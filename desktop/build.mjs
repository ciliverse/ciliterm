import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const runtime = path.join(here, 'runtime');

/**
 * Left out of the bundle and shipped as real `dependencies` of the desktop app
 * instead: `node-pty` is a native addon, and `systeminformation` resolves
 * platform modules at runtime. `bufferutil` / `utf-8-validate` are optional `ws`
 * accelerators loaded inside a try/catch — absent at runtime, `ws` falls back to
 * its JS implementation.
 */
const EXTERNAL = ['node-pty', 'systeminformation', 'bufferutil', 'utf-8-validate'];

function log(msg) {
  console.log(`[desktop:build] ${msg}`);
}

function pnpm(args, env = process.env) {
  execFileSync('pnpm', args, {
    cwd: repo,
    env,
    stdio: 'inherit',
    // pnpm is a .cmd shim on Windows and is not directly executable.
    shell: process.platform === 'win32',
  });
}

/**
 * Vite inlines `import.meta.env.VITE_SHOWCASE` at compile time, so the read-only
 * public-demo build is decided by whatever happens to be in the environment when
 * the client is built. A stray `VITE_SHOWCASE=1` would silently produce an
 * installer whose terminal is a pre-recorded replay and whose SSH manager is
 * disabled, with nothing in the build log to say so. Build the client here, from
 * a scrubbed environment, rather than shipping whatever `client/dist` contains.
 */
function buildClient() {
  const env = { ...process.env };
  if (env.VITE_SHOWCASE) {
    log(`ignoring VITE_SHOWCASE=${env.VITE_SHOWCASE} — desktop builds are never showcase`);
    delete env.VITE_SHOWCASE;
  }
  pnpm(['--filter', '@ciliterm/client', 'build'], env);
}

fs.rmSync(runtime, { recursive: true, force: true });
fs.mkdirSync(path.join(runtime, 'server'), { recursive: true });

// esbuild resolves @ciliterm/shared through its package exports, which point at
// shared/dist.
log('building shared');
pnpm(['--filter', '@ciliterm/shared', 'build']);

log('building client');
buildClient();

const clientDist = path.join(repo, 'client', 'dist');
if (!fs.existsSync(path.join(clientDist, 'index.html'))) {
  console.error(`[desktop:build] client build produced no index.html in ${clientDist}`);
  process.exit(1);
}

const result = await build({
  entryPoints: [path.join(repo, 'server', 'src', 'index.ts')],
  outfile: path.join(runtime, 'server', 'index.cjs'),
  bundle: true,
  platform: 'node',
  // Electron 43 ships Node 22; node20 stays valid if we ever downgrade.
  target: 'node20',
  /**
   * CJS, even though the sources are ESM. Every runtime dependency in the graph
   * (express, ws and their transitive deps) is CommonJS, and esbuild's ESM
   * output can only reach them through a `__require` shim that cannot load node
   * builtins. Emitting CJS gives them the real `require` instead, and skips the
   * ESM loader on a startup path the user is waiting on.
   */
  format: 'cjs',
  // The sources derive paths from `import.meta.url`, which does not exist in
  // CJS; point it at the bundle's own location so the semantics carry over.
  define: { 'import.meta.url': '__ciliterm_module_url' },
  banner: {
    js: "const __ciliterm_module_url = require('node:url').pathToFileURL(__filename).href;",
  },
  external: EXTERNAL,
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'warning',
  metafile: true,
});

const bytes = Object.values(result.metafile.outputs)[0].bytes;
log(`server bundle: ${(bytes / 1024).toFixed(0)} KiB`);

fs.cpSync(clientDist, path.join(runtime, 'web'), { recursive: true });
const webFiles = fs.readdirSync(path.join(runtime, 'web'), { recursive: true }).length;
log(`web assets: ${webFiles} files`);
log(`output: ${runtime}`);
