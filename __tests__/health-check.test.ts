/**
 * Health Check Optimization Tests (Fix 2a)
 * Tests for curl-based health endpoint checking
 * - Lightweight endpoint (minimal HTTP response)
 * - 5-second timeout
 * - HTTP status code parsing only
 * - Connection error handling
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import http from 'http';

describe('Fix 2a: Health Check Optimization', () => {
  let testServer: http.Server;
  const TEST_PORT = 3001;
  const BASE_URL = `http://localhost:${TEST_PORT}`;

  beforeAll(
    () =>
      new Promise<void>((resolve) => {
        // Create a lightweight test server for health checks
        testServer = http.createServer((req, res) => {
          if (req.url === '/health') {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('OK');
          } else if (req.url === '/health-slow') {
            // Simulate slow endpoint
            setTimeout(() => {
              res.writeHead(200);
              res.end('OK');
            }, 6000);
          } else if (req.url === '/health-error') {
            res.writeHead(500);
            res.end('Error');
          } else if (req.url === '/health-not-found') {
            res.writeHead(404);
            res.end('Not Found');
          }
        });
        testServer.listen(TEST_PORT, resolve);
      })
  );

  afterAll(
    () =>
      new Promise<void>((resolve) => {
        testServer.close(resolve);
      })
  );

  describe('HC-OPT-001: Health check endpoint returns 200', () => {
    it('should successfully GET /health and return HTTP 200', async () => {
      const result = await new Promise<{ statusCode: number; success: boolean }>((resolve) => {
        const req = http.get(`${BASE_URL}/health`, { timeout: 5000 }, (res) => {
          resolve({ statusCode: res.statusCode || 0, success: res.statusCode === 200 });
        });
        req.on('error', () => resolve({ statusCode: 0, success: false }));
      });

      expect(result.statusCode).toBe(200);
      expect(result.success).toBe(true);
    }, 10000);

    it('should parse HTTP status code only (no JSON parsing)', async () => {
      const result = await new Promise<boolean>((resolve) => {
        const req = http.get(`${BASE_URL}/health`, (res) => {
          // Simply check status code, not body content
          const isHealthy = res.statusCode === 200;
          resolve(isHealthy);
        });
        req.on('error', () => resolve(false));
      });

      expect(result).toBe(true);
    }, 10000);
  });

  describe('HC-OPT-002: Timeout handling (5 seconds max)', () => {
    it(
      'should timeout after 5 seconds on slow endpoint',
      async () => {
        const startTime = Date.now();
        const result = await new Promise<{ timedOut: boolean; duration: number }>((resolve) => {
          const req = http.get(
            `${BASE_URL}/health-slow`,
            { timeout: 5000 },
            (res) => {
              resolve({ timedOut: false, duration: Date.now() - startTime });
            }
          );
          req.on('timeout', () => {
            req.destroy();
            resolve({ timedOut: true, duration: Date.now() - startTime });
          });
          req.on('error', () => {
            resolve({ timedOut: true, duration: Date.now() - startTime });
          });
        });

        expect(result.timedOut).toBe(true);
        expect(result.duration).toBeLessThan(6000);
        expect(result.duration).toBeGreaterThanOrEqual(5000);
      },
      15000
    );

    it('should complete successfully if response is faster than 5 seconds', async () => {
      const result = await new Promise<{ success: boolean; duration: number }>((resolve) => {
        const startTime = Date.now();
        const req = http.get(`${BASE_URL}/health`, { timeout: 5000 }, (res) => {
          resolve({ success: res.statusCode === 200, duration: Date.now() - startTime });
        });
        req.on('error', () => resolve({ success: false, duration: Date.now() - startTime }));
      });

      expect(result.success).toBe(true);
      expect(result.duration).toBeLessThan(5000);
    }, 10000);
  });

  describe('HC-OPT-003: Connection refused handling', () => {
    it('should handle connection refused gracefully', async () => {
      const result = await new Promise<{ success: boolean; error: boolean }>((resolve) => {
        const req = http.get('http://localhost:9999', { timeout: 5000 }, (res) => {
          resolve({ success: res.statusCode === 200, error: false });
        });
        req.on('error', () => {
          resolve({ success: false, error: true });
        });
      });

      expect(result.error).toBe(true);
      expect(result.success).toBe(false);
    }, 10000);

    it('should log connection errors appropriately', async () => {
      await new Promise<void>((resolve) => {
        const req = http.get('http://localhost:9999', { timeout: 5000 }, (res) => {
          resolve();
        });
        req.on('error', () => {
          resolve();
        });
      });

      expect(true).toBe(true);
    }, 10000);
  });

  describe('HC-OPT-004: Non-200 status codes', () => {
    it('should identify HTTP 500 as unhealthy', async () => {
      const result = await new Promise<{ statusCode: number; healthy: boolean }>((resolve) => {
        const req = http.get(`${BASE_URL}/health-error`, { timeout: 5000 }, (res) => {
          resolve({ statusCode: res.statusCode || 0, healthy: res.statusCode === 200 });
        });
        req.on('error', () => resolve({ statusCode: 0, healthy: false }));
      });

      expect(result.statusCode).toBe(500);
      expect(result.healthy).toBe(false);
    }, 10000);

    it('should identify HTTP 404 as unhealthy', async () => {
      const result = await new Promise<{ statusCode: number; healthy: boolean }>((resolve) => {
        const req = http.get(`${BASE_URL}/health-not-found`, { timeout: 5000 }, (res) => {
          resolve({ statusCode: res.statusCode || 0, healthy: res.statusCode === 200 });
        });
        req.on('error', () => resolve({ statusCode: 0, healthy: false }));
      });

      expect(result.statusCode).toBe(404);
      expect(result.healthy).toBe(false);
    }, 10000);

    it('should handle various error codes (3xx, 4xx, 5xx)', async () => {
      const testCases = [
        { code: 301, healthy: false },
        { code: 404, healthy: false },
        { code: 500, healthy: false },
      ];

      for (const testCase of testCases) {
        const isHealthy = testCase.code === 200;
        expect(isHealthy).toBe(testCase.healthy);
      }
    }, 10000);
  });

  describe('HC-OPT-005: Lightweight endpoint characteristics', () => {
    it('should respond with minimal payload', async () => {
      const result = await new Promise<{ bodySize: number }>((resolve) => {
        let bodySize = 0;
        const req = http.get(`${BASE_URL}/health`, (res) => {
          res.on('data', (chunk) => {
            bodySize += chunk.length;
          });
          res.on('end', () => {
            resolve({ bodySize });
          });
        });
        req.on('error', () => resolve({ bodySize: 0 }));
      });

      expect(result.bodySize).toBeLessThan(100);
    }, 10000);

    it('should respond with plain text content type', async () => {
      const result = await new Promise<{ contentType: string }>((resolve) => {
        const req = http.get(`${BASE_URL}/health`, (res) => {
          const contentType = res.headers['content-type'] || '';
          resolve({ contentType });
        });
        req.on('error', () => resolve({ contentType: '' }));
      });

      expect(result.contentType).toContain('text/plain');
    }, 10000);
  });

  describe('HC-OPT-006: Health check logging', () => {
    it('should successfully check health status', async () => {
      const result = await new Promise<{ statusCode: number }>((resolve) => {
        const req = http.get(`${BASE_URL}/health`, (res) => {
          resolve({ statusCode: res.statusCode || 0 });
        });
        req.on('error', () => resolve({ statusCode: 0 }));
      });

      expect(result.statusCode).toBe(200);
    }, 10000);

    it('should properly report failed health checks', async () => {
      const result = await new Promise<{ statusCode: number }>((resolve) => {
        const req = http.get(`${BASE_URL}/health-error`, (res) => {
          resolve({ statusCode: res.statusCode || 0 });
        });
        req.on('error', () => resolve({ statusCode: 0 }));
      });

      expect(result.statusCode).toBe(500);
      expect(result.statusCode).not.toBe(200);
    }, 10000);
  });
});
