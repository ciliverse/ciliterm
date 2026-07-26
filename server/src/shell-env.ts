import path from 'node:path';

/**
 * Variables the Electron shell injects into the server process. Inheriting
 * `ELECTRON_RUN_AS_NODE` is the dangerous one: every Electron app the user
 * launches from a ciliterm terminal would boot as a bare Node script instead of
 * opening a window.
 */
const STRIPPED = new Set([
  'ELECTRON_RUN_AS_NODE',
  'ELECTRON_NO_ATTACH_CONSOLE',
  'ELECTRON_NO_ASAR',
  'ELECTRON_FORCE_IS_PACKAGED',
  'NODE_OPTIONS',
  'CHROME_DESKTOP',
  'ORIGINAL_XDG_CURRENT_DESKTOP',
]);

/** Server configuration; a shell (or a nested ciliterm) must not inherit it. */
const STRIPPED_PREFIX = 'CILITERM_';

/**
 * `PATH`-shaped variables that an AppImage runtime prepends its own bundled
 * directories to. Leaving them in place makes system binaries launched from the
 * terminal resolve ciliterm's bundled libraries and fail on version mismatch.
 */
const PATH_LIKE = [
  'LD_LIBRARY_PATH',
  'LD_PRELOAD',
  'PYTHONPATH',
  'PERLLIB',
  'GSETTINGS_SCHEMA_DIR',
  'XDG_DATA_DIRS',
  'GST_PLUGIN_SYSTEM_PATH',
  'GST_PLUGIN_SYSTEM_PATH_1_0',
  'QT_PLUGIN_PATH',
];

type Env = Record<string, string | undefined>;

/** Drops `appDir`-rooted entries from a `:`-separated path list. */
function stripAppDirEntries(value: string, appDir: string): string {
  const resolved = path.resolve(appDir);
  return value
    .split(path.delimiter)
    .filter((entry) => {
      if (!entry) return false;
      const abs = path.resolve(entry);
      return abs !== resolved && !abs.startsWith(resolved + path.sep);
    })
    .join(path.delimiter);
}

/**
 * Builds the environment handed to a spawned shell: the user's own environment,
 * minus everything the desktop shell added on the way in.
 *
 * Kept dependency-free and pure so it is unit-testable without spawning a pty.
 */
export function shellEnv(source: Env = process.env): Record<string, string> {
  const out: Record<string, string> = {};
  // An AppImage exports APPDIR; a plain install or dev run does not.
  const appDir = source.APPDIR;

  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (STRIPPED.has(key)) continue;
    if (key.startsWith(STRIPPED_PREFIX)) continue;

    if (appDir && PATH_LIKE.includes(key)) {
      // Prefer the pristine value the runtime saved, else filter in place.
      const original = source[`${key}_ORIG`] ?? source[`APPIMAGE_ORIGINAL_${key}`];
      const cleaned = original !== undefined ? original : stripAppDirEntries(value, appDir);
      if (cleaned) out[key] = cleaned;
      continue;
    }

    out[key] = value;
  }

  return out;
}
