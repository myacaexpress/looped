'use client';

import React from 'react';
import { ConversationStatus } from '@/types';

interface ChatHeaderProps {
  title: string;
  status: ConversationStatus;
  onClose: () => void;
}

const getStatusColor = (status: ConversationStatus): string => {
  switch (status) {
    case 'green':
    case 'resolved_ai':
    case 'resolved_human':
      return 'bg-green-500';
    case 'yellow':
    case 'active_human_needed':
      return 'bg-yellow-500';
    case 'red':
      return 'bg-red-500';
    case 'typing_ai':
    case 'typing_user':
      return 'bg-blue-500';
    default:
      return 'bg-gray-500';
  }
};

const getStatusText = (status: ConversationStatus): string => {
  switch (status) {
    case 'green':
      return 'AI Assistant';
    case 'yellow':
      return 'AI with suggestions';
    case 'red':
      return 'Human agent needed';
    case 'resolved_ai':
      return 'Resolved by AI';
    case 'resolved_human':
      return 'Resolved by agent';
    case 'typing_ai':
      return 'AI is typing...';
    case 'typing_user':
      return 'User is typing...';
    case 'active_human_needed':
      return 'Connecting to agent...';
    default:
      return 'Support Chat';
  }
};

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  title,
  status,
  onClose
}) => {
  return (
    <div className="flex items-center justify-between p-4 bg-blue-600 text-white rounded-t-lg">
      <div className="flex items-center space-x-3">
        <div className={`w-3 h-3 rounded-full ${getStatusColor(status)}`} />
        <div>
          <h3 className="font-semibold text-sm">{title}</h3>
          <p className="text-xs opacity-90">{getStatusText(status)}</p>
        </div>
      </div>
      
      <button
        onClick={onClose}
        className="text-white hover:text-gray-200 transition-colors p-1"
        aria-label="Close chat"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  );
};
