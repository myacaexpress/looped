-- Enhanced schema with performance optimizations
-- This file contains additional optimizations to be applied to the existing schema

-- Additional performance indexes for high-traffic queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_company_status_updated 
ON conversations(company_id, status, updated_at DESC) 
WHERE status IN ('green', 'yellow', 'red', 'active_human_needed');

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_agent_status 
ON conversations(assigned_agent_user_id, status) 
WHERE assigned_agent_user_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_conversation_created_desc 
ON messages(conversation_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_sender_type_created 
ON messages(sender_type, created_at DESC);

-- Partial indexes for active conversations only
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_active_only 
ON conversations(company_id, updated_at DESC) 
WHERE status NOT IN ('resolved_ai', 'resolved_human');

-- Composite index for knowledge base search optimization
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_knowledge_base_chunks_company_active 
ON knowledge_base_chunks(document_id) 
WHERE document_id IN (
  SELECT id FROM knowledge_base_documents 
  WHERE status = 'active'
);

-- Index for user company lookups (heavily used in auth)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_id_company 
ON users(id, company_id);

-- Materialized view for conversation statistics (updated periodically)
CREATE MATERIALIZED VIEW IF NOT EXISTS conversation_stats AS
SELECT 
  company_id,
  status,
  COUNT(*) as count,
  DATE_TRUNC('day', created_at) as date_created,
  AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) as avg_duration_seconds
FROM conversations 
GROUP BY company_id, status, DATE_TRUNC('day', created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_stats_unique 
ON conversation_stats(company_id, status, date_created);

-- Function to refresh conversation stats (call periodically)
CREATE OR REPLACE FUNCTION refresh_conversation_stats()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY conversation_stats;
END;
$$;

-- Optimized function for getting conversation list with message counts
CREATE OR REPLACE FUNCTION get_conversations_with_stats(
  p_company_id uuid,
  p_status_filter text DEFAULT 'all',
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  company_id uuid,
  employee_user_id uuid,
  assigned_agent_user_id uuid,
  status conversation_status,
  last_message_preview text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  employee_name text,
  employee_email text,
  agent_name text,
  agent_email text,
  message_count bigint,
  last_message_time timestamp with time zone
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.company_id,
    c.employee_user_id,
    c.assigned_agent_user_id,
    c.status,
    c.last_message_preview,
    c.created_at,
    c.updated_at,
    emp.full_name as employee_name,
    emp.email as employee_email,
    agent.full_name as agent_name,
    agent.email as agent_email,
    COALESCE(msg_stats.message_count, 0) as message_count,
    msg_stats.last_message_time
  FROM conversations c
  LEFT JOIN users emp ON c.employee_user_id = emp.id
  LEFT JOIN users agent ON c.assigned_agent_user_id = agent.id
  LEFT JOIN (
    SELECT 
      conversation_id,
      COUNT(*) as message_count,
      MAX(created_at) as last_message_time
    FROM messages 
    GROUP BY conversation_id
  ) msg_stats ON c.id = msg_stats.conversation_id
  WHERE c.company_id = p_company_id
    AND (p_status_filter = 'all' OR c.status::text = p_status_filter)
  ORDER BY c.updated_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Optimized function for knowledge base search with caching hints
CREATE OR REPLACE FUNCTION search_knowledge_base_optimized(
  query_embedding vector(1536),
  p_company_id uuid,
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
  similarity float,
  document_name text
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
    1 - (kbc.embedding <=> query_embedding) AS similarity,
    kbd.file_name as document_name
  FROM knowledge_base_chunks kbc
  JOIN knowledge_base_documents kbd ON kbc.document_id = kbd.id
  WHERE kbd.company_id = p_company_id
    AND kbd.status = 'active'
    AND 1 - (kbc.embedding <=> query_embedding) > match_threshold
  ORDER BY kbc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Function to get dashboard statistics efficiently
CREATE OR REPLACE FUNCTION get_dashboard_stats(p_company_id uuid)
RETURNS TABLE (
  total_conversations bigint,
  active_conversations bigint,
  resolved_conversations bigint,
  needs_attention bigint,
  today_conversations bigint,
  avg_response_time_minutes numeric
)
LANGUAGE plpgsql
AS $$
DECLARE
  today_start timestamp with time zone;
BEGIN
  today_start := DATE_TRUNC('day', NOW());
  
  RETURN QUERY
  SELECT 
    COUNT(*) as total_conversations,
    COUNT(*) FILTER (WHERE status IN ('green', 'yellow', 'red', 'typing_ai', 'typing_user', 'active_human_needed')) as active_conversations,
    COUNT(*) FILTER (WHERE status IN ('resolved_ai', 'resolved_human')) as resolved_conversations,
    COUNT(*) FILTER (WHERE status IN ('red', 'active_human_needed')) as needs_attention,
    COUNT(*) FILTER (WHERE created_at >= today_start) as today_conversations,
    ROUND(AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 60), 2) as avg_response_time_minutes
  FROM conversations
  WHERE company_id = p_company_id;
END;
$$;

-- Create a function to batch update conversation statuses (for bulk operations)
CREATE OR REPLACE FUNCTION batch_update_conversation_status(
  conversation_ids uuid[],
  new_status conversation_status,
  agent_id uuid DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  updated_count int;
BEGIN
  UPDATE conversations 
  SET 
    status = new_status,
    assigned_agent_user_id = COALESCE(agent_id, assigned_agent_user_id),
    updated_at = NOW()
  WHERE id = ANY(conversation_ids);
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

-- Add a trigger to automatically update last_message_preview
CREATE OR REPLACE FUNCTION update_conversation_preview()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations 
  SET 
    last_message_preview = LEFT(NEW.content, 100),
    updated_at = NOW()
  WHERE id = NEW.conversation_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_conversation_preview
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_preview();

-- Optimize vector search with better index parameters
DROP INDEX IF EXISTS idx_knowledge_base_chunks_embedding;
CREATE INDEX idx_knowledge_base_chunks_embedding ON knowledge_base_chunks 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 1000);

-- Add statistics collection for query optimization
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Create a view for monitoring slow queries
CREATE OR REPLACE VIEW slow_queries AS
SELECT 
  query,
  calls,
  total_exec_time,
  mean_exec_time,
  max_exec_time,
  rows,
  100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0) AS hit_percent
FROM pg_stat_statements
WHERE mean_exec_time > 100  -- queries taking more than 100ms on average
ORDER BY mean_exec_time DESC;
