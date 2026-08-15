import type { GeoPoint } from '@ciliterm/shared';

export function geoPointKey(p: Pick<GeoPoint, 'kind' | 'ip'>): string {
  return `${p.kind}:${p.ip}`;
}

export function diffGeoKeys(
  prev: string[],
  next: string[],
): { appeared: string[]; disappeared: string[] } {
  const before = new Set(prev);
  const after = new Set(next);
  return {
    appeared: next.filter((k) => !before.has(k)),
    disappeared: prev.filter((k) => !after.has(k)),
  };
}
