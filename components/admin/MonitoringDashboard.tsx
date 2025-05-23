'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';

interface HealthStatus {
  status: 'healthy' | 'warning' | 'critical' | 'error';
  timestamp: string;
  uptime: number;
  activeAlerts: number;
  metrics?: Record<string, any>;
  cacheHealth?: Record<string, any>;
  alerts?: Array<{
    id: string;
    message: string;
    severity: string;
    triggeredAt: number;
  }>;
  systemInfo?: {
    nodeVersion: string;
    platform: string;
    arch: string;
    memory: any;
  };
}

export default function MonitoringDashboard() {
  const [healthData, setHealthData] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showDetailed, setShowDetailed] = useState(false);

  const fetchHealthData = async (detailed: boolean = false) => {
    try {
      const response = await fetch(`/api/monitoring/health?detailed=${detailed}`);
      const data = await response.json();
      setHealthData(data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch health data');
      console.error('Health check error:', err);
    } finally {
      setLoading(false);
    }
  };

  const acknowledgeAlert = async (alertId: string) => {
    try {
      const response = await fetch('/api/monitoring/health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'acknowledge', alertId }),
      });
      
      if (response.ok) {
        fetchHealthData(showDetailed);
      }
    } catch (err) {
      console.error('Failed to acknowledge alert:', err);
    }
  };

  const clearCaches = async () => {
    try {
      const response = await fetch('/api/monitoring/health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear_caches' }),
      });
      
      if (response.ok) {
        fetchHealthData(showDetailed);
      }
    } catch (err) {
      console.error('Failed to clear caches:', err);
    }
  };

  useEffect(() => {
    fetchHealthData(showDetailed);
  }, [showDetailed]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchHealthData(showDetailed);
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [autoRefresh, showDetailed]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-600 bg-green-100';
      case 'warning': return 'text-yellow-600 bg-yellow-100';
      case 'critical': return 'text-red-600 bg-red-100';
      case 'error': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-600 bg-red-100';
      case 'high': return 'text-orange-600 bg-orange-100';
      case 'medium': return 'text-yellow-600 bg-yellow-100';
      case 'low': return 'text-blue-600 bg-blue-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const formatBytes = (bytes: number) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <strong className="font-bold">Error: </strong>
          <span className="block sm:inline">{error}</span>
        </div>
        <Button 
          onClick={() => fetchHealthData(showDetailed)} 
          className="mt-4"
        >
          Retry
        </Button>
      </div>
    );
  }

  if (!healthData) return null;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">System Monitoring</h1>
        <div className="flex gap-2">
          <Button
            variant={autoRefresh ? "default" : "outline"}
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? "Auto-refresh ON" : "Auto-refresh OFF"}
          </Button>
          <Button
            variant={showDetailed ? "default" : "outline"}
            onClick={() => setShowDetailed(!showDetailed)}
          >
            {showDetailed ? "Simple View" : "Detailed View"}
          </Button>
          <Button onClick={() => fetchHealthData(showDetailed)}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">System Status</p>
              <div className={`inline-flex px-2 py-1 rounded-full text-sm font-medium ${getStatusColor(healthData.status)}`}>
                {healthData.status.toUpperCase()}
              </div>
            </div>
            <div className={`w-3 h-3 rounded-full ${
              healthData.status === 'healthy' ? 'bg-green-500' :
              healthData.status === 'warning' ? 'bg-yellow-500' : 'bg-red-500'
            }`}></div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div>
            <p className="text-sm font-medium text-gray-600">Uptime</p>
            <p className="text-2xl font-bold text-gray-900">
              {formatUptime(healthData.uptime)}
            </p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div>
            <p className="text-sm font-medium text-gray-600">Active Alerts</p>
            <p className={`text-2xl font-bold ${
              healthData.activeAlerts > 0 ? 'text-red-600' : 'text-green-600'
            }`}>
              {healthData.activeAlerts}
            </p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div>
            <p className="text-sm font-medium text-gray-600">Last Updated</p>
            <p className="text-sm text-gray-900">
              {new Date(healthData.timestamp).toLocaleTimeString()}
            </p>
          </div>
        </div>
      </div>

      {/* Active Alerts */}
      {healthData.alerts && healthData.alerts.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">Active Alerts</h2>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {healthData.alerts.map((alert) => (
                <div key={alert.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${getSeverityColor(alert.severity)}`}>
                        {alert.severity.toUpperCase()}
                      </span>
                      <span className="text-sm text-gray-500">
                        {new Date(alert.triggeredAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-900">{alert.message}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => acknowledgeAlert(alert.id)}
                  >
                    Acknowledge
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Metrics */}
      {showDetailed && healthData.metrics && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">Performance Metrics</h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Object.entries(healthData.metrics).map(([key, metric]: [string, any]) => (
                <div key={key} className="border rounded-lg p-4">
                  <h3 className="text-sm font-medium text-gray-600 mb-2">
                    {key.replace(/_/g, ' ').toUpperCase()}
                  </h3>
                  <div className="space-y-1">
                    {metric.current !== undefined && (
                      <p className="text-lg font-semibold">
                        Current: {metric.current?.toFixed(2)} {metric.unit || ''}
                      </p>
                    )}
                    {metric.avg5min !== undefined && (
                      <p className="text-sm text-gray-600">
                        5min avg: {metric.avg5min?.toFixed(2)} {metric.unit || ''}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Cache Health */}
      {showDetailed && healthData.cacheHealth && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-lg font-medium text-gray-900">Cache Health</h2>
            <Button
              size="sm"
              variant="outline"
              onClick={clearCaches}
              className="text-red-600 hover:text-red-700"
            >
              Clear All Caches
            </Button>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Object.entries(healthData.cacheHealth).map(([cacheName, stats]: [string, any]) => (
                <div key={cacheName} className="border rounded-lg p-4">
                  <h3 className="text-sm font-medium text-gray-600 mb-2">
                    {cacheName.replace(/_/g, ' ')}
                  </h3>
                  {stats && (
                    <div className="space-y-1">
                      <p className="text-sm">
                        Size: {stats.size} / {stats.maxSize}
                      </p>
                      <p className="text-sm">
                        Hit Rate: {stats.hitRate?.toFixed(1)}%
                      </p>
                      <p className="text-sm">
                        Hits: {stats.hits} | Misses: {stats.misses}
                      </p>
                      <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full"
                          style={{ width: `${(stats.size / stats.maxSize) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* System Info */}
      {showDetailed && healthData.systemInfo && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">System Information</h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-medium text-gray-600 mb-2">Runtime</h3>
                <div className="space-y-1 text-sm">
                  <p>Node.js: {healthData.systemInfo.nodeVersion}</p>
                  <p>Platform: {healthData.systemInfo.platform}</p>
                  <p>Architecture: {healthData.systemInfo.arch}</p>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-600 mb-2">Memory Usage</h3>
                <div className="space-y-1 text-sm">
                  <p>RSS: {formatBytes(healthData.systemInfo.memory.rss)}</p>
                  <p>Heap Used: {formatBytes(healthData.systemInfo.memory.heapUsed)}</p>
                  <p>Heap Total: {formatBytes(healthData.systemInfo.memory.heapTotal)}</p>
                  <p>External: {formatBytes(healthData.systemInfo.memory.external)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
