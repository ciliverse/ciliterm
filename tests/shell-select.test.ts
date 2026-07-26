import { describe, it, expect } from 'vitest';
import { defaultShell } from '../server/src/config';
import { resolveArgv } from '../server/src/sessions';

/**
 * Both of these pick a program based on the host platform, so on a Linux CI the
 * Windows branches are only ever exercised here.
 */
describe('defaultShell', () => {
  it('uses SHELL on unix', () => {
    expect(defaultShell({ SHELL: '/bin/zsh' }, 'linux')).toBe('/bin/zsh');
  });

  it('falls back to bash on unix without SHELL', () => {
    expect(defaultShell({}, 'linux')).toBe('bash');
  });

  it('uses powershell on windows', () => {
    expect(defaultShell({}, 'win32')).toBe('powershell.exe');
  });

  it('ignores the unix SHELL that Git Bash and MSYS2 export on windows', () => {
    // A /usr/bin path is not resolvable by CreateProcess; honouring it would
    // make every pane fail to spawn for anyone launching from Git Bash.
    expect(defaultShell({ SHELL: '/usr/bin/bash' }, 'win32')).toBe('powershell.exe');
  });

  it('lets CILITERM_SHELL override on either platform', () => {
    expect(defaultShell({ CILITERM_SHELL: 'fish', SHELL: '/bin/zsh' }, 'linux')).toBe('fish');
    expect(defaultShell({ CILITERM_SHELL: 'cmd.exe' }, 'win32')).toBe('cmd.exe');
  });
});

describe('resolveArgv', () => {
  it('spawns the default shell when nothing is requested', () => {
    expect(resolveArgv({}, 'linux', 'bash')).toEqual({ file: 'bash', args: [] });
  });

  it('passes an exec through untouched, with no shell in between', () => {
    const exec = { file: 'ssh', args: ['-i', "/tmp/a'b", 'root@example.com'] };
    expect(resolveArgv({ exec }, 'linux', 'bash')).toBe(exec);
    expect(resolveArgv({ exec }, 'win32', 'powershell.exe')).toBe(exec);
  });

  it('runs a free-form command through bash on unix', () => {
    expect(resolveArgv({ command: 'htop' }, 'linux', 'bash')).toEqual({
      file: 'bash',
      args: ['-lc', 'htop'],
    });
  });

  it('runs a free-form command through powershell on windows, not bash', () => {
    expect(resolveArgv({ command: 'Get-Process' }, 'win32', 'powershell.exe')).toEqual({
      file: 'powershell.exe',
      args: ['-NoLogo', '-Command', 'Get-Process'],
    });
  });
});
