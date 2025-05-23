import { cacheManager, initializeDefaultCaches, CacheManager } from './cache-manager';
import { KnowledgeBaseService } from '@/lib/knowledge-base';
import { OptimizedQueries } from '@/lib/supabase/optimized-queries';
import { ConversationStatus } from '@/types';
import crypto from 'crypto';

// Initialize caches on module load
// initializeDefaultCaches(); // Removed for lazy initialization

// Define cache names as constants for better maintainability and to avoid hardcoding strings
export enum CacheNames {
  USER_SESSIONS = 'USER_SESSIONS',
  KNOWLEDGE_BASE = 'KNOWLEDGE_BASE',
  AI_RESPONSES = 'AI_RESPONSES',
  COMPANY_DATA = 'COMPANY_DATA',
  CONVERSATIONS = 'CONVERSATIONS',
  EMBEDDINGS = 'EMBEDDINGS',
}

/**
 * Cached Knowledge Base Service
 */
export class CachedKnowledgeBaseService {
  /**
   * Search with caching
   */
  static async search(
    query: string,
    companyId: string,
    options: {
      limit?: number;
      threshold?: number;
      includeContext?: boolean;
    } = {}
  ) {
    // Create cache key from query parameters
    const cacheKey = this.createSearchCacheKey(query, companyId, options);
    
    return await cacheManager.getOrSet(
      CacheNames.KNOWLEDGE_BASE,
      cacheKey,
      async () => {
        console.log(`🔍 Fetching knowledge base search results for: ${query}`);
        return await KnowledgeBaseService.search(query, companyId, options);
      },
      // Custom TTL for high-frequency queries (shorter cache time)
      query.length < 10 ? 30 * 60 * 1000 : undefined // 30 minutes for short queries
    );
  }

  /**
   * Get documents with caching
   */
  static async getDocuments(companyId: string) {
    const cacheKey = `documents:${companyId}`;
    
    return await cacheManager.getOrSet(
      CacheNames.KNOWLEDGE_BASE,
      cacheKey,
      async () => {
        console.log(`📄 Fetching documents for company: ${companyId}`);
        return await KnowledgeBaseService.getDocuments(companyId);
      }
    );
  }

  /**
   * Invalidate cache for company
   */
  static invalidateCompanyCache(companyId: string): void {
    const pattern = new RegExp(`^(search|documents):${companyId}:`);
    const invalidated = cacheManager.invalidatePattern(CacheNames.KNOWLEDGE_BASE, pattern);
    console.log(`🔄 Invalidated ${invalidated} knowledge base cache entries for company ${companyId}`);
  }

  /**
   * Create consistent cache key for search operations
   */
  private static createSearchCacheKey(
    query: string,
    companyId: string,
    options: any
  ): string {
    const optionsStr = JSON.stringify(options);
    const hash = crypto.createHash('md5').update(query + companyId + optionsStr).digest('hex');
    return `search:${companyId}:${hash}`;
  }
}

/**
 * Cached Conversation Service
 */
export class CachedConversationService {
  /**
   * Get conversation messages with caching
   */
  static async getConversationMessages(conversationId: string, limit: number = 50, offset: number = 0) {
    const cacheKey = `conversation_messages:${conversationId}:${limit}:${offset}`;
    
    return await cacheManager.getOrSet(
      CacheNames.CONVERSATIONS,
      cacheKey,
      async () => {
        console.log(`💬 Fetching conversation messages: ${conversationId}`);
        return await OptimizedQueries.getConversationMessages(conversationId, limit, offset);
      }
    );
  }

  /**
   * Get conversations with stats for company with caching
   */
  static async getConversationsWithStats(
    companyId: string,
    statusFilter: string = 'all',
    limit: number = 50,
    offset: number = 0
  ) {
    const cacheKey = `conversations_stats:${companyId}:${statusFilter}:${limit}:${offset}`;
    
    return await cacheManager.getOrSet(
      CacheNames.CONVERSATIONS,
      cacheKey,
      async () => {
        console.log(`🏢 Fetching conversations with stats for company: ${companyId}`);
        return await OptimizedQueries.getConversationsWithStats(companyId, statusFilter, limit, offset);
      },
      // Shorter TTL for company conversations (more dynamic data)
      30 * 60 * 1000 // 30 minutes
    );
  }

  /**
   * Update conversation status with cache invalidation
   */
  static async updateConversationStatus(
    conversationId: string,
    status: ConversationStatus,
    agentId?: string
  ) {
    const result = await OptimizedQueries.updateConversationStatus(
      conversationId,
      status,
      agentId
    );

    // Invalidate related cache entries using the companyId from the updated conversation
    if (result && result.company_id) {
      this.invalidateConversationCache(conversationId, result.company_id);
    } else {
      console.warn(`Could not invalidate company conversation cache for conversation ${conversationId}: company_id not found in update result.`);
      // Fallback to broader invalidation if company_id is not available
      this.invalidateConversationCache(conversationId, null); 
    }
    
    return result;
  }

  /**
   * Invalidate cache for specific conversation and related company data
   */
  static invalidateConversationCache(conversationId: string, companyId: string | null): void {
    cacheManager.delete(CacheNames.CONVERSATIONS, `conversation_messages:${conversationId}`);
    
    // Invalidate company conversations cache (pattern-based)
    let pattern: RegExp;
    if (companyId) {
      pattern = new RegExp(`^conversations_stats:${companyId}:`);
    } else {
      // If companyId is not available, invalidate all conversations_stats (broader, less efficient)
      pattern = new RegExp(`^conversations_stats:`);
    }
    
    const invalidated = cacheManager.invalidatePattern(CacheNames.CONVERSATIONS, pattern);
    console.log(`🔄 Invalidated conversation cache for ${conversationId} and ${invalidated} company conversation entries`);
  }

  /**
   * Warm up cache with recent conversations
   */
  static async warmUpRecentConversations(companyId: string): Promise<void> {
    console.log(`🔥 Warming up conversation cache for company: ${companyId}`);
    
    try {
      // Pre-load recent conversations with stats
      const conversations = await this.getConversationsWithStats(companyId, 'all', 10, 0);
      
      // Pre-load individual conversation messages
      const warmupPromises = conversations.map(async (conv: any) => {
        try {
          await this.getConversationMessages(conv.id, 20, 0);
        } catch (error) {
          console.warn(`Failed to warm up conversation ${conv.id}:`, error);
        }
      });
      
      await Promise.allSettled(warmupPromises);
      console.log(`✅ Warmed up ${conversations.length} conversations for company ${companyId}`);
    } catch (error) {
      console.error(`❌ Failed to warm up conversations for company ${companyId}:`, error);
    }
  }
}

/**
 * Cached Company Service
 */
export class CachedCompanyService {
  /**
   * Get user company ID with caching
   */
  static async getUserCompanyId(userId: string) {
    const cacheKey = `user_company:${userId}`;
    
    return await cacheManager.getOrSet(
      CacheNames.COMPANY_DATA,
      cacheKey,
      async () => {
        console.log(`🏢 Fetching company ID for user: ${userId}`);
        return await OptimizedQueries.getUserCompanyId(userId);
      }
    );
  }

  /**
   * Get dashboard stats with caching
   */
  static async getDashboardStats(companyId: string) {
    const cacheKey = `dashboard_stats:${companyId}`;
    
    return await cacheManager.getOrSet(
      CacheNames.COMPANY_DATA,
      cacheKey,
      async () => {
        console.log(`📊 Fetching dashboard stats for company: ${companyId}`);
        return await OptimizedQueries.getDashboardStats(companyId);
      },
      // Shorter TTL for dashboard stats (more dynamic data)
      10 * 60 * 1000 // 10 minutes
    );
  }

  /**
   * Invalidate company cache
   */
  static invalidateCompanyCache(companyId: string): void {
    const pattern = new RegExp(`^(dashboard_stats|user_company):${companyId}`);
    const invalidated = cacheManager.invalidatePattern(CacheNames.COMPANY_DATA, pattern);
    console.log(`🔄 Invalidated ${invalidated} company cache entries for company ${companyId}`);
  }
}

/**
 * Cached AI Response Service
 */
export class CachedAIResponseService {
  /**
   * Cache AI responses for similar queries
   */
  static async getCachedResponse(
    query: string,
    companyId: string,
    context: string[]
  ): Promise<any | null> {
    const cacheKey = this.createResponseCacheKey(query, companyId, context);
    
    return cacheManager.get(CacheNames.AI_RESPONSES, cacheKey);
  }

  /**
   * Store AI response in cache
   */
  static setCachedResponse(
    query: string,
    companyId: string,
    context: string[],
    response: any,
    customTtl?: number
  ): void {
    const cacheKey = this.createResponseCacheKey(query, companyId, context);
    
    cacheManager.set(CacheNames.AI_RESPONSES, cacheKey, response, customTtl);
  }

  /**
   * Create cache key for AI responses
   */
  private static createResponseCacheKey(
    query: string,
    companyId: string,
    context: string[]
  ): string {
    // Normalize query for better cache hits
    const normalizedQuery = query.toLowerCase().trim();
    const contextHash = crypto
      .createHash('md5')
      .update(context.join(''))
      .digest('hex')
      .substring(0, 8);
    
    const queryHash = crypto
      .createHash('md5')
      .update(normalizedQuery)
      .digest('hex')
      .substring(0, 8);
    
    return `ai_response:${companyId}:${queryHash}:${contextHash}`;
  }

  /**
   * Invalidate AI responses for company
   */
  static invalidateCompanyResponses(companyId: string): void {
    const pattern = new RegExp(`^ai_response:${companyId}:`);
    const invalidated = cacheManager.invalidatePattern(CacheNames.AI_RESPONSES, pattern);
    console.log(`🔄 Invalidated ${invalidated} AI response cache entries for company ${companyId}`);
  }
}

/**
 * Cached Embeddings Service
 */
export class CachedEmbeddingsService {
  /**
   * Get cached embeddings
   */
  static async getCachedEmbedding(text: string): Promise<number[] | null> {
    const cacheKey = this.createEmbeddingCacheKey(text);
    return cacheManager.get(CacheNames.EMBEDDINGS, cacheKey);
  }

  /**
   * Store embeddings in cache
   */
  static setCachedEmbedding(text: string, embedding: number[]): void {
    const cacheKey = this.createEmbeddingCacheKey(text);
    cacheManager.set(CacheNames.EMBEDDINGS, cacheKey, embedding);
  }

  /**
   * Create cache key for embeddings
   */
  private static createEmbeddingCacheKey(text: string): string {
    const hash = crypto.createHash('sha256').update(text).digest('hex');
    return `embedding:${hash}`;
  }

  /**
   * Batch get embeddings
   */
  static getBatchEmbeddings(texts: string[]): Map<string, number[]> {
    const keys = texts.map(text => this.createEmbeddingCacheKey(text));
    return cacheManager.getBatch(CacheNames.EMBEDDINGS, keys);
  }

  /**
   * Batch set embeddings
   */
  static setBatchEmbeddings(textEmbeddingPairs: Map<string, number[]>): void {
    const cacheEntries = new Map<string, number[]>();
    
    for (const [text, embedding] of textEmbeddingPairs) {
      const cacheKey = this.createEmbeddingCacheKey(text);
      cacheEntries.set(cacheKey, embedding);
    }
    
    cacheManager.setBatch(CacheNames.EMBEDDINGS, cacheEntries);
  }
}

/**
 * Cache Statistics and Management
 */
export class CacheStatsService {
  /**
   * Get comprehensive cache statistics
   */
  static getStats() {
    return cacheManager.getAllStats();
  }

  /**
   * Get cache health metrics
   */
  static getHealthMetrics() {
    const stats = cacheManager.getAllStats();
    const health: Record<string, any> = {};
    
    for (const [cacheName, cacheStats] of Object.entries(stats)) {
      if (cacheStats) {
        health[cacheName] = {
          utilization: (cacheStats.size / cacheStats.maxSize) * 100,
          hitRate: cacheStats.hitRate,
          status: this.getCacheStatus(cacheStats),
        };
      }
    }
    
    return health;
  }

  /**
   * Determine cache status based on metrics
   */
  private static getCacheStatus(stats: any): 'healthy' | 'warning' | 'critical' {
    if (stats.hitRate < 30) return 'critical';
    if (stats.hitRate < 60) return 'warning';
    return 'healthy';
  }

  /**
   * Clear all caches (use with caution)
   */
  static clearAllCaches(): void {
    const cacheNamesToClear = Object.values(CacheNames);
    
    for (const cacheName of cacheNamesToClear) {
      cacheManager.clear(cacheName);
    }
    
    console.log('🧹 All caches cleared');
  }

  /**
   * Warm up caches for a company
   */
  static async warmUpCompanyCaches(companyId: string): Promise<void> {
    console.log(`🔥 Starting cache warm-up for company: ${companyId}`);
    
    try {
      await Promise.allSettled([
        CachedCompanyService.getDashboardStats(companyId),
        CachedConversationService.warmUpRecentConversations(companyId),
        CachedKnowledgeBaseService.getDocuments(companyId),
      ]);
      
      console.log(`✅ Cache warm-up completed for company: ${companyId}`);
    } catch (error) {
      console.error(`❌ Cache warm-up failed for company ${companyId}:`, error);
    }
  }
}

// Export all cached services
export {
  CachedKnowledgeBaseService as KnowledgeBase,
  CachedConversationService as Conversations,
  CachedCompanyService as Company,
  CachedAIResponseService as AIResponses,
  CachedEmbeddingsService as Embeddings,
  CacheStatsService as CacheStats,
};
