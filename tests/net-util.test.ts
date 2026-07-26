import { describe, it, expect } from 'vitest';
import { isPublicIp } from '../server/src/net-util';

describe('isPublicIp', () => {
  it('accepts routable IPv4 addresses', () => {
    expect(isPublicIp('8.8.8.8')).toBe(true);
    expect(isPublicIp('1.1.1.1')).toBe(true);
    expect(isPublicIp('203.0.113.10')).toBe(true);
  });

  it('rejects private / loopback / link-local / CGNAT IPv4', () => {
    expect(isPublicIp('10.0.0.5')).toBe(false);
    expect(isPublicIp('192.168.1.20')).toBe(false);
    expect(isPublicIp('172.16.0.1')).toBe(false);
    expect(isPublicIp('172.31.255.255')).toBe(false);
    expect(isPublicIp('127.0.0.1')).toBe(false);
    expect(isPublicIp('169.254.1.1')).toBe(false);
    expect(isPublicIp('100.64.0.1')).toBe(false);
  });

  it('keeps routable 172.x outside the private block', () => {
    expect(isPublicIp('172.15.0.1')).toBe(true);
    expect(isPublicIp('172.32.0.1')).toBe(true);
  });

  it('handles IPv6 and junk input', () => {
    expect(isPublicIp('2606:4700:4700::1111')).toBe(true);
    expect(isPublicIp('::1')).toBe(false);
    expect(isPublicIp('fe80::1')).toBe(false);
    expect(isPublicIp('fd00::1')).toBe(false);
    expect(isPublicIp('')).toBe(false);
    expect(isPublicIp('*')).toBe(false);
    expect(isPublicIp('not-an-ip')).toBe(false);
  });
});
