import { describe, it, expect, vi, afterEach } from 'vitest';
import { ShowcaseSession, SHOWCASE_SESSION_NAME } from '../server/src/showcase-session';

describe('ShowcaseSession', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('never requires a real PTY and exposes a fixed demo name', () => {
    const onData = vi.fn();
    const onExit = vi.fn();
    const s = new ShowcaseSession({ onData, onExit });
    expect(s.name).toBe(SHOWCASE_SESSION_NAME);
    expect(s.kind).toBe('managed');
    s.stop();
  });

  it('replays demo frames over time', async () => {
    vi.useFakeTimers();
    const chunks: string[] = [];
    const s = new ShowcaseSession({
      onData: (d) => chunks.push(d),
      onExit: () => undefined,
    });
    await vi.advanceTimersByTimeAsync(500);
    expect(chunks.join('')).toMatch(/CiliTerm|showcase|READ-ONLY/i);
    s.stop();
  });

  it('interactive input echoes and returns simulated replies (no host exec)', () => {
    const chunks: string[] = [];
    const s = new ShowcaseSession({
      onData: (d) => chunks.push(d),
      onExit: () => undefined,
    });
    s.write('whoami\r');
    const out = chunks.join('');
    expect(out).toMatch(/guest/);
    expect(out).toMatch(/guest@showcase|simulated|showcase/i);
    s.write('uname -a\r');
    expect(chunks.join('')).toMatch(/Linux ciliterm-demo/);
    s.stop();
  });
});
