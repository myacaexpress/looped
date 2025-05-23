'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/navigation';
import { User } from '@supabase/supabase-js';

interface UserProfile {
  id: string;
  company_id: string;
  role: 'employee' | 'admin';
  email: string;
  full_name: string | null;
}

interface AnalyticsData {
  totalConversations: number;
  aiResolvedConversations: number;
  humanResolvedConversations: number;
  activeConversations: number;
  avgResponseTime: number;
  totalMessages: number;
  avgMessagesPerConversation: number;
  conversationsByStatus: Record<string, number>;
  conversationsByDay: Array<{ date: string; count: number }>;
  messagesByDay: Array<{ date: string; count: number }>;
  resolutionRate: number;
  escalationRate: number;
  knowledgeBaseStats: {
    totalDocuments: number;
    totalChunks: number;
    avgChunksPerDocument: number;
  };
}

export default function AnalyticsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d');
  
  const supabase = createClientComponentClient();
  const router = useRouter();

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (userProfile) {
      fetchAnalyticsData();
    }
  }, [userProfile, timeRange]);

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

  const fetchAnalyticsData = async () => {
    if (!userProfile) return;

    try {
      setLoading(true);
      
      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
      startDate.setDate(endDate.getDate() - days);

      // Fetch conversations data
      const { data: conversations, error: convError } = await supabase
        .from('conversations')
        .select(`
          id,
          status,
          created_at,
          updated_at,
          messages(count)
        `)
        .eq('company_id', userProfile.company_id)
        .gte('created_at', startDate.toISOString());

      if (convError) {
        console.error('Error fetching conversations:', convError);
        setError('Failed to load analytics data');
        return;
      }

      // Fetch messages data for response time calculation
      const { data: messages, error: msgError } = await supabase
        .from('messages')
        .select(`
          id,
          conversation_id,
          sender_type,
          created_at
        `)
        .in('conversation_id', conversations?.map(c => c.id) || [])
        .order('created_at', { ascending: true });

      if (msgError) {
        console.error('Error fetching messages:', msgError);
      }

      // Fetch knowledge base stats
      const { data: kbStats, error: kbError } = await supabase
        .rpc('get_knowledge_base_stats', { company_id: userProfile.company_id });

      if (kbError) {
        console.error('Error fetching KB stats:', kbError);
      }

      // Process analytics data
      const analytics = processAnalyticsData(conversations || [], messages || [], kbStats?.[0]);
      setAnalyticsData(analytics);

    } catch (err) {
      console.error('Error:', err);
      setError('Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  };

  const processAnalyticsData = (conversations: any[], messages: any[], kbStats: any): AnalyticsData => {
    const totalConversations = conversations.length;
    const aiResolvedConversations = conversations.filter(c => c.status === 'resolved_ai').length;
    const humanResolvedConversations = conversations.filter(c => c.status === 'resolved_human').length;
    const activeConversations = conversations.filter(c => 
      !['resolved_ai', 'resolved_human'].includes(c.status)
    ).length;

    const totalMessages = messages.length;
    const avgMessagesPerConversation = totalConversations > 0 ? totalMessages / totalConversations : 0;

    // Calculate conversation status distribution
    const conversationsByStatus = conversations.reduce((acc, conv) => {
      acc[conv.status] = (acc[conv.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Calculate conversations by day
    const conversationsByDay = generateDailyStats(conversations, 'created_at');
    const messagesByDay = generateDailyStats(messages, 'created_at');

    // Calculate resolution and escalation rates
    const resolvedConversations = aiResolvedConversations + humanResolvedConversations;
    const resolutionRate = totalConversations > 0 ? (resolvedConversations / totalConversations) * 100 : 0;
    const escalationRate = totalConversations > 0 ? (humanResolvedConversations / totalConversations) * 100 : 0;

    // Calculate average response time (simplified)
    const avgResponseTime = calculateAverageResponseTime(messages);

    return {
      totalConversations,
      aiResolvedConversations,
      humanResolvedConversations,
      activeConversations,
      avgResponseTime,
      totalMessages,
      avgMessagesPerConversation: Math.round(avgMessagesPerConversation * 10) / 10,
      conversationsByStatus,
      conversationsByDay,
      messagesByDay,
      resolutionRate: Math.round(resolutionRate * 10) / 10,
      escalationRate: Math.round(escalationRate * 10) / 10,
      knowledgeBaseStats: {
        totalDocuments: kbStats?.total_documents || 0,
        totalChunks: kbStats?.total_chunks || 0,
        avgChunksPerDocument: kbStats?.avg_chunks_per_document || 0
      }
    };
  };

  const generateDailyStats = (data: any[], dateField: string) => {
    const dailyStats: Record<string, number> = {};
    
    data.forEach(item => {
      const date = new Date(item[dateField]).toISOString().split('T')[0];
      dailyStats[date] = (dailyStats[date] || 0) + 1;
    });

    return Object.entries(dailyStats)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  };

  const calculateAverageResponseTime = (messages: any[]): number => {
    // Group messages by conversation
    const conversationMessages: Record<string, any[]> = {};
    messages.forEach(msg => {
      if (!conversationMessages[msg.conversation_id]) {
        conversationMessages[msg.conversation_id] = [];
      }
      conversationMessages[msg.conversation_id].push(msg);
    });

    let totalResponseTime = 0;
    let responseCount = 0;

    Object.values(conversationMessages).forEach(convMessages => {
      for (let i = 1; i < convMessages.length; i++) {
        const prevMsg = convMessages[i - 1];
        const currentMsg = convMessages[i];
        
        // If previous message was from user and current is from AI
        if (prevMsg.sender_type === 'user' && currentMsg.sender_type === 'ai') {
          const responseTime = new Date(currentMsg.created_at).getTime() - new Date(prevMsg.created_at).getTime();
          totalResponseTime += responseTime;
          responseCount++;
        }
      }
    });

    return responseCount > 0 ? Math.round(totalResponseTime / responseCount / 1000) : 0; // Return in seconds
  };

  const formatResponseTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h`;
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
          <p className="mt-4 text-gray-600">Loading analytics...</p>
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
            onClick={() => router.push('/admin')}
            className="mt-4 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Back to Dashboard
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
              <h1 className="text-2xl font-bold text-gray-900">Analytics Dashboard</h1>
              <p className="text-sm text-gray-600">
                Performance insights and metrics
              </p>
            </div>
            <div className="flex space-x-4">
              <button
                onClick={() => router.push('/admin')}
                className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 transition-colors"
              >
                Back to Dashboard
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
        {/* Time Range Selector */}
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-8">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-900">Time Range</h2>
            <div className="flex space-x-2">
              {(['7d', '30d', '90d'] as const).map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-4 py-2 rounded transition-colors ${
                    timeRange === range
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {range === '7d' ? 'Last 7 days' : range === '30d' ? 'Last 30 days' : 'Last 90 days'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {analyticsData && (
          <>
            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <div className="bg-white rounded-lg shadow-sm border p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Conversations</p>
                    <p className="text-3xl font-bold text-blue-600">{analyticsData.totalConversations}</p>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <span className="text-2xl">💬</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm border p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">AI Resolution Rate</p>
                    <p className="text-3xl font-bold text-green-600">{analyticsData.resolutionRate}%</p>
                  </div>
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <span className="text-2xl">🤖</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm border p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Escalation Rate</p>
                    <p className="text-3xl font-bold text-orange-600">{analyticsData.escalationRate}%</p>
                  </div>
                  <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                    <span className="text-2xl">⬆️</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm border p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Avg Response Time</p>
                    <p className="text-3xl font-bold text-purple-600">{formatResponseTime(analyticsData.avgResponseTime)}</p>
                  </div>
                  <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                    <span className="text-2xl">⏱️</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Detailed Stats */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
              {/* Conversation Status Breakdown */}
              <div className="bg-white rounded-lg shadow-sm border p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Conversation Status</h3>
                <div className="space-y-3">
                  {Object.entries(analyticsData.conversationsByStatus).map(([status, count]) => (
                    <div key={status} className="flex justify-between items-center">
                      <span className="text-sm text-gray-600 capitalize">{status.replace('_', ' ')}</span>
                      <span className="font-semibold">{count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Knowledge Base Stats */}
              <div className="bg-white rounded-lg shadow-sm border p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Knowledge Base</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Total Documents</span>
                    <span className="font-semibold">{analyticsData.knowledgeBaseStats.totalDocuments}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Total Chunks</span>
                    <span className="font-semibold">{analyticsData.knowledgeBaseStats.totalChunks}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Avg Chunks per Document</span>
                    <span className="font-semibold">{analyticsData.knowledgeBaseStats.avgChunksPerDocument}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Additional Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white rounded-lg shadow-sm border p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Messages</p>
                    <p className="text-2xl font-bold text-indigo-600">{analyticsData.totalMessages}</p>
                  </div>
                  <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                    <span className="text-lg">📝</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm border p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">AI Resolved</p>
                    <p className="text-2xl font-bold text-green-600">{analyticsData.aiResolvedConversations}</p>
                  </div>
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <span className="text-lg">✅</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm border p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Human Resolved</p>
                    <p className="text-2xl font-bold text-yellow-600">{analyticsData.humanResolvedConversations}</p>
                  </div>
                  <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                    <span className="text-lg">👤</span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
