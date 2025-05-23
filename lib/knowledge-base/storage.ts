import { supabaseAdmin } from '@/lib/supabase/client'
import { Database } from '@/lib/supabase/client'

type KnowledgeBaseDocument = Database['public']['Tables']['knowledge_base_documents']['Row']
type KnowledgeBaseDocumentInsert = Database['public']['Tables']['knowledge_base_documents']['Insert']

export class KnowledgeBaseStorage {
  private static readonly BUCKET_NAME = 'knowledge-base-documents'

  /**
   * Sanitizes a filename to prevent path traversal and invalid characters.
   * @param filename The original filename.
   * @returns The sanitized filename.
   */
  private static sanitizeFilename(filename: string): string {
    // Remove path traversal attempts (e.g., "../", "./")
    let sanitized = filename.replace(/\.{1,2}[/\\]/g, '');

    // Replace invalid characters with underscores
    // Invalid characters for most file systems: / \ ? % * : | " < >
    sanitized = sanitized.replace(/[/?%*:|"<>]/g, '_');

    // Trim leading/trailing spaces and dots
    sanitized = sanitized.replace(/^\s+|\s+$/g, '');
    sanitized = sanitized.replace(/^\.+|\.+$/g, '');

    // Ensure it's not empty after sanitization
    if (sanitized.length === 0) {
      return 'untitled_file';
    }

    return sanitized;
  }

  /**
   * Initialize the storage bucket for knowledge base documents
   */
  static async initializeBucket(): Promise<void> {
    try {
      // Check if bucket exists
      const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets()
      
      if (listError) {
        throw new Error(`Failed to list buckets: ${listError.message}`)
      }

      const bucketExists = buckets?.some(bucket => bucket.name === this.BUCKET_NAME)

      if (!bucketExists) {
        // Create the bucket
        const { error: createError } = await supabaseAdmin.storage.createBucket(this.BUCKET_NAME, {
          public: false,
          allowedMimeTypes: [
            'application/pdf',
            'text/plain',
            'text/markdown',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/csv',
            'application/json'
          ],
          fileSizeLimit: 50 * 1024 * 1024 // 50MB limit
        })

        if (createError) {
          throw new Error(`Failed to create bucket: ${createError.message}`)
        }

        console.log(`Created knowledge base storage bucket: ${this.BUCKET_NAME}`)
      } else {
        console.log(`Knowledge base storage bucket already exists: ${this.BUCKET_NAME}`)
      }
    } catch (error) {
      console.error('Error initializing storage bucket:', error)
      throw error
    }
  }

  /**
   * Upload a document to the knowledge base storage
   */
  static async uploadDocument(
    companyId: string,
    file: File,
    metadata: Record<string, any> = {}
  ): Promise<KnowledgeBaseDocument> {
    try {
      // Generate unique file path
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const sanitizedFileName = KnowledgeBaseStorage.sanitizeFilename(file.name);
      const fileName = `${timestamp}-${sanitizedFileName}`
      const storagePath = `${companyId}/${fileName}`

      // Upload file to storage
      const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
        .from(this.BUCKET_NAME)
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false
        })

      if (uploadError) {
        throw new Error(`Failed to upload file: ${uploadError.message}`)
      }

      // Create database record
      const documentData: KnowledgeBaseDocumentInsert = {
        company_id: companyId,
        file_name: file.name,
        storage_path: storagePath,
        status: 'pending',
        metadata: {
          ...metadata,
          file_size: file.size,
          file_type: file.type,
          upload_timestamp: new Date().toISOString()
        }
      }

      const { data: document, error: dbError } = await supabaseAdmin
        .from('knowledge_base_documents')
        .insert(documentData)
        .select()
        .single()

      if (dbError) {
        // Clean up uploaded file if database insert fails
        await supabaseAdmin.storage
          .from(this.BUCKET_NAME)
          .remove([storagePath])
        
        throw new Error(`Failed to create document record: ${dbError.message}`)
      }

      return document
    } catch (error) {
      console.error('Error uploading document:', error)
      throw error
    }
  }

  /**
   * Download a document from storage
   */
  static async downloadDocument(storagePath: string): Promise<Blob> {
    try {
      const { data, error } = await supabaseAdmin.storage
        .from(this.BUCKET_NAME)
        .download(storagePath)

      if (error) {
        throw new Error(`Failed to download document: ${error.message}`)
      }

      return data
    } catch (error) {
      console.error('Error downloading document:', error)
      throw error
    }
  }

  /**
   * Delete a document from storage and database
   */
  static async deleteDocument(documentId: string): Promise<void> {
    try {
      // Get document info first
      const { data: document, error: fetchError } = await supabaseAdmin
        .from('knowledge_base_documents')
        .select('storage_path')
        .eq('id', documentId)
        .single()

      if (fetchError) {
        throw new Error(`Failed to fetch document: ${fetchError.message}`)
      }

      // Delete from storage
      const { error: storageError } = await supabaseAdmin.storage
        .from(this.BUCKET_NAME)
        .remove([document.storage_path])

      if (storageError) {
        console.warn(`Failed to delete from storage: ${storageError.message}`)
      }

      // Delete from database (this will cascade to chunks)
      const { error: dbError } = await supabaseAdmin
        .from('knowledge_base_documents')
        .delete()
        .eq('id', documentId)

      if (dbError) {
        throw new Error(`Failed to delete document record: ${dbError.message}`)
      }
    } catch (error) {
      console.error('Error deleting document:', error)
      throw error
    }
  }

  /**
   * Get all documents for a company
   */
  static async getDocuments(companyId: string): Promise<KnowledgeBaseDocument[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('knowledge_base_documents')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })

      if (error) {
        throw new Error(`Failed to fetch documents: ${error.message}`)
      }

      return data || []
    } catch (error) {
      console.error('Error fetching documents:', error)
      throw error
    }
  }

  /**
   * Update document status
   */
  static async updateDocumentStatus(
    documentId: string,
    status: 'pending' | 'processing' | 'active' | 'error',
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      const updateData: any = { status }
      
      if (status === 'active') {
        updateData.indexed_at = new Date().toISOString()
      }
      
      if (metadata) {
        updateData.metadata = metadata
      }

      const { error } = await supabaseAdmin
        .from('knowledge_base_documents')
        .update(updateData)
        .eq('id', documentId)

      if (error) {
        throw new Error(`Failed to update document status: ${error.message}`)
      }
    } catch (error) {
      console.error('Error updating document status:', error)
      throw error
    }
  }

  /**
   * Get documents by status
   */
  static async getDocumentsByStatus(
    status: 'pending' | 'processing' | 'active' | 'error'
  ): Promise<KnowledgeBaseDocument[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('knowledge_base_documents')
        .select('*')
        .eq('status', status)
        .order('created_at', { ascending: true })

      if (error) {
        throw new Error(`Failed to fetch documents by status: ${error.message}`)
      }

      return data || []
    } catch (error) {
      console.error('Error fetching documents by status:', error)
      throw error
    }
  }
}
