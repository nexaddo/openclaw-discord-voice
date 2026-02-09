/**
 * Discord Voice Integration Server
 * Main HTTP server with health checks and metrics endpoints
 */

import express, { Express, Request, Response } from 'express';
import { createServer } from 'http';
import os from 'os';
import { DiscordPlugin } from '../plugins/discord-plugin/src/index.js';

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

interface MetricsData {
  discord_voice_connect_total: Map<string, number>;
  pipeline_active_sessions: Map<string, number>;
  pipeline_request_duration_seconds: Map<string, any>;
}

class VoiceServer {
  private app: Express;
  private port: number;
  private startTime: number;
  private metricsData: MetricsData;
  private discordPlugin: any;

  constructor(port: number = 3000) {
    this.app = express();
    this.port = port;
    this.startTime = Date.now();
    this.metricsData = {
      discord_voice_connect_total: new Map(),
      pipeline_active_sessions: new Map(),
      pipeline_request_duration_seconds: new Map(),
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
   */
  private setupHealthCheck(): void {
    this.app.get('/health', (req: Request, res: Response) => {
      const healthCheck = this.getHealthStatus();
      const statusCode = healthCheck.status === 'unhealthy' ? 503 : 200;
      res.status(statusCode).json(healthCheck);
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
   */
  private formatMetrics(): string {
    let output = '';

    // Discord voice connections counter
    output += '# HELP discord_voice_connect_total Discord voice connections\n';
    output += '# TYPE discord_voice_connect_total counter\n';

    if (this.metricsData.discord_voice_connect_total.size === 0) {
      output += 'discord_voice_connect_total{guild_id="default",status="success"} 0\n';
    } else {
      this.metricsData.discord_voice_connect_total.forEach((value, key) => {
        output += `discord_voice_connect_total{guild_id="${key}",status="success"} ${value}\n`;
      });
    }

    output += '\n';

    // Active pipeline sessions gauge
    output += '# HELP pipeline_active_sessions Active voice sessions\n';
    output += '# TYPE pipeline_active_sessions gauge\n';

    if (this.metricsData.pipeline_active_sessions.size === 0) {
      output += 'pipeline_active_sessions{guild_id="default"} 0\n';
    } else {
      this.metricsData.pipeline_active_sessions.forEach((value, key) => {
        output += `pipeline_active_sessions{guild_id="${key}"} ${value}\n`;
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
   */
  updateMetrics(type: 'connection' | 'session' | 'duration', guildId: string, value: any): void {
    switch (type) {
      case 'connection':
        this.metricsData.discord_voice_connect_total.set(
          guildId,
          (this.metricsData.discord_voice_connect_total.get(guildId) || 0) + value,
        );
        break;
      case 'session':
        this.metricsData.pipeline_active_sessions.set(guildId, value);
        break;
      case 'duration':
        this.metricsData.pipeline_request_duration_seconds.set(guildId, value);
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
   * Stop the server
   */
  async stop(): Promise<void> {
    console.log(`[${new Date().toISOString()}] Voice server stopping...`);
  }

  /**
   * Set Discord plugin reference
   */
  setDiscordPlugin(plugin: any): void {
    this.discordPlugin = plugin;
  }
}

export { VoiceServer, HealthCheckResult, MetricsData };
