import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import {
  ControlClientMessage,
  PtyClientMessage,
  SysClientMessage,
  encode,
  parseMessage,
} from '@ciliterm/shared';
import {
  HOST,
  PORT,
  AUTH_TOKEN,
  AUTH_DISABLED,
  SHOWCASE,
  DESKTOP,
  READY_PREFIX,
  CLIENT_DIST as CLIENT_DIST_OVERRIDE,
} from './config.js';
import { timingSafeEqual } from 'node:crypto';
import { SessionManager, type AttachedSession } from './sessions.js';
import { HostStore, buildSshCommand } from './hosts.js';
import { collectMetrics } from './sysinfo.js';
import { listDir } from './fs.js';
import { GeoService } from './geo.js';
import { ShowcaseSession, SHOWCASE_SESSION_NAME } from './showcase-session.js';
import { collectShowcaseMetrics, showcaseGeo } from './showcase-mock.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = CLIENT_DIST_OVERRIDE
  ? path.resolve(CLIENT_DIST_OVERRIDE)
  : path.resolve(__dirname, '../../client/dist');

const sessions = new SessionManager();
const hosts = new HostStore();
// Showcase never probes real public IP / peer connections (I/O + privacy).
const geo = new GeoService(hosts, { disabled: SHOWCASE });

const app = express();
app.get('/api/health', async (_req, res) => {
  res.json({
    ok: true,
    tmux: SHOWCASE ? false : sessions.tmuxAvailable,
    showcase: SHOWCASE,
    // Public demo token is intentionally discoverable — no execution surface.
    ...(SHOWCASE ? { publicToken: AUTH_TOKEN } : {}),
    // Lets the desktop shell warn before quitting kills non-tmux sessions. Kept
    // off the public surface since this endpoint is unauthenticated.
    ...(DESKTOP && !SHOWCASE ? { sessions: (await sessions.list()).length } : {}),
  });
});
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get('*', (_req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
}

const server = http.createServer(app);

const ptyWss = new WebSocketServer({ noServer: true });
const controlWss = new WebSocketServer({ noServer: true });
const sysWss = new WebSocketServer({ noServer: true });

/** Constant-time compare of the supplied token against the expected secret. */
function tokenValid(token: string | null): boolean {
  if (AUTH_DISABLED) return true;
  if (!token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(AUTH_TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  if (!tokenValid(url.searchParams.get('token'))) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }
  const { pathname } = url;
  const target =
    pathname === '/pty'
      ? ptyWss
      : pathname === '/control'
        ? controlWss
        : pathname === '/sys'
          ? sysWss
          : null;
  if (!target) {
    socket.destroy();
    return;
  }
  target.handleUpgrade(req, socket, head, (ws) => target.emit('connection', ws, req));
});

function showcaseSessionList() {
  return [{ name: SHOWCASE_SESSION_NAME, kind: 'managed' as const, attached: true }];
}

// --------------------------------------------------------------------------
// /pty : one socket per terminal pane
// --------------------------------------------------------------------------
ptyWss.on('connection', (ws: WebSocket) => {
  let session: AttachedSession | null = null;
  let cwdTimer: NodeJS.Timeout | null = null;
  let lastCwd = '';

  const send = (msg: unknown) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(encode(msg));
  };

  const startCwdTracking = () => {
    cwdTimer = setInterval(async () => {
      if (!session) return;
      const cwd = await session.getCwd();
      if (cwd && cwd !== lastCwd) {
        lastCwd = cwd;
        send({ t: 'cwd', path: cwd });
      }
    }, 1500);
  };

  ws.on('message', (raw) => {
    const msg = parseMessage(PtyClientMessage, raw.toString());
    if (!msg) return;

    if (msg.t === 'attach' || msg.t === 'create') {
      if (session) return;

      if (SHOWCASE) {
        // Fail-closed: never spawn PTY / SSH / custom command.
        if (msg.t === 'create' && (msg.hostId || msg.command)) {
          send({ t: 'error', message: 'showcase: shell and SSH are disabled' });
          return;
        }
        if (msg.t === 'attach' && msg.session !== SHOWCASE_SESSION_NAME) {
          send({ t: 'error', message: 'showcase: only the demo session is available' });
          return;
        }
        session = new ShowcaseSession({
          cols: msg.cols,
          rows: msg.rows,
          onData: (data) => send({ t: 'output', data }),
          onExit: (code) => send({ t: 'exit', code }),
        });
        send({ t: 'ready', session: session.name, kind: session.kind });
        broadcastSessions();
        startCwdTracking();
        return;
      }

      let command: string | undefined;
      if (msg.t === 'create') {
        if (msg.hostId) {
          const host = hosts.get(msg.hostId);
          if (!host) {
            send({ t: 'error', message: `unknown host: ${msg.hostId}` });
            return;
          }
          command = buildSshCommand(host);
        } else {
          command = msg.command;
        }
      }
      try {
        session = sessions.open({
          name: msg.t === 'attach' ? msg.session : msg.name,
          command,
          cwd: msg.t === 'create' ? msg.cwd : undefined,
          cols: msg.cols,
          rows: msg.rows,
          onData: (data) => send({ t: 'output', data }),
          onExit: (code) => {
            send({ t: 'exit', code });
          },
        });
      } catch (err) {
        // Spawning a pty fails for reasons outside this socket's control: no
        // free ptys, a sandbox without /dev/ptmx, or a node-pty binary built
        // for a different ABI than the host runtime. Report it to the pane that
        // asked instead of throwing out of the handler, which would kill the
        // process and every other session with it.
        const message = err instanceof Error ? err.message : String(err);
        console.error('[ciliterm] failed to open session:', message);
        send({ t: 'error', message: `failed to start session: ${message}` });
        return;
      }
      send({ t: 'ready', session: session.name, kind: session.kind });
      broadcastSessions();
      startCwdTracking();
      return;
    }

    if (!session) return;
    if (msg.t === 'input') session.write(msg.data);
    else if (msg.t === 'resize') session.resize(msg.cols, msg.rows);
  });

  ws.on('close', () => {
    if (cwdTimer) clearInterval(cwdTimer);
    session?.detach();
    broadcastSessions();
  });
});

// --------------------------------------------------------------------------
// /control : sessions + ssh hosts management (broadcast to all controllers)
// --------------------------------------------------------------------------
const controllers = new Set<WebSocket>();

function broadcast(msg: unknown): void {
  const data = encode(msg);
  for (const ws of controllers) {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  }
}

async function broadcastSessions(): Promise<void> {
  if (SHOWCASE) {
    broadcast({ t: 'sessions', list: showcaseSessionList() });
    return;
  }
  const list = await sessions.list();
  broadcast({ t: 'sessions', list });
}

controlWss.on('connection', (ws: WebSocket) => {
  controllers.add(ws);
  const send = (msg: unknown) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(encode(msg));
  };

  if (SHOWCASE) {
    send({ t: 'sessions', list: showcaseSessionList() });
    send({ t: 'hosts', list: [] });
  } else {
    void sessions.list().then((list) => send({ t: 'sessions', list }));
    send({ t: 'hosts', list: hosts.list() });
  }

  ws.on('message', async (raw) => {
    const msg = parseMessage(ControlClientMessage, raw.toString());
    if (!msg) return;

    if (SHOWCASE) {
      switch (msg.t) {
        case 'sessions.list':
          send({ t: 'sessions', list: showcaseSessionList() });
          break;
        case 'hosts.list':
          send({ t: 'hosts', list: [] });
          break;
        case 'sessions.rename':
        case 'sessions.kill':
        case 'hosts.save':
        case 'hosts.delete':
          send({ t: 'error', message: 'showcase: read-only (control writes disabled)' });
          break;
      }
      return;
    }

    try {
      switch (msg.t) {
        case 'sessions.list':
          send({ t: 'sessions', list: await sessions.list() });
          break;
        case 'sessions.rename':
          await sessions.rename(msg.name, msg.newName);
          await broadcastSessions();
          break;
        case 'sessions.kill':
          await sessions.kill(msg.name);
          await broadcastSessions();
          break;
        case 'hosts.list':
          send({ t: 'hosts', list: hosts.list() });
          break;
        case 'hosts.save':
          broadcast({ t: 'hosts', list: hosts.save(msg.host) });
          void geo.refresh();
          break;
        case 'hosts.delete':
          broadcast({ t: 'hosts', list: hosts.delete(msg.id) });
          void geo.refresh();
          break;
      }
    } catch (err) {
      send({ t: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  });

  ws.on('close', () => controllers.delete(ws));
});

// --------------------------------------------------------------------------
// /sys : metrics stream + filesystem listing
// --------------------------------------------------------------------------
sysWss.on('connection', (ws: WebSocket) => {
  // Showcase: fast mock ticks so sparklines/bars visibly move.
  let intervalMs = SHOWCASE ? 700 : 1000;
  let includeProcesses = true;
  let timer: NodeJS.Timeout | null = null;
  let busy = false;

  const send = (msg: unknown) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(encode(msg));
  };

  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const metrics = SHOWCASE ? collectShowcaseMetrics() : await collectMetrics(includeProcesses);
      send({ t: 'metrics', metrics });
    } catch (err) {
      send({ t: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      busy = false;
    }
  };

  const restart = () => {
    if (timer) clearInterval(timer);
    timer = setInterval(tick, intervalMs);
  };

  void tick();
  restart();

  // Showcase: animated fictional globe (nodes rotate). Personal: real geo.
  send({ t: 'geo', data: SHOWCASE ? showcaseGeo() : geo.snapshot() });
  const geoTimer = setInterval(
    () => send({ t: 'geo', data: SHOWCASE ? showcaseGeo() : geo.snapshot() }),
    SHOWCASE ? 2500 : 20_000,
  );

  ws.on('message', async (raw) => {
    const msg = parseMessage(SysClientMessage, raw.toString());
    if (!msg) return;
    if (msg.t === 'config') {
      if (msg.intervalMs) {
        intervalMs = SHOWCASE
          ? Math.max(500, Math.min(msg.intervalMs, 2000))
          : Math.max(500, msg.intervalMs);
      }
      if (typeof msg.includeProcesses === 'boolean') includeProcesses = msg.includeProcesses;
      restart();
    } else if (msg.t === 'geo.request') {
      send({ t: 'geo', data: SHOWCASE ? showcaseGeo() : await geo.refresh() });
    } else if (msg.t === 'proc.kill') {
      if (SHOWCASE) {
        send({ t: 'error', message: 'showcase: read-only (process kill disabled)' });
        return;
      }
      try {
        process.kill(msg.pid, msg.signal ?? 'SIGTERM');
        // Refresh the process list promptly so the UI reflects the change.
        void tick();
      } catch (err) {
        send({ t: 'error', message: err instanceof Error ? err.message : String(err) });
      }
    } else if (msg.t === 'fs.list') {
      if (SHOWCASE) {
        // Simulated directory listing — no host fs access.
        send({
          t: 'fs.list',
          path: msg.path || '/demo',
          entries: [
            { name: 'README.md', isDir: false, size: 420 },
            { name: 'metrics.json', isDir: false, size: 2048 },
            { name: 'globe.json', isDir: false, size: 1024 },
            { name: 'panels', isDir: true, size: 0 },
          ],
        });
        return;
      }
      try {
        const { path: resolved, entries } = await listDir(msg.path);
        send({ t: 'fs.list', path: resolved, entries });
      } catch (err) {
        send({ t: 'error', message: err instanceof Error ? err.message : String(err) });
      }
    }
  });

  ws.on('close', () => {
    if (timer) clearInterval(timer);
    if (geoTimer) clearInterval(geoTimer);
  });
});

server.listen(PORT, HOST, () => {
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : PORT;
  const query = AUTH_DISABLED ? '' : `?token=${AUTH_TOKEN}`;
  const mode = SHOWCASE ? 'SHOWCASE (read-only, no shell)' : `tmux: ${sessions.tmuxAvailable}`;

  if (DESKTOP) {
    // Machine-readable handshake: the Electron shell parses this to learn the
    // ephemeral port and token before opening the window.
    console.log(
      `${READY_PREFIX}${JSON.stringify({ port, token: AUTH_TOKEN, url: `http://${HOST}:${port}/${query}` })}`,
    );
    return;
  }

  console.log(`[ciliterm] server on http://${HOST}:${port}  (${mode})`);
  if (SHOWCASE) {
    console.log('[ciliterm] showcase locked: no PTY/SSH/kill/fs; demo replay only');
  }
  if (AUTH_DISABLED) {
    console.log('[ciliterm] auth off (loopback bind or CILITERM_NO_AUTH) - local access only');
  } else {
    console.log(
      `[ciliterm] open this URL (token required):\n           http://${HOST}:${port}/${query}`,
    );
  }
});

let shuttingDown = false;
function shutdown(): void {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close(() => process.exit(0));
  // Sockets attached to a pty keep the server alive; do not wait forever.
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

/**
 * The desktop shell pipes us a stdin it never writes to, so EOF means the shell
 * died without reaping us (crash, SIGKILL) and we would otherwise linger as an
 * orphan holding the user's shell sessions. Only a pipe carries that meaning —
 * run by hand, stdin is a tty or /dev/null and would report EOF immediately.
 */
if (DESKTOP && isPipe(0)) {
  process.stdin.on('end', shutdown);
  process.stdin.on('close', shutdown);
  process.stdin.resume();
}

function isPipe(fd: number): boolean {
  try {
    return fs.fstatSync(fd).isFIFO();
  } catch {
    return false;
  }
}
