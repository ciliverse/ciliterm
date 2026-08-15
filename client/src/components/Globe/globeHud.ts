import type { GeoPoint } from '@ciliterm/shared';

export function placeFromLabel(label: string): string {
  const i = label.indexOf(' · ');
  return i >= 0 ? label.slice(i + 3) : label;
}

export function nameFromLabel(label: string): string {
  const i = label.indexOf(' · ');
  return i >= 0 ? label.slice(0, i) : label;
}

export function formatGlobePin(p: GeoPoint): { name: string; stat: string } {
  const place = placeFromLabel(p.label);
  if (p.kind === 'self') return { name: 'HOME', stat: place };
  if (p.kind === 'ssh') {
    const host = nameFromLabel(p.label);
    if (p.up === false) return { name: host, stat: `DOWN · ${place}` };
    if (p.latencyMs != null) return { name: host, stat: `${Math.round(p.latencyMs)}ms · ${place}` };
    return { name: host, stat: place };
  }
  const proc = p.process || nameFromLabel(p.label);
  const name = p.conns != null ? `${proc} ×${p.conns}` : proc;
  return { name, stat: place };
}

export function summarizeLive(points: GeoPoint[]): { conns: number; ssh: number; down: number } {
  let conns = 0;
  let ssh = 0;
  let down = 0;
  for (const p of points) {
    if (p.kind === 'conn') conns += 1;
    if (p.kind === 'ssh') {
      ssh += 1;
      if (p.up === false) down += 1;
    }
  }
  return { conns, ssh, down };
}

export function rankHudRows(points: GeoPoint[]): GeoPoint[] {
  return points
    .filter((p) => p.kind === 'ssh' || p.kind === 'conn')
    .slice()
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'ssh' ? -1 : 1;
      return (b.conns ?? 0) - (a.conns ?? 0);
    });
}
