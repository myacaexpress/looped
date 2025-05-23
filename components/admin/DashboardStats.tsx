'use client';

import { useMemo } from 'react';

interface UserProfile {
  id: string;
  company_id: string;
  role: 'employee' | 'admin';
  email: string;
  full_name: string | null;
}

interface Conversation {
  id: string;
  status: 'green' | 'yellow' | 'red' | 'resolved_ai' | 'resolved_human' | 'typing_ai' | 'typing_user' | 'active_human_needed';
  created_at: string;
  updated_at: string;
  message_count: number;
}

interface DashboardStatsProps {
  conversations: Conversation[];
  userProfile: UserProfile | null;
}

export default function DashboardStats({ conversations, userProfile }: DashboardStatsProps) {
  const stats = useMemo(() => {
    const total = conversations.length;
    const active = conversations.filter(c => 
      ['green', 'yellow', 'red', 'typing_ai', 'typing_user', 'active_human_needed'].includes(c.status)
    ).length;
    const resolved = conversations.filter(c => 
      ['resolved_ai', 'resolved_human'].includes(c.status)
    ).length;
    const needsAttention = conversations.filter(c => 
      ['red', 'active_human_needed'].includes(c.status)
    ).length;
    
    // Calculate today's conversations
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayConversations = conversations.filter(c => 
      new Date(c.created_at) >= today
    ).length;

    // Calculate average response time (mock data for now)
    const avgResponseTime = '2.3 min';

    return {
      total,
      active,
      resolved,
      needsAttention,
      todayConversations,
      avgResponseTime
    };
  }, [conversations]);

  const statCards = [
    {
      title: 'Total Conversations',
      value: stats.total,
      icon: '💬',
      color: 'bg-blue-500',
      textColor: 'text-blue-600'
    },
    {
      title: 'Active Conversations',
      value: stats.active,
      icon: '🟢',
      color: 'bg-green-500',
      textColor: 'text-green-600'
    },
    {
      title: 'Needs Attention',
      value: stats.needsAttention,
      icon: '🔴',
      color: 'bg-red-500',
      textColor: 'text-red-600'
    },
    {
      title: 'Resolved Today',
      value: stats.resolved,
      icon: '✅',
      color: 'bg-purple-500',
      textColor: 'text-purple-600'
    },
    {
      title: 'New Today',
      value: stats.todayConversations,
      icon: '📈',
      color: 'bg-yellow-500',
      textColor: 'text-yellow-600'
    },
    {
      title: 'Avg Response Time',
      value: stats.avgResponseTime,
      icon: '⏱️',
      color: 'bg-indigo-500',
      textColor: 'text-indigo-600'
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      {statCards.map((stat, index) => (
        <div key={index} className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">{stat.title}</p>
              <p className={`text-2xl font-bold ${stat.textColor}`}>
                {stat.value}
              </p>
            </div>
            <div className={`w-12 h-12 ${stat.color} rounded-lg flex items-center justify-center text-white text-xl`}>
              {stat.icon}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
