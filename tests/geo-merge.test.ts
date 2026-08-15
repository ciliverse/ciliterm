import { describe, it, expect } from 'vitest';
import { isPublicIp } from '../server/src/net-util';
import { mergeGeoSnapshot, summarizePeers } from '../server/src/geo-merge';

const loc = (ip: string, city = 'Austin') => ({
  lat: 30.2,
  lng: -97.7,
  city,
  country: 'US',
  ip,
});

describe('summarizePeers', () => {
  it('counts public ESTABLISHED peers and picks the busiest process', () => {
    const peers = summarizePeers(
      [
        { state: 'ESTABLISHED', peerAddress: '8.8.8.8', process: 'chrome' },
        { state: 'ESTABLISHED', peerAddress: '8.8.8.8', process: 'chrome' },
        { state: 'ESTABLISHED', peerAddress: '8.8.8.8', process: 'curl' },
        { state: 'ESTABLISHED', peerAddress: '1.1.1.1', process: 'ssh' },
        { state: 'TIME_WAIT', peerAddress: '9.9.9.9', process: 'chrome' },
        { state: 'ESTABLISHED', peerAddress: '10.0.0.4', process: 'nginx' },
      ],
      isPublicIp,
    );
    expect(peers).toEqual([
      { ip: '8.8.8.8', conns: 3, process: 'chrome' },
      { ip: '1.1.1.1', conns: 1, process: 'ssh' },
    ]);
  });

  it('caps to the most-connected peers', () => {
    const conns = Array.from({ length: 45 }, (_, i) => ({
      state: 'ESTABLISHED',
      peerAddress: `1.2.3.${i + 1}`,
      process: 'x',
    }));
    const peers = summarizePeers(conns, () => true, 40);
    expect(peers).toHaveLength(40);
    expect(peers[0]?.ip).toBe('1.2.3.1');
  });
});

describe('mergeGeoSnapshot', () => {
  it('merges a live peer onto a matching SSH host as one ssh point', () => {
    const data = mergeGeoSnapshot({
      self: loc('203.0.113.1', 'Home'),
      peers: [{ ip: '8.8.8.8', conns: 3, process: 'ssh' }],
      hosts: [{ id: 'h1', label: 'prod', ip: '8.8.8.8' }],
      locs: new Map([['8.8.8.8', loc('8.8.8.8', 'Mountain View')]]),
      probes: new Map([['h1', { up: true, latencyMs: 22 }]]),
    });

    expect(data.points).toHaveLength(1);
    expect(data.points[0]).toMatchObject({
      kind: 'ssh',
      ip: '8.8.8.8',
      hostId: 'h1',
      process: 'ssh',
      conns: 3,
      up: true,
      latencyMs: 22,
    });
    expect(data.points[0]?.label).toContain('prod');
    expect(data.arcs).toHaveLength(1);
    expect(data.arcs[0]?.kind).toBe('ssh');
    expect(data.self?.kind).toBe('self');
  });

  it('keeps a live peer as conn when it is not a saved host', () => {
    const data = mergeGeoSnapshot({
      self: null,
      peers: [{ ip: '1.1.1.1', conns: 2, process: 'chrome' }],
      hosts: [],
      locs: new Map([['1.1.1.1', loc('1.1.1.1', 'Cloudflare')]]),
      probes: new Map(),
    });
    expect(data.points).toEqual([
      expect.objectContaining({
        kind: 'conn',
        ip: '1.1.1.1',
        process: 'chrome',
        conns: 2,
      }),
    ]);
    expect(data.points[0]?.hostId).toBeUndefined();
    expect(data.arcs).toEqual([]);
  });

  it('skips endpoints with no geolocation', () => {
    const data = mergeGeoSnapshot({
      self: null,
      peers: [{ ip: '8.8.8.8', conns: 1 }],
      hosts: [{ id: 'h1', label: 'ghost', ip: '9.9.9.9' }],
      locs: new Map([
        ['8.8.8.8', null],
        ['9.9.9.9', null],
      ]),
      probes: new Map(),
    });
    expect(data.points).toEqual([]);
  });

  it('attaches a down probe to an ssh host that has no live peer', () => {
    const data = mergeGeoSnapshot({
      self: loc('203.0.113.1'),
      peers: [],
      hosts: [{ id: 'h2', label: 'backup', ip: '203.0.113.50' }],
      locs: new Map([['203.0.113.50', loc('203.0.113.50', 'Dallas')]]),
      probes: new Map([['h2', { up: false, latencyMs: null }]]),
    });
    expect(data.points[0]).toMatchObject({
      kind: 'ssh',
      hostId: 'h2',
      up: false,
      latencyMs: null,
    });
    expect(data.points[0]?.conns).toBeUndefined();
  });
});
