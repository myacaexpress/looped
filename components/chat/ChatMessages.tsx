'use client';

import React from 'react';
import { ChatMessage, ConversationStatus, AISuggestion } from '@/types';

interface ChatMessagesProps {
  messages: ChatMessage[];
  status: ConversationStatus;
}

interface MessageBubbleProps {
  message: ChatMessage;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const isUser = message.sender === 'user';
  const isAI = message.sender === 'ai';
  const isAgent = message.sender === 'agent';

  const getBubbleStyles = () => {
    if (isUser) {
      return 'bg-blue-600 text-white ml-auto';
    } else if (isAI) {
      return 'bg-gray-100 text-gray-800 mr-auto';
    } else {
      return 'bg-green-100 text-green-800 mr-auto';
    }
  };

  const getSenderLabel = () => {
    if (isAI) return 'AI Assistant';
    if (isAgent) return 'Support Agent';
    return null;
  };

  const getSenderIcon = () => {
    if (isAI) {
      return (
        <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
          AI
        </div>
      );
    } else if (isAgent) {
      return (
        <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
          H
        </div>
      );
    }
    return null;
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <div className={`flex items-start space-x-2 mb-4 ${isUser ? 'flex-row-reverse space-x-reverse' : ''}`}>
      {!isUser && (
        <div className="flex-shrink-0">
          {getSenderIcon()}
        </div>
      )}
      
      <div className={`max-w-xs lg:max-w-md ${isUser ? 'ml-auto' : 'mr-auto'}`}>
        {!isUser && (
          <div className="text-xs text-gray-500 mb-1 ml-1">
            {getSenderLabel()}
          </div>
        )}
        
        <div className={`rounded-lg px-4 py-2 ${getBubbleStyles()}`}>
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        </div>
        
        <div className={`text-xs text-gray-400 mt-1 ${isUser ? 'text-right mr-1' : 'ml-1'}`}>
          {formatTime(message.timestamp)}
        </div>
        
        {message.suggestions && message.suggestions.length > 0 && (
          <div className="mt-2 space-y-1">
            <p className="text-xs text-gray-500 ml-1">Suggested responses:</p>
            {message.suggestions.map((suggestion) => (
              <div
                key={suggestion.id}
                className="bg-blue-50 border border-blue-200 rounded-md p-2 text-sm text-blue-800 cursor-pointer hover:bg-blue-100 transition-colors"
              >
                {suggestion.text}
                <span className="text-xs text-blue-600 ml-2">
                  ({Math.round(suggestion.confidence * 100)}% confidence)
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export const ChatMessages: React.FC<ChatMessagesProps> = ({
  messages,
  status
}) => {
  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center text-gray-500">
          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg
              className="w-6 h-6 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          </div>
          <p className="text-sm">Start a conversation</p>
          <p className="text-xs text-gray-400 mt-1">
            Ask any question and our AI will help you
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-2">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
    </div>
  );
};
