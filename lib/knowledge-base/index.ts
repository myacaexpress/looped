import { KnowledgeBaseStorage } from './storage'
import { DocumentProcessor } from './processor'
import { EmbeddingsService } from './embeddings'
import { Database } from '@/lib/supabase/client'

type KnowledgeBaseDocument = Database['public']['Tables']['knowledge_base_documents']['Row']
type KnowledgeBaseChunk = Database['public']['Tables']['knowledge_base_chunks']['Row']

export interface KnowledgeBaseSearchResult {
  chunks: Array<KnowledgeBaseChunk & { similarity: number }>
  context: string
  sources: Array<{
    documentId: string
    fileName: string
    chunkCount: number
  }>
}

export class KnowledgeBaseService {
  /**
   * Initialize the knowledge base system
   */
  static async initialize(): Promise<void> {
    try {
      console.log('Initializing Knowledge Base Service...')
      
      // Initialize storage bucket
      await KnowledgeBaseStorage.initializeBucket()
      
      // Validate OpenAI configuration
      const validation = EmbeddingsService.validateConfiguration()
      if (!validation.valid) {
        throw new Error(`OpenAI configuration invalid: ${validation.error}`)
      }
      
      console.log('Knowledge Base Service initialized successfully')
    } catch (error) {
      console.error('Failed to initialize Knowledge Base Service:', error)
      throw error
    }
  }

  /**
   * Upload and process a document
   */
  static async uploadDocument(
    companyId: string,
    file: File,
    metadata: Record<string, any> = {}
  ): Promise<KnowledgeBaseDocument> {
    try {
      console.log(`Uploading document: ${file.name}`)
      
      // Validate document
      const validation = DocumentProcessor.validateDocument(file)
      if (!validation.valid) {
        throw new Error(validation.error)
      }

      // Upload to storage
      const document = await KnowledgeBaseStorage.uploadDocument(companyId, file, metadata)
      
      // Process document asynchronously
      this.processDocumentAsync(document)
      
      return document
    } catch (error) {
      console.error('Error uploading document:', error)
      throw error
    }
  }

  /**
   * Process a document asynchronously
   */
  private static async processDocumentAsync(document: KnowledgeBaseDocument): Promise<void> {
    try {
      console.log(`Processing document: ${document.file_name}`)
      
      // Extract and chunk text
      const chunks = await DocumentProcessor.processDocument(document)
      
      if (chunks.length === 0) {
        // Update document status to error for empty documents
        await KnowledgeBaseStorage.updateDocumentStatus(document.id, 'error', {
          error: 'No processable content found in document',
          processed_at: new Date().toISOString()
        });
        console.warn(`Document ${document.file_name} has no processable content.`);
        return; // Exit early if no chunks
      }

      // Generate embeddings
      await EmbeddingsService.generateEmbeddings(document.id, chunks)
      
      // Update document status to active
      await KnowledgeBaseStorage.updateDocumentStatus(document.id, 'active', {
        chunks_count: chunks.length,
        processed_at: new Date().toISOString()
      })
      
      console.log(`Successfully processed document: ${document.file_name} (${chunks.length} chunks)`)
    } catch (error) {
      console.error(`Error processing document ${document.file_name}:`, error)
      
      // Update document status to error
      await KnowledgeBaseStorage.updateDocumentStatus(document.id, 'error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        processed_at: new Date().toISOString()
      })
    }
  }

  /**
   * Search the knowledge base
   */
  static async search(
    query: string,
    companyId: string,
    options: {
      limit?: number
      threshold?: number
      includeContext?: boolean
    } = {}
  ): Promise<KnowledgeBaseSearchResult> {
    try {
      const { limit = 5, threshold = 0.7, includeContext = true } = options
      
      console.log(`Searching knowledge base for: "${query}"`)
      
      // Search for similar chunks
      const chunks = await EmbeddingsService.searchKnowledgeBase(
        query,
        companyId,
        limit,
        threshold
      )

      // Build context from chunks
      let context = ''
      const sources: Array<{ documentId: string; fileName: string; chunkCount: number }> = []
      
      if (includeContext && chunks.length > 0) {
        // Group chunks by document
        const documentGroups = new Map<string, typeof chunks>()
        
        for (const chunk of chunks) {
          const docId = chunk.document_id
          if (!documentGroups.has(docId)) {
            documentGroups.set(docId, [])
          }
          documentGroups.get(docId)!.push(chunk)
        }

        // Build context and sources
        const contextParts: string[] = []
        
        for (const [documentId, docChunks] of documentGroups) {
          const fileName = docChunks[0].metadata?.fileName || 'Unknown Document'
          
          sources.push({
            documentId,
            fileName,
            chunkCount: docChunks.length
          })

          // Add document context
          contextParts.push(`\n--- From ${fileName} ---`)
          docChunks.forEach((chunk, index) => {
            contextParts.push(`${chunk.chunk_text}`)
            if (index < docChunks.length - 1) {
              contextParts.push('') // Add spacing between chunks
            }
          })
        }

        context = contextParts.join('\n')
      }

      console.log(`Found ${chunks.length} relevant chunks from ${sources.length} documents`)

      return {
        chunks,
        context,
        sources
      }
    } catch (error) {
      console.error('Error searching knowledge base:', error)
      throw error
    }
  }

  /**
   * Get all documents for a company
   */
  static async getDocuments(companyId: string): Promise<KnowledgeBaseDocument[]> {
    try {
      return await KnowledgeBaseStorage.getDocuments(companyId)
    } catch (error) {
      console.error('Error getting documents:', error)
      throw error
    }
  }

  /**
   * Delete a document and its chunks
   */
  static async deleteDocument(documentId: string): Promise<void> {
    try {
      console.log(`Deleting document: ${documentId}`)
      
      // Delete chunks first
      await EmbeddingsService.deleteDocumentChunks(documentId)
      
      // Delete document and storage
      await KnowledgeBaseStorage.deleteDocument(documentId)
      
      console.log(`Successfully deleted document: ${documentId}`)
    } catch (error) {
      console.error('Error deleting document:', error)
      throw error
    }
  }

  /**
   * Process all pending documents
   */
  static async processPendingDocuments(): Promise<void> {
    try {
      console.log('Processing all pending documents...')
      
      const pendingDocuments = await KnowledgeBaseStorage.getDocumentsByStatus('pending')
      
      console.log(`Found ${pendingDocuments.length} pending documents`)

      // Process documents sequentially to avoid overwhelming the system
      for (const document of pendingDocuments) {
        try {
          await this.processDocumentAsync(document)
        } catch (error) {
          console.error(`Failed to process document ${document.file_name}:`, error)
          // Continue with next document
        }
      }
      
      console.log('Finished processing pending documents')
    } catch (error) {
      console.error('Error processing pending documents:', error)
      throw error
    }
  }

  /**
   * Get knowledge base statistics
   */
  static async getStats(companyId: string): Promise<{
    totalChunks: number
    totalDocuments: number
    avgChunksPerDocument: number
    documentsByStatus: Record<string, number>
  }> {
    try {
      // Get chunk stats
      const chunkStats = await EmbeddingsService.getChunkStats(companyId)
      
      // Get documents by status
      const allDocuments = await KnowledgeBaseStorage.getDocuments(companyId)
      const documentsByStatus = allDocuments.reduce((acc, doc) => {
        acc[doc.status] = (acc[doc.status] || 0) + 1
        return acc
      }, {} as Record<string, number>)

      return {
        totalChunks: Number(chunkStats.totalChunks),
        totalDocuments: Number(chunkStats.totalDocuments),
        avgChunksPerDocument: Number(chunkStats.avgChunksPerDocument),
        documentsByStatus
      }
    } catch (error) {
      console.error('Error getting knowledge base stats:', error)
      throw error
    }
  }

  /**
   * Test the knowledge base system
   */
  static async testSystem(): Promise<{
    storage: boolean
    embeddings: boolean
    search: boolean
    errors: string[]
  }> {
    const errors: string[] = []
    let storage = false
    let embeddings = false
    let search = false

    try {
      // Test storage
      await KnowledgeBaseStorage.initializeBucket()
      storage = true
    } catch (error) {
      errors.push(`Storage test failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    try {
      // Test embeddings
      const result = await EmbeddingsService.testConnection()
      if (result.success) {
        embeddings = true
      } else {
        errors.push(`Embeddings test failed: ${result.error}`)
      }
    } catch (error) {
      errors.push(`Embeddings test failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    try {
      // Test search (this will only work if embeddings work)
      if (embeddings) {
        const testEmbedding = await EmbeddingsService.generateQueryEmbedding('test')
        if (testEmbedding && testEmbedding.length > 0) {
          search = true
        }
      }
    } catch (error) {
      errors.push(`Search test failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    return {
      storage,
      embeddings,
      search,
      errors
    }
  }

  /**
   * Reprocess a document (useful for failed documents)
   */
  static async reprocessDocument(documentId: string): Promise<void> {
    try {
      console.log(`Reprocessing document: ${documentId}`)
      
      // Get document info
      const documents = await KnowledgeBaseStorage.getDocumentsByStatus('error')
      const document = documents.find(d => d.id === documentId)
      
      if (!document) {
        throw new Error('Document not found or not in error status')
      }

      // Delete existing chunks if any
      await EmbeddingsService.deleteDocumentChunks(documentId)
      
      // Reset status to pending
      await KnowledgeBaseStorage.updateDocumentStatus(documentId, 'pending')
      
      // Process the document
      await this.processDocumentAsync(document)
      
      console.log(`Successfully reprocessed document: ${documentId}`)
    } catch (error) {
      console.error('Error reprocessing document:', error)
      throw error
    }
  }
}

// Export all components for direct access if needed
export {
  KnowledgeBaseStorage,
  DocumentProcessor,
  EmbeddingsService
}

// Export types
export type {
  KnowledgeBaseDocument,
  KnowledgeBaseChunk
}
