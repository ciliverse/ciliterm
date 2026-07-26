import { describe, it, expect } from 'vitest';
import { buildSshCommand } from '../server/src/ssh-cmd';
import type { SshHost } from '../shared/src/protocol';

const host = (over: Partial<SshHost> = {}): SshHost => ({
  id: 'x',
  label: 'box',
  host: 'example.com',
  port: 22,
  user: 'root',
  ...over,
});

describe('buildSshCommand', () => {
  it('builds a minimal command for the default port', () => {
    expect(buildSshCommand(host())).toBe('ssh root@example.com');
  });

  it('adds -p only for non-default ports', () => {
    expect(buildSshCommand(host({ port: 2222 }))).toBe('ssh -p 2222 root@example.com');
  });

  it('quotes the key path and preserves order', () => {
    expect(buildSshCommand(host({ keyPath: '/home/me/.ssh/id_ed25519', port: 2200 }))).toBe(
      "ssh -i '/home/me/.ssh/id_ed25519' -p 2200 root@example.com",
    );
  });

  it('escapes single quotes in the key path to avoid shell injection', () => {
    const cmd = buildSshCommand(host({ keyPath: "/tmp/a'b" }));
    expect(cmd).toContain("-i '/tmp/a'\\''b'");
  });
});
