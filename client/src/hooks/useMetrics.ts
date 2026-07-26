import { useCallback, useEffect, useState } from 'react';
import type { Metrics } from '@ciliterm/shared';
import type { ConnStatus } from '../transport/Transport';
import { getSys } from '../transport/clients';

export function useMetrics(intervalMs: number, includeProcesses: boolean) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [status, setStatus] = useState<ConnStatus>('connecting');

  useEffect(() => {
    const sys = getSys();
    const offMsg = sys.onMessage((msg) => {
      if (msg.t === 'metrics') setMetrics(msg.metrics);
    });
    const offStatus = sys.onStatus(setStatus);
    return () => {
      offMsg();
      offStatus();
    };
  }, []);

  useEffect(() => {
    getSys().send({ t: 'config', intervalMs, includeProcesses });
  }, [intervalMs, includeProcesses]);

  const kill = useCallback((pid: number, signal?: 'SIGTERM' | 'SIGKILL' | 'SIGINT') => {
    getSys().send({ t: 'proc.kill', pid, signal });
  }, []);

  return { metrics, status, kill };
}
