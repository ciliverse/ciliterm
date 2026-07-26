import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LAYOUT,
  hiddenModules,
  hideModule,
  moveModule,
  ALL_MODULES,
  type Layout,
} from '../client/src/layout/layout';

const base: Layout = {
  left: ['sessions', 'cpu'],
  right: ['globe'],
  widths: { left: 300, right: 340 },
};

describe('moveModule', () => {
  it('moves a module within the same column to a new index', () => {
    const next = moveModule(base, 'cpu', 'left', 0);
    expect(next.left).toEqual(['cpu', 'sessions']);
  });

  it('moves a module across columns and removes it from the source', () => {
    const next = moveModule(base, 'cpu', 'right', 0);
    expect(next.left).toEqual(['sessions']);
    expect(next.right).toEqual(['cpu', 'globe']);
  });

  it('clamps an out-of-range index to the end', () => {
    const next = moveModule(base, 'globe', 'left', 999);
    expect(next.left).toEqual(['sessions', 'cpu', 'globe']);
    expect(next.right).toEqual([]);
  });

  it('does not mutate the input layout', () => {
    const snapshot = JSON.parse(JSON.stringify(base));
    moveModule(base, 'cpu', 'right', 0);
    expect(base).toEqual(snapshot);
  });
});

describe('hideModule', () => {
  it('removes a module from both columns', () => {
    const next = hideModule(base, 'cpu');
    expect(next.left).toEqual(['sessions']);
    expect(hiddenModules(next)).toContain('cpu');
  });
});

describe('hiddenModules', () => {
  it('reports every module not shown in a column', () => {
    const hidden = hiddenModules(base);
    const shown = new Set([...base.left, ...base.right]);
    expect(hidden.every((m) => !shown.has(m))).toBe(true);
    expect(hidden.length).toBe(ALL_MODULES.length - shown.size);
  });

  it('reports nothing hidden for the default layout has consistent totals', () => {
    const hidden = hiddenModules(DEFAULT_LAYOUT);
    const shown = DEFAULT_LAYOUT.left.length + DEFAULT_LAYOUT.right.length;
    expect(hidden.length + shown).toBe(ALL_MODULES.length);
  });
});
