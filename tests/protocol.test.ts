import { describe, it, expect } from 'vitest';
import {
  parseMessage,
  encode,
  PtyClientMessage,
  SysClientMessage,
  SysServerMessage,
} from '../shared/src/protocol';

describe('parseMessage', () => {
  it('accepts a valid discriminated-union message', () => {
    const msg = parseMessage(PtyClientMessage, JSON.stringify({ t: 'input', data: 'ls\n' }));
    expect(msg).toEqual({ t: 'input', data: 'ls\n' });
  });

  it('rejects an unknown discriminator', () => {
    expect(parseMessage(PtyClientMessage, JSON.stringify({ t: 'nope' }))).toBeNull();
  });

  it('rejects a wrong field type', () => {
    expect(parseMessage(PtyClientMessage, JSON.stringify({ t: 'input', data: 42 }))).toBeNull();
  });

  it('rejects malformed JSON', () => {
    expect(parseMessage(PtyClientMessage, '{not json')).toBeNull();
  });

  it('validates the new proc.kill message with signal enum', () => {
    expect(
      parseMessage(SysClientMessage, JSON.stringify({ t: 'proc.kill', pid: 123, signal: 'SIGKILL' })),
    ).toEqual({ t: 'proc.kill', pid: 123, signal: 'SIGKILL' });
    expect(parseMessage(SysClientMessage, JSON.stringify({ t: 'proc.kill', pid: -1 }))).toBeNull();
    expect(
      parseMessage(SysClientMessage, JSON.stringify({ t: 'proc.kill', pid: 1, signal: 'BOOM' })),
    ).toBeNull();
  });
});

describe('geo snapshot', () => {
  it('accepts live optional fields on a point and still parses a bare point', () => {
    const live = parseMessage(
      SysServerMessage,
      JSON.stringify({
        t: 'geo',
        data: {
          self: { lat: 1, lng: 2, label: 'HOME', ip: '1.1.1.1', kind: 'self' },
          points: [
            {
              lat: 35.6,
              lng: 139.7,
              label: 'tokyo',
              ip: '8.8.8.8',
              kind: 'ssh',
              process: 'ssh',
              conns: 2,
              hostId: 'h1',
              latencyMs: 18,
              up: true,
            },
          ],
          arcs: [],
        },
      }),
    );
    expect(live).toMatchObject({
      t: 'geo',
      data: {
        points: [
          {
            kind: 'ssh',
            process: 'ssh',
            conns: 2,
            hostId: 'h1',
            latencyMs: 18,
            up: true,
          },
        ],
      },
    });

    const bare = parseMessage(
      SysServerMessage,
      JSON.stringify({
        t: 'geo',
        data: {
          self: null,
          points: [{ lat: 0, lng: 0, label: 'x', ip: '9.9.9.9', kind: 'conn' }],
          arcs: [],
        },
      }),
    );
    expect(bare?.t).toBe('geo');
    if (bare?.t === 'geo') expect(bare.data.points[0]).toEqual({
      lat: 0,
      lng: 0,
      label: 'x',
      ip: '9.9.9.9',
      kind: 'conn',
    });
  });
});

describe('encode', () => {
  it('round-trips through parseMessage', () => {
    const original = { t: 'resize', cols: 80, rows: 24 } as const;
    expect(parseMessage(PtyClientMessage, encode(original))).toEqual(original);
  });
});
