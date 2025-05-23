import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { createClient } from '@supabase/supabase-js'

// Client-side Supabase client for use in React components
export const supabase = createClientComponentClient()

// Server-side Supabase client with service role key for admin operations
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

// Database types for better TypeScript support
export type Database = {
  public: {
    Tables: {
      companies: {
        Row: {
          id: string
          name: string
          admin_user_id: string
          configuration_details: Record<string, any> | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          admin_user_id: string
          configuration_details?: Record<string, any> | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          admin_user_id?: string
          configuration_details?: Record<string, any> | null
          created_at?: string
          updated_at?: string
        }
      }
      users: {
        Row: {
          id: string
          company_id: string
          role: 'employee' | 'admin'
          email: string
          full_name: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          role: 'employee' | 'admin'
          email: string
          full_name?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          role?: 'employee' | 'admin'
          email?: string
          full_name?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      knowledge_base_documents: {
        Row: {
          id: string
          company_id: string
          file_name: string
          storage_path: string
          status: 'pending' | 'processing' | 'active' | 'error'
          indexed_at: string | null
          metadata: Record<string, any> | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          file_name: string
          storage_path: string
          status?: 'pending' | 'processing' | 'active' | 'error'
          indexed_at?: string | null
          metadata?: Record<string, any> | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          file_name?: string
          storage_path?: string
          status?: 'pending' | 'processing' | 'active' | 'error'
          indexed_at?: string | null
          metadata?: Record<string, any> | null
          created_at?: string
          updated_at?: string
        }
      }
      knowledge_base_chunks: {
        Row: {
          id: string
          document_id: string
          chunk_text: string
          embedding: number[]
          metadata: Record<string, any> | null
          created_at: string
        }
        Insert: {
          id?: string
          document_id: string
          chunk_text: string
          embedding: number[]
          metadata?: Record<string, any> | null
          created_at?: string
        }
        Update: {
          id?: string
          document_id?: string
          chunk_text?: string
          embedding?: number[]
          metadata?: Record<string, any> | null
          created_at?: string
        }
      }
      conversations: {
        Row: {
          id: string
          company_id: string
          employee_user_id: string
          assigned_agent_user_id: string | null
          status: 'green' | 'yellow' | 'red' | 'resolved_ai' | 'resolved_human' | 'typing_ai' | 'typing_user' | 'active_human_needed'
          last_message_preview: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          employee_user_id: string
          assigned_agent_user_id?: string | null
          status?: 'green' | 'yellow' | 'red' | 'resolved_ai' | 'resolved_human' | 'typing_ai' | 'typing_user' | 'active_human_needed'
          last_message_preview?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          employee_user_id?: string
          assigned_agent_user_id?: string | null
          status?: 'green' | 'yellow' | 'red' | 'resolved_ai' | 'resolved_human' | 'typing_ai' | 'typing_user' | 'active_human_needed'
          last_message_preview?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      messages: {
        Row: {
          id: string
          conversation_id: string
          sender_user_id: string | null
          sender_type: 'user' | 'ai' | 'agent'
          content: string
          ai_suggestions: Record<string, any>[] | null
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          sender_user_id?: string | null
          sender_type: 'user' | 'ai' | 'agent'
          content: string
          ai_suggestions?: Record<string, any>[] | null
          created_at?: string
        }
        Update: {
          id?: string
          conversation_id?: string
          sender_user_id?: string | null
          sender_type?: 'user' | 'ai' | 'agent'
          content?: string
          ai_suggestions?: Record<string, any>[] | null
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
