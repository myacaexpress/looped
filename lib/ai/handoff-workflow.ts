import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages";
import { ConversationStatus, AISuggestion } from "@/types";
import { KnowledgeBaseService } from "@/lib/knowledge-base";
import { supabaseAdmin } from "@/lib/supabase/client";

// Workflow State Definition
interface HandoffWorkflowState {
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
}

// Initialize LLM
const llm = new ChatOpenAI({
  modelName: "gpt-4o-mini",
  temperature: 0.7,
  openAIApiKey: process.env.OPENAI_API_KEY,
});

// Step 1: Analyze Query Intent and Complexity
async function analyzeQuery(state: HandoffWorkflowState): Promise<HandoffWorkflowState> {
  console.log("🔍 [Step 1] Analyzing query intent and complexity...");
  
  const analysisPrompt = `
    Analyze this user query and determine:
    1. Intent category (account_help, technical_support, billing, general_inquiry, urgent_issue)
    2. Urgency level (low, medium, high, critical)
    3. Complexity level (simple, moderate, complex, expert_required)
    4. Confidence in AI ability to handle (0.0-1.0)
    5. Whether immediate human intervention is needed
    
    User query: "${state.userQuery}"
    
    Consider these factors:
    - Account-specific requests usually need human verification
    - Technical issues with error codes might be complex
    - Billing disputes often require human judgment
    - Urgent language ("emergency", "urgent", "asap") increases priority
    - Emotional language might need human empathy
    
    Respond in JSON format:
    {
      "intent": "category",
      "urgency": "level", 
      "complexity": "level",
      "aiConfidence": 0.0-1.0,
      "needsImmedateHuman": boolean,
      "reasoning": "brief explanation"
    }
  `;
  
  try {
    const response = await llm.invoke([new HumanMessage(analysisPrompt)]);
    const responseText = response.content as string;
    const analysis = extractAndParseJson<any>(responseText); // Use the helper function
    
    console.log(`📊 Analysis result: ${analysis.intent}, confidence: ${analysis.aiConfidence}`);
    
    return {
      ...state,
      confidence: analysis.aiConfidence || 0.8,
      needsHumanIntervention: analysis.needsImmedateHuman || false,
      escalationReason: analysis.needsImmedateHuman ? analysis.reasoning : "",
    };
  } catch (error) {
    console.error("❌ Error in query analysis:", error);
    return {
      ...state,
      confidence: 0.5,
      needsHumanIntervention: false,
      escalationReason: "Analysis failed - proceeding with caution",
    };
  }
}

// Step 2: Retrieve Knowledge Base Context
async function retrieveContext(state: HandoffWorkflowState): Promise<HandoffWorkflowState> {
  console.log("📚 [Step 2] Retrieving knowledge base context...");
  
  try {
    const searchResults = await KnowledgeBaseService.search(
      state.userQuery,
      state.companyId,
      {
        limit: 5,
        threshold: 0.7,
        includeContext: true
      }
    );

    if (searchResults.chunks.length > 0) {
      console.log(`✅ Found ${searchResults.chunks.length} relevant chunks`);
      
      const context = searchResults.chunks.map(chunk => chunk.chunk_text);
      
      return {
        ...state,
        retrievedContext: context,
        sources: searchResults.sources,
      };
    } else {
      console.log("⚠️ No relevant context found in knowledge base");
      
      // Fallback context for demo
      const fallbackContext = [
        "Company policy: We offer 24/7 customer support for all premium users.",
        "FAQ: Account issues can usually be resolved by clearing browser cache.",
        "Support hours: Our human agents are available Monday-Friday 9AM-6PM EST.",
      ];
      
      return {
        ...state,
        retrievedContext: fallbackContext,
        sources: [],
      };
    }
  } catch (error) {
    console.error("❌ Error retrieving context:", error);
    return {
      ...state,
      retrievedContext: ["Error accessing knowledge base - escalating to human support"],
      sources: [],
      confidence: Math.min(state.confidence * 0.7, 0.5), // Reduce confidence
    };
  }
}

// Step 3: Generate AI Response
async function generateResponse(state: HandoffWorkflowState): Promise<HandoffWorkflowState> {
  console.log("🤖 [Step 3] Generating AI response...");
  
  const contextText = state.retrievedContext.join("\n");
  const sourceInfo = state.sources.length > 0 
    ? `\n\nSources: ${state.sources.map(s => s.fileName).join(", ")}`
    : "";
  
  const responsePrompt = `
    You are a helpful customer support AI assistant. Generate a response based on the context and user query.
    
    Context from Knowledge Base:
    ${contextText}
    ${sourceInfo}
    
    User Query: "${state.userQuery}"
    
    Guidelines:
    - Be helpful, professional, and empathetic
    - Use context when relevant and cite sources appropriately
    - If context doesn't contain relevant info, say so honestly
    - If unsure about something, express uncertainty
    - Keep responses concise but complete
    - For complex/account-specific issues, suggest human support
    - If you found info from knowledge base, mention it
    
    Also provide a confidence score (0.0-1.0) for your response quality.
    
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
    const responseText = response.content as string;
    const aiResponse = extractAndParseJson<any>(responseText); // Use the helper function
    
    console.log(`🎯 Generated response with confidence: ${aiResponse.confidence}`);
    
    // Combine AI confidence with previous analysis
    const combinedConfidence = Math.min(
      state.confidence * 0.6 + aiResponse.confidence * 0.4,
      0.95
    );
    
    return {
      ...state,
      finalResponse: aiResponse.response,
      confidence: combinedConfidence,
      needsHumanIntervention: state.needsHumanIntervention || aiResponse.suggestsHumanHelp,
    };
  } catch (error) {
    console.error("❌ Error generating response:", error);
    return {
      ...state,
      finalResponse: "I'm having trouble processing your request. Let me connect you with a human agent.",
      confidence: 0.3,
      needsHumanIntervention: true,
      escalationReason: "AI response generation failed",
    };
  }
}

// Step 4: Determine Conversation Status
async function determineStatus(state: HandoffWorkflowState): Promise<HandoffWorkflowState> {
  console.log("🚦 [Step 4] Determining conversation status...");
  
  let status: ConversationStatus = "green";
  let suggestions: AISuggestion[] = [];
  
  // Status determination logic based on confidence and other factors
  if (state.needsHumanIntervention || state.confidence < 0.5) {
    status = "red";
    suggestions = [
      {
        id: "escalate_immediately",
        text: "Escalate to human agent immediately",
        confidence: 0.95,
      },
      {
        id: "review_context",
        text: "Review available knowledge base context",
        confidence: 0.8,
      },
    ];
  } else if (state.confidence < 0.7) {
    status = "yellow";
    suggestions = await generateSuggestions(state);
  } else {
    status = "green";
    // No suggestions needed for high-confidence responses
  }
  
  console.log(`🎯 Status determined: ${status} (confidence: ${state.confidence})`);
  
  return {
    ...state,
    currentStatus: status,
    suggestions,
  };
}

// Step 5: Handle Human Handoff
async function handleHandoff(state: HandoffWorkflowState): Promise<HandoffWorkflowState> {
  console.log("👥 [Step 5] Handling human handoff...");
  
  try {
    // Update conversation status in database
    const { error } = await supabaseAdmin
      .from('conversations')
      .update({
        status: state.currentStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', state.conversationId);
    
    if (error) {
      console.error("❌ Error updating conversation status:", error);
    }
    
    // For red status, try to assign an available agent
    if (state.currentStatus === "red") {
      // TODO: Implement agent assignment logic
      // For now, just mark as needing human intervention
      console.log("🔴 Red status - human intervention required");
      
      return {
        ...state,
        agentAssigned: false,
        finalResponse: state.finalResponse + "\n\nI'm connecting you with a human agent who can better assist you.",
      };
    }
    
    return state;
  } catch (error) {
    console.error("❌ Error in handoff process:", error);
    return state;
  }
}

// Helper function to generate suggestions for yellow status
async function generateSuggestions(state: HandoffWorkflowState): Promise<AISuggestion[]> {
  const contextText = state.retrievedContext.join("\n");
  const sourceInfo = state.sources.length > 0 
    ? `\nAvailable sources: ${state.sources.map(s => s.fileName).join(", ")}`
    : "\nNo knowledge base sources found.";
  
  const suggestionsPrompt = `
    Generate 2-3 helpful suggestions for a human agent based on this conversation context.
    
    User Query: "${state.userQuery}"
    AI Response: "${state.finalResponse}"
    Context: ${contextText}
    ${sourceInfo}
    Confidence: ${state.confidence}
    
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
    console.error("❌ Error generating suggestions:", error);
    return [
      {
        id: "fallback_suggestion",
        text: "Review the conversation context and provide personalized assistance",
        confidence: 0.8,
      },
    ];
  }
}

// Main workflow orchestrator
async function runHandoffWorkflow(
  conversationId: string,
  userMessage: string,
  companyId: string,
  previousMessages: BaseMessage[] = []
): Promise<HandoffWorkflowState> {
  console.log(`🚀 [Workflow] Starting handoff workflow for conversation ${conversationId}`);
  
  // Initialize state
  let state: HandoffWorkflowState = {
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
  };
  
  try {
    // Step 1: Analyze query
    state = await analyzeQuery(state);
    
    // Early exit if immediate human intervention is needed
    if (state.needsHumanIntervention && state.confidence < 0.3) {
      console.log("🔴 Early escalation triggered");
      state.currentStatus = "red";
      state.finalResponse = "This request requires immediate human assistance. I'm connecting you with an agent.";
      return await handleHandoff(state);
    }
    
    // Step 2: Retrieve context
    state = await retrieveContext(state);
    
    // Step 3: Generate response
    state = await generateResponse(state);
    
    // Step 4: Determine status
    state = await determineStatus(state);
    
    // Step 5: Handle handoff if needed
    if (state.currentStatus === "red") {
      state = await handleHandoff(state);
    }
    
    console.log(`✅ [Workflow] Completed with status: ${state.currentStatus}, confidence: ${state.confidence}`);
    return state;
    
  } catch (error) {
    console.error("❌ [Workflow] Error in handoff workflow:", error);
    
    // Return error state
    return {
      ...state,
      currentStatus: "red",
      confidence: 0.0,
      finalResponse: "I'm experiencing technical difficulties. Please try again or contact human support.",
      suggestions: [
        {
          id: "error_suggestion",
          text: "Technical issue detected - escalate to human support immediately",
          confidence: 1.0,
        },
      ],
    };
  }
}

// Main function to process user messages using the handoff workflow
export async function processUserMessageWithHandoff(
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
}> {
  const result = await runHandoffWorkflow(conversationId, userMessage, companyId, previousMessages);
  
  return {
    response: result.finalResponse,
    status: result.currentStatus,
    confidence: result.confidence,
    suggestions: result.suggestions,
    sources: result.sources.length > 0 ? result.sources : undefined,
  };
}

// Function to manually trigger handoff for a conversation
export async function triggerManualHandoff(
  conversationId: string,
  reason: string
): Promise<boolean> {
  try {
    console.log(`👥 Manual handoff triggered for conversation ${conversationId}: ${reason}`);
    
    const { error } = await supabaseAdmin
      .from('conversations')
      .update({
        status: 'red',
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId);
    
    if (error) {
      console.error("❌ Error triggering manual handoff:", error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error("❌ Error in manual handoff:", error);
    return false;
  }
}

// Function to get conversation status
export async function getConversationStatus(conversationId: string): Promise<ConversationStatus | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('conversations')
      .select('status')
      .eq('id', conversationId)
      .single();
    
    if (error) {
      console.error("❌ Error getting conversation status:", error);
      return null;
    }
    
    return data.status as ConversationStatus;
  } catch (error) {
    console.error("❌ Error in getConversationStatus:", error);
    return null;
  }
}

// Export types
export type { HandoffWorkflowState };

// Helper function to extract and parse JSON from LLM response
function extractAndParseJson<T>(responseText: string): T {
  const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) || responseText.match(/```\s*([\s\S]*?)\s*```/);
  const jsonText = jsonMatch ? jsonMatch[1] : responseText;
  return JSON.parse(jsonText.trim()) as T;
}
