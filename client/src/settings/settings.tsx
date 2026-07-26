import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_THEME_ID, type Theme } from '../theme/themes';
import { DEFAULT_LAYOUT, type Layout } from '../layout/layout';

export interface Settings {
  fontFamily: string;
  fontSize: number;
  showKeyboard: boolean;
  sysIntervalMs: number;
  includeProcesses: boolean;
  lowPowerGlobe: boolean;
  /** Send pasted text raw (no bracketed-paste markers). Fixes `^[[200~` leaks on shells that don't support it. */
  rawPaste: boolean;
  themeId: string;
  /** User-imported theme plugins. */
  customThemes: Theme[];
  /** Arrangement of movable modules across the left/right columns. */
  layout: Layout;
  /** Named layout presets the user can switch between. */
  layoutPresets: { name: string; layout: Layout }[];
  /** Show the animated boot sequence on load. */
  bootScreen: boolean;
  /** CRT look intensity 0–100 (scanlines, grid, glow). */
  crtIntensity: number;
  /** Enable UI motion (panel enter, brand pulse, alert flash). */
  motion: boolean;
}

const DEFAULTS: Settings = {
  fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, Consolas, monospace',
  fontSize: 14,
  showKeyboard: false,
  sysIntervalMs: 1000,
  includeProcesses: true,
  lowPowerGlobe: false,
  rawPaste: false,
  themeId: DEFAULT_THEME_ID,
  customThemes: [],
  layout: DEFAULT_LAYOUT,
  layoutPresets: [],
  bootScreen: true,
  crtIntensity: 55,
  motion: true,
};

const STORAGE_KEY = 'ciliterm.settings';

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Settings>;
      const merged = { ...DEFAULTS, ...parsed };
      // Ensure the layout is well-formed even across upgrades.
      merged.layout = {
        left: parsed.layout?.left ?? DEFAULT_LAYOUT.left,
        right: parsed.layout?.right ?? DEFAULT_LAYOUT.right,
        widths: { ...DEFAULT_LAYOUT.widths, ...(parsed.layout?.widths ?? {}) },
      };
      return merged;
    }
  } catch {
    /* ignore */
  }
  return DEFAULTS;
}

interface SettingsContextValue {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(load);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      update: (patch) => setSettings((s) => ({ ...s, ...patch })),
    }),
    [settings],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
