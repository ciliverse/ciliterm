import { createServer } from 'node:net';
import { describe, it, expect, afterEach } from 'vitest';
import { probeTcp } from '../server/src/host-probe';

let close: (() => Promise<void>) | null = null;

afterEach(async () => {
  if (close) await close();
  close = null;
});

function listen(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer((socket) => socket.end());
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('no port'));
        return;
      }
      close = () =>
        new Promise((done) => {
          server.close(() => done());
        });
      resolve(addr.port);
    });
  });
}

describe('probeTcp', () => {
  it('reports up and a non-negative RTT for an open port', async () => {
    const port = await listen();
    const result = await probeTcp('127.0.0.1', port, 1500);
    expect(result.up).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.latencyMs).toBeLessThan(1500);
  });

  it('reports down when the port refuses', async () => {
    const result = await probeTcp('127.0.0.1', 1, 400);
    expect(result).toEqual({ up: false, latencyMs: null });
  });

  it('reports down on timeout', async () => {
    const result = await probeTcp('172.16.0.1', 9, 80);
    expect(result).toEqual({ up: false, latencyMs: null });
  });
});
