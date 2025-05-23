import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { DocumentProcessor } from '@/lib/knowledge-base/processor';
import { EmbeddingsService } from '@/lib/knowledge-base/embeddings';
import { KnowledgeBaseStorage } from '@/lib/knowledge-base/storage';

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user profile and check if admin
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError || !profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Access denied. Admin role required.' }, { status: 403 });
    }

    const { company_id } = await request.json();

    if (!company_id) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    // Verify the company_id matches the user's company
    if (profile.company_id !== company_id) {
      return NextResponse.json({ error: 'Access denied to this company' }, { status: 403 });
    }

    // Get all documents for the company
    const { data: documents, error: documentsError } = await supabase
      .from('knowledge_base_documents')
      .select('*')
      .eq('company_id', company_id);

    if (documentsError) {
      console.error('Error fetching documents:', documentsError);
      return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 });
    }

    if (!documents || documents.length === 0) {
      return NextResponse.json({ message: 'No documents to re-index' }, { status: 200 });
    }

    // Clear existing chunks for this company (which will cascade to embeddings)
    const documentIds = documents.map(d => d.id);
    const { error: clearError } = await supabase
      .from('knowledge_base_chunks')
      .delete()
      .in('document_id', documentIds);

    if (clearError) {
      console.error('Error clearing existing chunks:', clearError);
      return NextResponse.json({ error: 'Failed to clear existing chunks' }, { status: 500 });
    }

    let processedCount = 0;
    let errorCount = 0;

    // Process each document
    for (const document of documents) {
      try {
        // Set document status to processing
        await KnowledgeBaseStorage.updateDocumentStatus(document.id, 'processing');

        // Process the document using the existing DocumentProcessor
        const chunks = await DocumentProcessor.processDocument(document);

        if (chunks.length === 0) {
          console.warn(`No chunks extracted from document: ${document.file_name}`);
          await KnowledgeBaseStorage.updateDocumentStatus(document.id, 'error', {
            error: 'No content extracted',
            processed_at: new Date().toISOString()
          });
          errorCount++;
          continue;
        }

        // Generate embeddings for the chunks
        await EmbeddingsService.generateEmbeddings(document.id, chunks);

        // Update document status to active
        await KnowledgeBaseStorage.updateDocumentStatus(document.id, 'active');

        processedCount++;
      } catch (error) {
        console.error(`Error processing document ${document.file_name}:`, error);
        await KnowledgeBaseStorage.updateDocumentStatus(document.id, 'error', {
          error: error instanceof Error ? error.message : 'Unknown error',
          processed_at: new Date().toISOString()
        });
        errorCount++;
      }
    }

    return NextResponse.json({
      message: 'Re-indexing completed',
      processed: processedCount,
      errors: errorCount,
      total: documents.length
    });

  } catch (error) {
    console.error('Re-indexing error:', error);
    return NextResponse.json(
      { error: 'Internal server error during re-indexing' },
      { status: 500 }
    );
  }
}
