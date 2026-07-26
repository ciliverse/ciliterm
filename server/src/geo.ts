import dns from 'node:dns/promises';
import net from 'node:net';
import si from 'systeminformation';
import type { GeoArc, GeoData, GeoPoint } from '@ciliterm/shared';
import type { HostStore } from './hosts.js';
import { isPublicIp } from './net-util.js';

interface GeoLoc {
  lat: number;
  lng: number;
  city: string;
  country: string;
  ip: string;
}

interface ApiRow {
  status: string;
  country?: string;
  city?: string;
  lat?: number;
  lon?: number;
  query?: string;
}

const API_FIELDS = 'status,country,city,lat,lon,query';
const SELF_TTL_MS = 60 * 60 * 1000; // public IP rarely changes
const MAX_ENDPOINTS = 40;

const ipCache = new Map<string, GeoLoc | null>();
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

/** Established outbound peer IPs, most-connected first, deduped and public-only. */
async function activePeerIps(): Promise<string[]> {
  try {
    const conns = await si.networkConnections();
    const counts = new Map<string, number>();
    for (const c of conns) {
      if (c.state !== 'ESTABLISHED') continue;
      const ip = c.peerAddress;
      if (!isPublicIp(ip)) continue;
      counts.set(ip, (counts.get(ip) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([ip]) => ip);
  } catch {
    return [];
  }
}

async function resolveHostIp(host: string): Promise<string | null> {
  if (net.isIP(host)) return host;
  try {
    const { address } = await dns.lookup(host);
    return address;
  } catch {
    return null;
  }
}

async function collectGeo(hosts: HostStore): Promise<GeoData> {
  const self = await geolocateSelf();

  // Live outbound connections.
  const connIps = (await activePeerIps()).slice(0, MAX_ENDPOINTS);

  // Saved SSH hosts (resolve hostnames -> IPs).
  const sshList = hosts.list();
  const sshResolved = await Promise.all(
    sshList.map(async (h) => ({ host: h, ip: await resolveHostIp(h.host) })),
  );
  const sshIps = sshResolved
    .map((r) => r.ip)
    .filter((ip): ip is string => !!ip && isPublicIp(ip));

  const locs = await geolocateBatch([...new Set([...connIps, ...sshIps])]);

  const points: GeoPoint[] = [];
  const arcs: GeoArc[] = [];
  const seen = new Set<string>();

  const push = (ip: string, kind: 'conn' | 'ssh', label: string): void => {
    const loc = locs.get(ip);
    if (!loc || seen.has(`${kind}:${ip}`)) return;
    seen.add(`${kind}:${ip}`);
    const place = [loc.city, loc.country].filter(Boolean).join(', ') || ip;
    points.push({ lat: loc.lat, lng: loc.lng, label: `${label} · ${place}`, ip, kind });
    if (self) {
      arcs.push({
        startLat: self.lat,
        startLng: self.lng,
        endLat: loc.lat,
        endLng: loc.lng,
        label: `${label} · ${place}`,
        kind,
      });
    }
  };

  for (const ip of connIps) push(ip, 'conn', ip);
  for (const r of sshResolved) {
    if (r.ip && isPublicIp(r.ip)) push(r.ip, 'ssh', r.host.label);
  }

  const selfPoint: GeoPoint | null = self
    ? {
        lat: self.lat,
        lng: self.lng,
        label: `HOME · ${[self.city, self.country].filter(Boolean).join(', ') || self.ip}`,
        ip: self.ip,
        kind: 'self',
      }
    : null;

  return { self: selfPoint, points, arcs };
}

/** Maintains a shared geo snapshot refreshed on a slow cadence (API-friendly). */
export class GeoService {
  private data: GeoData = { self: null, points: [], arcs: [] };
  private timer: NodeJS.Timeout | null = null;
  private readonly disabled: boolean;

  constructor(
    private hosts: HostStore,
    opts?: { disabled?: boolean },
  ) {
    this.disabled = opts?.disabled ?? false;
    if (this.disabled) return;
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), 30_000);
  }

  snapshot(): GeoData {
    return this.data;
  }

  async refresh(): Promise<GeoData> {
    if (this.disabled) return this.data;
    try {
      this.data = await collectGeo(this.hosts);
    } catch {
      // keep last good snapshot
    }
    return this.data;
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
