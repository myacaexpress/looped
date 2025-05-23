'use client';

import { useMemo } from 'react';

interface Conversation {
  id: string;
  company_id: string;
  employee_user_id: string;
  assigned_agent_user_id: string | null;
  status: 'green' | 'yellow' | 'red' | 'resolved_ai' | 'resolved_human' | 'typing_ai' | 'typing_user' | 'active_human_needed';
  last_message_preview: string | null;
  created_at: string;
  updated_at: string;
  employee: {
    full_name: string | null;
    email: string;
  };
  assigned_agent: {
    full_name: string | null;
    email: string;
  } | null;
  message_count: number;
}

interface ConversationListProps {
  conversations: Conversation[];
  selectedConversation: Conversation | null;
  onSelectConversation: (conversation: Conversation) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  onTakeOver: (conversationId: string) => void;
  onResolve: (conversationId: string) => void;
}

export default function ConversationList({
  conversations,
  selectedConversation,
  onSelectConversation,
  statusFilter,
  onStatusFilterChange,
  onTakeOver,
  onResolve
}: ConversationListProps) {
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'green':
        return 'bg-green-500';
      case 'yellow':
        return 'bg-yellow-500';
      case 'red':
      case 'active_human_needed':
        return 'bg-red-500';
      case 'resolved_ai':
      case 'resolved_human':
        return 'bg-gray-500';
      case 'typing_ai':
      case 'typing_user':
        return 'bg-blue-500';
      default:
        return 'bg-gray-400';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'green':
        return 'AI Handling';
      case 'yellow':
        return 'Needs Review';
      case 'red':
        return 'Urgent';
      case 'active_human_needed':
        return 'Human Needed';
      case 'resolved_ai':
        return 'Resolved by AI';
      case 'resolved_human':
        return 'Resolved by Human';
      case 'typing_ai':
        return 'AI Typing';
      case 'typing_user':
        return 'User Typing';
      default:
        return status;
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  };

  const filteredConversations = useMemo(() => {
    if (statusFilter === 'all') return conversations;
    return conversations.filter(conv => conv.status === statusFilter);
  }, [conversations, statusFilter]);

  const statusOptions = [
    { value: 'all', label: 'All Conversations' },
    { value: 'green', label: 'AI Handling' },
    { value: 'yellow', label: 'Needs Review' },
    { value: 'red', label: 'Urgent' },
    { value: 'active_human_needed', label: 'Human Needed' },
    { value: 'resolved_ai', label: 'Resolved by AI' },
    { value: 'resolved_human', label: 'Resolved by Human' }
  ];

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      <div className="p-4 border-b">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Conversations</h2>
        
        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
          className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          {statusOptions.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="max-h-96 overflow-y-auto">
        {filteredConversations.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            No conversations found
          </div>
        ) : (
          filteredConversations.map((conversation) => (
            <div
              key={conversation.id}
              onClick={() => onSelectConversation(conversation)}
              className={`p-4 border-b cursor-pointer hover:bg-gray-50 transition-colors ${
                selectedConversation?.id === conversation.id ? 'bg-blue-50 border-blue-200' : ''
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-3 h-3 rounded-full ${getStatusColor(conversation.status)}`}></div>
                    <span className="text-sm font-medium text-gray-900">
                      {conversation.employee.full_name || conversation.employee.email}
                    </span>
                  </div>
                  
                  <p className="text-xs text-gray-600 mb-1">
                    {getStatusLabel(conversation.status)}
                  </p>
                  
                  {conversation.last_message_preview && (
                    <p className="text-sm text-gray-700 truncate">
                      {conversation.last_message_preview}
                    </p>
                  )}
                  
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-gray-500">
                      {formatTime(conversation.updated_at)}
                    </span>
                    <span className="text-xs text-gray-500">
                      {conversation.message_count} messages
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              {(conversation.status === 'red' || conversation.status === 'active_human_needed') && (
                <div className="flex gap-2 mt-2">
                  {!conversation.assigned_agent_user_id && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onTakeOver(conversation.id);
                      }}
                      className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700"
                    >
                      Take Over
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onResolve(conversation.id);
                    }}
                    className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700"
                  >
                    Resolve
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
