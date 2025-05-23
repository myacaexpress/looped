import { NextRequest, NextResponse } from 'next/server';
import { performanceMonitor } from '@/lib/monitoring/performance-monitor';
import { CacheStats } from '@/lib/cache/cached-services';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'json';
    const detailed = searchParams.get('detailed') === 'true';

    // Record API request
    const timer = performanceMonitor.createTimer('health_check_api');

    if (format === 'prometheus') {
      const metrics = performanceMonitor.exportMetrics('prometheus');
      timer.end();
      
      return new NextResponse(metrics, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
        },
      });
    }

    // Get health summary
    const healthSummary = performanceMonitor.getHealthSummary();
    
    let response: any = {
      status: healthSummary.status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      activeAlerts: healthSummary.activeAlerts,
    };

    if (detailed) {
      response = {
        ...response,
        metrics: healthSummary.metrics,
        cacheHealth: healthSummary.cacheHealth,
        alerts: performanceMonitor.getActiveAlerts(),
        systemInfo: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          memory: process.memoryUsage(),
        },
      };
    }

    const duration = timer.end();
    
    // Set appropriate status code based on health
    const statusCode = healthSummary.status === 'critical' ? 503 
                     : healthSummary.status === 'warning' ? 200 
                     : 200;

    return NextResponse.json(response, { 
      status: statusCode,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Response-Time': `${duration}ms`,
      },
    });

  } catch (error) {
    console.error('Health check error:', error);
    
    return NextResponse.json(
      { 
        status: 'error', 
        message: 'Health check failed',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, alertId } = body;

    if (action === 'acknowledge' && alertId) {
      const acknowledged = performanceMonitor.acknowledgeAlert(alertId);
      
      return NextResponse.json({
        success: acknowledged,
        message: acknowledged ? 'Alert acknowledged' : 'Alert not found',
      });
    }

    if (action === 'clear_caches') {
      CacheStats.clearAllCaches();
      
      return NextResponse.json({
        success: true,
        message: 'All caches cleared',
      });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );

  } catch (error) {
    console.error('Health action error:', error);
    
    return NextResponse.json(
      { error: 'Action failed' },
      { status: 500 }
    );
  }
}
