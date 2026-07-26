import si from 'systeminformation';
import os from 'node:os';
import type { Metrics } from '@ciliterm/shared';
import { SHOWCASE } from './config.js';

let cachedLatency: number | null = null;

// inetLatency spawns ping and adds load — never in public showcase.
async function refreshLatency(): Promise<void> {
  if (SHOWCASE) return;
  try {
    const ms = await si.inetLatency();
    cachedLatency = Number.isFinite(ms) && ms >= 0 ? ms : null;
  } catch {
    cachedLatency = null;
  }
}
if (!SHOWCASE) {
  setInterval(refreshLatency, 15_000);
  void refreshLatency();
}

function primaryIp(): string {
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    for (const entry of list ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) return entry.address;
    }
  }
  return '127.0.0.1';
}

export async function collectMetrics(includeProcesses: boolean): Promise<Metrics> {
  const [load, mem, netList, fsList, procs, osInfo, cpuInfo] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.networkStats(),
    si.fsSize(),
    includeProcesses ? si.processes() : Promise.resolve(null),
    si.osInfo(),
    si.cpu(),
  ]);

  const net = netList[0] ?? { iface: 'n/a', rx_sec: 0, tx_sec: 0 };

  const disk = fsList
    .filter((d) => d.size > 0)
    .slice(0, 6)
    .map((d) => ({
      fs: d.fs,
      mount: d.mount,
      usePct: d.use,
      used: d.used,
      size: d.size,
    }));

  const processes =
    procs?.list
      .slice()
      .sort((a, b) => b.cpu - a.cpu)
      .slice(0, 8)
      .map((p) => ({ pid: p.pid, name: p.name, cpu: p.cpu, mem: p.mem })) ?? [];

  return {
    cpu: {
      load: load.currentLoad,
      cores: load.cpus?.length ?? os.cpus().length,
      model: `${cpuInfo.manufacturer} ${cpuInfo.brand}`.trim(),
    },
    mem: {
      usedPct: (mem.active / mem.total) * 100,
      total: mem.total,
      used: mem.active,
      free: mem.available,
      swapUsedPct: mem.swaptotal > 0 ? (mem.swapused / mem.swaptotal) * 100 : null,
    },
    net: {
      iface: net.iface,
      rxBytesPerSec: Math.max(0, net.rx_sec ?? 0),
      txBytesPerSec: Math.max(0, net.tx_sec ?? 0),
    },
    disk,
    processes,
    latency: cachedLatency,
    host: {
      hostname: os.hostname(),
      platform: osInfo.platform,
      arch: osInfo.arch,
      uptime: os.uptime(),
      ip: primaryIp(),
    },
    time: Date.now(),
  };
}
