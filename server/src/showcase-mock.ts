import type { GeoData, Metrics } from '@ciliterm/shared';

/** Synthetic exhibit host — never the real machine. */
const DEMO_HOST = {
  hostname: 'ciliterm-demo',
  platform: 'linux',
  arch: 'x64',
  ip: '10.42.0.8',
};

type ProcSeed = { pid: number; name: string; baseCpu: number; baseMem: number; phase: number };

const DEMO_PROCS: ProcSeed[] = [
  { pid: 120, name: 'ciliterm', baseCpu: 4.2, baseMem: 3.4, phase: 0.2 },
  { pid: 88, name: 'nginx', baseCpu: 1.8, baseMem: 1.5, phase: 1.1 },
  { pid: 201, name: 'node-api', baseCpu: 8.5, baseMem: 6.2, phase: 2.4 },
  { pid: 214, name: 'vite', baseCpu: 3.1, baseMem: 4.0, phase: 0.7 },
  { pid: 44, name: 'sshd', baseCpu: 0.3, baseMem: 0.5, phase: 3.3 },
  { pid: 312, name: 'containerd', baseCpu: 2.6, baseMem: 3.1, phase: 1.8 },
  { pid: 501, name: 'postgres', baseCpu: 5.4, baseMem: 9.8, phase: 4.2 },
  { pid: 640, name: 'redis-server', baseCpu: 1.2, baseMem: 1.4, phase: 2.9 },
  { pid: 720, name: 'vector', baseCpu: 2.0, baseMem: 2.2, phase: 5.1 },
  { pid: 901, name: 'metricsd', baseCpu: 0.9, baseMem: 0.8, phase: 0.4 },
  { pid: 1102, name: 'buildkitd', baseCpu: 6.0, baseMem: 5.5, phase: 3.7 },
  { pid: 1308, name: 'fluent-bit', baseCpu: 1.5, baseMem: 1.1, phase: 4.8 },
];

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Occasional traffic/CPU spikes so sparklines look alive. */
function spike(t: number, everySec: number, strength: number): number {
  const x = (t % everySec) / everySec;
  // sharp bump near the start of each window
  if (x < 0.08) return strength * (1 - x / 0.08);
  if (x > 0.55 && x < 0.62) return strength * 0.45 * (1 - (x - 0.55) / 0.07);
  return 0;
}

/**
 * High-motion fake metrics for the public showcase.
 * Amplitudes are intentionally large so bars/sparklines visibly animate.
 */
export function collectShowcaseMetrics(): Metrics {
  const t = Date.now() / 1000;

  const cpuSpike = spike(t, 11, 38) + spike(t + 4, 17, 22);
  const cpuWave =
    28 +
    Math.sin(t * 1.35) * 18 +
    Math.sin(t * 2.7) * 10 +
    Math.sin(t * 0.45) * 8 +
    cpuSpike;
  const cpuLoad = clamp(cpuWave, 8, 97);

  const memWave =
    48 + Math.sin(t * 0.55) * 14 + Math.sin(t * 1.1) * 6 + spike(t, 23, 10);
  const memPct = clamp(memWave, 28, 86);

  const netSpike = spike(t, 9, 900_000) + spike(t + 2.5, 14, 450_000);
  const rx =
    180_000 +
    Math.abs(Math.sin(t * 2.1)) * 520_000 +
    Math.abs(Math.sin(t * 5.3)) * 180_000 +
    netSpike;
  const tx =
    90_000 +
    Math.abs(Math.cos(t * 1.8)) * 310_000 +
    Math.abs(Math.sin(t * 4.2)) * 120_000 +
    netSpike * 0.35;

  const processes = DEMO_PROCS.map((p) => {
    const burst = spike(t + p.phase, 8 + (p.pid % 7), p.baseCpu * 2.2);
    const cpu = clamp(
      p.baseCpu +
        Math.sin(t * 2.2 + p.phase) * (p.baseCpu * 0.85) +
        Math.sin(t * 5.1 + p.phase * 2) * 1.8 +
        burst,
      0.05,
      92,
    );
    const mem = clamp(
      p.baseMem + Math.sin(t * 0.7 + p.phase) * (p.baseMem * 0.25),
      0.2,
      24,
    );
    return { pid: p.pid, name: p.name, cpu, mem };
  })
    .sort((a, b) => b.cpu - a.cpu)
    .slice(0, 10);

  const rootUse = clamp(34 + Math.sin(t * 0.4) * 8 + spike(t, 19, 6), 22, 72);
  const dataUse = clamp(58 + Math.cos(t * 0.35) * 12 + spike(t + 1, 15, 8), 35, 88);
  const logsUse = clamp(41 + Math.sin(t * 0.9 + 1) * 15 + spike(t, 13, 12), 18, 90);

  return {
    cpu: {
      load: cpuLoad,
      cores: 8,
      model: 'Demo CPU ×8 · showcase',
    },
    mem: {
      usedPct: memPct,
      total: 16 * 1024 ** 3,
      used: Math.round((16 * 1024 ** 3 * memPct) / 100),
      free: Math.round((16 * 1024 ** 3 * (100 - memPct)) / 100),
      swapUsedPct: clamp(6 + Math.sin(t * 0.6) * 5 + spike(t, 21, 8), 1, 28),
    },
    net: {
      iface: 'demo0',
      rxBytesPerSec: rx,
      txBytesPerSec: tx,
    },
    disk: [
      {
        fs: '/dev/demo-root',
        mount: '/',
        usePct: rootUse,
        used: Math.round((128 * 1024 ** 3 * rootUse) / 100),
        size: 128 * 1024 ** 3,
      },
      {
        fs: '/dev/demo-data',
        mount: '/data',
        usePct: dataUse,
        used: Math.round((512 * 1024 ** 3 * dataUse) / 100),
        size: 512 * 1024 ** 3,
      },
      {
        fs: '/dev/demo-logs',
        mount: '/var/log',
        usePct: logsUse,
        used: Math.round((64 * 1024 ** 3 * logsUse) / 100),
        size: 64 * 1024 ** 3,
      },
    ],
    processes,
    latency: clamp(8 + Math.abs(Math.sin(t * 1.4)) * 22 + spike(t, 12, 35), 4, 90),
    host: {
      ...DEMO_HOST,
      uptime: 86400 * 12 + (Date.now() / 1000) % 86400,
    },
    time: Date.now(),
  };
}

const GEO_NODES = [
  { lat: 37.77, lng: -122.42, label: 'edge · SF', ip: '10.42.1.2', kind: 'conn' as const, process: 'chrome', conns: 4 },
  { lat: 51.5, lng: -0.12, label: 'edge · London', ip: '10.42.2.3', kind: 'conn' as const, process: 'curl', conns: 1 },
  { lat: 35.68, lng: 139.69, label: 'tokyo', ip: '10.42.3.4', kind: 'ssh' as const, hostId: 'demo-tokyo', process: 'ssh', conns: 2 },
  { lat: 1.35, lng: 103.82, label: 'edge · Singapore', ip: '10.42.4.5', kind: 'conn' as const, process: 'node', conns: 3 },
  { lat: -33.87, lng: 151.21, label: 'sydney', ip: '10.42.5.6', kind: 'ssh' as const, hostId: 'demo-sydney' },
  { lat: 52.52, lng: 13.4, label: 'edge · Berlin', ip: '10.42.6.7', kind: 'conn' as const, process: 'firefox', conns: 2 },
  { lat: 19.07, lng: 72.87, label: 'edge · Mumbai', ip: '10.42.7.8', kind: 'conn' as const, process: 'apt', conns: 1 },
  { lat: 47.6, lng: -122.33, label: 'seattle', ip: '10.42.8.9', kind: 'ssh' as const, hostId: 'demo-seattle', process: 'ssh', conns: 1 },
];

/** Time-varying globe: nodes appear/disappear and jitter slightly. */
export function showcaseGeo(): GeoData {
  const t = Date.now() / 1000;
  const self = {
    lat: 31.23 + Math.sin(t * 0.05) * 0.08,
    lng: 121.47 + Math.cos(t * 0.05) * 0.08,
    label: 'demo · Shanghai',
    ip: DEMO_HOST.ip,
    kind: 'self' as const,
  };

  // Rotate which remote nodes are “online”.
  const activeCount = 3 + Math.floor((Math.sin(t * 0.35) + 1) * 2); // 3..7
  const offset = Math.floor(t / 4) % GEO_NODES.length;
  const active = Array.from({ length: activeCount }, (_, i) => {
    const n = GEO_NODES[(offset + i) % GEO_NODES.length]!;
    const ssh = n.kind === 'ssh';
    const up = !ssh || Math.sin(t * 0.4 + i) > -0.7;
    return {
      ...n,
      lat: n.lat + Math.sin(t * 0.8 + i) * 0.15,
      lng: n.lng + Math.cos(t * 0.7 + i) * 0.15,
      label: `${n.label}${Math.sin(t + i) > 0.6 ? ' ●' : ''}`,
      up: ssh ? up : undefined,
      latencyMs: ssh && up ? Math.round(18 + Math.abs(Math.sin(t + i)) * 40) : ssh ? null : undefined,
    };
  });

  return {
    self,
    points: [self, ...active],
    arcs: active.map((p) => ({
      startLat: self.lat,
      startLng: self.lng,
      endLat: p.lat,
      endLng: p.lng,
      label: p.label,
      kind: p.kind === 'ssh' ? ('ssh' as const) : ('conn' as const),
    })),
  };
}
