import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { KnowledgeBaseService } from '@/lib/knowledge-base'

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    
    // Check authentication
    const { data: { session }, error: authError } = await supabase.auth.getSession()
    if (authError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user info
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('company_id, role')
      .eq('id', session.user.id)
      .single()

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Get documents for the company
    const documents = await KnowledgeBaseService.getDocuments(user.company_id)
    
    // Get stats
    const stats = await KnowledgeBaseService.getStats(user.company_id)

    return NextResponse.json({
      success: true,
      documents: documents.map(doc => ({
        id: doc.id,
        fileName: doc.file_name,
        status: doc.status,
        indexedAt: doc.indexed_at,
        metadata: doc.metadata,
        createdAt: doc.created_at,
        updatedAt: doc.updated_at
      })),
      stats
    })

  } catch (error) {
    console.error('Error getting documents:', error)
    return NextResponse.json(
      { 
        error: 'Failed to get documents',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    
    // Check authentication
    const { data: { session }, error: authError } = await supabase.auth.getSession()
    if (authError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user info
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('company_id, role')
      .eq('id', session.user.id)
      .single()

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Check if user is admin
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    // Get document ID from query params
    const { searchParams } = new URL(request.url)
    const documentId = searchParams.get('id')

    if (!documentId) {
      return NextResponse.json({ error: 'Document ID is required' }, { status: 400 })
    }

    // Verify document belongs to user's company
    const documents = await KnowledgeBaseService.getDocuments(user.company_id)
    const document = documents.find(d => d.id === documentId)

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Delete document
    await KnowledgeBaseService.deleteDocument(documentId)

    return NextResponse.json({
      success: true,
      message: 'Document deleted successfully'
    })

  } catch (error) {
    console.error('Error deleting document:', error)
    return NextResponse.json(
      { 
        error: 'Failed to delete document',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
