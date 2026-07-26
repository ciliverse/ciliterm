import { useEffect, useRef, useState } from 'react';
import type { Metrics } from '@ciliterm/shared';

const HISTORY = 60;

export interface MetricsHistory {
  cpu: number[];
  mem: number[];
  rx: number[];
  tx: number[];
}

function push(arr: number[], v: number): number[] {
  const next = arr.length >= HISTORY ? arr.slice(1) : arr.slice();
  next.push(v);
  return next;
}

function seedSeries(center: number, n = 24): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const wobble = Math.sin(i * 0.7) * 0.12 + Math.sin(i * 1.9) * 0.06;
    out.push(Math.min(0.98, Math.max(0.02, center + wobble)));
  }
  return out;
}

/** Rolling normalized time-series for the sparkline cards. */
export function useMetricsHistory(metrics: Metrics | null): MetricsHistory {
  const [hist, setHist] = useState<MetricsHistory>({ cpu: [], mem: [], rx: [], tx: [] });
  const netMax = useRef(1);
  const seeded = useRef(false);

  useEffect(() => {
    if (!metrics) return;
    netMax.current = Math.max(
      netMax.current * 0.95,
      metrics.net.rxBytesPerSec,
      metrics.net.txBytesPerSec,
      1024,
    );
    // 20% headroom so a fresh spike sits below the top edge instead of clipping.
    const netScale = netMax.current * 1.2;
    const cpuN = metrics.cpu.load / 100;
    const memN = metrics.mem.usedPct / 100;
    const rxN = metrics.net.rxBytesPerSec / netScale;
    const txN = metrics.net.txBytesPerSec / netScale;

    setHist((h) => {
      // First paint: prefill sparklines so panels don't look frozen/empty.
      if (!seeded.current && h.cpu.length === 0) {
        seeded.current = true;
        return {
          cpu: seedSeries(cpuN),
          mem: seedSeries(memN),
          rx: seedSeries(Math.max(0.15, rxN)),
          tx: seedSeries(Math.max(0.1, txN)),
        };
      }
      return {
        cpu: push(h.cpu, cpuN),
        mem: push(h.mem, memN),
        rx: push(h.rx, rxN),
        tx: push(h.tx, txN),
      };
    });
  }, [metrics]);

  return hist;
}
