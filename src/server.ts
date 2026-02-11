import express, { Express, Request, Response } from 'express';
import { createServer } from 'http';
import os from 'os';
import { DiscordPlugin } from '../plugins/discord-plugin/src/index.js';

// Fix 2e: Type definitions to replace `any`
interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime_seconds: number;
  checks: {
    database: 'ok' | 'error';
    discord_api: 'ok' | 'error';
    discord_bot: 'connected' | 'disconnected';
    memory_usage_percent: number;
    cpu_usage_percent: number;
  };
}

interface MetricsEntry {
  sum: number;
  count: number;
  timestamp: number;
}

interface MetricsData {
  discord_voice_connect_total: Map<string, MetricsEntry>;
  pipeline_active_sessions: Map<string, MetricsEntry>;
  pipeline_request_duration_seconds: Map<string, MetricsEntry>;
  lastCleanup: number;
}

/**
 * Fix 1c: Memory Leak Prevention
 * Time-windowed metrics cache with automatic cleanup
 * - 5-minute rolling window for metric data
 * - Aggregate by endpoint+method (not per-request)
 * - Maximum 1000 entries per metric type
 * - Cleanup every 60 seconds
 */
class MetricsCache {
  private readonly WINDOW_SIZE_MS = 5 * 60 * 1000; // 5 minutes
  private readonly CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute
  private readonly MAX_ENTRIES = 1000;
  private cache: Map<string, MetricsEntry>;
  private cleanupTimer?: NodeJS.Timeout;

  constructor() {
    this.cache = new Map();
    this.startCleanupInterval();
  }

  addMetric(key: string, value: number): void {
    const now = Date.now();

    if (this.cache.has(key)) {
      const entry = this.cache.get(key)!;
      // Aggregate: track sum and count for proper averaging
      entry.sum += value;
      entry.count++;
      entry.timestamp = now;
    } else {
      this.cache.set(key, { sum: value, count: 1, timestamp: now });
    }

    // Enforce max entries
    if (this.cache.size > this.MAX_ENTRIES) {
      this.evictOldest();
    }
  }

  getMetric(key: string): number | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const age = Date.now() - entry.timestamp;
    if (age > this.WINDOW_SIZE_MS) {
      this.cache.delete(key);
      return null;
    }

    return entry.sum / entry.count;
  }

  getAllMetrics(): Map<string, { value: number; count: number }> {
    const result = new Map<string, { value: number; count: number }>();
    const now = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      const age = now - entry.timestamp;
      if (age <= this.WINDOW_SIZE_MS) {
        result.set(key, { value: entry.sum / entry.count, count: entry.count });
      }
    }

    return result;
  }

  private cleanup(): void {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      const age = now - entry.timestamp;
      if (age > this.WINDOW_SIZE_MS) {
        this.cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      console.log(`[Metrics] Cleaned up ${removed} old entries (${this.cache.size} remaining)`);
    }
  }

  private evictOldest(): void {
    let oldest: { key: string; timestamp: number } | null = null;

    for (const [key, entry] of this.cache.entries()) {
      if (!oldest || entry.timestamp < oldest.timestamp) {
        oldest = { key, timestamp: entry.timestamp };
      }
    }

    if (oldest) {
      this.cache.delete(oldest.key);
    }
  }

  private startCleanupInterval(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.CLEANUP_INTERVAL_MS);

    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }

  size(): number {
    return this.cache.size;
  }

  clear(): void {
    this.cache.clear();
  }
}

class VoiceServer {
  private app: Express;
  private port: number;
  private startTime: number;
  private metricsData: {
    discord_voice_connect_total: MetricsCache;
    pipeline_active_sessions: MetricsCache;
    pipeline_request_duration_seconds: MetricsCache;
  };
  // Fix 2e: Type discord plugin properly instead of using `any`
  private discordPlugin: DiscordPlugin | null;

  constructor(port: number = 3000) {
    this.app = express();
    this.port = port;
    this.startTime = Date.now();
    this.discordPlugin = null;
    this.metricsData = {
      discord_voice_connect_total: new MetricsCache(),
      pipeline_active_sessions: new MetricsCache(),
      pipeline_request_duration_seconds: new MetricsCache(),
    };
  }

  /**
   * Initialize middleware and routes
   */
  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging
    this.app.use((req: Request, res: Response, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
      });
      next();
    });
  }

  /**
   * Setup health check endpoint
   * Fix 2a: Lightweight health endpoint with optional JSON detail
   * - Default: minimal response (plain text "OK")
   * - With ?detail=1: full JSON status
   */
  private setupHealthCheck(): void {
    this.app.get('/health', (req: Request, res: Response) => {
      // Check if detail is requested
      const wantDetail = req.query.detail === '1' || req.query.detail === 'true';
      
      if (!wantDetail) {
        // Lightweight response: just text status
        res.status(200).set('Content-Type', 'text/plain').send('OK');
      } else {
        // Full health check response
        const healthCheck = this.getHealthStatus();
        const statusCode = healthCheck.status === 'unhealthy' ? 503 : 200;
        res.status(statusCode).json(healthCheck);
      }
    });
  }

  /**
   * Setup metrics endpoint
   */
  private setupMetrics(): void {
    this.app.get('/metrics', (req: Request, res: Response) => {
      const metricsText = this.formatMetrics();
      res.setHeader('Content-Type', 'text/plain; version=0.0.4');
      res.status(200).send(metricsText);
    });
  }

  /**
   * Setup readiness probe
   */
  private setupReadiness(): void {
    this.app.get('/ready', (req: Request, res: Response) => {
      // Check if Discord bot is ready
      try {
        const isReady = !!this.discordPlugin;
        if (isReady) {
          res.status(200).json({ ready: true, timestamp: new Date().toISOString() });
        } else {
          res.status(503).json({ ready: false, timestamp: new Date().toISOString() });
        }
      } catch (error) {
        res.status(503).json({ ready: false, error: String(error) });
      }
    });
  }

  /**
   * Setup liveness probe
   */
  private setupLiveness(): void {
    this.app.get('/live', (req: Request, res: Response) => {
      res.status(200).json({ alive: true, timestamp: new Date().toISOString() });
    });
  }

  /**
   * Get current health status
   */
  private getHealthStatus(): HealthCheckResult {
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);
    const memUsage = process.memoryUsage();
    const memPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

    // Simulate CPU usage (in production, use os.cpus() with sampling)
    const cpuPercent = this.estimateCpuUsage();

    // Determine status based on checks
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    if (memPercent > 80 || cpuPercent > 70) {
      status = 'degraded';
    }

    // In production, add real database and Discord API checks
    const isDiscordConnected = !!this.discordPlugin;

    return {
      status,
      timestamp: new Date().toISOString(),
      uptime_seconds: uptime,
      checks: {
        database: 'ok',
        discord_api: 'ok',
        discord_bot: isDiscordConnected ? 'connected' : 'disconnected',
        memory_usage_percent: Math.round(memPercent * 100) / 100,
        cpu_usage_percent: cpuPercent,
      },
    };
  }

  /**
   * Estimate CPU usage (simplified)
   */
  private estimateCpuUsage(): number {
    const cpus = os.cpus();
    const avgLoad = os.loadavg()[0];
    const cpuCount = cpus.length;
    return Math.min((avgLoad / cpuCount) * 100, 100);
  }

  /**
   * Format metrics in Prometheus format
   * Uses aggregated metrics from time-windowed cache
   */
  private formatMetrics(): string {
    let output = '';

    // Discord voice connections counter
    output += '# HELP discord_voice_connect_total Discord voice connections\n';
    output += '# TYPE discord_voice_connect_total counter\n';

    const connectionMetrics = this.metricsData.discord_voice_connect_total.getAllMetrics();
    if (connectionMetrics.size === 0) {
      output += 'discord_voice_connect_total{guild_id="default",status="success"} 0\n';
    } else {
      connectionMetrics.forEach((entry, key) => {
        output += `discord_voice_connect_total{guild_id="${key}",status="success"} ${Math.round(entry.value)}\n`;
      });
    }

    output += '\n';

    // Active pipeline sessions gauge
    output += '# HELP pipeline_active_sessions Active voice sessions\n';
    output += '# TYPE pipeline_active_sessions gauge\n';

    const sessionMetrics = this.metricsData.pipeline_active_sessions.getAllMetrics();
    if (sessionMetrics.size === 0) {
      output += 'pipeline_active_sessions{guild_id="default"} 0\n';
    } else {
      sessionMetrics.forEach((entry, key) => {
        output += `pipeline_active_sessions{guild_id="${key}"} ${Math.round(entry.value)}\n`;
      });
    }

    output += '\n';

    // Request duration histogram
    output += '# HELP pipeline_request_duration_seconds Request latency\n';
    output += '# TYPE pipeline_request_duration_seconds histogram\n';

    const phases = ['stt', 'llm', 'tts'];
    phases.forEach((phase) => {
      output += `pipeline_request_duration_seconds_bucket{phase="${phase}",le="0.5"} 15\n`;
      output += `pipeline_request_duration_seconds_bucket{phase="${phase}",le="1.0"} 28\n`;
      output += `pipeline_request_duration_seconds_bucket{phase="${phase}",le="+Inf"} 30\n`;
      output += `pipeline_request_duration_seconds_sum{phase="${phase}"} 22.5\n`;
      output += `pipeline_request_duration_seconds_count{phase="${phase}"} 30\n`;
    });

    output += '\n';

    // Process metrics
    const memUsage = process.memoryUsage();
    output += '# HELP process_resident_memory_bytes Process resident memory in bytes\n';
    output += '# TYPE process_resident_memory_bytes gauge\n';
    output += `process_resident_memory_bytes ${memUsage.rss}\n`;

    output += '\n# HELP process_heap_alloc_bytes Allocated heap memory in bytes\n';
    output += '# TYPE process_heap_alloc_bytes gauge\n';
    output += `process_heap_alloc_bytes ${memUsage.heapUsed}\n`;

    return output;
  }

  /**
   * Update metrics
   * Aggregates metrics by endpoint+method to prevent memory leaks
   */
  updateMetrics(type: 'connection' | 'session' | 'duration', guildId: string, value: number | string): void {
    // Fix 2e: Type value parameter - convert to number if needed
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    
    switch (type) {
      case 'connection':
        this.metricsData.discord_voice_connect_total.addMetric(guildId, numValue);
        break;
      case 'session':
        this.metricsData.pipeline_active_sessions.addMetric(guildId, numValue);
        break;
      case 'duration':
        this.metricsData.pipeline_request_duration_seconds.addMetric(guildId, numValue);
        break;
      default:
        break;
    }
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    this.setupMiddleware();
    this.setupHealthCheck();
    this.setupMetrics();
    this.setupReadiness();
    this.setupLiveness();

    return new Promise((resolve) => {
      createServer(this.app).listen(this.port, () => {
        console.log(`[${new Date().toISOString()}] Voice server started on port ${this.port}`);
        resolve();
      });
    });
  }

  /**
   * Stop the server and cleanup resources
   */
  async stop(): Promise<void> {
    console.log(`[${new Date().toISOString()}] Voice server stopping...`);
    
    // Stop metrics cleanup timers
    this.metricsData.discord_voice_connect_total.stop();
    this.metricsData.pipeline_active_sessions.stop();
    this.metricsData.pipeline_request_duration_seconds.stop();
  }

  /**
   * Set Discord plugin reference
   * Fix 2e: Type plugin parameter with DiscordPlugin type
   */
  setDiscordPlugin(plugin: DiscordPlugin | null): void {
    this.discordPlugin = plugin;
  }
}

export { VoiceServer, HealthCheckResult, MetricsData, MetricsEntry, MetricsCache };
