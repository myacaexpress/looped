import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages";
import { ConversationStatus, AISuggestion } from "@/types";
import { KnowledgeBaseService } from "@/lib/knowledge-base";

// Initialize the LLM
const getLlm = () => {
  const openAIApiKey = process.env.OPENAI_API_KEY;
  if (!openAIApiKey) {
    throw new Error("OPENAI_API_KEY is not set in environment variables.");
  }
  return new ChatOpenAI({
    modelName: "gpt-4o-mini",
    temperature: 0.7,
    openAIApiKey: openAIApiKey,
  });
};

const llm = getLlm();

// Simple workflow state interface
interface WorkflowState {
  conversationId: string;
  messages: BaseMessage[];
  currentStatus: ConversationStatus;
  confidence: number;
  retrievedContext: string[];
  suggestions: AISuggestion[];
  needsHumanIntervention: boolean;
  userQuery: string;
  finalResponse: string;
}

// Analyze user query and determine intent
async function analyzeQuery(userQuery: string): Promise<{
  intent: string;
  urgency: string;
  complexity: string;
  needsHuman: boolean;
  confidence: number;
}> {
  console.log("🔍 Analyzing user query...");
  
  const analysisPrompt = `
    Analyze this user query and determine:
    1. The intent/category (e.g., account_help, technical_support, billing, general_inquiry)
    2. The urgency level (low, medium, high)
    3. The complexity level (simple, moderate, complex)
    4. Whether it requires human intervention (true/false)
    
    User query: "${userQuery}"
    
    Respond in JSON format:
    {
      "intent": "category",
      "urgency": "level",
      "complexity": "level",
      "needsHuman": boolean,
      "confidence": 0.0-1.0
    }
  `;
  
  try {
    const response = await llm.invoke([new HumanMessage(analysisPrompt)]);
    const analysis = JSON.parse(response.content as string);
    
    return {
      intent: analysis.intent || "general_inquiry",
      urgency: analysis.urgency || "medium",
      complexity: analysis.complexity || "moderate",
      needsHuman: analysis.needsHuman || false,
      confidence: analysis.confidence || 0.8,
    };
  } catch (error) {
    console.error("Error parsing analysis:", error);
    return {
      intent: "general_inquiry",
      urgency: "medium",
      complexity: "moderate",
      needsHuman: false,
      confidence: 0.5,
    };
  }
}

// Retrieve relevant context using RAG
async function retrieveContext(userQuery: string, companyId?: string): Promise<{
  context: string[];
  sources: Array<{ documentId: string; fileName: string; chunkCount: number }>;
}> {
  console.log("📚 Retrieving context from knowledge base...");
  
  try {
    if (companyId) {
      // Use real knowledge base search
      const searchResults = await KnowledgeBaseService.search(
        userQuery,
        companyId,
        {
          limit: 5,
          threshold: 0.7,
          includeContext: true
        }
      );

      if (searchResults.chunks.length > 0) {
        console.log(`Found ${searchResults.chunks.length} relevant chunks from knowledge base`);
        
        // Extract context from chunks
        const context = searchResults.chunks.map(chunk => chunk.chunk_text);
        
        return {
          context,
          sources: searchResults.sources
        };
      }
    }
    
    // Fallback to mock context if no knowledge base results or no company ID
    console.log("Using fallback context - no knowledge base results found");
    const mockContext = [
      "Company policy: We offer 24/7 customer support for all premium users.",
      "FAQ: Account issues can usually be resolved by clearing browser cache.",
      "Knowledge base: Password reset requires email verification.",
      "Support hours: Our human agents are available Monday-Friday 9AM-6PM EST.",
      "Escalation policy: Complex technical issues should be escalated to Level 2 support.",
    ];
    
    // Simple keyword matching for demo purposes
    const keywords = userQuery.toLowerCase().split(' ');
    const relevantContext = mockContext.filter(context => 
      keywords.some(keyword => context.toLowerCase().includes(keyword))
    );
    
    return {
      context: relevantContext.length > 0 ? relevantContext : mockContext.slice(0, 3),
      sources: []
    };
  } catch (error) {
    console.error("Error retrieving context:", error);
    
    // Return basic fallback context
    return {
      context: [
        "I apologize, but I'm having trouble accessing our knowledge base right now.",
        "For immediate assistance, please contact our support team.",
        "Our support hours are Monday-Friday 9AM-6PM EST."
      ],
      sources: []
    };
  }
}

// Generate AI response with enhanced context awareness
async function generateResponse(
  userQuery: string, 
  context: string[], 
  sources: Array<{ documentId: string; fileName: string; chunkCount: number }>
): Promise<{
  response: string;
  confidence: number;
}> {
  console.log("🤖 Generating AI response...");
  
  const contextText = context.join("\n");
  const sourceInfo = sources.length > 0 
    ? `\n\nSources: ${sources.map(s => s.fileName).join(", ")}`
    : "";
  
  const responsePrompt = `
    You are a helpful customer support AI assistant. Based on the context provided from the company's knowledge base and the user's query, generate a helpful and accurate response.
    
    Context from Knowledge Base:
    ${contextText}
    ${sourceInfo}
    
    User Query: "${userQuery}"
    
    Guidelines:
    - Be helpful and professional
    - Use the context when relevant and cite sources when appropriate
    - If the context doesn't contain relevant information, say so honestly
    - If you're not sure about something, say so
    - Keep responses concise but complete
    - If the issue seems complex or requires account-specific information, suggest escalation to human support
    - If you found information from the knowledge base, mention that you're referencing company documentation
    
    Generate your response:
  `;
  
  try {
    const response = await llm.invoke([new HumanMessage(responsePrompt)]);
    const aiResponse = response.content as string;
    
    // Determine confidence based on response quality and context availability
    let confidence = 0.8;
    
    if (aiResponse.toLowerCase().includes("not sure") || 
        aiResponse.toLowerCase().includes("don't know")) {
      confidence = 0.6;
    }
    
    if (context.length === 0 || context.some(c => c.includes("trouble accessing"))) {
      confidence = 0.5;
    }
    
    if (sources.length > 0) {
      confidence = Math.min(confidence + 0.1, 0.95); // Boost confidence if we have real sources
    }
    
    return {
      response: aiResponse,
      confidence,
    };
  } catch (error) {
    console.error("Error generating response:", error);
    return {
      response: "I'm sorry, I'm having trouble processing your request right now. Please try again or contact human support.",
      confidence: 0.3,
    };
  }
}

// Generate suggestions for human agents
async function generateSuggestions(
  userQuery: string, 
  context: string[], 
  confidence: number,
  sources: Array<{ documentId: string; fileName: string; chunkCount: number }>
): Promise<AISuggestion[]> {
  console.log("💡 Generating suggestions...");
  
  if (confidence > 0.8) {
    return [];
  }
  
  const contextText = context.join("\n");
  const sourceInfo = sources.length > 0 
    ? `\nAvailable sources: ${sources.map(s => s.fileName).join(", ")}`
    : "\nNo knowledge base sources found for this query.";
  
  const suggestionsPrompt = `
    Based on this user query and available context, generate 2-3 helpful suggestions for a human agent.
    
    User Query: "${userQuery}"
    Context: ${contextText}
    ${sourceInfo}
    
    Generate suggestions in JSON format:
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
    console.error("Error generating suggestions:", error);
    return [
      {
        id: "suggestion_0",
        text: "Review the user's account history for similar issues",
        confidence: 0.7,
      },
      {
        id: "suggestion_1",
        text: "Check the knowledge base for relevant documentation",
        confidence: 0.8,
      },
      {
        id: "suggestion_2",
        text: "Consider escalating to technical support if needed",
        confidence: 0.8,
      },
    ];
  }
}

// Main workflow function to process a user message
export async function processUserMessage(
  conversationId: string,
  userMessage: string,
  companyId?: string,
  previousMessages: BaseMessage[] = []
): Promise<{
  response: string;
  status: ConversationStatus;
  confidence: number;
  suggestions: AISuggestion[];
  sources?: Array<{ documentId: string; fileName: string; chunkCount: number }>;
}> {
  try {
    console.log(`🚀 Processing message for conversation ${conversationId}`);
    
    // Step 1: Analyze the query
    const analysis = await analyzeQuery(userMessage);
    
    // Step 2: Retrieve relevant context from knowledge base
    const { context, sources } = await retrieveContext(userMessage, companyId);
    
    // Step 3: Generate AI response
    const { response, confidence } = await generateResponse(userMessage, context, sources);
    
    // Step 4: Determine status based on analysis and confidence
    let status: ConversationStatus = "green";
    if (analysis.needsHuman || confidence < 0.7) {
      status = "yellow";
    }
    if (confidence < 0.5) {
      status = "red";
    }
    
    // Step 5: Generate suggestions if needed
    const suggestions = await generateSuggestions(userMessage, context, confidence, sources);
    
    console.log(`✅ Processed message with confidence: ${confidence}, status: ${status}, sources: ${sources.length}`);
    
    return {
      response,
      status,
      confidence,
      suggestions,
      sources: sources.length > 0 ? sources : undefined,
    };
  } catch (error) {
    console.error("Error in processUserMessage:", error);
    
    return {
      response: "I'm experiencing some technical difficulties. Please try again or contact human support.",
      status: "red" as ConversationStatus,
      confidence: 0.0,
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

// Helper function to create a mock conversation for testing
export async function createMockConversation(): Promise<{
  conversationId: string;
  messages: BaseMessage[];
}> {
  const conversationId = `conv_${Date.now()}`;
  const messages: BaseMessage[] = [
    new HumanMessage("Hello, I'm having trouble logging into my account."),
    new AIMessage("I'd be happy to help you with your login issue. Let me guide you through some troubleshooting steps."),
  ];
  
  return {
    conversationId,
    messages,
  };
}

// Export types for use in other modules
export type { WorkflowState };
