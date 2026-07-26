/** Movable UI modules and how they are arranged into the left/right columns. */

export type ModuleId =
  | 'sessions'
  | 'ssh'
  | 'cpu'
  | 'memory'
  | 'network'
  | 'disk'
  | 'processes'
  | 'sysinfo'
  | 'globe'
  | 'filesystem';

export type ColumnId = 'left' | 'right';

export interface Layout {
  left: ModuleId[];
  right: ModuleId[];
  widths: { left: number; right: number };
}

export const ALL_MODULES: ModuleId[] = [
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
];

export const MODULE_LABELS: Record<ModuleId, string> = {
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
};

export const MIN_COL_WIDTH = 220;
export const MAX_COL_WIDTH = 560;

export const DEFAULT_LAYOUT: Layout = {
  left: ['sessions', 'ssh', 'cpu', 'memory', 'network', 'disk', 'processes', 'sysinfo'],
  right: ['globe', 'filesystem'],
  widths: { left: 300, right: 340 },
};

/** Modules currently hidden (present in neither column). */
export function hiddenModules(layout: Layout): ModuleId[] {
  const shown = new Set([...layout.left, ...layout.right]);
  return ALL_MODULES.filter((m) => !shown.has(m));
}

/** Move (or insert) a module into a column at a given index. Pure. */
export function moveModule(
  layout: Layout,
  id: ModuleId,
  toCol: ColumnId,
  toIndex: number,
): Layout {
  const left = layout.left.filter((m) => m !== id);
  const right = layout.right.filter((m) => m !== id);
  const target = toCol === 'left' ? left : right;
  const idx = Math.max(0, Math.min(toIndex, target.length));
  target.splice(idx, 0, id);
  return { ...layout, left, right };
}

/** Remove a module from all columns (hide it). Pure. */
export function hideModule(layout: Layout, id: ModuleId): Layout {
  return {
    ...layout,
    left: layout.left.filter((m) => m !== id),
    right: layout.right.filter((m) => m !== id),
  };
}
