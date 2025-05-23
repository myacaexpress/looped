'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/navigation';
import { User } from '@supabase/supabase-js';
import ConversationList from '@/components/admin/ConversationList';
import ConversationDetails from '@/components/admin/ConversationDetails';
import DashboardStats from '@/components/admin/DashboardStats';

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

export default function AdminDashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  const supabase = createClientComponentClient();
  const router = useRouter();

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (userProfile) {
      fetchConversations();
      // Set up real-time subscription
      const subscription = supabase
        .channel('conversations')
        .on('postgres_changes', 
          { 
            event: '*', 
            schema: 'public', 
            table: 'conversations',
            filter: `company_id=eq.${userProfile.company_id}`
          }, 
          () => {
            fetchConversations();
          }
        )
        .subscribe();

      return () => {
        subscription.unsubscribe();
      };
    }
  }, [userProfile, statusFilter]);

  const checkAuth = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        router.push('/login');
        return;
      }

      setUser(user);

      // Get user profile and check if admin
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileError || !profile) {
        setError('Failed to load user profile');
        return;
      }

      if (profile.role !== 'admin') {
        setError('Access denied. Admin role required.');
        return;
      }

      setUserProfile(profile);
    } catch (err) {
      setError('Authentication error');
      console.error('Auth error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchConversations = async () => {
    if (!userProfile) return;

    try {
      let query = supabase
        .from('conversations')
        .select(`
          *,
          employee:users!conversations_employee_user_id_fkey(full_name, email),
          assigned_agent:users!conversations_assigned_agent_user_id_fkey(full_name, email),
          messages(count)
        `)
        .eq('company_id', userProfile.company_id)
        .order('updated_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching conversations:', error);
        setError('Failed to load conversations');
        return;
      }

      // Transform the data to include message count
      const transformedData = data?.map(conv => ({
        ...conv,
        message_count: conv.messages?.[0]?.count || 0
      })) || [];

      setConversations(transformedData);
    } catch (err) {
      console.error('Error:', err);
      setError('Failed to load conversations');
    }
  };

  const handleTakeOverConversation = async (conversationId: string) => {
    if (!userProfile) return;

    try {
      const { error } = await supabase
        .from('conversations')
        .update({ 
          assigned_agent_user_id: userProfile.id,
          status: 'active_human_needed'
        })
        .eq('id', conversationId);

      if (error) {
        console.error('Error taking over conversation:', error);
        return;
      }

      // Refresh conversations
      fetchConversations();
    } catch (err) {
      console.error('Error:', err);
    }
  };

  const handleResolveConversation = async (conversationId: string) => {
    try {
      const { error } = await supabase
        .from('conversations')
        .update({ status: 'resolved_human' })
        .eq('id', conversationId);

      if (error) {
        console.error('Error resolving conversation:', error);
        return;
      }

      // Refresh conversations
      fetchConversations();
    } catch (err) {
      console.error('Error:', err);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
          <button
            onClick={() => router.push('/login')}
            className="mt-4 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
              <p className="text-sm text-gray-600">
                Welcome back, {userProfile?.full_name || userProfile?.email}
              </p>
            </div>
            <div className="flex space-x-4">
              <button
                onClick={() => router.push('/admin/knowledge-base')}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
              >
                Knowledge Base
              </button>
              <button
                onClick={handleSignOut}
                className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Navigation */}
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => router.push('/admin/knowledge-base')}
              className="flex items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="flex-shrink-0 h-8 w-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <svg className="h-5 w-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="ml-4 text-left">
                <h3 className="text-sm font-medium text-gray-900">Knowledge Base</h3>
                <p className="text-sm text-gray-500">Manage documents and content</p>
              </div>
            </button>
            
            <div className="flex items-center p-4 border border-gray-200 rounded-lg bg-gray-50">
              <div className="flex-shrink-0 h-8 w-8 bg-green-100 rounded-lg flex items-center justify-center">
                <svg className="h-5 w-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-3.582 8-8 8a8.013 8.013 0 01-7-4L5 20l4-1a8.014 8.014 0 01-2-7c0-4.418 3.582-8 8-8s8 3.582 8 8z" />
                </svg>
              </div>
              <div className="ml-4 text-left">
                <h3 className="text-sm font-medium text-gray-900">Conversations</h3>
                <p className="text-sm text-gray-500">Currently viewing</p>
              </div>
            </div>

            <button
              onClick={() => router.push('/admin/analytics')}
              className="flex items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="flex-shrink-0 h-8 w-8 bg-purple-100 rounded-lg flex items-center justify-center">
                <svg className="h-5 w-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div className="ml-4 text-left">
                <h3 className="text-sm font-medium text-gray-900">Analytics</h3>
                <p className="text-sm text-gray-500">View performance metrics</p>
              </div>
            </button>
          </div>
        </div>

        {/* Dashboard Stats */}
        <DashboardStats 
          conversations={conversations}
          userProfile={userProfile}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
          {/* Conversation List */}
          <div className="lg:col-span-1">
            <ConversationList
              conversations={conversations}
              selectedConversation={selectedConversation}
              onSelectConversation={setSelectedConversation}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              onTakeOver={handleTakeOverConversation}
              onResolve={handleResolveConversation}
            />
          </div>

          {/* Conversation Details */}
          <div className="lg:col-span-2">
            <ConversationDetails
              conversation={selectedConversation}
              userProfile={userProfile}
              onTakeOver={handleTakeOverConversation}
              onResolve={handleResolveConversation}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
