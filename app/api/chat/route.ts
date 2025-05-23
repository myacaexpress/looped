import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { processUserMessageWithHandoff } from '@/lib/ai/handoff-workflow';
import { HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import { v4 as uuidv4 } from 'uuid';

// Helper function to validate UUID format
function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const body = await request.json();
    const { message, conversationId, previousMessages = [] } = body;

    // Validate required fields
    if (!message || !conversationId) {
      return NextResponse.json(
        { error: 'Message and conversationId are required' },
        { status: 400 }
      );
    }

    // Generate a proper UUID for the conversation if needed
    let validConversationId = conversationId;
    if (conversationId === 'default' || conversationId === 'test-company' || !isValidUUID(conversationId)) {
      validConversationId = uuidv4();
      console.log(`🔄 Generated new conversation ID: ${validConversationId}`);
    }

    // Get user's company ID for knowledge base search
    let companyId: string | undefined;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: user } = await supabase
          .from('users')
          .select('company_id')
          .eq('id', session.user.id)
          .single();
        
        companyId = user?.company_id;
      }
    } catch (error) {
      console.warn('Could not get user company ID:', error);
      // Continue without company ID - will use fallback context
    }

    // Convert previous messages to BaseMessage format
    const formattedMessages: BaseMessage[] = previousMessages.map((msg: any) => {
      if (msg.type === 'human' || msg.role === 'user') {
        return new HumanMessage(msg.content || msg.message);
      } else {
        return new AIMessage(msg.content || msg.message);
      }
    });

    console.log(`📨 Processing chat message for conversation: ${conversationId}`);
    console.log(`💬 User message: ${message}`);
    console.log(`🏢 Company ID: ${companyId || 'none'}`);

    // Generate a proper UUID for company ID if needed
    let validCompanyId: string = companyId || uuidv4();
    if (!companyId || companyId === 'default') {
      validCompanyId = uuidv4();
      console.log(`🔄 Generated new company ID: ${validCompanyId}`);
    }

    // Process the message through our AI workflow
    const result = await processUserMessageWithHandoff(
      validConversationId,
      message,
      validCompanyId,
      formattedMessages
    );

    console.log(`✅ AI response generated with confidence: ${result.confidence}`);
    console.log(`🎯 Status: ${result.status}`);
    console.log(`📚 Sources: ${result.sources?.length || 0}`);

    // Return the response
    return NextResponse.json({
      success: true,
      data: {
        message: result.response,
        status: result.status,
        confidence: result.confidence,
        suggestions: result.suggestions,
        sources: result.sources,
        conversationId,
        timestamp: new Date().toISOString(),
      },
    });

  } catch (error) {
    console.error('Error in chat API:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        data: {
          message: "I'm sorry, I'm experiencing technical difficulties. Please try again or contact human support.",
          status: 'red',
          confidence: 0.0,
          suggestions: [
            {
              id: 'error_suggestion',
              text: 'Technical issue detected - escalate to human support immediately',
              confidence: 1.0,
            },
          ],
          conversationId: 'error',
          timestamp: new Date().toISOString(),
        },
      },
      { status: 500 }
    );
  }
}

// Handle OPTIONS for CORS
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
