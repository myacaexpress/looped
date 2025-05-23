'use client';

import React from 'react';

export const TypingIndicator: React.FC = () => {
  return (
    <div className="px-4 py-2">
      <div className="flex items-start space-x-2">
        <div className="flex-shrink-0">
          <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
            AI
          </div>
        </div>
        
        <div className="bg-gray-100 rounded-lg px-4 py-3 max-w-xs">
          <div className="flex items-center space-x-1">
            <div className="text-xs text-gray-500 mr-2">AI is typing</div>
            <div className="flex space-x-1">
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
