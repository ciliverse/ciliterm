import net from 'node:net';

/** Reject loopback / private / link-local / CGNAT / unspecified addresses. */
export function isPublicIp(ip: string): boolean {
  if (!ip || ip === '*' || ip === '::' || ip === '0.0.0.0') return false;
  const v = net.isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 192 && b === 168) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 169 && b === 254) return false;
    if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
    return true;
  }
  if (v === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::1') return false;
    if (lower.startsWith('fe80') || lower.startsWith('fc') || lower.startsWith('fd')) return false;
    return true;
  }
  return false;
}
