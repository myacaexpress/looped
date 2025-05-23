import { supabaseAdmin } from '@/lib/supabase/client'
import { Database } from '@/lib/supabase/client'

type ConversationWithStats = {
  id: string;
  company_id: string;
  employee_user_id: string;
  assigned_agent_user_id: string | null;
  status: 'green' | 'yellow' | 'red' | 'resolved_ai' | 'resolved_human' | 'typing_ai' | 'typing_user' | 'active_human_needed';
  last_message_preview: string | null;
  created_at: string;
  updated_at: string;
  employee_name: string | null;
  employee_email: string;
  agent_name: string | null;
  agent_email: string | null;
  message_count: number;
  last_message_time: string | null;
}

type DashboardStats = {
  total_conversations: number;
  active_conversations: number;
  resolved_conversations: number;
  needs_attention: number;
  today_conversations: number;
  avg_response_time_minutes: number;
}

type KnowledgeBaseSearchResult = {
  id: string;
  document_id: string;
  chunk_text: string;
  embedding: number[];
  metadata: any;
  created_at: string;
  similarity: number;
  document_name: string;
}

/**
 * Optimized query utilities for better performance
 */
export class OptimizedQueries {
  
  /**
   * Get conversations with statistics using optimized stored procedure
   */
  static async getConversationsWithStats(
    companyId: string,
    statusFilter: string = 'all',
    limit: number = 50,
    offset: number = 0
  ): Promise<ConversationWithStats[]> {
    try {
      const { data, error } = await supabaseAdmin.rpc('get_conversations_with_stats', {
        p_company_id: companyId,
        p_status_filter: statusFilter,
        p_limit: limit,
        p_offset: offset
      });

      if (error) {
        console.error('Error fetching conversations with stats:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error in getConversationsWithStats:', error);
      throw error;
    }
  }

  /**
   * Get dashboard statistics efficiently
   */
  static async getDashboardStats(companyId: string): Promise<DashboardStats> {
    try {
      const { data, error } = await supabaseAdmin.rpc('get_dashboard_stats', {
        p_company_id: companyId
      });

      if (error) {
        console.error('Error fetching dashboard stats:', error);
        throw error;
      }

      return data?.[0] || {
        total_conversations: 0,
        active_conversations: 0,
        resolved_conversations: 0,
        needs_attention: 0,
        today_conversations: 0,
        avg_response_time_minutes: 0
      };
    } catch (error) {
      console.error('Error in getDashboardStats:', error);
      throw error;
    }
  }

  /**
   * Optimized knowledge base search
   */
  static async searchKnowledgeBase(
    queryEmbedding: number[],
    companyId: string,
    matchThreshold: number = 0.7,
    matchCount: number = 5
  ): Promise<KnowledgeBaseSearchResult[]> {
    try {
      const { data, error } = await supabaseAdmin.rpc('search_knowledge_base_optimized', {
        query_embedding: queryEmbedding,
        p_company_id: companyId,
        match_threshold: matchThreshold,
        match_count: matchCount
      });

      if (error) {
        console.error('Error in optimized knowledge base search:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error in searchKnowledgeBase:', error);
      throw error;
    }
  }

  /**
   * Batch update conversation statuses for bulk operations
   */
  static async batchUpdateConversationStatus(
    conversationIds: string[],
    newStatus: string,
    agentId?: string
  ): Promise<number> {
    try {
      const { data, error } = await supabaseAdmin.rpc('batch_update_conversation_status', {
        conversation_ids: conversationIds,
        new_status: newStatus,
        agent_id: agentId || null
      });

      if (error) {
        console.error('Error in batch update:', error);
        throw error;
      }

      return data || 0;
    } catch (error) {
      console.error('Error in batchUpdateConversationStatus:', error);
      throw error;
    }
  }

  /**
   * Get messages for a conversation with pagination and caching hints
   */
  static async getConversationMessages(
    conversationId: string,
    limit: number = 50,
    offset: number = 0
  ) {
    try {
      const { data, error } = await supabaseAdmin
        .from('messages')
        .select(`
          id,
          conversation_id,
          sender_user_id,
          sender_type,
          content,
          ai_suggestions,
          created_at,
          sender:users(full_name, email)
        `)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .range(offset, offset + limit - 1);

      if (error) {
        console.error('Error fetching conversation messages:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error in getConversationMessages:', error);
      throw error;
    }
  }

  /**
   * Get user's company ID with caching
   */
  static async getUserCompanyId(userId: string): Promise<string | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('users')
        .select('company_id')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error fetching user company ID:', error);
        return null;
      }

      return data?.company_id || null;
    } catch (error) {
      console.error('Error in getUserCompanyId:', error);
      return null;
    }
  }

  /**
   * Get active knowledge base documents for a company
   */
  static async getActiveKnowledgeBaseDocuments(companyId: string) {
    try {
      const { data, error } = await supabaseAdmin
        .from('knowledge_base_documents')
        .select('*')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching active documents:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error in getActiveKnowledgeBaseDocuments:', error);
      throw error;
    }
  }

  /**
   * Refresh conversation statistics materialized view
   */
  static async refreshConversationStats(): Promise<void> {
    try {
      const { error } = await supabaseAdmin.rpc('refresh_conversation_stats');

      if (error) {
        console.error('Error refreshing conversation stats:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error in refreshConversationStats:', error);
      throw error;
    }
  }

  /**
   * Get slow queries for monitoring
   */
  static async getSlowQueries() {
    try {
      const { data, error } = await supabaseAdmin
        .from('slow_queries')
        .select('*')
        .limit(20);

      if (error) {
        console.error('Error fetching slow queries:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error in getSlowQueries:', error);
      throw error;
    }
  }

  /**
   * Create a conversation with optimized insert
   */
  static async createConversation(
    companyId: string,
    employeeUserId: string,
    initialMessage?: string
  ) {
    try {
      const { data: conversation, error: convError } = await supabaseAdmin
        .from('conversations')
        .insert({
          company_id: companyId,
          employee_user_id: employeeUserId,
          status: 'green',
          last_message_preview: initialMessage ? initialMessage.substring(0, 100) : null
        })
        .select()
        .single();

      if (convError) {
        console.error('Error creating conversation:', convError);
        throw convError;
      }

      // If there's an initial message, insert it
      if (initialMessage && conversation) {
        const { error: msgError } = await supabaseAdmin
          .from('messages')
          .insert({
            conversation_id: conversation.id,
            sender_user_id: employeeUserId,
            sender_type: 'user',
            content: initialMessage
          });

        if (msgError) {
          console.error('Error creating initial message:', msgError);
          // Don't throw here, conversation was created successfully
        }
      }

      return conversation;
    } catch (error) {
      console.error('Error in createConversation:', error);
      throw error;
    }
  }

  /**
   * Add a message to a conversation with automatic preview update
   */
  static async addMessage(
    conversationId: string,
    senderId: string | null,
    senderType: 'user' | 'ai' | 'agent',
    content: string,
    aiSuggestions?: any
  ) {
    try {
      const { data, error } = await supabaseAdmin
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_user_id: senderId,
          sender_type: senderType,
          content,
          ai_suggestions: aiSuggestions || null
        })
        .select()
        .single();

      if (error) {
        console.error('Error adding message:', error);
        throw error;
      }

      // The trigger will automatically update the conversation preview
      return data;
    } catch (error) {
      console.error('Error in addMessage:', error);
      throw error;
    }
  }

  /**
   * Update conversation status with optimized query
   */
  static async updateConversationStatus(
    conversationId: string,
    status: string,
    agentId?: string
  ) {
    try {
      const updateData: any = { 
        status,
        updated_at: new Date().toISOString()
      };

      if (agentId) {
        updateData.assigned_agent_user_id = agentId;
      }

      const { data, error } = await supabaseAdmin
        .from('conversations')
        .update(updateData)
        .eq('id', conversationId)
        .select()
        .single();

      if (error) {
        console.error('Error updating conversation status:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error in updateConversationStatus:', error);
      throw error;
    }
  }
}

/**
 * Connection pool and query optimization utilities
 */
export class ConnectionOptimizer {
  
  /**
   * Execute a query with connection pooling optimization
   */
  static async executeWithPool<T>(
    queryFn: () => Promise<T>,
    retries: number = 3
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let i = 0; i < retries; i++) {
      try {
        return await queryFn();
      } catch (error) {
        lastError = error as Error;
        
        // If it's a connection error, wait and retry
        if (error && typeof error === 'object' && 'code' in error) {
          const pgError = error as any;
          if (pgError.code === '53300' || pgError.code === '08006') {
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
            continue;
          }
        }
        
        // For other errors, don't retry
        throw error;
      }
    }

    throw lastError;
  }

  /**
   * Prepare statements for frequently used queries
   */
  static async prepareStatements() {
    // This would be implemented with a proper PostgreSQL driver
    // For now, we'll use Supabase's built-in connection pooling
    console.log('Using Supabase connection pooling');
  }
}
