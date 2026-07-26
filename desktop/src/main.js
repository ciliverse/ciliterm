'use strict';

const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

/** Must match `READY_PREFIX` in `server/src/config.ts`. */
const READY_PREFIX = '[ciliterm:ready] ';
const READY_TIMEOUT_MS = 20_000;
const SHUTDOWN_GRACE_MS = 3_000;

const RUNTIME_DIR = path.join(__dirname, '..', 'runtime');
const ICON_FILE = path.join(__dirname, '..', 'assets', 'icon.png');

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {import('node:child_process').ChildProcess | null} */
let serverProc = null;
/** @type {string} */
let serverOrigin = '';
/** Full ready URL, token included, for reopening the window on macOS. */
let launchUrl = '';
let serverExitedUnexpectedly = false;
let shuttingDown = false;

// ---------------------------------------------------------------------------
// Window geometry, remembered across launches
// ---------------------------------------------------------------------------

const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');

function loadWindowState() {
  const fallback = { width: 1280, height: 820 };
  try {
    const saved = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    if (!Number.isFinite(saved.width) || !Number.isFinite(saved.height)) return fallback;
    return saved;
  } catch {
    return fallback;
  }
}

function saveWindowState(win) {
  if (!win || win.isDestroyed()) return;
  // Maximised bounds are the screen, not what the user wants restored.
  const bounds = win.isMaximized() || win.isFullScreen() ? win.getNormalBounds() : win.getBounds();
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(stateFile(), JSON.stringify({ ...bounds, maximized: win.isMaximized() }));
  } catch {
    /* geometry is a convenience; never block quitting on it */
  }
}

// ---------------------------------------------------------------------------
// Server sidecar
// ---------------------------------------------------------------------------

/**
 * Runs the bundled server on the Electron binary in plain-Node mode, so we ship
 * one runtime instead of two. It binds an ephemeral loopback port and hands the
 * real one back over stdout.
 *
 * @returns {Promise<{ port: number, token: string, url: string }>}
 */
function startServer() {
  const entry = path.join(RUNTIME_DIR, 'server', 'index.cjs');
  if (!fs.existsSync(entry)) {
    return Promise.reject(
      new Error(
        `Server bundle not found at ${entry}.\nRun \`pnpm --filter @ciliterm/desktop build\`.`,
      ),
    );
  }

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        CILITERM_DESKTOP: '1',
        CILITERM_HOST: '127.0.0.1',
        // 0 = let the OS pick, so two ciliterms never fight over 8787.
        CILITERM_PORT: '0',
        CILITERM_CLIENT_DIST: path.join(RUNTIME_DIR, 'web'),
      },
      // stdin stays open as the liveness channel: if we die without reaping the
      // child, its stdin ends and it shuts itself down instead of orphaning.
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    serverProc = child;

    let settled = false;
    let startedOk = false;
    let stdoutTail = '';
    let stderrTail = '';

    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) {
        reject(err);
        return;
      }
      startedOk = true;
      resolve(value);
    };

    const timer = setTimeout(() => {
      child.kill();
      finish(new Error(`Server did not start within ${READY_TIMEOUT_MS / 1000}s.\n${stderrTail}`));
    }, READY_TIMEOUT_MS);

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      process.stdout.write(chunk);
      if (settled) return;
      stdoutTail += chunk;
      const lines = stdoutTail.split('\n');
      // The trailing element may be a partial line; keep it buffered.
      stdoutTail = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith(READY_PREFIX)) continue;
        try {
          finish(null, JSON.parse(line.slice(READY_PREFIX.length)));
        } catch (err) {
          finish(new Error(`Malformed ready line from server: ${err.message}`));
        }
        return;
      }
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      process.stderr.write(chunk);
      stderrTail = (stderrTail + chunk).slice(-4000);
    });

    child.on('error', (err) => {
      // Never launched, so there is nothing for the quit path to reap.
      if (serverProc === child) serverProc = null;
      finish(new Error(`Could not launch the server: ${err.message}`));
    });

    child.on('exit', (code, signal) => {
      if (serverProc === child) serverProc = null;
      if (!settled) {
        finish(new Error(`Server exited early (${signal ?? code}).\n${stderrTail}`));
        return;
      }
      // A start that already failed has reported itself; do not stack a second
      // dialog on top when the process we just killed finally exits.
      if (!startedOk || shuttingDown) return;
      serverExitedUnexpectedly = true;
      dialog.showErrorBox(
        'ciliterm backend stopped',
        `The terminal backend exited unexpectedly (${signal ?? code}).\n\n${stderrTail.slice(-1500)}`,
      );
      app.quit();
    });
  });
}

/** Stops the sidecar, escalating to SIGKILL if it will not go quietly. */
function stopServer() {
  const child = serverProc;
  serverProc = null;
  if (!child || child.exitCode !== null) return Promise.resolve();

  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        /* already gone */
      }
      resolve();
    }, SHUTDOWN_GRACE_MS);

    child.once('exit', done);
    try {
      child.stdin.end();
      child.kill('SIGTERM');
    } catch {
      done();
    }
  });
}

/**
 * Sessions live in tmux when it is installed and therefore survive quitting.
 * Without tmux they are in-process and die with the app, so ask first.
 *
 * @returns {Promise<boolean>} true when it is safe to close
 */
async function confirmCloseWithLiveSessions() {
  let health;
  try {
    const res = await fetch(`${serverOrigin}/api/health`, { signal: AbortSignal.timeout(1500) });
    health = await res.json();
  } catch {
    return true;
  }
  if (health.tmux || !health.sessions) return true;

  const { response } = await dialog.showMessageBox({
    type: 'warning',
    buttons: ['Quit anyway', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    title: 'Running sessions',
    message: `Quit ciliterm and end ${health.sessions} running session${health.sessions === 1 ? '' : 's'}?`,
    detail:
      'tmux is not installed, so these sessions run inside ciliterm and will be terminated.\n\nInstall tmux to make sessions survive restarts.',
  });
  return response === 0;
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

function createWindow(url) {
  const state = loadWindowState();

  mainWindow = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 720,
    minHeight: 460,
    title: 'ciliterm',
    backgroundColor: '#04070a',
    // Menu bar would cover the HUD; Alt still reveals it on Windows/Linux.
    autoHideMenuBar: true,
    show: false,
    ...(process.platform === 'linux' && fs.existsSync(ICON_FILE) ? { icon: ICON_FILE } : {}),
    webPreferences: {
      // The renderer is the same web bundle the browser build serves and talks
      // to the backend over WebSockets, so it needs no Node access and no
      // preload bridge.
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      spellcheck: false,
      // A backgrounded terminal must keep draining pty output and metrics.
      backgroundThrottling: false,
    },
  });

  if (state.maximized) mainWindow.maximize();

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  let closeApproved = false;
  mainWindow.on('close', (event) => {
    if (closeApproved || serverExitedUnexpectedly) return;
    event.preventDefault();
    void confirmCloseWithLiveSessions().then((ok) => {
      if (!ok) return;
      closeApproved = true;
      saveWindowState(mainWindow);
      mainWindow?.close();
    });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Anything that is not our own origin belongs in the user's browser.
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:/.test(target)) void shell.openExternal(target);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, target) => {
    if (target.startsWith(serverOrigin)) return;
    event.preventDefault();
    if (/^https?:/.test(target)) void shell.openExternal(target);
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    dialog.showErrorBox('ciliterm window crashed', `The UI process stopped: ${details.reason}.`);
  });

  void mainWindow.loadURL(url);
}

// ---------------------------------------------------------------------------
// Menu
//
// Accelerators are the whole problem here. On Windows and Linux the terminal
// owns the Ctrl chord space -- Ctrl+C is SIGINT, Ctrl+R is reverse search,
// Ctrl+W deletes a word, Ctrl+S/Q are flow control, Ctrl+D is EOF. Electron's
// stock roles claim nearly all of them, so every binding below is either
// Ctrl+Shift or a function key. macOS is free of the conflict because the
// system reserves Cmd, which is why it keeps the conventional shortcuts.
// ---------------------------------------------------------------------------

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const reload = () => mainWindow?.webContents.reload();
  const devtools = () => mainWindow?.webContents.toggleDevTools();
  const fullscreen = () => mainWindow?.setFullScreen(!mainWindow.isFullScreen());

  const viewItems = [
    { label: 'Reload', accelerator: isMac ? 'Cmd+R' : 'Ctrl+Shift+R', click: reload },
    {
      label: 'Toggle Developer Tools',
      accelerator: isMac ? 'Alt+Cmd+I' : 'F12',
      click: devtools,
    },
    { type: 'separator' },
    { label: 'Toggle Full Screen', accelerator: isMac ? 'Ctrl+Cmd+F' : 'F11', click: fullscreen },
  ];

  const helpItems = [
    {
      label: 'Project Homepage',
      click: () => void shell.openExternal('https://github.com/ciliverse/ciliterm'),
    },
    { label: `Version ${app.getVersion()}`, enabled: false },
  ];

  if (isMac) {
    return Menu.buildFromTemplate([
      { role: 'appMenu' },
      { role: 'editMenu' },
      { label: 'View', submenu: viewItems },
      { role: 'windowMenu' },
      { role: 'help', submenu: helpItems },
    ]);
  }

  return Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [{ label: 'Quit', accelerator: 'Ctrl+Shift+Q', click: () => app.quit() }],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Copy', accelerator: 'Ctrl+Shift+C', role: 'copy' },
        { label: 'Paste', accelerator: 'Ctrl+Shift+V', role: 'paste' },
        { type: 'separator' },
        { label: 'Select All', accelerator: 'Ctrl+Shift+A', role: 'selectAll' },
      ],
    },
    { label: 'View', submenu: viewItems },
    { label: 'Help', submenu: helpItems },
  ]);
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

// One backend per machine: a second launch focuses the window we already have.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(buildMenu());
    try {
      const info = await startServer();
      serverOrigin = `http://127.0.0.1:${info.port}`;
      launchUrl = info.url;
      createWindow(launchUrl);
    } catch (err) {
      dialog.showErrorBox('ciliterm failed to start', String(err.message ?? err));
      app.exit(1);
      return;
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0 && launchUrl) createWindow(launchUrl);
    });
  });

  app.on('window-all-closed', () => {
    // macOS apps stay resident; the backend keeps sessions warm for reopening.
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => saveWindowState(mainWindow));

  app.on('will-quit', (event) => {
    // Only fires once the quit is really going ahead, so this is where the
    // sidecar's exit stops being a crash and starts being expected.
    shuttingDown = true;
    if (!serverProc) return;
    event.preventDefault();
    void stopServer().then(() => app.exit(0));
  });
}
