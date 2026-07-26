import { describe, it, expect } from 'vitest';
import {
  parseMessage,
  encode,
  PtyClientMessage,
  SysClientMessage,
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

describe('encode', () => {
  it('round-trips through parseMessage', () => {
    const original = { t: 'resize', cols: 80, rows: 24 } as const;
    expect(parseMessage(PtyClientMessage, encode(original))).toEqual(original);
  });
});
