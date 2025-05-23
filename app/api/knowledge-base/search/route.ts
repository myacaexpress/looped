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

    // Parse request body
    const body = await request.json()
    const { query, limit = 5, threshold = 0.7, includeContext = true } = body

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 })
    }

    // Search knowledge base
    const results = await KnowledgeBaseService.search(
      query,
      user.company_id,
      {
        limit: Math.min(limit, 20), // Cap at 20 results
        threshold: Math.max(0.1, Math.min(threshold, 1.0)), // Ensure valid range
        includeContext
      }
    )

    return NextResponse.json({
      success: true,
      query,
      results: {
        chunks: results.chunks.map(chunk => ({
          id: chunk.id,
          text: chunk.chunk_text,
          similarity: chunk.similarity,
          metadata: chunk.metadata
        })),
        context: results.context,
        sources: results.sources,
        totalResults: results.chunks.length
      }
    })

  } catch (error) {
    console.error('Error searching knowledge base:', error)
    return NextResponse.json(
      { 
        error: 'Failed to search knowledge base',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

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

    // Get query from URL params
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')
    const limit = parseInt(searchParams.get('limit') || '5')
    const threshold = parseFloat(searchParams.get('threshold') || '0.7')

    if (!query) {
      return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 })
    }

    // Search knowledge base
    const results = await KnowledgeBaseService.search(
      query,
      user.company_id,
      {
        limit: Math.min(limit, 20),
        threshold: Math.max(0.1, Math.min(threshold, 1.0)),
        includeContext: true
      }
    )

    return NextResponse.json({
      success: true,
      query,
      results: {
        chunks: results.chunks.map(chunk => ({
          id: chunk.id,
          text: chunk.chunk_text,
          similarity: chunk.similarity,
          metadata: chunk.metadata
        })),
        context: results.context,
        sources: results.sources,
        totalResults: results.chunks.length
      }
    })

  } catch (error) {
    console.error('Error searching knowledge base:', error)
    return NextResponse.json(
      { 
        error: 'Failed to search knowledge base',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
