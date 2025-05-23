'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface TestResult {
  response: string;
  status: 'green' | 'yellow' | 'red';
  confidence: number;
  suggestions: Array<{
    id: string;
    text: string;
    confidence: number;
  }>;
  sources?: Array<{
    documentId: string;
    fileName: string;
    chunkCount: number;
  }>;
}

export default function TestHandoffPage() {
  const [message, setMessage] = useState('');
  const [conversationId, setConversationId] = useState(`test_${Date.now()}`);
  const [result, setResult] = useState<TestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const testScenarios = [
    {
      name: "Simple Question (Green)",
      message: "What are your support hours?",
      description: "Should result in GREEN status with high confidence"
    },
    {
      name: "Account Issue (Yellow)",
      message: "I can't access my account and need help with password reset",
      description: "Should result in YELLOW status with moderate confidence"
    },
    {
      name: "Billing Dispute (Red)",
      message: "I was charged twice for my subscription and I'm very upset about this billing error!",
      description: "Should result in RED status requiring human intervention"
    },
    {
      name: "Technical Emergency (Red)",
      message: "URGENT: Our production system is down and we need immediate help!",
      description: "Should result in RED status due to urgency"
    },
    {
      name: "Complex Technical Issue (Yellow/Red)",
      message: "I'm getting error code 500 when trying to integrate your API with our system",
      description: "Should result in YELLOW or RED status depending on complexity analysis"
    }
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: message.trim(),
          conversationId,
          previousMessages: []
        }),
      });

      const data = await response.json();

      if (data.success) {
        setResult({
          response: data.data.message,
          status: data.data.status,
          confidence: data.data.confidence,
          suggestions: data.data.suggestions || [],
          sources: data.data.sources
        });
      } else {
        setError(data.error || 'Unknown error occurred');
      }
    } catch (err) {
      setError('Failed to send message');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadScenario = (scenario: typeof testScenarios[0]) => {
    setMessage(scenario.message);
    setConversationId(`test_${Date.now()}`);
    setResult(null);
    setError(null);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'green': return 'text-green-600 bg-green-50 border-green-200';
      case 'yellow': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'red': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'green': return '🟢';
      case 'yellow': return '🟡';
      case 'red': return '🔴';
      default: return '⚪';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            AI-to-Human Handoff Test
          </h1>
          <p className="text-gray-600 mb-8">
            Test the AI handoff mechanism with different conversation scenarios. 
            The system will analyze each message and determine the appropriate status:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="p-4 border border-green-200 bg-green-50 rounded-lg">
              <div className="flex items-center mb-2">
                <span className="text-2xl mr-2">🟢</span>
                <h3 className="font-semibold text-green-800">Green Status</h3>
              </div>
              <p className="text-sm text-green-700">
                AI confident and can handle the request independently
              </p>
            </div>

            <div className="p-4 border border-yellow-200 bg-yellow-50 rounded-lg">
              <div className="flex items-center mb-2">
                <span className="text-2xl mr-2">🟡</span>
                <h3 className="font-semibold text-yellow-800">Yellow Status</h3>
              </div>
              <p className="text-sm text-yellow-700">
                AI needs assistance - provides suggestions for human agents
              </p>
            </div>

            <div className="p-4 border border-red-200 bg-red-50 rounded-lg">
              <div className="flex items-center mb-2">
                <span className="text-2xl mr-2">🔴</span>
                <h3 className="font-semibold text-red-800">Red Status</h3>
              </div>
              <p className="text-sm text-red-700">
                Immediate human intervention required
              </p>
            </div>
          </div>

          {/* Test Scenarios */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Test Scenarios</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {testScenarios.map((scenario, index) => (
                <div key={index} className="p-4 border border-gray-200 rounded-lg">
                  <h3 className="font-medium text-gray-900 mb-2">{scenario.name}</h3>
                  <p className="text-sm text-gray-600 mb-3">{scenario.description}</p>
                  <Button
                    onClick={() => loadScenario(scenario)}
                    variant="outline"
                    size="sm"
                    className="w-full"
                  >
                    Load Scenario
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Test Form */}
          <form onSubmit={handleSubmit} className="space-y-4 mb-8">
            <div>
              <label htmlFor="conversationId" className="block text-sm font-medium text-gray-700 mb-1">
                Conversation ID
              </label>
              <Input
                id="conversationId"
                value={conversationId}
                onChange={(e) => setConversationId(e.target.value)}
                placeholder="Enter conversation ID"
                className="w-full"
              />
            </div>

            <div>
              <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1">
                Test Message
              </label>
              <Textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Enter your test message here..."
                rows={3}
                className="w-full"
              />
            </div>

            <Button
              type="submit"
              disabled={loading || !message.trim()}
              className="w-full"
            >
              {loading ? 'Processing...' : 'Test Handoff Mechanism'}
            </Button>
          </form>

          {/* Error Display */}
          {error && (
            <div className="mb-6 p-4 border border-red-200 bg-red-50 rounded-lg">
              <h3 className="font-medium text-red-800 mb-2">Error</h3>
              <p className="text-red-700">{error}</p>
            </div>
          )}

          {/* Results Display */}
          {result && (
            <div className="space-y-6">
              <div className={`p-4 border rounded-lg ${getStatusColor(result.status)}`}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold flex items-center">
                    {getStatusIcon(result.status)}
                    <span className="ml-2">Status: {result.status.toUpperCase()}</span>
                  </h3>
                  <div className="text-sm">
                    Confidence: {Math.round(result.confidence * 100)}%
                  </div>
                </div>
              </div>

              <div className="p-4 border border-gray-200 bg-gray-50 rounded-lg">
                <h3 className="font-medium text-gray-900 mb-2">AI Response</h3>
                <p className="text-gray-700 whitespace-pre-wrap">{result.response}</p>
              </div>

              {result.suggestions.length > 0 && (
                <div className="p-4 border border-blue-200 bg-blue-50 rounded-lg">
                  <h3 className="font-medium text-blue-900 mb-3">Agent Suggestions</h3>
                  <div className="space-y-2">
                    {result.suggestions.map((suggestion) => (
                      <div key={suggestion.id} className="flex items-start space-x-2">
                        <span className="text-blue-600 mt-1">•</span>
                        <div className="flex-1">
                          <p className="text-blue-800">{suggestion.text}</p>
                          <p className="text-xs text-blue-600">
                            Confidence: {Math.round(suggestion.confidence * 100)}%
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.sources && result.sources.length > 0 && (
                <div className="p-4 border border-purple-200 bg-purple-50 rounded-lg">
                  <h3 className="font-medium text-purple-900 mb-3">Knowledge Base Sources</h3>
                  <div className="space-y-2">
                    {result.sources.map((source, index) => (
                      <div key={index} className="text-sm text-purple-800">
                        📄 {source.fileName} ({source.chunkCount} chunks)
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
