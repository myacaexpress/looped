import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages";
import { RunnableParallel, RunnablePassthrough, RunnableLambda } from "@langchain/core/runnables";
import { ConversationStatus, AISuggestion } from "@/types";
import { KnowledgeBaseService } from "@/lib/knowledge-base";
import { OptimizedQueries } from "@/lib/supabase/optimized-queries";

// Enhanced workflow state with concurrency support
interface ConcurrentWorkflowState {
  conversationId: string;
  companyId: string;
  userQuery: string;
  messages: BaseMessage[];
  currentStatus: ConversationStatus;
  confidence: number;
  retrievedContext: string[];
  suggestions: AISuggestion[];
  needsHumanIntervention: boolean;
  finalResponse: string;
  sources: Array<{ documentId: string; fileName: string; chunkCount: number }>;
  escalationReason: string;
  agentAssigned: boolean;
  processingTime: number;
  parallelResults: {
    analysis?: any;
    context?: any;
    suggestions?: any;
  };
}

// Connection pool for LLM instances to handle concurrent requests
class LLMPool {
  private static instances: ChatOpenAI[] = [];
  private static maxInstances = 5;
  private static currentIndex = 0;

  static getInstance(): ChatOpenAI {
    if (this.instances.length === 0) {
      // Initialize pool
      for (let i = 0; i < this.maxInstances; i++) {
        this.instances.push(new ChatOpenAI({
          modelName: "gpt-4o-mini",
          temperature: 0.7,
          openAIApiKey: process.env.OPENAI_API_KEY,
          maxConcurrency: 3, // Limit concurrent requests per instance
          maxRetries: 2,
        }));
      }
    }

    // Round-robin selection
    const instance = this.instances[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.maxInstances;
    return instance;
  }

  static async warmUp(): Promise<void> {
    // Pre-warm the connection pool
    const warmupPromises = this.instances.map(async (llm, index) => {
      try {
        await llm.invoke([new HumanMessage("warmup")]);
        console.log(`✅ LLM instance ${index} warmed up`);
      } catch (error) {
        console.warn(`⚠️ LLM instance ${index} warmup failed:`, error);
      }
    });

    await Promise.allSettled(warmupPromises);
  }
}

// Concurrent analysis functions
const createAnalysisRunnable = () => {
  const llm = LLMPool.getInstance();
  
  return async (input: { userQuery: string }) => {
    const analysisPrompt = `
      Analyze this user query and determine:
      1. Intent category (account_help, technical_support, billing, general_inquiry, urgent_issue)
      2. Urgency level (low, medium, high, critical)
      3. Complexity level (simple, moderate, complex, expert_required)
      4. Confidence in AI ability to handle (0.0-1.0)
      5. Whether immediate human intervention is needed
      
      User query: "${input.userQuery}"
      
      Respond in JSON format:
      {
        "intent": "category",
        "urgency": "level", 
        "complexity": "level",
        "aiConfidence": 0.0-1.0,
        "needsImmediateHuman": boolean,
        "reasoning": "brief explanation"
      }
    `;
    
    try {
      const response = await llm.invoke([new HumanMessage(analysisPrompt)]);
      return JSON.parse(response.content as string);
    } catch (error) {
      console.error("❌ Error in concurrent analysis:", error);
      return {
        intent: "general_inquiry",
        urgency: "medium",
        complexity: "moderate",
        aiConfidence: 0.5,
        needsImmediateHuman: false,
        reasoning: "Analysis failed - proceeding with defaults"
      };
    }
  };
};

const createContextRetrievalRunnable = () => {
  return async (input: { userQuery: string; companyId: string }) => {
    try {
      const searchResults = await KnowledgeBaseService.search(
        input.userQuery,
        input.companyId,
        {
          limit: 5,
          threshold: 0.7,
          includeContext: true
        }
      );

      if (searchResults.chunks.length > 0) {
        return {
          context: searchResults.chunks.map(chunk => chunk.chunk_text),
          sources: searchResults.sources,
          success: true
        };
      } else {
        // Fallback context
        return {
          context: [
            "Company policy: We offer 24/7 customer support for all premium users.",
            "FAQ: Account issues can usually be resolved by clearing browser cache.",
            "Support hours: Our human agents are available Monday-Friday 9AM-6PM EST.",
          ],
          sources: [],
          success: false
        };
      }
    } catch (error) {
      console.error("❌ Error in concurrent context retrieval:", error);
      return {
        context: ["Error accessing knowledge base - escalating to human support"],
        sources: [],
        success: false
      };
    }
  };
};

const createSuggestionsRunnable = () => {
  const llm = LLMPool.getInstance();
  
  return async (input: { userQuery: string; context: string[]; confidence: number }) => {
    if (input.confidence > 0.7) {
      return []; // No suggestions needed for high confidence
    }

    const suggestionsPrompt = `
      Generate 2-3 helpful suggestions for a human agent based on this conversation context.
      
      User Query: "${input.userQuery}"
      Context: ${input.context.join("\n")}
      Confidence: ${input.confidence}
      
      Generate actionable suggestions that would help a human agent provide better assistance.
      
      Respond in JSON format:
      [
        {
          "text": "suggestion text",
          "confidence": 0.0-1.0
        }
      ]
    `;
    
    try {
      const response = await llm.invoke([new HumanMessage(suggestionsPrompt)]);
      const suggestions = JSON.parse(response.content as string);
      
      return suggestions.map((s: any, index: number) => ({
        id: `suggestion_${index}`,
        text: s.text,
        confidence: s.confidence,
      }));
    } catch (error) {
      console.error("❌ Error in concurrent suggestions:", error);
      return [
        {
          id: "fallback_suggestion",
          text: "Review the conversation context and provide personalized assistance",
          confidence: 0.8,
        },
      ];
    }
  };
};

// Main concurrent workflow orchestrator
export async function runConcurrentWorkflow(
  conversationId: string,
  userMessage: string,
  companyId: string,
  previousMessages: BaseMessage[] = []
): Promise<ConcurrentWorkflowState> {
  const startTime = Date.now();
  console.log(`🚀 [Concurrent Workflow] Starting for conversation ${conversationId}`);
  
  // Initialize state
  let state: ConcurrentWorkflowState = {
    conversationId,
    companyId,
    userQuery: userMessage,
    messages: [...previousMessages, new HumanMessage(userMessage)],
    currentStatus: "green",
    confidence: 0.8,
    retrievedContext: [],
    suggestions: [],
    needsHumanIntervention: false,
    finalResponse: "",
    sources: [],
    escalationReason: "",
    agentAssigned: false,
    processingTime: 0,
    parallelResults: {}
  };

  try {
    // Step 1: Run analysis and context retrieval in parallel
    console.log("🔄 [Step 1] Running parallel analysis and context retrieval...");
    
    const parallelStep1 = RunnableParallel.from({
      analysis: RunnableLambda.from(createAnalysisRunnable()),
      context: RunnableLambda.from(createContextRetrievalRunnable()),
    });

    const step1Results = await parallelStep1.invoke({
      userQuery: userMessage,
      companyId: companyId
    });

    // Update state with parallel results
    state.parallelResults.analysis = step1Results.analysis;
    state.parallelResults.context = step1Results.context;
    state.confidence = step1Results.analysis.aiConfidence || 0.8;
    state.needsHumanIntervention = step1Results.analysis.needsImmediateHuman || false;
    state.retrievedContext = step1Results.context.context || [];
    state.sources = step1Results.context.sources || [];

    console.log(`📊 Parallel Step 1 completed - Analysis: ${step1Results.analysis.intent}, Context chunks: ${state.retrievedContext.length}`);

    // Early exit for immediate escalation
    if (state.needsHumanIntervention && state.confidence < 0.3) {
      console.log("🔴 Early escalation triggered");
      state.currentStatus = "red";
      state.finalResponse = "This request requires immediate human assistance. I'm connecting you with an agent.";
      state.processingTime = Date.now() - startTime;
      return await handleConcurrentHandoff(state);
    }

    // Step 2: Generate response and suggestions in parallel
    console.log("🔄 [Step 2] Running parallel response generation and suggestions...");
    
    const responseRunnable = async (input: any) => {
      const llm = LLMPool.getInstance();
      const contextText = input.context.join("\n");
      const sourceInfo = input.sources.length > 0 
        ? `\n\nSources: ${input.sources.map((s: any) => s.fileName).join(", ")}`
        : "";
      
      const responsePrompt = `
        You are a helpful customer support AI assistant. Generate a response based on the context and user query.
        
        Context from Knowledge Base:
        ${contextText}
        ${sourceInfo}
        
        User Query: "${input.userQuery}"
        
        Guidelines:
        - Be helpful, professional, and empathetic
        - Use context when relevant and cite sources appropriately
        - If context doesn't contain relevant info, say so honestly
        - If unsure about something, express uncertainty
        - Keep responses concise but complete
        
        Respond in JSON format:
        {
          "response": "your response text",
          "confidence": 0.0-1.0,
          "suggestsHumanHelp": boolean,
          "reasoning": "why this confidence level"
        }
      `;
      
      try {
        const response = await llm.invoke([new HumanMessage(responsePrompt)]);
        return JSON.parse(response.content as string);
      } catch (error) {
        console.error("❌ Error generating response:", error);
        return {
          response: "I'm having trouble processing your request. Let me connect you with a human agent.",
          confidence: 0.3,
          suggestsHumanHelp: true,
          reasoning: "Response generation failed"
        };
      }
    };

    const parallelStep2 = RunnableParallel.from({
      response: RunnableLambda.from(responseRunnable),
      suggestions: RunnableLambda.from(createSuggestionsRunnable()),
    });

    const step2Results = await parallelStep2.invoke({
      userQuery: userMessage,
      context: state.retrievedContext,
      sources: state.sources,
      confidence: state.confidence
    });

    // Update state with response results
    state.finalResponse = step2Results.response.response;
    state.confidence = Math.min(
      state.confidence * 0.6 + step2Results.response.confidence * 0.4,
      0.95
    );
    state.needsHumanIntervention = state.needsHumanIntervention || step2Results.response.suggestsHumanHelp;
    state.suggestions = step2Results.suggestions;

    console.log(`🎯 Parallel Step 2 completed - Response confidence: ${state.confidence}`);

    // Step 3: Determine status and handle handoff if needed
    console.log("🚦 [Step 3] Determining status and handling handoff...");
    
    if (state.needsHumanIntervention || state.confidence < 0.5) {
      state.currentStatus = "red";
      if (!state.suggestions.length) {
        state.suggestions = [
          {
            id: "escalate_immediately",
            text: "Escalate to human agent immediately",
            confidence: 0.95,
          }
        ];
      }
    } else if (state.confidence < 0.7) {
      state.currentStatus = "yellow";
    } else {
      state.currentStatus = "green";
    }

    // Handle handoff if needed
    if (state.currentStatus === "red") {
      state = await handleConcurrentHandoff(state);
    }

    state.processingTime = Date.now() - startTime;
    console.log(`✅ [Concurrent Workflow] Completed in ${state.processingTime}ms with status: ${state.currentStatus}`);
    
    return state;

  } catch (error) {
    console.error("❌ [Concurrent Workflow] Error:", error);
    
    state.currentStatus = "red";
    state.confidence = 0.0;
    state.finalResponse = "I'm experiencing technical difficulties. Please try again or contact human support.";
    state.suggestions = [
      {
        id: "error_suggestion",
        text: "Technical issue detected - escalate to human support immediately",
        confidence: 1.0,
      },
    ];
    state.processingTime = Date.now() - startTime;
    
    return state;
  }
}

// Optimized handoff handling with database operations
async function handleConcurrentHandoff(state: ConcurrentWorkflowState): Promise<ConcurrentWorkflowState> {
  console.log("👥 [Concurrent Handoff] Processing...");
  
  try {
    // Use optimized query for status update
    await OptimizedQueries.updateConversationStatus(
      state.conversationId,
      state.currentStatus,
      undefined // No agent assignment for now
    );
    
    if (state.currentStatus === "red") {
      console.log("🔴 Red status - human intervention required");
      state.finalResponse = state.finalResponse + "\n\nI'm connecting you with a human agent who can better assist you.";
    }
    
    return state;
  } catch (error) {
    console.error("❌ Error in concurrent handoff:", error);
    return state;
  }
}

// Batch processing for multiple conversations
export async function processBatchConversations(
  conversations: Array<{
    conversationId: string;
    userMessage: string;
    companyId: string;
    previousMessages?: BaseMessage[];
  }>,
  maxConcurrency: number = 3
): Promise<ConcurrentWorkflowState[]> {
  console.log(`🔄 [Batch Processing] Processing ${conversations.length} conversations with max concurrency: ${maxConcurrency}`);
  
  const results: ConcurrentWorkflowState[] = [];
  const semaphore = new Array(maxConcurrency).fill(null);
  
  const processConversation = async (conversation: any, index: number) => {
    const semaphoreIndex = index % maxConcurrency;
    
    try {
      // Wait for semaphore slot
      await new Promise(resolve => {
        const checkSlot = () => {
          if (semaphore[semaphoreIndex] === null) {
            semaphore[semaphoreIndex] = conversation.conversationId;
            resolve(null);
          } else {
            setTimeout(checkSlot, 10);
          }
        };
        checkSlot();
      });
      
      const result = await runConcurrentWorkflow(
        conversation.conversationId,
        conversation.userMessage,
        conversation.companyId,
        conversation.previousMessages || []
      );
      
      results[index] = result;
      
    } catch (error) {
      console.error(`❌ Error processing conversation ${conversation.conversationId}:`, error);
      results[index] = {
        conversationId: conversation.conversationId,
        companyId: conversation.companyId,
        userQuery: conversation.userMessage,
        messages: [],
        currentStatus: "red",
        confidence: 0.0,
        retrievedContext: [],
        suggestions: [],
        needsHumanIntervention: true,
        finalResponse: "Error processing request",
        sources: [],
        escalationReason: "Processing error",
        agentAssigned: false,
        processingTime: 0,
        parallelResults: {}
      };
    } finally {
      // Release semaphore slot
      semaphore[semaphoreIndex] = null;
    }
  };
  
  // Process all conversations
  await Promise.all(
    conversations.map((conversation, index) => 
      processConversation(conversation, index)
    )
  );
  
  console.log(`✅ [Batch Processing] Completed ${results.length} conversations`);
  return results;
}

// Main function to process user messages with concurrent optimization
export async function processUserMessageConcurrent(
  conversationId: string,
  userMessage: string,
  companyId: string,
  previousMessages: BaseMessage[] = []
): Promise<{
  response: string;
  status: ConversationStatus;
  confidence: number;
  suggestions: AISuggestion[];
  sources?: Array<{ documentId: string; fileName: string; chunkCount: number }>;
  processingTime: number;
}> {
  const result = await runConcurrentWorkflow(conversationId, userMessage, companyId, previousMessages);
  
  return {
    response: result.finalResponse,
    status: result.currentStatus,
    confidence: result.confidence,
    suggestions: result.suggestions,
    sources: result.sources.length > 0 ? result.sources : undefined,
    processingTime: result.processingTime,
  };
}

// Initialize the LLM pool on module load
LLMPool.warmUp().catch(console.error);

// Export types and utilities
export type { ConcurrentWorkflowState };
export { LLMPool };
