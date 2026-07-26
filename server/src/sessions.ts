import { execFile, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import fs from 'node:fs';
import type { IPty } from 'node-pty';
import type { SessionInfo, SessionKind } from '@ciliterm/shared';
import { DEFAULT_SHELL, MANAGED_BUFFER_LIMIT } from './config.js';
import { shellEnv } from './shell-env.js';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

/** Lazy-load native addon so showcase mode can run without node-pty installed. */
function loadPty(): typeof import('node-pty') {
  return require('node-pty') as typeof import('node-pty');
}

export interface OpenOptions {
  name?: string;
  command?: string;
  cwd?: string;
  cols?: number;
  rows?: number;
  onData: (data: string) => void;
  onExit: (code: number | null) => void;
}

export interface AttachedSession {
  name: string;
  kind: SessionKind;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  detach(): void;
  getCwd(): Promise<string | null>;
}

function detectTmux(): boolean {
  try {
    execFileSync('tmux', ['-V'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function randomName(): string {
  return `cili-${Math.random().toString(36).slice(2, 7)}`;
}

interface ManagedSession {
  name: string;
  proc: IPty;
  buffer: string;
  listeners: Set<(data: string) => void>;
  exitListeners: Set<(code: number | null) => void>;
  exited: boolean;
  exitCode: number | null;
}

/**
 * Manages terminal sessions. Prefers the system `tmux` for true persistence
 * (detach/reattach across reloads, survives server restarts). Falls back to an
 * in-process long-lived pty with an output ring buffer when tmux is absent.
 */
export class SessionManager {
  readonly tmuxAvailable: boolean;
  private managed = new Map<string, ManagedSession>();

  constructor() {
    this.tmuxAvailable = detectTmux();
  }

  async list(): Promise<SessionInfo[]> {
    if (this.tmuxAvailable) {
      try {
        const { stdout } = await execFileAsync('tmux', [
          'list-sessions',
          '-F',
          '#{session_name}\t#{session_attached}',
        ]);
        return stdout
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            const [name, attached] = line.split('\t');
            return { name, kind: 'tmux' as const, attached: attached !== '0' };
          });
      } catch {
        // `tmux list-sessions` exits non-zero when no server is running yet.
        return [];
      }
    }
    return [...this.managed.values()].map((s) => ({
      name: s.name,
      kind: 'managed' as const,
      attached: s.listeners.size > 0,
    }));
  }

  open(opts: OpenOptions): AttachedSession {
    return this.tmuxAvailable ? this.openTmux(opts) : this.openManaged(opts);
  }

  private openTmux(opts: OpenOptions): AttachedSession {
    const pty = loadPty();
    const name = opts.name?.trim() || randomName();
    const args = ['new-session', '-A', '-s', name];
    if (opts.cwd) args.push('-c', opts.cwd);
    if (opts.command) args.push(opts.command);

    const proc = pty.spawn('tmux', args, {
      name: 'xterm-256color',
      cols: opts.cols ?? 80,
      rows: opts.rows ?? 24,
      cwd: opts.cwd ?? process.env.HOME,
      env: shellEnv(),
    });

    proc.onData(opts.onData);
    proc.onExit(({ exitCode }) => opts.onExit(exitCode));

    return {
      name,
      kind: 'tmux',
      write: (data) => proc.write(data),
      resize: (cols, rows) => {
        try {
          proc.resize(cols, rows);
        } catch {
          /* ignore resize on dead pty */
        }
      },
      // Detaching a tmux client kills only the client pty; the session persists.
      detach: () => {
        try {
          proc.kill();
        } catch {
          /* ignore */
        }
      },
      getCwd: async () => {
        try {
          const { stdout } = await execFileAsync('tmux', [
            'display-message',
            '-p',
            '-t',
            name,
            '-F',
            '#{pane_current_path}',
          ]);
          return stdout.trim() || null;
        } catch {
          return null;
        }
      },
    };
  }

  private openManaged(opts: OpenOptions): AttachedSession {
    const name = opts.name?.trim() || randomName();
    let session = this.managed.get(name);

    if (!session) {
      const pty = loadPty();
      const shellFile = opts.command ? 'bash' : DEFAULT_SHELL;
      const shellArgs = opts.command ? ['-lc', opts.command] : [];
      const proc = pty.spawn(shellFile, shellArgs, {
        name: 'xterm-256color',
        cols: opts.cols ?? 80,
        rows: opts.rows ?? 24,
        cwd: opts.cwd ?? process.env.HOME,
        env: shellEnv(),
      });

      const created: ManagedSession = {
        name,
        proc,
        buffer: '',
        listeners: new Set(),
        exitListeners: new Set(),
        exited: false,
        exitCode: null,
      };

      proc.onData((data) => {
        created.buffer = (created.buffer + data).slice(-MANAGED_BUFFER_LIMIT);
        for (const l of created.listeners) l(data);
      });
      proc.onExit(({ exitCode }) => {
        created.exited = true;
        created.exitCode = exitCode;
        for (const l of created.exitListeners) l(exitCode);
        this.managed.delete(name);
      });

      this.managed.set(name, created);
      session = created;
    }

    const active = session;
    active.listeners.add(opts.onData);
    active.exitListeners.add(opts.onExit);

    // Replay recent output so a reattaching client restores its screen.
    if (active.buffer) opts.onData(active.buffer);
    if (active.exited) opts.onExit(active.exitCode);

    return {
      name,
      kind: 'managed',
      write: (data) => active.proc.write(data),
      resize: (cols, rows) => {
        try {
          active.proc.resize(cols, rows);
        } catch {
          /* ignore */
        }
      },
      // Detaching keeps the pty alive so the session persists.
      detach: () => {
        active.listeners.delete(opts.onData);
        active.exitListeners.delete(opts.onExit);
      },
      getCwd: async () => readProcCwd(active.proc.pid),
    };
  }

  async rename(name: string, newName: string): Promise<void> {
    if (this.tmuxAvailable) {
      await execFileAsync('tmux', ['rename-session', '-t', name, newName]);
      return;
    }
    const s = this.managed.get(name);
    if (s) {
      s.name = newName;
      this.managed.delete(name);
      this.managed.set(newName, s);
    }
  }

  async kill(name: string): Promise<void> {
    if (this.tmuxAvailable) {
      await execFileAsync('tmux', ['kill-session', '-t', name]).catch(() => {});
      return;
    }
    const s = this.managed.get(name);
    if (s) {
      try {
        s.proc.kill();
      } catch {
        /* ignore */
      }
      this.managed.delete(name);
    }
  }
}

function readProcCwd(pid: number): string | null {
  try {
    return fs.readlinkSync(`/proc/${pid}/cwd`);
  } catch {
    return null;
  }
}
