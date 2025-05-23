'use client';

import React, { useEffect, useState } from 'react';
import { ChatWidget } from '@/components/chat/ChatWidget';
import { WidgetConfig } from '@/types';

export default function TestWidgetPage() {
  const [isWidgetOpen, setIsWidgetOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);

  useEffect(() => {
    const testCompanyId = process.env.NEXT_PUBLIC_TEST_COMPANY_ID;
    if (!testCompanyId) {
      setError('NEXT_PUBLIC_TEST_COMPANY_ID is not set in environment variables.');
      setLoading(false);
      return;
    }
    setCompanyId(testCompanyId);
    setLoading(false);
  }, []);

  const widgetConfig: WidgetConfig = {
    companyId: companyId || 'default-company-id', // Fallback, though error should prevent use
    primaryColor: '#3B82F6',
    position: 'bottom-right',
    greeting: 'Hello! How can I help you today?',
    placeholder: 'Type your message here...'
  };

  const handleSendMessage = (message: string) => {
    console.log('Message sent:', message);
    // This will be connected to the actual API later
  };

  const handleCloseWidget = () => {
    setIsWidgetOpen(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading widget test page...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
          <strong className="font-bold">Error:</strong>
          <span className="block sm:inline"> {error}</span>
          <p className="text-sm mt-2">Please ensure `NEXT_PUBLIC_TEST_COMPANY_ID` is set in your `.env` file.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          Chat Widget Test Page
        </h1>
        
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Widget Controls</h2>
          <button
            onClick={() => setIsWidgetOpen(!isWidgetOpen)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            {isWidgetOpen ? 'Close Widget' : 'Open Widget'}
          </button>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Sample Content</h2>
          <p className="text-gray-600 mb-4">
            This is a test page to demonstrate the embeddable chat widget. 
            The widget should appear in the bottom-right corner when opened.
          </p>
          
          <div className="space-y-4">
            <div className="bg-gray-100 p-4 rounded-lg">
              <h3 className="font-semibold mb-2">Features to Test:</h3>
              <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
                <li>Widget open/close functionality</li>
                <li>Message sending and receiving</li>
                <li>AI typing indicators</li>
                <li>Status indicators (AI vs Human)</li>
                <li>Responsive design</li>
                <li>Message history display</li>
              </ul>
            </div>
            
            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="font-semibold mb-2 text-blue-800">Test Messages:</h3>
              <ul className="list-disc list-inside space-y-1 text-sm text-blue-600">
                <li>"Hello, I need help with my account"</li>
                <li>"What are your business hours?"</li>
                <li>"I'm having trouble logging in"</li>
                <li>"Can you help me reset my password?"</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {isWidgetOpen && companyId && ( // Only render if companyId is available
        <ChatWidget
          config={{ ...widgetConfig, companyId }}
          onSendMessage={handleSendMessage}
          onClose={handleCloseWidget}
        />
      )}
    </div>
  );
}
