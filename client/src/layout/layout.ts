/** Movable UI modules and how they are arranged into slots. */

export type BuiltinModuleId =
  | 'sessions'
  | 'ssh'
  | 'cpu'
  | 'memory'
  | 'network'
  | 'disk'
  | 'processes'
  | 'sysinfo'
  | 'globe'
  | 'filesystem'
  | 'clock'
  | 'terminal';

export type ModuleId = BuiltinModuleId | `term:${string}`;

export function isTerminal(id: string): id is 'terminal' | `term:${string}` {
  return id === 'terminal' || id.startsWith('term:');
}

export function nextTerminalId(layout: Layout): ModuleId {
  const used = new Set(placedModules(layout));
  if (!used.has('terminal')) return 'terminal';
  let n = 2;
  while (used.has(`term:${n}`)) n += 1;
  return `term:${n}`;
}

export function moduleLabel(id: ModuleId): string {
  if (isTerminal(id)) return 'Terminal';
  return MODULE_LABELS[id];
}

export type ColumnId = 'left' | 'right';
export type SlotId = ColumnId | 'header' | 'center';

export interface Layout {
  left: ModuleId[];
  right: ModuleId[];
  header: ModuleId[];
  center: ModuleId[];
  widths: { left: number; right: number };
  heights: Partial<Record<ModuleId, number>>;
}

export const ALL_MODULES: BuiltinModuleId[] = [
  'sessions',
  'ssh',
  'cpu',
  'memory',
  'network',
  'disk',
  'processes',
  'sysinfo',
  'globe',
  'filesystem',
  'clock',
  'terminal',
];

export const MODULE_LABELS: Record<BuiltinModuleId, string> = {
  sessions: 'Sessions',
  ssh: 'SSH Hosts',
  cpu: 'CPU',
  memory: 'Memory',
  network: 'Network',
  disk: 'Disk',
  processes: 'Processes',
  sysinfo: 'System Info',
  globe: 'Globe',
  filesystem: 'Filesystem',
  clock: 'Clock',
  terminal: 'Terminal',
};

export const MIN_COL_WIDTH = 220;
export const MAX_COL_WIDTH = 560;
export const MIN_CENTER_WIDTH = 280;

/** How wide a side column may grow, given the other column and whether center is occupied. */
export function maxColWidth(
  peerWidth: number,
  viewport: number,
  centerOccupied: boolean,
): number {
  const reserve = centerOccupied ? MIN_CENTER_WIDTH : 0;
  const room = Math.max(MIN_COL_WIDTH, viewport - peerWidth - reserve);
  if (centerOccupied) return Math.min(MAX_COL_WIDTH, room);
  return room;
}
export const MIN_MOD_HEIGHT = 120;
export const MAX_MOD_HEIGHT = 900;

export const DEFAULT_LAYOUT: Layout = {
  left: ['sessions', 'ssh', 'cpu', 'memory', 'network', 'disk', 'processes', 'sysinfo'],
  right: ['globe', 'filesystem'],
  header: ['clock'],
  center: ['terminal'],
  widths: { left: 300, right: 340 },
  heights: { globe: 380, filesystem: 280 },
};

export function placedModules(layout: Layout): ModuleId[] {
  return [...layout.left, ...layout.right, ...layout.header, ...layout.center];
}

/** Modules currently hidden (present in no slot). */
export function hiddenModules(layout: Layout): ModuleId[] {
  const shown = new Set(placedModules(layout));
  return ALL_MODULES.filter((m) => !shown.has(m));
}

export function normalizeLayout(raw?: Partial<Layout> | null): Layout {
  const header = raw?.header ?? DEFAULT_LAYOUT.header;
  const center = raw?.center ?? DEFAULT_LAYOUT.center;
  return {
    left: raw?.left ?? DEFAULT_LAYOUT.left,
    right: raw?.right ?? DEFAULT_LAYOUT.right,
    header,
    center,
    widths: { ...DEFAULT_LAYOUT.widths, ...(raw?.widths ?? {}) },
    heights: { ...DEFAULT_LAYOUT.heights, ...(raw?.heights ?? {}) },
  };
}

/** Move (or insert) a module into a slot at a given index. Pure. */
export function moveModule(layout: Layout, id: ModuleId, toSlot: SlotId, toIndex: number): Layout {
  const next = hideModule(layout, id);
  const target = next[toSlot].slice();
  const idx = Math.max(0, Math.min(toIndex, target.length));
  target.splice(idx, 0, id);
  return { ...next, [toSlot]: target };
}

/** Remove a module from all slots (hide it). Pure. */
export function hideModule(layout: Layout, id: ModuleId): Layout {
  return {
    ...layout,
    left: layout.left.filter((m) => m !== id),
    right: layout.right.filter((m) => m !== id),
    header: layout.header.filter((m) => m !== id),
    center: layout.center.filter((m) => m !== id),
  };
}

export function setModuleHeight(layout: Layout, id: ModuleId, height: number): Layout {
  const h = Math.max(MIN_MOD_HEIGHT, Math.min(MAX_MOD_HEIGHT, Math.round(height)));
  return { ...layout, heights: { ...layout.heights, [id]: h } };
}

/** Open a center terminal without stealing one that already lives in a side slot. */
export function openCenterTerminal(layout: Layout, viewport: number): Layout {
  let left = layout.widths.left;
  let right = layout.widths.right;
  left = Math.min(left, maxColWidth(right, viewport, true));
  right = Math.min(right, maxColWidth(left, viewport, true));
  const widths = { left, right };
  if (layout.center.some(isTerminal)) return { ...layout, widths };
  if ([...layout.left, ...layout.right, ...layout.header].some(isTerminal)) {
    return { ...layout, widths, center: [nextTerminalId(layout), ...layout.center] };
  }
  return { ...moveModule(layout, 'terminal', 'center', 0), widths };
}
