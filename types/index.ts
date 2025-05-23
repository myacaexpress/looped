// Database Types
export interface Company {
  id: string;
  name: string;
  admin_user_id: string;
  configuration_details?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  company_id: string;
  role: 'employee' | 'admin';
  email: string;
  full_name?: string;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeBaseDocument {
  id: string;
  company_id: string;
  file_name: string;
  storage_path: string;
  status: 'pending' | 'processing' | 'active' | 'error';
  indexed_at?: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeBaseChunk {
  id: string;
  document_id: string;
  chunk_text: string;
  embedding: number[];
  metadata?: Record<string, any>;
  created_at: string;
}

export interface Conversation {
  id: string;
  company_id: string;
  employee_user_id: string;
  assigned_agent_user_id?: string;
  status: ConversationStatus;
  last_message_preview?: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_user_id?: string;
  sender_type: 'user' | 'ai' | 'agent';
  content: string;
  ai_suggestions?: AISuggestion[];
  created_at: string;
}

// Conversation States
export type ConversationStatus = 
  | 'green'           // AI confident/resolved
  | 'yellow'          // AI needs assistance
  | 'red'             // AI stuck/escalated
  | 'resolved_ai'     // Resolved by AI
  | 'resolved_human'  // Resolved by human
  | 'typing_ai'       // AI is typing
  | 'typing_user'     // User is typing
  | 'active_human_needed'; // Active human intervention needed

// AI Suggestion for Yellow state
export interface AISuggestion {
  id: string;
  text: string;
  confidence: number;
  source_document_id?: string;
}

// Chat Widget Types
export interface ChatMessage {
  id: string;
  content: string;
  sender: 'user' | 'ai' | 'agent';
  timestamp: string;
  suggestions?: AISuggestion[];
}

export interface ChatState {
  isOpen: boolean;
  messages: ChatMessage[];
  isTyping: boolean;
  conversationId?: string;
  status: ConversationStatus;
}

// Dashboard Types
export interface ConversationCard {
  conversation: Conversation;
  lastMessage?: Message;
  unreadCount: number;
  employee?: User;
  assignedAgent?: User;
}

export interface DashboardStats {
  totalConversations: number;
  aiResolvedCount: number;
  humanResolvedCount: number;
  activeConversations: number;
  averageResolutionTime: number;
  aiResolutionRate: number;
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Form Types
export interface CompanyOnboardingForm {
  companyName: string;
  adminEmail: string;
  adminPassword: string;
}

export interface LoginForm {
  email: string;
  password: string;
}

export interface MessageForm {
  content: string;
  conversationId: string;
}

// LangGraph Types
export interface LangGraphState {
  conversationId: string;
  messages: ChatMessage[];
  currentStatus: ConversationStatus;
  confidence: number;
  retrievedContext?: string[];
  suggestions?: AISuggestion[];
  needsHumanIntervention: boolean;
}

export interface LangGraphNode {
  name: string;
  execute: (state: LangGraphState) => Promise<LangGraphState>;
}

// Widget Configuration
export interface WidgetConfig {
  companyId: string;
  primaryColor?: string;
  position?: 'bottom-right' | 'bottom-left';
  greeting?: string;
  placeholder?: string;
}

// File Upload Types
export interface FileUpload {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error';
  error?: string;
}

// Analytics Types
export interface AnalyticsData {
  period: 'day' | 'week' | 'month';
  conversationVolume: number[];
  resolutionRates: {
    ai: number;
    human: number;
  };
  averageResponseTime: number;
  topQuestions: Array<{
    question: string;
    count: number;
  }>;
}

// Notification Types
export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}

// Real-time Event Types
export interface RealtimeEvent {
  type: 'message' | 'status_change' | 'agent_assignment';
  conversationId: string;
  data: any;
  timestamp: string;
}
