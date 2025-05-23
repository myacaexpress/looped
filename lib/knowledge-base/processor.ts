import { KnowledgeBaseStorage } from './storage'
import { Database } from '@/lib/supabase/client'

type KnowledgeBaseDocument = Database['public']['Tables']['knowledge_base_documents']['Row']

export interface DocumentChunk {
  text: string
  metadata: Record<string, any>
}

export class DocumentProcessor {
  private static readonly MAX_CHUNK_SIZE = 1000
  private static readonly CHUNK_OVERLAP = 200
  private static readonly MAX_JSON_DEPTH = 10; // Limit recursion depth for JSON parsing

  /**
   * Process a document and extract text content
   */
  static async processDocument(document: KnowledgeBaseDocument): Promise<DocumentChunk[]> {
    try {
      // Update status to processing
      await KnowledgeBaseStorage.updateDocumentStatus(document.id, 'processing')

      // Download the document
      const blob = await KnowledgeBaseStorage.downloadDocument(document.storage_path)
      
      // Extract text based on file type
      const text = await this.extractText(blob, document.file_name)
      
      if (!text || text.trim().length === 0) {
        throw new Error('No text content extracted from document')
      }

      // Split text into chunks
      const chunks = this.chunkText(text, {
        fileName: document.file_name,
        documentId: document.id,
        companyId: document.company_id
      })

      return chunks
    } catch (error) {
      // Update status to error
      await KnowledgeBaseStorage.updateDocumentStatus(document.id, 'error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        processed_at: new Date().toISOString()
      })
      throw error
    }
  }

  /**
   * Extract text content from different file types
   */
  private static async extractText(blob: Blob, fileName: string): Promise<string> {
    const fileExtension = fileName.toLowerCase().split('.').pop()
    
    switch (fileExtension) {
      case 'txt':
      case 'md':
      case 'csv':
        return await this.extractPlainText(blob)
      
      case 'json':
        return await this.extractJsonText(blob)
      
      case 'pdf':
        return await this.extractPdfText(blob)
      
      case 'doc':
      case 'docx':
        return await this.extractWordText(blob)
      
      default:
        // Try to extract as plain text
        return await this.extractPlainText(blob)
    }
  }

  /**
   * Extract text from plain text files
   */
  private static async extractPlainText(blob: Blob): Promise<string> {
    return await blob.text()
  }

  /**
   * Extract text from JSON files
   */
  private static async extractJsonText(blob: Blob): Promise<string> {
    try {
      const jsonText = await blob.text()
      const jsonData = JSON.parse(jsonText)
      
      // Convert JSON to readable text format
      return this.jsonToText(jsonData)
    } catch (error) {
      throw new Error('Failed to parse JSON file')
    }
  }

  /**
   * Convert JSON object to readable text
   */
  private static jsonToText(obj: any, prefix = '', depth = 0): string {
    if (depth > this.MAX_JSON_DEPTH) {
      return '[MAX_DEPTH_EXCEEDED]';
    }

    if (typeof obj === 'string') {
      return obj
    }
    
    if (typeof obj === 'number' || typeof obj === 'boolean') {
      return String(obj)
    }
    
    if (Array.isArray(obj)) {
      return obj.map((item, index) => 
        this.jsonToText(item, `${prefix}[${index}]`, depth + 1)
      ).join('\n')
    }
    
    if (typeof obj === 'object' && obj !== null) {
      return Object.entries(obj)
        .map(([key, value]) => {
          const newPrefix = prefix ? `${prefix}.${key}` : key
          const textValue = this.jsonToText(value, newPrefix, depth + 1)
          return `${key}: ${textValue}`
        })
        .join('\n')
    }
    
    return ''
  }

  /**
   * Extract text from PDF files (placeholder - would need pdf-parse or similar)
   */
  private static async extractPdfText(blob: Blob): Promise<string> {
    // For now, throw an error - PDF parsing requires additional dependencies
    throw new Error('PDF processing not yet implemented. Please convert to text format.')
  }

  /**
   * Extract text from Word documents (placeholder - would need mammoth or similar)
   */
  private static async extractWordText(blob: Blob): Promise<string> {
    // For now, throw an error - Word document parsing requires additional dependencies
    throw new Error('Word document processing not yet implemented. Please convert to text format.')
  }

  /**
   * Split text into chunks with overlap
   */
  private static chunkText(text: string, metadata: Record<string, any>): DocumentChunk[] {
    const chunks: DocumentChunk[] = []
    
    // Clean and normalize text
    const cleanText = text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()

    // Split by paragraphs first
    const paragraphs = cleanText.split(/\n\s*\n/)
    
    let currentChunk = ''
    let chunkIndex = 0

    for (const paragraph of paragraphs) {
      const trimmedParagraph = paragraph.trim()
      
      if (!trimmedParagraph) continue

      // If adding this paragraph would exceed chunk size, save current chunk
      if (currentChunk.length + trimmedParagraph.length > this.MAX_CHUNK_SIZE && currentChunk.length > 0) {
        chunks.push({
          text: currentChunk.trim(),
          metadata: {
            ...metadata,
            chunk_index: chunkIndex,
            chunk_size: currentChunk.length
          }
        })
        
        // Start new chunk with overlap from previous chunk
        const words = currentChunk.split(' ')
        const overlapWords = words.slice(-Math.floor(this.CHUNK_OVERLAP / 6)) // Approximate word count for overlap
        currentChunk = overlapWords.join(' ') + '\n\n' + trimmedParagraph
        chunkIndex++
      } else {
        // Add paragraph to current chunk
        if (currentChunk.length > 0) {
          currentChunk += '\n\n' + trimmedParagraph
        } else {
          currentChunk = trimmedParagraph
        }
      }
    }

    // Add the last chunk if it has content
    if (currentChunk.trim().length > 0) {
      chunks.push({
        text: currentChunk.trim(),
        metadata: {
          ...metadata,
          chunk_index: chunkIndex,
          chunk_size: currentChunk.length
        }
      })
    }

    // If no chunks were created (very short text), create one chunk
    if (chunks.length === 0 && cleanText.length > 0) {
      chunks.push({
        text: cleanText,
        metadata: {
          ...metadata,
          chunk_index: 0,
          chunk_size: cleanText.length
        }
      })
    }

    return chunks
  }

  /**
   * Process all pending documents
   */
  static async processPendingDocuments(): Promise<void> {
    try {
      const pendingDocuments = await KnowledgeBaseStorage.getDocumentsByStatus('pending')
      
      console.log(`Processing ${pendingDocuments.length} pending documents`)

      for (const document of pendingDocuments) {
        try {
          console.log(`Processing document: ${document.file_name}`)
          await this.processDocument(document)
          console.log(`Successfully processed: ${document.file_name}`)
        } catch (error) {
          console.error(`Failed to process document ${document.file_name}:`, error)
        }
      }
    } catch (error) {
      console.error('Error processing pending documents:', error)
      throw error
    }
  }

  /**
   * Validate document before processing
   */
  static validateDocument(file: File): { valid: boolean; error?: string } {
    const maxSize = 50 * 1024 * 1024 // 50MB
    const allowedTypes = [
      'text/plain',
      'text/markdown',
      'application/json',
      'text/csv',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]

    if (file.size > maxSize) {
      return {
        valid: false,
        error: 'File size exceeds 50MB limit'
      }
    }

    if (!allowedTypes.includes(file.type)) {
      return {
        valid: false,
        error: `File type ${file.type} is not supported. Supported types: TXT, MD, JSON, CSV, PDF, DOC, DOCX`
      }
    }

    return { valid: true }
  }
}
