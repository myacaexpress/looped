'use client';

import React, { useEffect, useState } from 'react';
import { ChatWidget } from '@/components/chat/ChatWidget';
import { WidgetConfig } from '@/types';

export default function WidgetPage() {
  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [isReady, setIsReady] = useState(false);

  const trustedOrigin = 'https://trusted-origin.com'; // Define trustedOrigin at the top level

  useEffect(() => {
    // Parse configuration from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const companyId = urlParams.get('companyId');
    const configParam = urlParams.get('config');

    if (!companyId) {
      console.error('Widget: companyId is required');
      return;
    }

    let parsedConfig: WidgetConfig = {
      companyId,
      primaryColor: '#3B82F6',
      position: 'bottom-right',
      greeting: 'Hello! How can I help you today?',
      placeholder: 'Type your message here...'
    };

    // Parse additional config if provided
    if (configParam) {
      try {
        const additionalConfig = JSON.parse(decodeURIComponent(configParam));
        parsedConfig = { ...parsedConfig, ...additionalConfig };
      } catch (error) {
        console.warn('Widget: Failed to parse config parameter', error);
      }
    }

    setConfig(parsedConfig);
    setIsReady(true);

    // Notify parent window that widget is ready
    if (window.parent !== window) {
      window.parent.postMessage({
        type: 'widget-ready',
        data: { companyId }
      }, trustedOrigin);
    }
  }, []);

  const handleSendMessage = (message: string) => {
    console.log('Widget: Message sent:', message);
    
    // Notify parent window about message
    if (window.parent !== window) {
      window.parent.postMessage({
        type: 'message-sent',
        data: { message, timestamp: new Date().toISOString() }
      }, trustedOrigin);
    }

    // Here you would typically send the message to your API
    // For now, we'll just log it
  };

  const handleClose = () => {
    // Notify parent window to close widget
    if (window.parent !== window) {
      window.parent.postMessage({
        type: 'widget-close',
        data: {}
      }, trustedOrigin);
    }
  };

  // Handle resize notifications
  useEffect(() => {
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const height = entry.contentRect.height;
        if (window.parent !== window) {
          window.parent.postMessage({
            type: 'widget-resize',
            data: { height }
          }, trustedOrigin);
        }
      }
    });

    if (document.body) {
      resizeObserver.observe(document.body);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  if (!isReady || !config) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading chat widget...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-transparent">
      <ChatWidget
        config={config}
        onSendMessage={handleSendMessage}
        onClose={handleClose}
      />
    </div>
  );
}
