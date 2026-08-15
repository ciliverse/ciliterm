import type { GeoArc, GeoData, GeoPoint } from '@ciliterm/shared';

export const MAX_ENDPOINTS = 40;

export interface LivePeer {
  ip: string;
  conns: number;
  process?: string;
}

export interface ResolvedHost {
  id: string;
  label: string;
  ip: string;
}

export interface GeoLoc {
  lat: number;
  lng: number;
  city: string;
  country: string;
  ip: string;
}

export interface HostProbe {
  up: boolean;
  latencyMs: number | null;
}

export interface ConnRow {
  state: string;
  peerAddress: string;
  process?: string;
}

interface PeerAcc {
  conns: number;
  processes: Map<string, number>;
}

function topProcess(processes: Map<string, number>): string | undefined {
  let best: string | undefined;
  let n = 0;
  for (const [name, count] of processes) {
    if (count > n) {
      best = name;
      n = count;
    }
  }
  return best;
}

/** Public ESTABLISHED peers, most-connected first. */
export function summarizePeers(
  conns: ConnRow[],
  isPublic: (ip: string) => boolean,
  max = MAX_ENDPOINTS,
): LivePeer[] {
  const byIp = new Map<string, PeerAcc>();
  for (const c of conns) {
    if (c.state !== 'ESTABLISHED') continue;
    const ip = c.peerAddress;
    if (!isPublic(ip)) continue;
    let acc = byIp.get(ip);
    if (!acc) {
      acc = { conns: 0, processes: new Map() };
      byIp.set(ip, acc);
    }
    acc.conns += 1;
    if (c.process) acc.processes.set(c.process, (acc.processes.get(c.process) ?? 0) + 1);
  }
  return [...byIp.entries()]
    .sort((a, b) => b[1].conns - a[1].conns)
    .slice(0, max)
    .map(([ip, acc]) => {
      const process = topProcess(acc.processes);
      return process ? { ip, conns: acc.conns, process } : { ip, conns: acc.conns };
    });
}

function placeOf(loc: GeoLoc): string {
  return [loc.city, loc.country].filter(Boolean).join(', ') || loc.ip;
}

function selfPoint(self: GeoLoc): GeoPoint {
  return {
    lat: self.lat,
    lng: self.lng,
    label: `HOME · ${placeOf(self)}`,
    ip: self.ip,
    kind: 'self',
  };
}

function arcFor(
  self: GeoLoc | null,
  loc: GeoLoc,
  label: string,
  kind: 'conn' | 'ssh',
): GeoArc | null {
  if (!self) return null;
  return {
    startLat: self.lat,
    startLng: self.lng,
    endLat: loc.lat,
    endLng: loc.lng,
    label,
    kind,
  };
}

/** Fold live peers onto saved SSH hosts. Same public IP → one ssh point. */
export function mergeGeoSnapshot(input: {
  self: GeoLoc | null;
  peers: LivePeer[];
  hosts: ResolvedHost[];
  locs: Map<string, GeoLoc | null>;
  probes: Map<string, HostProbe>;
}): GeoData {
  const points: GeoPoint[] = [];
  const arcs: GeoArc[] = [];
  const usedIps = new Set<string>();
  const peerByIp = new Map(input.peers.map((p) => [p.ip, p]));

  const push = (point: GeoPoint, loc: GeoLoc, kind: 'conn' | 'ssh'): void => {
    points.push(point);
    const arc = arcFor(input.self, loc, point.label, kind);
    if (arc) arcs.push(arc);
  };

  for (const host of input.hosts) {
    const loc = input.locs.get(host.ip);
    if (!loc) continue;
    usedIps.add(host.ip);
    const peer = peerByIp.get(host.ip);
    const probe = input.probes.get(host.id);
    const label = `${host.label} · ${placeOf(loc)}`;
    const point: GeoPoint = {
      lat: loc.lat,
      lng: loc.lng,
      label,
      ip: host.ip,
      kind: 'ssh',
      hostId: host.id,
    };
    if (peer) {
      point.conns = peer.conns;
      if (peer.process) point.process = peer.process;
    }
    if (probe) {
      point.up = probe.up;
      point.latencyMs = probe.latencyMs;
    }
    push(point, loc, 'ssh');
  }

  for (const peer of input.peers) {
    if (usedIps.has(peer.ip)) continue;
    const loc = input.locs.get(peer.ip);
    if (!loc) continue;
    const name = peer.process ?? peer.ip;
    const label = `${name} · ${placeOf(loc)}`;
    const point: GeoPoint = {
      lat: loc.lat,
      lng: loc.lng,
      label,
      ip: peer.ip,
      kind: 'conn',
      conns: peer.conns,
    };
    if (peer.process) point.process = peer.process;
    push(point, loc, 'conn');
  }

  return {
    self: input.self ? selfPoint(input.self) : null,
    points,
    arcs,
  };
}
