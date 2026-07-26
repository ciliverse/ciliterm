import type { ITheme } from '@xterm/xterm';

/** A ciliterm theme: a small set of semantic colors that drive UI, terminal and globe. */
export interface Theme {
  id: string;
  name: string;
  colors: {
    bg: string;
    bgPanel: string; // rgba() with transparency for glassy panels
    bgPanelSolid: string;
    primary: string; // accent / cyan role
    primaryDim: string;
    secondary: string; // orange role
    red: string;
    green: string;
    text: string;
    textDim: string;
  };
}

export const BUILTIN_THEMES: Theme[] = [
  {
    id: 'tron',
    name: 'TRON (cyan)',
    colors: {
      bg: '#04070a',
      bgPanel: 'rgba(8, 18, 24, 0.72)',
      bgPanelSolid: '#071016',
      primary: '#35e6ff',
      primaryDim: '#1a7f92',
      secondary: '#ffae00',
      red: '#ff4d5e',
      green: '#4dffb0',
      text: '#cfeef5',
      textDim: '#6f98a3',
    },
  },
  {
    id: 'matrix',
    name: 'Matrix (green)',
    colors: {
      bg: '#010601',
      bgPanel: 'rgba(4, 16, 8, 0.72)',
      bgPanelSolid: '#04120a',
      primary: '#39ff8a',
      primaryDim: '#1f6b3e',
      secondary: '#b6ff3a',
      red: '#ff5555',
      green: '#8affc9',
      text: '#c8facc',
      textDim: '#4f8a5c',
    },
  },
  {
    id: 'amber',
    name: 'Amber (retro)',
    colors: {
      bg: '#0a0600',
      bgPanel: 'rgba(24, 16, 4, 0.72)',
      bgPanelSolid: '#140d02',
      primary: '#ffb000',
      primaryDim: '#8a5e00',
      secondary: '#ff7b29',
      red: '#ff5a3c',
      green: '#c8e64d',
      text: '#ffd479',
      textDim: '#a97b2e',
    },
  },
  {
    id: 'synthwave',
    name: 'Synthwave (magenta)',
    colors: {
      bg: '#0a0410',
      bgPanel: 'rgba(20, 8, 28, 0.72)',
      bgPanelSolid: '#120720',
      primary: '#ff4dd2',
      primaryDim: '#a01f8a',
      secondary: '#22e0ff',
      red: '#ff5470',
      green: '#7dffb0',
      text: '#f5d0ff',
      textDim: '#9a6fb0',
    },
  },
  {
    id: 'ice',
    name: 'Ice (blue)',
    colors: {
      bg: '#060b12',
      bgPanel: 'rgba(8, 16, 26, 0.72)',
      bgPanelSolid: '#07101a',
      primary: '#61d0ff',
      primaryDim: '#2a6f92',
      secondary: '#ffd479',
      red: '#ff6b7a',
      green: '#a3e635',
      text: '#d6e6f2',
      textDim: '#6f8aa3',
    },
  },
  {
    id: 'paper',
    name: 'Paper (light)',
    colors: {
      bg: '#f2efe6',
      bgPanel: 'rgba(255, 252, 245, 0.88)',
      bgPanelSolid: '#faf7f0',
      primary: '#1a6b8a',
      primaryDim: '#5a8fa3',
      secondary: '#c45c26',
      red: '#c43c3c',
      green: '#2d8a5a',
      text: '#1e2a32',
      textDim: '#6a7a84',
    },
  },
  {
    id: 'blood',
    name: 'Blood Orange',
    colors: {
      bg: '#0a0404',
      bgPanel: 'rgba(28, 8, 8, 0.78)',
      bgPanelSolid: '#140606',
      primary: '#ff4a2a',
      primaryDim: '#8a2818',
      secondary: '#ffae00',
      red: '#ff2a4a',
      green: '#7dff6a',
      text: '#ffe8e0',
      textDim: '#a86a5a',
    },
  },
  {
    id: 'plasma',
    name: 'Plasma (violet)',
    colors: {
      bg: '#07040f',
      bgPanel: 'rgba(16, 8, 32, 0.78)',
      bgPanelSolid: '#0e0820',
      primary: '#b44dff',
      primaryDim: '#5a228a',
      secondary: '#00e5ff',
      red: '#ff4d8a',
      green: '#5effc0',
      text: '#ebe0ff',
      textDim: '#8a70b0',
    },
  },
  {
    id: 'mono',
    name: 'Mono (terminal)',
    colors: {
      bg: '#0c0c0c',
      bgPanel: 'rgba(18, 18, 18, 0.85)',
      bgPanelSolid: '#141414',
      primary: '#e8e8e8',
      primaryDim: '#6a6a6a',
      secondary: '#a0a0a0',
      red: '#ff6666',
      green: '#88cc88',
      text: '#e0e0e0',
      textDim: '#707070',
    },
  },
  {
    id: 'nord',
    name: 'Nord (frost)',
    colors: {
      bg: '#2e3440',
      bgPanel: 'rgba(46, 52, 64, 0.88)',
      bgPanelSolid: '#3b4252',
      primary: '#88c0d0',
      primaryDim: '#5e81ac',
      secondary: '#ebcb8b',
      red: '#bf616a',
      green: '#a3be8c',
      text: '#eceff4',
      textDim: '#818a9a',
    },
  },
];

export const DEFAULT_THEME_ID = 'tron';

export function hexToRgba(hex: string, alpha: number): string {
  let m = hex.replace('#', '').trim();
  if (m.length === 3) m = [...m].map((c) => c + c).join('');
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Push a theme's colors onto the document root as CSS variables consumed by theme.css. */
export function applyTheme(theme: Theme): void {
  const c = theme.colors;
  const root = document.documentElement;
  const set = (k: string, v: string) => root.style.setProperty(k, v);
  set('--bg', c.bg);
  set('--bg-panel', c.bgPanel);
  set('--bg-panel-solid', c.bgPanelSolid);
  set('--cyan', c.primary);
  set('--cyan-dim', c.primaryDim);
  set('--cyan-faint', hexToRgba(c.primary, 0.14));
  set('--orange', c.secondary);
  set('--red', c.red);
  set('--green', c.green);
  set('--text', c.text);
  set('--text-dim', c.textDim);
  set('--grid-line', hexToRgba(c.primary, 0.08));
  set('--glow', `0 0 8px ${hexToRgba(c.primary, 0.35)}`);
  // Soft ambient wash used by the app backdrop (follows primary).
  set('--ambient', hexToRgba(c.primary, 0.07));
}

/**
 * Map a 0–100 CRT intensity to scanline / grid / glow CSS vars.
 * 0 = flat UI, 50 ≈ current default, 100 = heavy CRT look.
 */
export function applyCrtIntensity(level: number): void {
  const t = Math.max(0, Math.min(100, level)) / 100;
  const root = document.documentElement;
  root.style.setProperty('--crt-scan', String(0.12 + t * 0.55));
  root.style.setProperty('--crt-grid', String(0.35 + t * 0.9));
  root.style.setProperty('--crt-glow', String(0.4 + t * 1.2));
  root.dataset.crt = t < 0.08 ? 'off' : t > 0.75 ? 'high' : 'mid';

  // Rebuild grid / glow strength from the active primary so intensity actually moves.
  const primary = getComputedStyle(root).getPropertyValue('--cyan').trim() || '#35e6ff';
  const gridA = 0.02 + t * 0.12;
  const glowA = 0.12 + t * 0.45;
  root.style.setProperty('--grid-line', hexToRgba(primary, gridA));
  root.style.setProperty('--glow', `0 0 ${6 + t * 10}px ${hexToRgba(primary, glowA)}`);
}

/** Derive an xterm.js theme from the semantic palette. Background stays transparent. */
export function terminalTheme(theme: Theme): ITheme {
  const c = theme.colors;
  return {
    background: '#00000000',
    foreground: c.text,
    cursor: c.primary,
    cursorAccent: c.bg,
    selectionBackground: hexToRgba(c.primary, 0.3),
    black: c.bg,
    red: c.red,
    green: c.green,
    yellow: c.secondary,
    blue: c.primary,
    magenta: '#c678dd',
    cyan: c.primary,
    white: c.text,
    brightBlack: c.textDim,
    brightRed: c.red,
    brightGreen: c.green,
    brightYellow: c.secondary,
    brightBlue: c.primary,
    brightMagenta: '#d7a3e8',
    brightCyan: c.primary,
    brightWhite: '#ffffff',
  };
}

/** Read a resolved CSS variable value (for canvas drawing that can't use var()). */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#35e6ff';
}

/** Resolve the active theme from an id, falling back to the default. */
export function resolveTheme(id: string, custom: Theme[] = []): Theme {
  return (
    custom.find((t) => t.id === id) ??
    BUILTIN_THEMES.find((t) => t.id === id) ??
    BUILTIN_THEMES[0]
  );
}

/** Validate arbitrary parsed JSON as a Theme (for user-imported theme plugins). */
export function parseCustomTheme(raw: string): Theme {
  const obj = JSON.parse(raw) as Partial<Theme>;
  if (!obj || typeof obj.id !== 'string' || typeof obj.name !== 'string' || !obj.colors) {
    throw new Error('theme must have id, name and colors');
  }
  const required: (keyof Theme['colors'])[] = [
    'bg',
    'bgPanel',
    'bgPanelSolid',
    'primary',
    'primaryDim',
    'secondary',
    'red',
    'green',
    'text',
    'textDim',
  ];
  for (const key of required) {
    if (typeof obj.colors[key] !== 'string') {
      throw new Error(`missing color: ${key}`);
    }
  }
  return { id: obj.id, name: obj.name, colors: obj.colors as Theme['colors'] };
}
