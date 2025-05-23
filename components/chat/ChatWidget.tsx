'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ChatState, ChatMessage, WidgetConfig, ConversationStatus } from '@/types';
import { ChatHeader } from './ChatHeader';
import { ChatMessages } from './ChatMessages';
import { ChatInput } from './ChatInput';
import { TypingIndicator } from './TypingIndicator';

interface ChatWidgetProps {
  config: WidgetConfig;
  onSendMessage?: (message: string) => void;
  onClose?: () => void;
}

export const ChatWidget: React.FC<ChatWidgetProps> = ({
  config,
  onSendMessage,
  onClose
}) => {
  const [chatState, setChatState] = useState<ChatState>({
    isOpen: true,
    messages: [],
    isTyping: false,
    status: 'green'
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatState.messages]);

  const handleSendMessage = async (content: string) => {
    if (!content.trim()) return;

    // Add user message
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      content,
      sender: 'user',
      timestamp: new Date().toISOString()
    };

    setChatState(prev => ({
      ...prev,
      messages: [...prev.messages, userMessage],
      isTyping: true,
      status: 'typing_ai'
    }));

    // Call external handler if provided
    if (onSendMessage) {
      onSendMessage(content);
    }

    // Call the AI API
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: content,
          conversationId: config.companyId || 'default',
          previousMessages: chatState.messages.map(msg => ({
            type: msg.sender === 'user' ? 'human' : 'ai',
            content: msg.content
          }))
        }),
      });

      const result = await response.json();

      if (result.success) {
        const aiMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          content: result.data.message,
          sender: 'ai',
          timestamp: result.data.timestamp
        };

        setChatState(prev => ({
          ...prev,
          messages: [...prev.messages, aiMessage],
          isTyping: false,
          status: result.data.status as ConversationStatus
        }));
      } else {
        throw new Error(result.error || 'Failed to get AI response');
      }
    } catch (error) {
      console.error('Error calling AI API:', error);
      
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        content: "I'm sorry, I'm experiencing technical difficulties. Please try again or contact human support.",
        sender: 'ai',
        timestamp: new Date().toISOString()
      };

      setChatState(prev => ({
        ...prev,
        messages: [...prev.messages, errorMessage],
        isTyping: false,
        status: 'red'
      }));
    }
  };

  const handleClose = () => {
    setChatState(prev => ({ ...prev, isOpen: false }));
    if (onClose) {
      onClose();
    }
  };

  if (!chatState.isOpen) {
    return null;
  }

  return (
    <div 
      className="fixed bottom-4 right-4 w-80 h-96 bg-white rounded-lg shadow-2xl border border-gray-200 flex flex-col z-50"
      style={{ 
        '--primary-color': config.primaryColor || '#3B82F6' 
      } as React.CSSProperties}
    >
      <ChatHeader 
        title="Support Chat"
        status={chatState.status}
        onClose={handleClose}
      />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <ChatMessages 
          messages={chatState.messages}
          status={chatState.status}
        />
        
        {chatState.isTyping && (
          <TypingIndicator />
        )}
        
        <div ref={messagesEndRef} />
      </div>
      
      <ChatInput 
        onSendMessage={handleSendMessage}
        placeholder={config.placeholder || "Type your message..."}
        disabled={chatState.isTyping}
      />
    </div>
  );
};
