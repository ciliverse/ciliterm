# @ciliterm/desktop

The Electron shell that turns ciliterm into an installable desktop app for
Linux, macOS and Windows.

## How it fits together

The desktop build does not reimplement anything. It runs the same server and
loads the same web client, wrapped in a window:

```
Electron main (src/main.js)
  └── spawns process.execPath with ELECTRON_RUN_AS_NODE=1
        └── runtime/server/index.cjs        the whole backend, one bundled file
              ├── binds 127.0.0.1:<ephemeral>
              ├── serves runtime/web        the Vite client build
              └── prints [ciliterm:ready] {"port":…,"token":…,"url":…}
  └── BrowserWindow → http://127.0.0.1:<port>
```

Five decisions are worth knowing about before changing anything here.

**The backend runs on the Electron binary, not a bundled Node.** Electron already
contains Node, so `ELECTRON_RUN_AS_NODE=1` reuses it instead of shipping a
second runtime.

**Nothing is rebuilt for Electron's ABI.** `node-pty` 1.1.0 is a Node-API addon,
so a single binary works under both runtimes — Electron 43 reports ABI 148 and
Node 24 reports 137, and the same `pty.node` loads in each. `npmRebuild` is
therefore off, which is not only a build-time saving: node-pty resolves
`build/Release` _before_ `prebuilds/<platform>-<arch>`, so a rebuild would leave
a host-arch binary shadowing the correct prebuild in the other macOS slice. The
practical benefit is that `pnpm dev` and `pnpm desktop` share one install with
no rebuild step between them.

**It is a separate process, not the main process.** A pty that wedges or a
backend crash takes down the sidecar, not the window, so the app can show a real
error instead of vanishing.

**The port is ephemeral.** `CILITERM_PORT=0` lets the OS choose, so the desktop
app never collides with a `pnpm start` on 8787, and the shell learns the real
port from the `[ciliterm:ready]` line on stdout. That prefix is a contract with
`READY_PREFIX` in `server/src/config.ts`.

**`asar` is off.** `ELECTRON_RUN_AS_NODE` bypasses Electron's asar filesystem
patches, so an archived server bundle would not be importable, and `node-pty`'s
`.node` binary has to exist on disk regardless. The payload is a bundled server,
the web assets and two npm packages, so unpacking it costs nothing.

## Config lives where the web build puts it

The desktop app deliberately does **not** get its own config directory. SSH
hosts stay in `~/.config/ciliterm/hosts.json`, shared with `pnpm start`, so
switching between the two does not lose your host book. Only window geometry is
app-private (in Electron's `userData`).

## Build and run

From the repo root:

```bash
pnpm install
pnpm desktop          # build everything, then launch the app
```

`pnpm desktop` runs `build.mjs`, which builds `@ciliterm/shared` and
`@ciliterm/client`, esbuilds `server/src/index.ts` into a single CommonJS file,
and copies `client/dist` next to it. Both outputs land in `desktop/runtime/`,
which is generated and gitignored.

It drives the client build itself rather than reusing whatever `client/dist`
happens to contain, because the read-only public demo is a **compile-time**
choice: Vite inlines `import.meta.env.VITE_SHOWCASE`. A leftover
`VITE_SHOWCASE=1` in a shell would otherwise produce an installer whose terminal
is a pre-recorded replay and whose SSH manager is disabled, with nothing in the
build log to say so. `build.mjs` strips the variable and tells you it did.

Iterating on the shell only:

```bash
pnpm --filter @ciliterm/desktop build   # refresh runtime/
pnpm --filter @ciliterm/desktop start   # launch without rebuilding
```

For UI work, prefer plain `pnpm dev` in a browser — it has hot reload and the
desktop shell adds nothing you need while editing components.

## Packaging

```bash
pnpm desktop:linux    # AppImage + deb
pnpm desktop:mac      # dmg + zip, arm64 and x64
pnpm desktop:win      # NSIS installer + portable exe
pnpm desktop:pack     # unpacked directory, for inspecting the layout
```

Installers land in `desktop/release/`, configured by `electron-builder.yml`
(YAML rather than a `build` block in `package.json`, because electron-builder
validates its schema strictly and leaves no room for comments in JSON).

Each platform is still built on itself. Not for ABI reasons — see above — but
because the installer formats need their host: `dmg` requires macOS, and on
Linux there is no `node-pty` prebuild, so `pty.node` is compiled at install time
against the host's libc.

CI does all three in parallel — see `.github/workflows/release-desktop.yml`,
triggered by a `v*` tag.

### Icons

`assets/icon.svg` is the source; `assets/icon.png` (1024×1024) is what
electron-builder consumes, generating `.ico` and `.icns` from it. After editing
the SVG:

```bash
cd desktop/assets
convert -background none -density 384 icon.svg -resize 1024x1024 PNG32:icon.png
```

## Builds are unsigned

There is no Apple Developer certificate or Windows code-signing certificate
behind these artifacts, so both systems will warn on first launch.

**macOS** marks downloaded apps as quarantined:

```bash
xattr -dr com.apple.quarantine /Applications/CiliTerm.app
```

**Windows** SmartScreen shows "Windows protected your PC" → _More info_ → _Run
anyway_.

**Linux** AppImages need the executable bit:

```bash
chmod +x CiliTerm-*-linux-x64.AppImage
```

## Keyboard shortcuts are deliberately unusual on Windows and Linux

A terminal owns the `Ctrl` chord space. `Ctrl+C` is SIGINT, `Ctrl+R` is reverse
history search, `Ctrl+W` deletes a word, `Ctrl+D` is EOF, `Ctrl+S`/`Ctrl+Q` are
flow control. Electron's stock menu roles claim nearly all of them, which would
quietly break the shell — so every binding is `Ctrl+Shift` or a function key:

| Action      | Linux / Windows | macOS        |
| ----------- | --------------- | ------------ |
| Copy        | `Ctrl+Shift+C`  | `Cmd+C`      |
| Paste       | `Ctrl+Shift+V`  | `Cmd+V`      |
| Select all  | `Ctrl+Shift+A`  | `Cmd+A`      |
| Reload      | `Ctrl+Shift+R`  | `Cmd+R`      |
| Quit        | `Ctrl+Shift+Q`  | `Cmd+Q`      |
| Dev tools   | `F12`           | `Alt+Cmd+I`  |
| Full screen | `F11`           | `Ctrl+Cmd+F` |

macOS keeps the conventional shortcuts because the system reserves `Cmd`, so
they never collide with terminal control characters.

In-terminal search (`Ctrl/Cmd+F`) and copy/paste from the right-click menu are
handled by the web client, not by this shell.

## Optional system dependencies

None of these is bundled; the app degrades instead of failing.

- **tmux** — sessions survive quitting and reopening the app. Without it,
  sessions live inside the backend process, and quitting warns you before
  ending them. There is no tmux on Windows, so sessions there always end with
  the app.
- **ssh** — required by the SSH manager. Key and ssh-agent auth only. Windows 10
  1809 and later ship `ssh.exe`, which is enough.
- **A working WebGL context** — only the globe needs one. Inside a VM, over RDP
  or on a blocklisted driver the panel shows "globe unavailable" and the rest of
  the app is untouched.

## Sanity checks when something breaks

The sidecar's stdout and stderr are forwarded to the terminal you launched
Electron from, so `pnpm --filter @ciliterm/desktop start` shows backend logs.

| Symptom                                  | Likely cause                                                                  |
| ---------------------------------------- | ----------------------------------------------------------------------------- |
| "Server bundle not found"                | `runtime/` was never generated — run the build                                |
| "Server did not start within 20s"        | The backend crashed on boot; its stderr is in the dialog                      |
| Backend "stopped unexpectedly" on launch | Usually a missing system library on the target machine                        |
| "GLOBE UNAVAILABLE" in the globe panel   | No WebGL context (VM, RDP, blocklisted driver). Everything else keeps working |
| The app boots as a read-only demo        | The client was built with `VITE_SHOWCASE=1`; rebuild via `build.mjs`          |
| Launching does nothing / no window       | `ELECTRON_RUN_AS_NODE` is set in your shell, so the binary starts as Node     |
