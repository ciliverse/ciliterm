import dns from 'node:dns/promises';
import net from 'node:net';
import si from 'systeminformation';
import type { GeoData } from '@ciliterm/shared';
import type { HostStore } from './hosts.js';
import { isPublicIp } from './net-util.js';
import {
  MAX_ENDPOINTS,
  mergeGeoSnapshot,
  summarizePeers,
  type GeoLoc,
  type HostProbe,
  type ResolvedHost,
} from './geo-merge.js';
import { probeTcp } from './host-probe.js';

interface ApiRow {
  status: string;
  country?: string;
  city?: string;
  lat?: number;
  lon?: number;
  query?: string;
}

const API_FIELDS = 'status,country,city,lat,lon,query';
const SELF_TTL_MS = 60 * 60 * 1000;
const DNS_TTL_MS = 5 * 60 * 1000;
const CHEAP_TICK_MS = 2_000;
const PROBE_EVERY_MS = 30_000;
const PROBE_TIMEOUT_MS = 1_500;
const MAX_PROBES_IN_FLIGHT = 2;

const ipCache = new Map<string, GeoLoc | null>();
const dnsCache = new Map<string, { at: number; ip: string | null }>();
let selfCache: { at: number; loc: GeoLoc | null } | null = null;

function rowToLoc(r: ApiRow): GeoLoc | null {
  if (r.status !== 'success' || typeof r.lat !== 'number' || typeof r.lon !== 'number') return null;
  return {
    lat: r.lat,
    lng: r.lon,
    city: r.city ?? '',
    country: r.country ?? '',
    ip: r.query ?? '',
  };
}

async function geolocateSelf(): Promise<GeoLoc | null> {
  if (selfCache && Date.now() - selfCache.at < SELF_TTL_MS) return selfCache.loc;
  try {
    const res = await fetch(`http://ip-api.com/json/?fields=${API_FIELDS}`, {
      signal: AbortSignal.timeout(6000),
    });
    const loc = rowToLoc((await res.json()) as ApiRow);
    selfCache = { at: Date.now(), loc };
    return loc;
  } catch {
    return selfCache?.loc ?? null;
  }
}

async function geolocateBatch(ips: string[]): Promise<Map<string, GeoLoc | null>> {
  const out = new Map<string, GeoLoc | null>();
  const need: string[] = [];
  for (const ip of ips) {
    if (ipCache.has(ip)) out.set(ip, ipCache.get(ip) ?? null);
    else if (!need.includes(ip)) need.push(ip);
  }
  for (let i = 0; i < need.length; i += 100) {
    const chunk = need.slice(i, i + 100);
    try {
      const res = await fetch(`http://ip-api.com/batch?fields=${API_FIELDS}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk.map((query) => ({ query }))),
        signal: AbortSignal.timeout(8000),
      });
      const rows = (await res.json()) as ApiRow[];
      for (const row of rows) {
        const key = row.query ?? '';
        const loc = rowToLoc(row);
        if (key) ipCache.set(key, loc);
        if (key) out.set(key, loc);
      }
    } catch {
      for (const ip of chunk) {
        ipCache.set(ip, null);
        out.set(ip, null);
      }
    }
  }
  return out;
}

async function activePeers() {
  try {
    const conns = await si.networkConnections();
    return summarizePeers(conns, isPublicIp, MAX_ENDPOINTS);
  } catch {
    return [];
  }
}

async function resolveHostIp(host: string): Promise<string | null> {
  const cached = dnsCache.get(host);
  if (cached && Date.now() - cached.at < DNS_TTL_MS) return cached.ip;
  if (net.isIP(host)) {
    dnsCache.set(host, { at: Date.now(), ip: host });
    return host;
  }
  try {
    const { address } = await dns.lookup(host);
    dnsCache.set(host, { at: Date.now(), ip: address });
    return address;
  } catch {
    dnsCache.set(host, { at: Date.now(), ip: null });
    return null;
  }
}

/** Shared geo snapshot: cheap 2s tick, ip-api on miss, TCP probes staggered. */
export class GeoService {
  private data: GeoData = { self: null, points: [], arcs: [] };
  private timer: NodeJS.Timeout | null = null;
  private readonly disabled: boolean;
  private readonly probes = new Map<string, HostProbe>();
  private readonly lastProbeAt = new Map<string, number>();
  private inFlight = 0;

  constructor(
    private hosts: HostStore,
    opts?: { disabled?: boolean },
  ) {
    this.disabled = opts?.disabled ?? false;
    if (this.disabled) return;
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), CHEAP_TICK_MS);
  }

  snapshot(): GeoData {
    return this.data;
  }

  async refresh(): Promise<GeoData> {
    if (this.disabled) return this.data;
    try {
      this.data = await this.collect();
    } catch {
      // keep last good snapshot
    }
    return this.data;
  }

  private async collect(): Promise<GeoData> {
    const [self, peers] = await Promise.all([geolocateSelf(), activePeers()]);
    const publicHosts = await this.listProbeTargets();
    const locs = await geolocateBatch([
      ...new Set([...peers.map((p) => p.ip), ...publicHosts.map((h) => h.ip)]),
    ]);
    this.kickProbes(publicHosts);
    return mergeGeoSnapshot({
      self,
      peers,
      hosts: publicHosts.map(({ id, label, ip }) => ({ id, label, ip })),
      locs,
      probes: this.probes,
    });
  }

  private async listProbeTargets(): Promise<
    Array<ResolvedHost & { port: number; probeHost: string }>
  > {
    const resolved = await Promise.all(
      this.hosts.list().map(async (h) => ({ host: h, ip: await resolveHostIp(h.host) })),
    );
    const out: Array<ResolvedHost & { port: number; probeHost: string }> = [];
    for (const r of resolved) {
      if (!r.ip || !isPublicIp(r.ip)) continue;
      out.push({
        id: r.host.id,
        label: r.host.label,
        ip: r.ip,
        port: r.host.port,
        probeHost: r.host.host,
      });
    }
    return out;
  }

  private kickProbes(hosts: Array<ResolvedHost & { port: number; probeHost: string }>): void {
    const now = Date.now();
    for (const h of hosts) {
      if (this.inFlight >= MAX_PROBES_IN_FLIGHT) break;
      const last = this.lastProbeAt.get(h.id) ?? 0;
      if (now - last < PROBE_EVERY_MS) continue;
      this.lastProbeAt.set(h.id, now);
      this.inFlight += 1;
      void probeTcp(h.probeHost, h.port, PROBE_TIMEOUT_MS)
        .then((result) => {
          this.probes.set(h.id, result);
        })
        .finally(() => {
          this.inFlight -= 1;
        });
    }
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
