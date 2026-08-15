import { describe, it, expect } from 'vitest';
import type { GeoPoint } from '../shared/src/protocol';
import {
  formatGlobePin,
  placeFromLabel,
  rankHudRows,
  summarizeLive,
} from '../client/src/components/Globe/globeHud';

const ssh = (over: Partial<GeoPoint> = {}): GeoPoint => ({
  lat: 35.6,
  lng: 139.7,
  label: 'prod · Tokyo, Japan',
  ip: '8.8.8.8',
  kind: 'ssh',
  hostId: 'h1',
  up: true,
  latencyMs: 18,
  ...over,
});

const conn = (over: Partial<GeoPoint> = {}): GeoPoint => ({
  lat: 37.7,
  lng: -122.4,
  label: 'chrome · Mountain View, US',
  ip: '1.1.1.1',
  kind: 'conn',
  process: 'chrome',
  conns: 3,
  ...over,
});

describe('placeFromLabel', () => {
  it('takes the part after the middle dot', () => {
    expect(placeFromLabel('chrome · Mountain View, US')).toBe('Mountain View, US');
    expect(placeFromLabel('HOME · Shanghai')).toBe('Shanghai');
  });

  it('falls back to the whole label', () => {
    expect(placeFromLabel('orphan')).toBe('orphan');
  });
});

describe('formatGlobePin', () => {
  it('shows home with the city', () => {
    expect(
      formatGlobePin({
        lat: 31,
        lng: 121,
        label: 'HOME · Shanghai, China',
        ip: '1.2.3.4',
        kind: 'self',
      }),
    ).toEqual({ name: 'HOME', stat: 'Shanghai, China' });
  });

  it('shows ssh latency or DOWN', () => {
    expect(formatGlobePin(ssh())).toEqual({ name: 'prod', stat: '18ms · Tokyo, Japan' });
    expect(formatGlobePin(ssh({ up: false, latencyMs: null }))).toEqual({
      name: 'prod',
      stat: 'DOWN · Tokyo, Japan',
    });
  });

  it('shows process and conn count for live peers', () => {
    expect(formatGlobePin(conn())).toEqual({ name: 'chrome ×3', stat: 'Mountain View, US' });
  });
});

describe('summarizeLive', () => {
  it('counts peers, ssh hosts and down hosts', () => {
    expect(summarizeLive([conn(), ssh(), ssh({ ip: '9.9.9.9', up: false })])).toEqual({
      conns: 1,
      ssh: 2,
      down: 1,
    });
  });
});

describe('rankHudRows', () => {
  it('puts ssh before conns and keeps the busiest peers first', () => {
    const quiet = conn({ ip: '2.2.2.2', conns: 1, process: 'curl', label: 'curl · London, UK' });
    const rows = rankHudRows([quiet, conn(), ssh()]);
    expect(rows.map((r) => r.ip)).toEqual(['8.8.8.8', '1.1.1.1', '2.2.2.2']);
  });
});
