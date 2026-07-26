import type { SshHost } from '@ciliterm/shared';

/** Build an `ssh` command string from a host record (key/agent auth only). */
export function buildSshCommand(host: SshHost): string {
  const parts = ['ssh'];
  if (host.keyPath) parts.push('-i', shellQuote(host.keyPath));
  if (host.port && host.port !== 22) parts.push('-p', String(host.port));
  parts.push(`${host.user}@${host.host}`);
  return parts.join(' ');
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
