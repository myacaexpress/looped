'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

interface UserProfile {
  id: string;
  company_id: string;
  role: 'employee' | 'admin';
  email: string;
  full_name: string | null;
}

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

interface Message {
  id: string;
  conversation_id: string;
  sender_user_id: string | null;
  sender_type: 'user' | 'ai' | 'agent';
  content: string;
  ai_suggestions: any;
  created_at: string;
  sender?: {
    full_name: string | null;
    email: string;
  };
}

interface ConversationDetailsProps {
  conversation: Conversation | null;
  userProfile: UserProfile | null;
  onTakeOver: (conversationId: string) => void;
  onResolve: (conversationId: string) => void;
}

export default function ConversationDetails({
  conversation,
  userProfile,
  onTakeOver,
  onResolve
}: ConversationDetailsProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  
  const supabase = createClientComponentClient();

  useEffect(() => {
    if (conversation) {
      fetchMessages();
      
      // Set up real-time subscription for messages
      const subscription = supabase
        .channel(`messages-${conversation.id}`)
        .on('postgres_changes', 
          { 
            event: '*', 
            schema: 'public', 
            table: 'messages',
            filter: `conversation_id=eq.${conversation.id}`
          }, 
          () => {
            fetchMessages();
          }
        )
        .subscribe();

      return () => {
        subscription.unsubscribe();
      };
    }
  }, [conversation]);

  const fetchMessages = async () => {
    if (!conversation) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('messages')
        .select(`
          *,
          sender:users(full_name, email)
        `)
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching messages:', error);
        return;
      }

      setMessages(data || []);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!conversation || !userProfile || !newMessage.trim()) return;

    setSending(true);
    try {
      const { error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversation.id,
          sender_user_id: userProfile.id,
          sender_type: 'agent',
          content: newMessage.trim()
        });

      if (error) {
        console.error('Error sending message:', error);
        return;
      }

      setNewMessage('');
      
      // Update conversation status if needed
      if (conversation.status !== 'active_human_needed') {
        await supabase
          .from('conversations')
          .update({ 
            status: 'active_human_needed',
            assigned_agent_user_id: userProfile.id,
            last_message_preview: newMessage.trim().substring(0, 100)
          })
          .eq('id', conversation.id);
      }
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setSending(false);
    }
  };

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
    return new Date(dateString).toLocaleString();
  };

  const getSenderName = (message: Message) => {
    if (message.sender_type === 'ai') return 'AI Assistant';
    if (message.sender_type === 'user') return conversation?.employee.full_name || conversation?.employee.email || 'User';
    if (message.sender_type === 'agent') return message.sender?.full_name || message.sender?.email || 'Agent';
    return 'Unknown';
  };

  const getSenderColor = (senderType: string) => {
    switch (senderType) {
      case 'ai':
        return 'bg-blue-100 text-blue-800';
      case 'user':
        return 'bg-gray-100 text-gray-800';
      case 'agent':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (!conversation) {
    return (
      <div className="bg-white rounded-lg shadow-sm border h-96 flex items-center justify-center">
        <div className="text-center text-gray-500">
          <div className="text-4xl mb-4">💬</div>
          <p>Select a conversation to view details</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border flex flex-col h-96">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-4 h-4 rounded-full ${getStatusColor(conversation.status)}`}></div>
            <div>
              <h3 className="font-semibold text-gray-900">
                {conversation.employee.full_name || conversation.employee.email}
              </h3>
              <p className="text-sm text-gray-600">
                {getStatusLabel(conversation.status)}
              </p>
            </div>
          </div>
          
          <div className="flex gap-2">
            {!conversation.assigned_agent_user_id && (
              <button
                onClick={() => onTakeOver(conversation.id)}
                className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
              >
                Take Over
              </button>
            )}
            <button
              onClick={() => onResolve(conversation.id)}
              className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700"
            >
              Resolve
            </button>
          </div>
        </div>
        
        {conversation.assigned_agent && (
          <div className="mt-2 text-sm text-gray-600">
            Assigned to: {conversation.assigned_agent.full_name || conversation.assigned_agent.email}
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            No messages yet
          </div>
        ) : (
          messages.map((message) => (
            <div key={message.id} className="flex flex-col space-y-1">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSenderColor(message.sender_type)}`}>
                  {getSenderName(message)}
                </span>
                <span className="text-xs text-gray-500">
                  {formatTime(message.created_at)}
                </span>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm text-gray-900 whitespace-pre-wrap">
                  {message.content}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Message Input */}
      <div className="p-4 border-t">
        <div className="flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Type your message..."
            className="flex-1 p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            disabled={sending}
          />
          <button
            onClick={sendMessage}
            disabled={sending || !newMessage.trim()}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
