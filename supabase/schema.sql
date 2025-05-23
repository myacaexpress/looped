-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Create custom types
CREATE TYPE conversation_status AS ENUM (
  'green',
  'yellow', 
  'red',
  'resolved_ai',
  'resolved_human',
  'typing_ai',
  'typing_user',
  'active_human_needed'
);

CREATE TYPE user_role AS ENUM ('employee', 'admin');
CREATE TYPE sender_type AS ENUM ('user', 'ai', 'agent');
CREATE TYPE document_status AS ENUM ('pending', 'processing', 'active', 'error');

-- Companies table
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  admin_user_id UUID NOT NULL,
  configuration_details JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Users table (extends Supabase auth.users)
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role user_role NOT NULL DEFAULT 'employee',
  email TEXT NOT NULL,
  full_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Knowledge base documents table
CREATE TABLE knowledge_base_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  status document_status NOT NULL DEFAULT 'pending',
  indexed_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Knowledge base chunks table (for vector search)
CREATE TABLE knowledge_base_chunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES knowledge_base_documents(id) ON DELETE CASCADE,
  chunk_text TEXT NOT NULL,
  embedding vector(1536), -- OpenAI embedding dimension
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Conversations table
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_agent_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status conversation_status NOT NULL DEFAULT 'green',
  last_message_preview TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Messages table
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  sender_type sender_type NOT NULL,
  content TEXT NOT NULL,
  ai_suggestions JSONB DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_users_company_id ON users(company_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_knowledge_base_documents_company_id ON knowledge_base_documents(company_id);
CREATE INDEX idx_knowledge_base_documents_status ON knowledge_base_documents(status);
CREATE INDEX idx_knowledge_base_chunks_document_id ON knowledge_base_chunks(document_id);
CREATE INDEX idx_conversations_company_id ON conversations(company_id);
CREATE INDEX idx_conversations_employee_user_id ON conversations(employee_user_id);
CREATE INDEX idx_conversations_assigned_agent_user_id ON conversations(assigned_agent_user_id);
CREATE INDEX idx_conversations_status ON conversations(status);
CREATE INDEX idx_conversations_updated_at ON conversations(updated_at DESC);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);

-- Vector similarity search index
CREATE INDEX idx_knowledge_base_chunks_embedding ON knowledge_base_chunks 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Row Level Security (RLS) policies
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Companies policies
CREATE POLICY "Users can view their own company" ON companies
  FOR SELECT USING (admin_user_id = auth.uid());

CREATE POLICY "Users can update their own company" ON companies
  FOR UPDATE USING (admin_user_id = auth.uid());

-- Users policies
CREATE POLICY "Users can view users in their company" ON users
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own profile" ON users
  FOR UPDATE USING (id = auth.uid());

-- Knowledge base documents policies
CREATE POLICY "Users can view documents in their company" ON knowledge_base_documents
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage documents in their company" ON knowledge_base_documents
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Knowledge base chunks policies
CREATE POLICY "Users can view chunks in their company" ON knowledge_base_chunks
  FOR SELECT USING (
    document_id IN (
      SELECT id FROM knowledge_base_documents 
      WHERE company_id IN (
        SELECT company_id FROM users WHERE id = auth.uid()
      )
    )
  );

-- Conversations policies
CREATE POLICY "Users can view conversations in their company" ON conversations
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can create conversations in their company" ON conversations
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT company_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update conversations in their company" ON conversations
  FOR UPDATE USING (
    company_id IN (
      SELECT company_id FROM users WHERE id = auth.uid()
    )
  );

-- Messages policies
CREATE POLICY "Users can view messages in their company conversations" ON messages
  FOR SELECT USING (
    conversation_id IN (
      SELECT id FROM conversations 
      WHERE company_id IN (
        SELECT company_id FROM users WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can create messages in their company conversations" ON messages
  FOR INSERT WITH CHECK (
    conversation_id IN (
      SELECT id FROM conversations 
      WHERE company_id IN (
        SELECT company_id FROM users WHERE id = auth.uid()
      )
    )
  );

-- Functions for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_knowledge_base_documents_updated_at BEFORE UPDATE ON knowledge_base_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Functions for knowledge base search and statistics
CREATE OR REPLACE FUNCTION search_knowledge_base(
  query_embedding vector(1536),
  company_id uuid,
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  chunk_text text,
  embedding vector(1536),
  metadata jsonb,
  created_at timestamp with time zone,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kbc.id,
    kbc.document_id,
    kbc.chunk_text,
    kbc.embedding,
    kbc.metadata,
    kbc.created_at,
    1 - (kbc.embedding <=> query_embedding) AS similarity
  FROM knowledge_base_chunks kbc
  JOIN knowledge_base_documents kbd ON kbc.document_id = kbd.id
  WHERE kbd.company_id = search_knowledge_base.company_id
    AND kbd.status = 'active'
    AND 1 - (kbc.embedding <=> query_embedding) > match_threshold
  ORDER BY kbc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

CREATE OR REPLACE FUNCTION get_knowledge_base_stats(company_id uuid)
RETURNS TABLE (
  total_chunks bigint,
  total_documents bigint,
  avg_chunks_per_document numeric
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(kbc.id) AS total_chunks,
    COUNT(DISTINCT kbc.document_id) AS total_documents,
    CASE 
      WHEN COUNT(DISTINCT kbc.document_id) > 0 
      THEN ROUND(COUNT(kbc.id)::numeric / COUNT(DISTINCT kbc.document_id), 2)
      ELSE 0
    END AS avg_chunks_per_document
  FROM knowledge_base_chunks kbc
  JOIN knowledge_base_documents kbd ON kbc.document_id = kbd.id
  WHERE kbd.company_id = get_knowledge_base_stats.company_id
    AND kbd.status = 'active';
END;
$$;
