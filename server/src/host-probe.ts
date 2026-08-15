import net from 'node:net';

export interface ProbeResult {
  up: boolean;
  latencyMs: number | null;
}

/** TCP connect probe. Timeout or any error → down. */
export function probeTcp(host: string, port: number, timeoutMs: number): Promise<ProbeResult> {
  const started = Date.now();
  return new Promise((resolve) => {
    const socket = net.connect({ host, port }, () => {
      const latencyMs = Math.max(0, Date.now() - started);
      socket.destroy();
      finish({ up: true, latencyMs });
    });

    let done = false;
    const finish = (result: ProbeResult) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    const timer = setTimeout(() => finish({ up: false, latencyMs: null }), timeoutMs);
    socket.on('error', () => finish({ up: false, latencyMs: null }));
  });
}
