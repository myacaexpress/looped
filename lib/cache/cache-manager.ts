import { LRUCache } from 'lru-cache';

// Cache configuration interface
interface CacheConfig {
  maxSize: number;
  ttl: number; // Time to live in milliseconds
  updateAgeOnGet?: boolean;
  allowStale?: boolean;
}

// Cache entry with metadata
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  hits: number;
  lastAccessed: number;
}

export class CacheManager {
  private static instance: CacheManager;
  private static initialized: boolean = false; // Flag for lazy initialization
  private caches: Map<string, LRUCache<string, CacheEntry<any>>> = new Map();
  private stats: Map<string, { hits: number; misses: number; sets: number }> = new Map();

  private constructor() {}

  static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    // Lazy initialize default caches if not already done
    if (!CacheManager.initialized) {
      initializeDefaultCaches(); // Call the function from this module
      CacheManager.initialized = true;
    }
    return CacheManager.instance;
  }

  /**
   * Initialize a cache with specific configuration
   */
  initializeCache(name: string, config: CacheConfig): void {
    const cache = new LRUCache<string, CacheEntry<any>>({
      max: config.maxSize,
      ttl: config.ttl,
      updateAgeOnGet: config.updateAgeOnGet ?? true,
      allowStale: config.allowStale ?? false,
    });

    this.caches.set(name, cache);
    this.stats.set(name, { hits: 0, misses: 0, sets: 0 });
    
    console.log(`✅ Cache "${name}" initialized with max size: ${config.maxSize}, TTL: ${config.ttl}ms`);
  }

  /**
   * Get value from cache
   */
  get<T>(cacheName: string, key: string): T | null {
    const cache = this.caches.get(cacheName);
    const stats = this.stats.get(cacheName);
    
    if (!cache || !stats) {
      console.warn(`Cache "${cacheName}" not found`);
      return null;
    }

    const entry = cache.get(key);
    
    if (entry) {
      entry.hits++;
      entry.lastAccessed = Date.now();
      stats.hits++;
      console.log(`🎯 Cache HIT for "${cacheName}:${key}"`);
      return entry.data;
    } else {
      stats.misses++;
      console.log(`❌ Cache MISS for "${cacheName}:${key}"`);
      return null;
    }
  }

  /**
   * Set value in cache
   */
  set<T>(cacheName: string, key: string, value: T, customTtl?: number): void {
    const cache = this.caches.get(cacheName);
    const stats = this.stats.get(cacheName);
    
    if (!cache || !stats) {
      console.warn(`Cache "${cacheName}" not found`);
      return;
    }

    const entry: CacheEntry<T> = {
      data: value,
      timestamp: Date.now(),
      hits: 0,
      lastAccessed: Date.now(),
    };

    if (customTtl) {
      cache.set(key, entry, { ttl: customTtl });
    } else {
      cache.set(key, entry);
    }

    stats.sets++;
    console.log(`💾 Cache SET for "${cacheName}:${key}"`);
  }

  /**
   * Delete value from cache
   */
  delete(cacheName: string, key: string): boolean {
    const cache = this.caches.get(cacheName);
    
    if (!cache) {
      console.warn(`Cache "${cacheName}" not found`);
      return false;
    }

    const deleted = cache.delete(key);
    if (deleted) {
      console.log(`🗑️ Cache DELETE for "${cacheName}:${key}"`);
    }
    
    return deleted;
  }

  /**
   * Clear entire cache
   */
  clear(cacheName: string): void {
    const cache = this.caches.get(cacheName);
    
    if (!cache) {
      console.warn(`Cache "${cacheName}" not found`);
      return;
    }

    cache.clear();
    console.log(`🧹 Cache CLEAR for "${cacheName}"`);
  }

  /**
   * Get cache statistics
   */
  getStats(cacheName: string) {
    const cache = this.caches.get(cacheName);
    const stats = this.stats.get(cacheName);
    
    if (!cache || !stats) {
      return null;
    }

    const hitRate = stats.hits + stats.misses > 0 
      ? (stats.hits / (stats.hits + stats.misses)) * 100 
      : 0;

    return {
      size: cache.size,
      maxSize: cache.max,
      hits: stats.hits,
      misses: stats.misses,
      sets: stats.sets,
      hitRate: Math.round(hitRate * 100) / 100,
    };
  }

  /**
   * Get all cache statistics
   */
  getAllStats() {
    const allStats: Record<string, any> = {};
    
    for (const cacheName of this.caches.keys()) {
      allStats[cacheName] = this.getStats(cacheName);
    }
    
    return allStats;
  }

  /**
   * Get or set pattern (cache-aside)
   */
  async getOrSet<T>(
    cacheName: string,
    key: string,
    fetchFunction: () => Promise<T>,
    customTtl?: number
  ): Promise<T> {
    // Try to get from cache first
    const cached = this.get<T>(cacheName, key);
    
    if (cached !== null) {
      return cached;
    }

    // If not in cache, fetch the data
    try {
      const data = await fetchFunction();
      this.set(cacheName, key, data, customTtl);
      return data;
    } catch (error) {
      console.error(`Error fetching data for cache key "${cacheName}:${key}":`, error);
      throw error;
    }
  }

  /**
   * Batch get multiple keys
   */
  getBatch<T>(cacheName: string, keys: string[]): Map<string, T> {
    const results = new Map<string, T>();
    
    for (const key of keys) {
      const value = this.get<T>(cacheName, key);
      if (value !== null) {
        results.set(key, value);
      }
    }
    
    return results;
  }

  /**
   * Batch set multiple key-value pairs
   */
  setBatch<T>(cacheName: string, entries: Map<string, T>, customTtl?: number): void {
    for (const [key, value] of entries) {
      this.set(cacheName, key, value, customTtl);
    }
  }

  /**
   * Check if key exists in cache
   */
  has(cacheName: string, key: string): boolean {
    const cache = this.caches.get(cacheName);
    return cache ? cache.has(key) : false;
  }

  /**
   * Get cache keys
   */
  keys(cacheName: string): string[] {
    const cache = this.caches.get(cacheName);
    return cache ? Array.from(cache.keys()) : [];
  }

  /**
   * Warm up cache with predefined data
   */
  warmUp<T>(cacheName: string, data: Map<string, T>): void {
    console.log(`🔥 Warming up cache "${cacheName}" with ${data.size} entries`);
    this.setBatch(cacheName, data);
  }

  /**
   * Invalidate cache entries by pattern
   */
  invalidatePattern(cacheName: string, pattern: RegExp): number {
    const cache = this.caches.get(cacheName);
    
    if (!cache) {
      console.warn(`Cache "${cacheName}" not found`);
      return 0;
    }

    const keys = Array.from(cache.keys());
    const matchingKeys = keys.filter(key => pattern.test(key));
    
    for (const key of matchingKeys) {
      cache.delete(key);
    }

    console.log(`🔄 Invalidated ${matchingKeys.length} entries matching pattern in "${cacheName}"`);
    return matchingKeys.length;
  }
}

// Predefined cache configurations
export const CacheConfigs = {
  // User session cache - short TTL, small size
  USER_SESSIONS: {
    maxSize: 1000,
    ttl: 15 * 60 * 1000, // 15 minutes
    updateAgeOnGet: true,
  },

  // Knowledge base search results - medium TTL, larger size
  KNOWLEDGE_BASE: {
    maxSize: 5000,
    ttl: 60 * 60 * 1000, // 1 hour
    updateAgeOnGet: true,
  },

  // AI responses - longer TTL for similar queries
  AI_RESPONSES: {
    maxSize: 2000,
    ttl: 30 * 60 * 1000, // 30 minutes
    updateAgeOnGet: true,
  },

  // Company data - long TTL, small size
  COMPANY_DATA: {
    maxSize: 500,
    ttl: 4 * 60 * 60 * 1000, // 4 hours
    updateAgeOnGet: true,
  },

  // Conversation metadata - medium TTL
  CONVERSATIONS: {
    maxSize: 3000,
    ttl: 2 * 60 * 60 * 1000, // 2 hours
    updateAgeOnGet: true,
  },

  // Embeddings cache - very long TTL, large size
  EMBEDDINGS: {
    maxSize: 10000,
    ttl: 24 * 60 * 60 * 1000, // 24 hours
    updateAgeOnGet: false,
  },
};

// Initialize default caches
export function initializeDefaultCaches(): void {
  const cacheManager = CacheManager.getInstance();
  
  Object.entries(CacheConfigs).forEach(([name, config]) => {
    cacheManager.initializeCache(name as string, config);
  });
  
  console.log('🚀 All default caches initialized');
}

// Export singleton instance
export const cacheManager = CacheManager.getInstance();
