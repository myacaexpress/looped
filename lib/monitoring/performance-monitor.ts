import { cacheManager } from '@/lib/cache/cache-manager';

// Performance metrics interface
interface PerformanceMetric {
  name: string;
  value: number;
  timestamp: number;
  tags?: Record<string, string>;
  unit?: string;
}

// Alert configuration
interface AlertConfig {
  name: string;
  metric: string;
  threshold: number;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
  cooldownMinutes: number;
}

// Alert instance
interface Alert {
  id: string;
  config: AlertConfig;
  triggeredAt: number;
  value: number;
  message: string;
  acknowledged: boolean;
}

/**
 * Performance monitoring and alerting system
 */
export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: Map<string, PerformanceMetric[]> = new Map();
  private alerts: Map<string, Alert> = new Map();
  private alertConfigs: Map<string, AlertConfig> = new Map();
  private maxMetricsPerType = 1000; // Keep last 1000 metrics per type
  private alertCooldowns: Map<string, number> = new Map();

  private constructor() {
    this.initializeDefaultAlerts();
    this.startPeriodicCollection();
  }

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  /**
   * Record a performance metric
   */
  recordMetric(name: string, value: number, tags?: Record<string, string>, unit?: string): void {
    const metric: PerformanceMetric = {
      name,
      value,
      timestamp: Date.now(),
      tags,
      unit,
    };

    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    const metricsList = this.metrics.get(name)!;
    metricsList.push(metric);

    // Keep only the last N metrics
    if (metricsList.length > this.maxMetricsPerType) {
      metricsList.shift();
    }

    // Check for alerts
    this.checkAlerts(name, value);

    console.log(`📊 Metric recorded: ${name} = ${value}${unit ? ` ${unit}` : ''}`);
  }

  /**
   * Get metrics for a specific name
   */
  getMetrics(name: string, limit?: number): PerformanceMetric[] {
    const metrics = this.metrics.get(name) || [];
    return limit ? metrics.slice(-limit) : metrics;
  }

  /**
   * Get all metric names
   */
  getMetricNames(): string[] {
    return Array.from(this.metrics.keys());
  }

  /**
   * Get latest value for a metric
   */
  getLatestMetric(name: string): PerformanceMetric | null {
    const metrics = this.metrics.get(name);
    return metrics && metrics.length > 0 ? metrics[metrics.length - 1] : null;
  }

  /**
   * Get average value for a metric over time period
   */
  getAverageMetric(name: string, timeWindowMs: number): number | null {
    const metrics = this.metrics.get(name);
    if (!metrics || metrics.length === 0) return null;

    const cutoffTime = Date.now() - timeWindowMs;
    const recentMetrics = metrics.filter(m => m.timestamp >= cutoffTime);
    
    if (recentMetrics.length === 0) return null;

    const sum = recentMetrics.reduce((acc, m) => acc + m.value, 0);
    return sum / recentMetrics.length;
  }

  /**
   * Time a function execution
   */
  async timeFunction<T>(
    name: string,
    fn: () => Promise<T>,
    tags?: Record<string, string>
  ): Promise<T> {
    const startTime = performance.now();
    
    try {
      const result = await fn();
      const duration = performance.now() - startTime;
      
      this.recordMetric(`${name}_duration`, duration, tags, 'ms');
      this.recordMetric(`${name}_success`, 1, tags);
      
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      
      this.recordMetric(`${name}_duration`, duration, tags, 'ms');
      this.recordMetric(`${name}_error`, 1, tags);
      
      throw error;
    }
  }

  /**
   * Create a timer for manual timing
   */
  createTimer(name: string, tags?: Record<string, string>) {
    const startTime = performance.now();
    
    return {
      end: () => {
        const duration = performance.now() - startTime;
        this.recordMetric(`${name}_duration`, duration, tags, 'ms');
        return duration;
      }
    };
  }

  /**
   * Record HTTP request metrics
   */
  recordHttpRequest(
    method: string,
    path: string,
    statusCode: number,
    duration: number,
    size?: number
  ): void {
    const tags = {
      method,
      path: this.sanitizePath(path),
      status_code: statusCode.toString(),
      status_class: `${Math.floor(statusCode / 100)}xx`,
    };

    this.recordMetric('http_request_duration', duration, tags, 'ms');
    this.recordMetric('http_request_count', 1, tags);
    
    if (size !== undefined) {
      this.recordMetric('http_response_size', size, tags, 'bytes');
    }

    // Record error rates
    if (statusCode >= 400) {
      this.recordMetric('http_error_count', 1, tags);
    }
  }

  /**
   * Record database query metrics
   */
  recordDatabaseQuery(
    operation: string,
    table: string,
    duration: number,
    rowCount?: number
  ): void {
    const tags = {
      operation,
      table,
    };

    this.recordMetric('db_query_duration', duration, tags, 'ms');
    this.recordMetric('db_query_count', 1, tags);
    
    if (rowCount !== undefined) {
      this.recordMetric('db_rows_affected', rowCount, tags);
    }
  }

  /**
   * Record cache metrics
   */
  recordCacheOperation(
    operation: 'hit' | 'miss' | 'set' | 'delete',
    cacheName: string,
    duration?: number
  ): void {
    const tags = {
      operation,
      cache_name: cacheName,
    };

    this.recordMetric('cache_operation_count', 1, tags);
    
    if (duration !== undefined) {
      this.recordMetric('cache_operation_duration', duration, tags, 'ms');
    }
  }

  /**
   * Add alert configuration
   */
  addAlert(config: AlertConfig): void {
    this.alertConfigs.set(config.name, config);
    console.log(`🚨 Alert configured: ${config.name} (${config.metric} ${config.operator} ${config.threshold})`);
  }

  /**
   * Remove alert configuration
   */
  removeAlert(name: string): void {
    this.alertConfigs.delete(name);
    this.alerts.delete(name);
    this.alertCooldowns.delete(name);
    console.log(`🔕 Alert removed: ${name}`);
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.alerts.values()).filter(alert => !alert.acknowledged);
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.acknowledged = true;
      console.log(`✅ Alert acknowledged: ${alertId}`);
      return true;
    }
    return false;
  }

  /**
   * Get system health summary
   */
  getHealthSummary(): {
    status: 'healthy' | 'warning' | 'critical';
    activeAlerts: number;
    metrics: Record<string, any>;
    cacheHealth: Record<string, any>;
  } {
    const activeAlerts = this.getActiveAlerts();
    const criticalAlerts = activeAlerts.filter(a => a.config.severity === 'critical');
    const highAlerts = activeAlerts.filter(a => a.config.severity === 'high');

    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (criticalAlerts.length > 0) {
      status = 'critical';
    } else if (highAlerts.length > 0 || activeAlerts.length > 5) {
      status = 'warning';
    }

    // Get key metrics
    const metrics: Record<string, any> = {};
    const keyMetrics = [
      'http_request_duration',
      'db_query_duration',
      'cache_hit_rate',
      'memory_usage',
      'cpu_usage'
    ];

    for (const metricName of keyMetrics) {
      const latest = this.getLatestMetric(metricName);
      const avg5min = this.getAverageMetric(metricName, 5 * 60 * 1000);
      
      if (latest || avg5min !== null) {
        metrics[metricName] = {
          current: latest?.value,
          avg5min,
          unit: latest?.unit,
        };
      }
    }

    // Get cache health
    const cacheHealth = this.getCacheHealthMetrics();

    return {
      status,
      activeAlerts: activeAlerts.length,
      metrics,
      cacheHealth,
    };
  }

  /**
   * Initialize default alert configurations
   */
  private initializeDefaultAlerts(): void {
    const defaultAlerts: AlertConfig[] = [
      {
        name: 'high_response_time',
        metric: 'http_request_duration',
        threshold: 5000, // 5 seconds
        operator: 'gt',
        severity: 'high',
        enabled: true,
        cooldownMinutes: 5,
      },
      {
        name: 'high_error_rate',
        metric: 'http_error_rate',
        threshold: 0.1, // 10%
        operator: 'gt',
        severity: 'critical',
        enabled: true,
        cooldownMinutes: 2,
      },
      {
        name: 'slow_db_queries',
        metric: 'db_query_duration',
        threshold: 10000, // 10 seconds
        operator: 'gt',
        severity: 'medium',
        enabled: true,
        cooldownMinutes: 10,
      },
      {
        name: 'low_cache_hit_rate',
        metric: 'cache_hit_rate',
        threshold: 0.5, // 50%
        operator: 'lt',
        severity: 'medium',
        enabled: true,
        cooldownMinutes: 15,
      },
      {
        name: 'high_memory_usage',
        metric: 'memory_usage',
        threshold: 0.9, // 90%
        operator: 'gt',
        severity: 'high',
        enabled: true,
        cooldownMinutes: 5,
      },
    ];

    for (const alert of defaultAlerts) {
      this.addAlert(alert);
    }
  }

  /**
   * Check if any alerts should be triggered
   */
  private checkAlerts(metricName: string, value: number): void {
    for (const [alertName, config] of this.alertConfigs) {
      if (!config.enabled || config.metric !== metricName) continue;

      // Check cooldown
      const lastTriggered = this.alertCooldowns.get(alertName);
      const cooldownMs = config.cooldownMinutes * 60 * 1000;
      
      if (lastTriggered && Date.now() - lastTriggered < cooldownMs) {
        continue;
      }

      // Check threshold
      let shouldTrigger = false;
      switch (config.operator) {
        case 'gt':
          shouldTrigger = value > config.threshold;
          break;
        case 'gte':
          shouldTrigger = value >= config.threshold;
          break;
        case 'lt':
          shouldTrigger = value < config.threshold;
          break;
        case 'lte':
          shouldTrigger = value <= config.threshold;
          break;
        case 'eq':
          shouldTrigger = value === config.threshold;
          break;
      }

      if (shouldTrigger) {
        this.triggerAlert(config, value);
      }
    }
  }

  /**
   * Trigger an alert
   */
  private triggerAlert(config: AlertConfig, value: number): void {
    const alertId = `${config.name}_${Date.now()}`;
    const alert: Alert = {
      id: alertId,
      config,
      triggeredAt: Date.now(),
      value,
      message: `Alert: ${config.name} - ${config.metric} is ${value} (threshold: ${config.threshold})`,
      acknowledged: false,
    };

    this.alerts.set(alertId, alert);
    this.alertCooldowns.set(config.name, Date.now());

    console.error(`🚨 ALERT TRIGGERED: ${alert.message}`);

    // In a real application, you would send notifications here
    // (email, Slack, PagerDuty, etc.)
    this.sendAlertNotification(alert);
  }

  /**
   * Send alert notification (placeholder for real implementation)
   */
  private sendAlertNotification(alert: Alert): void {
    // This would integrate with your notification system
    console.log(`📧 Alert notification sent: ${alert.message}`);
    
    // Example integrations:
    // - Send email via SendGrid/SES
    // - Post to Slack webhook
    // - Send to PagerDuty
    // - Store in database for dashboard
  }

  /**
   * Start periodic metric collection
   */
  private startPeriodicCollection(): void {
    // Collect system metrics every 30 seconds
    setInterval(() => {
      this.collectSystemMetrics();
      this.collectCacheMetrics();
    }, 30000);

    // Calculate derived metrics every minute
    setInterval(() => {
      this.calculateDerivedMetrics();
    }, 60000);
  }

  /**
   * Collect system metrics
   */
  private collectSystemMetrics(): void {
    try {
      // Memory usage
      if (typeof process !== 'undefined' && process.memoryUsage) {
        const memUsage = process.memoryUsage();
        this.recordMetric('memory_heap_used', memUsage.heapUsed, undefined, 'bytes');
        this.recordMetric('memory_heap_total', memUsage.heapTotal, undefined, 'bytes');
        this.recordMetric('memory_rss', memUsage.rss, undefined, 'bytes');
        
        // Calculate memory usage percentage (rough estimate)
        const memoryUsagePercent = memUsage.heapUsed / memUsage.heapTotal;
        this.recordMetric('memory_usage', memoryUsagePercent);
      }

      // CPU usage (simplified - in production you'd use more sophisticated monitoring)
      if (typeof process !== 'undefined' && process.cpuUsage) {
        const cpuUsage = process.cpuUsage();
        this.recordMetric('cpu_user', cpuUsage.user, undefined, 'microseconds');
        this.recordMetric('cpu_system', cpuUsage.system, undefined, 'microseconds');
      }
    } catch (error) {
      console.warn('Failed to collect system metrics:', error);
    }
  }

  /**
   * Collect cache metrics
   */
  private collectCacheMetrics(): void {
    try {
      const cacheStats = cacheManager.getAllStats();
      
      for (const [cacheName, stats] of Object.entries(cacheStats)) {
        if (stats) {
          this.recordMetric('cache_size', stats.size, { cache_name: cacheName });
          this.recordMetric('cache_hit_rate', stats.hitRate / 100, { cache_name: cacheName });
          this.recordMetric('cache_hits', stats.hits, { cache_name: cacheName });
          this.recordMetric('cache_misses', stats.misses, { cache_name: cacheName });
        }
      }
    } catch (error) {
      console.warn('Failed to collect cache metrics:', error);
    }
  }

  /**
   * Calculate derived metrics
   */
  private calculateDerivedMetrics(): void {
    try {
      // Calculate error rate
      const errorCount = this.getLatestMetric('http_error_count')?.value || 0;
      const totalCount = this.getLatestMetric('http_request_count')?.value || 0;
      
      if (totalCount > 0) {
        const errorRate = errorCount / totalCount;
        this.recordMetric('http_error_rate', errorRate);
      }

      // Calculate average response time over last 5 minutes
      const avgResponseTime = this.getAverageMetric('http_request_duration', 5 * 60 * 1000);
      if (avgResponseTime !== null) {
        this.recordMetric('http_avg_response_time_5min', avgResponseTime, undefined, 'ms');
      }
    } catch (error) {
      console.warn('Failed to calculate derived metrics:', error);
    }
  }

  /**
   * Get cache health metrics
   */
  private getCacheHealthMetrics(): Record<string, any> {
    try {
      return cacheManager.getAllStats();
    } catch (error) {
      console.warn('Failed to get cache health metrics:', error);
      return {};
    }
  }

  /**
   * Sanitize URL path for metrics (remove IDs, etc.)
   */
  private sanitizePath(path: string): string {
    return path
      .replace(/\/\d+/g, '/:id')
      .replace(/\/[a-f0-9-]{36}/g, '/:uuid')
      .replace(/\/[a-f0-9]{24}/g, '/:objectid');
  }

  /**
   * Export metrics for external monitoring systems
   */
  exportMetrics(format: 'json' | 'prometheus' = 'json'): string {
    if (format === 'prometheus') {
      return this.exportPrometheusMetrics();
    }

    const exportData: Record<string, any> = {};
    
    for (const [name, metrics] of this.metrics) {
      exportData[name] = metrics.map(m => ({
        value: m.value,
        timestamp: m.timestamp,
        tags: m.tags,
        unit: m.unit,
      }));
    }

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Export metrics in Prometheus format
   */
  private exportPrometheusMetrics(): string {
    const lines: string[] = [];
    
    for (const [name, metrics] of this.metrics) {
      const latest = metrics[metrics.length - 1];
      if (!latest) continue;

      const metricName = name.replace(/[^a-zA-Z0-9_]/g, '_');
      let line = `${metricName} ${latest.value}`;
      
      if (latest.tags && Object.keys(latest.tags).length > 0) {
        const tags = Object.entries(latest.tags)
          .map(([k, v]) => `${k}="${v}"`)
          .join(',');
        line = `${metricName}{${tags}} ${latest.value}`;
      }
      
      lines.push(line);
    }

    return lines.join('\n');
  }
}

// Export singleton instance
export const performanceMonitor = PerformanceMonitor.getInstance();

// Middleware function for Express/Next.js
export function createPerformanceMiddleware() {
  return (req: any, res: any, next: any) => {
    const startTime = Date.now();
    const originalSend = res.send;

    res.send = function(data: any) {
      const duration = Date.now() - startTime;
      const size = Buffer.isBuffer(data) ? data.length : Buffer.byteLength(data || '', 'utf8');
      
      performanceMonitor.recordHttpRequest(
        req.method,
        req.path || req.url,
        res.statusCode,
        duration,
        size
      );

      return originalSend.call(this, data);
    };

    next();
  };
}
