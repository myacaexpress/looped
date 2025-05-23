'use client'

import { useState } from 'react'

interface Document {
  id: string
  fileName: string
  status: string
  createdAt: string
}

interface SearchResult {
  id: string
  text: string
  similarity: number
  metadata: any
}

interface SearchResponse {
  chunks: SearchResult[]
  context: string
  sources: Array<{
    documentId: string
    fileName: string
    chunkCount: number
  }>
  totalResults: number
}

export default function TestKnowledgeBasePage() {
  const [documents, setDocuments] = useState<Document[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResponse | null>(null)
  const [uploading, setUploading] = useState(false)
  const [searching, setSearching] = useState(false)
  const [loading, setLoading] = useState(false)

  // Load documents
  const loadDocuments = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/knowledge-base/documents')
      const data = await response.json()
      
      if (data.success) {
        setDocuments(data.documents)
      } else {
        console.error('Failed to load documents:', data.error)
      }
    } catch (error) {
      console.error('Error loading documents:', error)
    } finally {
      setLoading(false)
    }
  }

  // Upload document
  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('metadata', JSON.stringify({
        uploadedBy: 'test-user',
        category: 'test'
      }))

      const response = await fetch('/api/knowledge-base/upload', {
        method: 'POST',
        body: formData
      })

      const data = await response.json()
      
      if (data.success) {
        console.log('Document uploaded successfully:', data.document)
        await loadDocuments() // Refresh the list
      } else {
        console.error('Upload failed:', data.error)
        alert(`Upload failed: ${data.error}`)
      }
    } catch (error) {
      console.error('Error uploading document:', error)
      alert('Error uploading document')
    } finally {
      setUploading(false)
      // Reset the input
      event.target.value = ''
    }
  }

  // Search knowledge base
  const handleSearch = async () => {
    if (!searchQuery.trim()) return

    setSearching(true)
    try {
      const response = await fetch('/api/knowledge-base/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: searchQuery,
          limit: 5,
          threshold: 0.7,
          includeContext: true
        })
      })

      const data = await response.json()
      
      if (data.success) {
        setSearchResults(data.results)
      } else {
        console.error('Search failed:', data.error)
        alert(`Search failed: ${data.error}`)
      }
    } catch (error) {
      console.error('Error searching:', error)
      alert('Error searching knowledge base')
    } finally {
      setSearching(false)
    }
  }

  // Delete document
  const handleDelete = async (documentId: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return

    try {
      const response = await fetch(`/api/knowledge-base/documents?id=${documentId}`, {
        method: 'DELETE'
      })

      const data = await response.json()
      
      if (data.success) {
        await loadDocuments() // Refresh the list
      } else {
        console.error('Delete failed:', data.error)
        alert(`Delete failed: ${data.error}`)
      }
    } catch (error) {
      console.error('Error deleting document:', error)
      alert('Error deleting document')
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Knowledge Base Test</h1>
      
      {/* Upload Section */}
      <div className="mb-8 p-4 border rounded-lg">
        <h2 className="text-xl font-semibold mb-4">Upload Document</h2>
        <div className="flex items-center gap-4">
          <input
            type="file"
            accept=".txt,.md,.json,.csv"
            onChange={handleUpload}
            disabled={uploading}
            className="flex-1 p-2 border rounded"
          />
          {uploading && <span className="text-sm text-gray-500">Uploading...</span>}
        </div>
        <p className="text-sm text-gray-600 mt-2">
          Supported formats: TXT, MD, JSON, CSV (PDF and DOC support coming soon)
        </p>
      </div>

      {/* Documents List */}
      <div className="mb-8 p-4 border rounded-lg">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Documents</h2>
          <button 
            onClick={loadDocuments} 
            disabled={loading}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
        
        {documents.length === 0 ? (
          <p className="text-gray-500">No documents uploaded yet.</p>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => (
              <div key={doc.id} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                <div>
                  <span className="font-medium">{doc.fileName}</span>
                  <span className={`ml-2 px-2 py-1 text-xs rounded ${
                    doc.status === 'active' ? 'bg-green-100 text-green-800' :
                    doc.status === 'processing' ? 'bg-yellow-100 text-yellow-800' :
                    doc.status === 'error' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {doc.status}
                  </span>
                  <span className="ml-2 text-sm text-gray-500">
                    {new Date(doc.createdAt).toLocaleString()}
                  </span>
                </div>
                <button
                  onClick={() => handleDelete(doc.id)}
                  className="px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Search Section */}
      <div className="mb-8 p-4 border rounded-lg">
        <h2 className="text-xl font-semibold mb-4">Search Knowledge Base</h2>
        <div className="flex gap-4 mb-4">
          <input
            type="text"
            placeholder="Enter your search query..."
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
            onKeyPress={(e: React.KeyboardEvent) => e.key === 'Enter' && handleSearch()}
            className="flex-1 p-2 border rounded"
          />
          <button 
            onClick={handleSearch} 
            disabled={searching || !searchQuery.trim()}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
          >
            {searching ? 'Searching...' : 'Search'}
          </button>
        </div>

        {/* Search Results */}
        {searchResults && (
          <div className="mt-6">
            <h3 className="text-lg font-semibold mb-4">
              Search Results ({searchResults.totalResults} found)
            </h3>
            
            {searchResults.sources.length > 0 && (
              <div className="mb-4 p-3 bg-blue-50 rounded">
                <h4 className="font-medium mb-2">Sources:</h4>
                <ul className="text-sm">
                  {searchResults.sources.map((source, index) => (
                    <li key={index}>
                      {source.fileName} ({source.chunkCount} chunks)
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {searchResults.chunks.length === 0 ? (
              <p className="text-gray-500">No relevant results found.</p>
            ) : (
              <div className="space-y-4">
                {searchResults.chunks.map((chunk, index) => (
                  <div key={chunk.id} className="p-4 border rounded-lg">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-sm font-medium text-blue-600">
                        Chunk {index + 1}
                      </span>
                      <span className="text-sm text-gray-500">
                        Similarity: {(chunk.similarity * 100).toFixed(1)}%
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">
                      {chunk.text}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {searchResults.context && (
              <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium mb-2">Combined Context:</h4>
                <textarea
                  value={searchResults.context}
                  readOnly
                  className="w-full h-40 text-sm p-2 border rounded"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
