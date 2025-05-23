import { supabaseAdmin } from '@/lib/supabase/client'
import { DocumentChunk } from './processor'
import { Database } from '@/lib/supabase/client'

type KnowledgeBaseChunk = Database['public']['Tables']['knowledge_base_chunks']['Row']
type KnowledgeBaseChunkInsert = Database['public']['Tables']['knowledge_base_chunks']['Insert']

interface OpenAIEmbeddingItem {
  embedding: number[];
  object: string; // Typically "embedding"
  index: number;
}

export class EmbeddingsService {
  private static readonly OPENAI_API_URL = 'https://api.openai.com/v1/embeddings'
  private static readonly EMBEDDING_MODEL = 'text-embedding-3-small'
  private static readonly EMBEDDING_DIMENSION = 1536
  private static readonly BATCH_SIZE = 100 // Process embeddings in batches

  /**
   * Generate embeddings for document chunks
   */
  static async generateEmbeddings(
    documentId: string,
    chunks: DocumentChunk[]
  ): Promise<KnowledgeBaseChunk[]> {
    try {
      console.log(`Generating embeddings for ${chunks.length} chunks`)
      
      const results: KnowledgeBaseChunk[] = []
      
      // Process chunks in batches to avoid API rate limits
      for (let i = 0; i < chunks.length; i += this.BATCH_SIZE) {
        const batch = chunks.slice(i, i + this.BATCH_SIZE)
        const batchResults = await this.processBatch(documentId, batch)
        results.push(...batchResults)
        
        // Add a small delay between batches to respect rate limits
        if (i + this.BATCH_SIZE < chunks.length) {
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }
      
      console.log(`Successfully generated ${results.length} embeddings`)
      return results
    } catch (error) {
      console.error('Error generating embeddings:', error)
      throw error
    }
  }

  /**
   * Process a batch of chunks
   */
  private static async processBatch(
    documentId: string,
    chunks: DocumentChunk[]
  ): Promise<KnowledgeBaseChunk[]> {
    try {
      // Generate embeddings for all chunks in the batch
      const embeddings = await this.callOpenAIEmbeddings(chunks.map(chunk => chunk.text))
      
      // Prepare data for database insertion
      const chunkData: KnowledgeBaseChunkInsert[] = chunks.map((chunk, index) => ({
        document_id: documentId,
        chunk_text: chunk.text,
        embedding: embeddings[index],
        metadata: chunk.metadata
      }))

      // Insert chunks into database
      const { data, error } = await supabaseAdmin
        .from('knowledge_base_chunks')
        .insert(chunkData)
        .select()

      if (error) {
        throw new Error(`Failed to insert chunks: ${error.message}`)
      }

      return data || []
    } catch (error) {
      console.error('Error processing batch:', error)
      throw error
    }
  }

  /**
   * Call OpenAI API to generate embeddings
   */
  private static async callOpenAIEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      const apiKey = process.env.OPENAI_API_KEY
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY environment variable is not set')
      }

      const response = await fetch(this.OPENAI_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.EMBEDDING_MODEL,
          input: texts,
          encoding_format: 'float'
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`)
      }

      const data = await response.json()
      
      if (!data.data || !Array.isArray(data.data)) {
        throw new Error('Invalid response format from OpenAI API')
      }

      return data.data.map((item: OpenAIEmbeddingItem) => item.embedding)
    } catch (error) {
      console.error('Error calling OpenAI API:', error)
      throw error
    }
  }

  /**
   * Generate embedding for a single query text
   */
  static async generateQueryEmbedding(query: string): Promise<number[]> {
    try {
      const embeddings = await this.callOpenAIEmbeddings([query])
      return embeddings[0]
    } catch (error) {
      console.error('Error generating query embedding:', error)
      throw error
    }
  }

  /**
   * Find similar chunks using vector similarity search
   */
  static async findSimilarChunks(
    queryEmbedding: number[],
    companyId: string,
    limit: number = 5,
    threshold: number = 0.7
  ): Promise<Array<KnowledgeBaseChunk & { similarity: number }>> {
    try {
      // Use pgvector's cosine similarity search
      const { data, error } = await supabaseAdmin.rpc('search_knowledge_base', {
        query_embedding: queryEmbedding,
        company_id: companyId,
        match_threshold: threshold,
        match_count: limit
      })

      if (error) {
        throw new Error(`Failed to search knowledge base: ${error.message}`)
      }

      return data || []
    } catch (error) {
      console.error('Error finding similar chunks:', error)
      throw error
    }
  }

  /**
   * Search knowledge base with text query
   */
  static async searchKnowledgeBase(
    query: string,
    companyId: string,
    limit: number = 5,
    threshold: number = 0.7
  ): Promise<Array<KnowledgeBaseChunk & { similarity: number }>> {
    try {
      // Generate embedding for the query
      const queryEmbedding = await this.generateQueryEmbedding(query)
      
      // Find similar chunks
      return await this.findSimilarChunks(queryEmbedding, companyId, limit, threshold)
    } catch (error) {
      console.error('Error searching knowledge base:', error)
      throw error
    }
  }

  /**
   * Delete all chunks for a document
   */
  static async deleteDocumentChunks(documentId: string): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .from('knowledge_base_chunks')
        .delete()
        .eq('document_id', documentId)

      if (error) {
        throw new Error(`Failed to delete document chunks: ${error.message}`)
      }
    } catch (error) {
      console.error('Error deleting document chunks:', error)
      throw error
    }
  }

  /**
   * Get chunk statistics for a company
   */
  static async getChunkStats(companyId: string): Promise<{
    totalChunks: number
    totalDocuments: number
    avgChunksPerDocument: number
  }> {
    try {
      const { data, error } = await supabaseAdmin.rpc('get_knowledge_base_stats', {
        company_id: companyId
      })

      if (error) {
        throw new Error(`Failed to get chunk stats: ${error.message}`)
      }

      return data || { totalChunks: 0, totalDocuments: 0, avgChunksPerDocument: 0 }
    } catch (error) {
      console.error('Error getting chunk stats:', error)
      throw error
    }
  }

  /**
   * Validate OpenAI API configuration
   */
  static validateConfiguration(): { valid: boolean; error?: string } {
    const apiKey = process.env.OPENAI_API_KEY
    
    if (!apiKey) {
      return {
        valid: false,
        error: 'OPENAI_API_KEY environment variable is not set'
      }
    }

    if (!apiKey.startsWith('sk-')) {
      return {
        valid: false,
        error: 'OPENAI_API_KEY appears to be invalid (should start with sk-)'
      }
    }

    return { valid: true }
  }

  /**
   * Test OpenAI API connection
   */
  static async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const validation = this.validateConfiguration()
      if (!validation.valid) {
        return { success: false, error: validation.error }
      }

      // Test with a simple query
      await this.generateQueryEmbedding('test connection')
      
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }
}
