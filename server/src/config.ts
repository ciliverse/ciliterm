import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

export const HOST = process.env.CILITERM_HOST ?? '127.0.0.1';

/** `0` asks the OS for a free port; the real one is reported on the ready line. */
export const PORT = Number(process.env.CILITERM_PORT ?? 8787);

/**
 * Desktop (Electron) shell. The app owns the window and the lifecycle, so the
 * server binds an ephemeral loopback port and reports it back on stdout instead
 * of printing a human-facing launch URL.
 */
export const DESKTOP = process.env.CILITERM_DESKTOP === '1';

/**
 * Where the built web client lives. Defaults to the monorepo layout
 * (`server/dist/../../client/dist`); packaged builds point this at the
 * resources directory, which has no such sibling relationship.
 */
export const CLIENT_DIST = process.env.CILITERM_CLIENT_DIST ?? '';

/**
 * Handshake line written to stdout in desktop mode, followed by a JSON payload
 * of `{ port, token, url }`. The Electron shell greps stdout for this exact
 * prefix — keep it in sync with `desktop/src/main.js`.
 */
export const READY_PREFIX = '[ciliterm:ready] ';

/**
 * Public read-only exhibit: never spawn a real shell / SSH / kill / fs browse.
 * Fail-closed — cannot be combined with CILITERM_NO_AUTH.
 */
export const SHOWCASE =
  process.env.CILITERM_SHOWCASE === '1' || process.env.CILITERM_MODE === 'showcase';

if (SHOWCASE && process.env.CILITERM_NO_AUTH === '1') {
  console.error(
    '[ciliterm] FATAL: CILITERM_SHOWCASE=1 is incompatible with CILITERM_NO_AUTH=1 (fail-closed)',
  );
  process.exit(1);
}

/**
 * Shared secret required as `?token=` on WebSocket upgrades. Since `/pty` grants
 * real shell access, this stops anyone who can reach the port (e.g. on a LAN)
 * from opening a session. Override with CILITERM_TOKEN, else it is random per
 * start and printed to the console.
 *
 * In showcase mode a public demo token is fine (no execution surface); still
 * required so random scanners do not open WS freely.
 */
export const AUTH_TOKEN =
  process.env.CILITERM_TOKEN ??
  (SHOWCASE ? 'ciliterm-public-showcase' : randomBytes(24).toString('hex'));

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

/**
 * Auth policy: when bound to loopback the port is only reachable from this
 * machine (same threat model as a local shell), so tokens are off by default for
 * a frictionless local experience. Tokens are enforced automatically once the
 * server is exposed on a non-loopback host, or whenever CILITERM_TOKEN is set.
 * `CILITERM_NO_AUTH=1` force-disables; setting CILITERM_TOKEN force-enables.
 * Showcase always enforces tokens (fail-closed).
 */
export const AUTH_DISABLED = SHOWCASE
  ? false
  : process.env.CILITERM_NO_AUTH === '1' ||
    (LOOPBACK_HOSTS.has(HOST) && !process.env.CILITERM_TOKEN);

/**
 * `SHELL` is a POSIX convention, but Git Bash, MSYS2 and Cygwin export it on
 * Windows too — pointing at a Unix path like `/usr/bin/bash` that CreateProcess
 * cannot resolve. Launching ciliterm from one of those shells would otherwise
 * leave every pane failing to spawn, so it is only consulted where it means
 * something. `CILITERM_SHELL` stays the override on both platforms.
 */
export function defaultShell(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = os.platform(),
): string {
  if (env.CILITERM_SHELL) return env.CILITERM_SHELL;
  if (platform === 'win32') return 'powershell.exe';
  return env.SHELL ?? 'bash';
}

export const DEFAULT_SHELL = defaultShell();

export const CONFIG_DIR =
  process.env.CILITERM_CONFIG_DIR ?? path.join(os.homedir(), '.config', 'ciliterm');

export const HOSTS_FILE = path.join(CONFIG_DIR, 'hosts.json');

/** Ring buffer size (chars) kept per managed session for replay on reattach. */
export const MANAGED_BUFFER_LIMIT = 256 * 1024;
