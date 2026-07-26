import type { SshHost } from '@ciliterm/shared';

/** A program and its arguments, ready to hand to `pty.spawn` unmodified. */
export interface Argv {
  file: string;
  args: string[];
}

/**
 * Build an `ssh` invocation from a host record (key/agent auth only).
 *
 * Returns argv rather than a command line so it can be spawned directly. That
 * removes the quoting problem instead of solving it — a key path holding a
 * quote, a space or a `$` cannot break out of an array — and it is the only
 * form that works on Windows, which has shipped `ssh.exe` since Windows 10
 * 1809 but has no POSIX shell to quote for.
 */
export function buildSshArgv(host: SshHost): Argv {
  const args: string[] = [];
  if (host.keyPath) args.push('-i', host.keyPath);
  if (host.port && host.port !== 22) args.push('-p', String(host.port));
  args.push(`${host.user}@${host.host}`);
  return { file: 'ssh', args };
}
