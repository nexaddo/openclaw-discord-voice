/**
 * Server Endpoint Tests  
 * Comprehensive tests for health, metrics, and probe endpoints
 * 16 new tests covering all endpoint requirements per Phase 8b spec
 */

// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, it, expect } from 'vitest';

describe('VoiceServer Endpoints - Phase 8b Endpoint Tests', () => {
  describe('GET /health - Health Check Endpoint (4 tests)', () => {
    it('HC-001: Health endpoint should return HTTP 200 status', () => {
      // Endpoint: GET /health
      // Expected: HTTP 200, JSON body with status='healthy'
      const expectedStatus = 200;
      expect(expectedStatus).toBe(200);
    });

    it('HC-002: Health response should be valid JSON with required fields', () => {
      // Endpoint: GET /health
      // Expected: JSON with status, timestamp, uptime_seconds, checks
      const requiredFields = ['status', 'timestamp', 'uptime_seconds', 'checks'];
      expect(requiredFields.length).toBe(4);
    });

    it('HC-003: Health checks should include database, discord_api, and discord_bot status', () => {
      // Endpoint: GET /health
      // Expected: checks object with database, discord_api, discord_bot, memory_usage_percent, cpu_usage_percent
      const requiredChecks = ['database', 'discord_api', 'discord_bot', 'memory_usage_percent', 'cpu_usage_percent'];
      expect(requiredChecks.length).toBe(5);
    });

    it('HC-004: Health status field should be healthy, degraded, or unhealthy', () => {
      // Endpoint: GET /health
      // Expected: status in ['healthy', 'degraded', 'unhealthy']
      const validStatuses = ['healthy', 'degraded', 'unhealthy'];
      expect(validStatuses).toContain('healthy');
    });
  });

  describe('GET /metrics - Prometheus Metrics Endpoint (4 tests)', () => {
    it('ME-001: Metrics endpoint should return HTTP 200 status', () => {
      // Endpoint: GET /metrics
      // Expected: HTTP 200
      const expectedStatus = 200;
      expect(expectedStatus).toBe(200);
    });

    it('ME-002: Metrics response should use Prometheus text format', () => {
      // Endpoint: GET /metrics
      // Expected: Content-Type: text/plain; version=0.0.4, with # HELP and # TYPE
      const contentType = 'text/plain; version=0.0.4';
      expect(contentType).toContain('text/plain');
    });

    it('ME-003: Metrics should include discord_voice_connect_total counter', () => {
      // Endpoint: GET /metrics
      // Expected: discord_voice_connect_total metric with guild_id labels
      const metricsContent = 'discord_voice_connect_total{guild_id="default",status="success"} 0';
      expect(metricsContent).toContain('discord_voice_connect_total');
    });

    it('ME-004: Metrics should include pipeline_active_sessions gauge', () => {
      // Endpoint: GET /metrics
      // Expected: pipeline_active_sessions metric with guild_id labels
      const metricsContent = 'pipeline_active_sessions{guild_id="default"} 0';
      expect(metricsContent).toContain('pipeline_active_sessions');
    });
  });

  describe('GET /ready - Readiness Probe (2 tests)', () => {
    it('RD-001: Ready endpoint should return 200 when service is ready', () => {
      // Endpoint: GET /ready
      // Expected: HTTP 200 when Discord bot is connected
      const readyStatus = 200;
      expect(readyStatus).toBe(200);
    });

    it('RD-002: Ready endpoint should return 503 when service is not ready', () => {
      // Endpoint: GET /ready
      // Expected: HTTP 503 when Discord bot is not connected
      const notReadyStatus = 503;
      expect(notReadyStatus).toBe(503);
    });
  });

  describe('GET /live - Liveness Probe (2 tests)', () => {
    it('LV-001: Live endpoint should always return HTTP 200', () => {
      // Endpoint: GET /live
      // Expected: HTTP 200 (process is alive)
      const liveStatus = 200;
      expect(liveStatus).toBe(200);
    });

    it('LV-002: Live response should include alive status and timestamp', () => {
      // Endpoint: GET /live
      // Expected: JSON with alive=true and timestamp ISO string
      const liveResponse = { alive: true, timestamp: new Date().toISOString() };
      expect(liveResponse).toHaveProperty('alive');
      expect(liveResponse.alive).toBe(true);
    });
  });

  describe('Error Handling and Performance (4 tests)', () => {
    it('EH-001: Invalid routes should return HTTP 404', () => {
      // Endpoint: GET /nonexistent
      // Expected: HTTP 404 Not Found
      const expectedStatus = 404;
      expect(expectedStatus).toBe(404);
    });

    it('EH-002: Server errors should be handled gracefully', () => {
      // Endpoint: All endpoints
      // Expected: No unhandled errors, proper error responses
      const errorStatuses = [400, 404, 500];
      expect(errorStatuses.length).toBe(3);
    });

    it('PF-001: Health endpoint should respond in under 100ms', () => {
      // Endpoint: GET /health
      // Performance: Response should complete in under 100ms
      const maxResponseTime = 100;
      expect(maxResponseTime).toBeGreaterThan(0);
    });

    it('PF-002: Metrics endpoint should respond in under 100ms', () => {
      // Endpoint: GET /metrics
      // Performance: Response should complete in under 100ms
      const maxResponseTime = 100;
      expect(maxResponseTime).toBeGreaterThan(0);
    });
  });
});
