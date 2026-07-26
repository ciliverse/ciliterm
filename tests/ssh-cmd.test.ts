import { describe, it, expect } from 'vitest';
import { buildSshArgv } from '../server/src/ssh-cmd';
import type { SshHost } from '../shared/src/protocol';

const host = (over: Partial<SshHost> = {}): SshHost => ({
  id: 'x',
  label: 'box',
  host: 'example.com',
  port: 22,
  user: 'root',
  ...over,
});

describe('buildSshArgv', () => {
  it('builds a minimal invocation for the default port', () => {
    expect(buildSshArgv(host())).toEqual({ file: 'ssh', args: ['root@example.com'] });
  });

  it('adds -p only for non-default ports', () => {
    expect(buildSshArgv(host({ port: 2222 })).args).toEqual(['-p', '2222', 'root@example.com']);
  });

  it('passes the key path through and preserves order', () => {
    expect(buildSshArgv(host({ keyPath: '/home/me/.ssh/id_ed25519', port: 2200 })).args).toEqual([
      '-i',
      '/home/me/.ssh/id_ed25519',
      '-p',
      '2200',
      'root@example.com',
    ]);
  });

  it('leaves shell metacharacters in the key path untouched, as argv needs no quoting', () => {
    // The old string form had to escape these; an argv element cannot break out.
    const nasty = "/tmp/a'b c$(whoami);rm -rf /";
    expect(buildSshArgv(host({ keyPath: nasty })).args).toEqual(['-i', nasty, 'root@example.com']);
  });
});
