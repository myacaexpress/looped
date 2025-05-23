import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { KnowledgeBaseService } from '@/lib/knowledge-base'

export async function POST(request: NextRequest) {
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

    // Parse form data
    const formData = await request.formData()
    const file = formData.get('file') as File
    const metadataStr = formData.get('metadata') as string

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Define allowed file types and max size
    const MAX_FILE_SIZE_MB = 5;
    const ALLOWED_FILE_TYPES = [
      'application/pdf',
      'text/plain',
      'text/markdown',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'text/csv',
      'application/json'
    ];

    // Validate file type
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Invalid file type. Allowed types are: ${ALLOWED_FILE_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      return NextResponse.json(
        { error: `File size exceeds the maximum limit of ${MAX_FILE_SIZE_MB}MB` },
        { status: 400 }
      );
    }

    // Parse metadata
    let metadata = {}
    if (metadataStr) {
      try {
        metadata = JSON.parse(metadataStr)
      } catch (error) {
        return NextResponse.json({ error: 'Invalid metadata JSON' }, { status: 400 })
      }
    }

    // Upload and process document
    const document = await KnowledgeBaseService.uploadDocument(
      user.company_id,
      file,
      metadata
    )

    return NextResponse.json({
      success: true,
      document: {
        id: document.id,
        fileName: document.file_name,
        status: document.status,
        createdAt: document.created_at
      }
    })

  } catch (error) {
    console.error('Error uploading document:', error)
    return NextResponse.json(
      { 
        error: 'Failed to upload document',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
