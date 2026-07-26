/**
 * Manual end-to-end check of the SSH spawn path (not part of `pnpm test`).
 *
 * Unit tests cover buildSshArgv and resolveArgv, but not the wiring that
 * carries an `exec` from the /pty handler through tmux into a real process.
 * Targets 192.0.2.1 (TEST-NET-1, unroutable by definition) so it can never
 * reach a real host: the point is that ssh itself reports the failure, which
 * only happens if argv arrived intact.
 *
 *   node tests/manual-ssh-path.mjs
 */
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';

// ws is a dependency of @ciliterm/server, not of the workspace root.
const { WebSocket } = createRequire(new URL('../server/package.json', import.meta.url))('ws');

const PORT = 8899;
const KEY_PATH = "/tmp/a key with spaces'and-quote";
const CONFIG_DIR = '/tmp/ciliterm-ssh-path-test';

let sessionName = null;

const server = spawn('node', ['server/dist/index.js'], {
  env: {
    ...process.env,
    CILITERM_PORT: String(PORT),
    CILITERM_HOST: '127.0.0.1',
    CILITERM_CONFIG_DIR: CONFIG_DIR,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stderr.on('data', (d) => process.stderr.write(d));

const done = (code, msg) => {
  // A tmux session outlives the server by design, so this has to tidy up
  // explicitly or every run leaves a stray `cili-*` behind.
  if (sessionName) {
    try {
      execFileSync('tmux', ['kill-session', '-t', sessionName], { stdio: 'ignore' });
    } catch {
      /* tmux absent, or the session already went away with ssh */
    }
  }
  fs.rmSync(CONFIG_DIR, { recursive: true, force: true });
  console.log(msg);
  server.kill();
  process.exit(code);
};

await new Promise((r) => {
  server.stdout.on('data', (d) => {
    if (String(d).includes('server on')) r();
  });
  setTimeout(r, 4000);
});

// The host book lives on the /control channel, not a REST route.
const control = new WebSocket(`ws://127.0.0.1:${PORT}/control`);
const host = await new Promise((resolve, reject) => {
  control.on('open', () => {
    control.send(
      JSON.stringify({
        t: 'hosts.save',
        host: {
          label: 'unroutable',
          host: '192.0.2.1',
          port: 2222,
          user: 'nobody',
          keyPath: KEY_PATH,
        },
      }),
    );
  });
  control.on('message', (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.t === 'hosts') {
      const found = msg.list.find((h) => h.host === '192.0.2.1');
      if (found) resolve(found);
    }
  });
  setTimeout(() => reject(new Error('control channel never returned the host')), 5000);
});
console.log(`created host ${host.id} (keyPath contains a space and a quote)`);

const ws = new WebSocket(`ws://127.0.0.1:${PORT}/pty`);
let output = '';

ws.on('open', () => {
  ws.send(JSON.stringify({ t: 'create', hostId: host.id, cols: 100, rows: 30 }));
});

ws.on('message', (raw) => {
  const msg = JSON.parse(String(raw));
  if (msg.t === 'ready') sessionName = msg.session;
  if (msg.t === 'output') output += msg.data;
  if (msg.t === 'error') done(1, `FAIL: server error: ${msg.message}`);
});

setTimeout(() => {
  console.log('--- pane output ---');
  console.log(output.trim() || '(nothing)');
  console.log('-------------------');

  // ssh must have received the key path as ONE argv element. If a shell or
  // tmux had re-split it, ssh would complain about a truncated path.
  if (output.includes(KEY_PATH)) {
    done(0, 'PASS: ssh received the key path intact, so exec reached it as argv');
  }
  if (/bash|not found|No such file or directory: ssh/i.test(output)) {
    done(1, 'FAIL: went through a shell or ssh was not found');
  }
  done(1, 'INCONCLUSIVE: ssh produced no recognisable output');
}, 6000);
