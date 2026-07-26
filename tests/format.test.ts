import { describe, it, expect } from 'vitest';
import { bytes, rate, uptime } from '../client/src/utils/format';

describe('bytes', () => {
  it('rounds sub-kilobyte values to whole bytes', () => {
    expect(bytes(6.5868263473054)).toBe('7 B');
    expect(bytes(0)).toBe('0 B');
  });

  it('guards against non-finite / negative input', () => {
    expect(bytes(NaN)).toBe('0 B');
    expect(bytes(-10)).toBe('0 B');
    expect(bytes(Infinity)).toBe('0 B');
  });

  it('scales into KB/MB/GB with one decimal (0 above 100)', () => {
    expect(bytes(1024)).toBe('1.0 KB');
    expect(bytes(1536)).toBe('1.5 KB');
    expect(bytes(150 * 1024)).toBe('150 KB');
    expect(bytes(1024 * 1024)).toBe('1.0 MB');
    expect(bytes(3 * 1024 * 1024 * 1024)).toBe('3.0 GB');
  });
});

describe('rate', () => {
  it('appends /s', () => {
    expect(rate(0)).toBe('0 B/s');
    expect(rate(2048)).toBe('2.0 KB/s');
  });
});

describe('uptime', () => {
  it('formats days/hours/minutes', () => {
    expect(uptime(90)).toBe('0h 1m');
    expect(uptime(3661)).toBe('1h 1m');
    expect(uptime(90061)).toBe('1d 1h 1m');
  });
});
