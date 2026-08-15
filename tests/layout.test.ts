import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LAYOUT,
  hiddenModules,
  hideModule,
  moveModule,
  normalizeLayout,
  maxColWidth,
  openCenterTerminal,
  isTerminal,
  MIN_COL_WIDTH,
  MAX_COL_WIDTH,
  ALL_MODULES,
  type Layout,
} from '../client/src/layout/layout';

const base: Layout = {
  left: ['sessions', 'cpu'],
  right: ['globe'],
  header: ['clock'],
  center: ['terminal'],
  widths: { left: 300, right: 340 },
  heights: { globe: 380 },
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

  it('can hide the clock and terminal slots', () => {
    const next = hideModule(hideModule(base, 'clock'), 'terminal');
    expect(next.header).toEqual([]);
    expect(next.center).toEqual([]);
    expect(hiddenModules(next)).toEqual(expect.arrayContaining(['clock', 'terminal']));
  });
});

describe('hiddenModules', () => {
  it('reports every module not shown in a slot', () => {
    const hidden = hiddenModules(base);
    const shown = new Set([...base.left, ...base.right, ...base.header, ...base.center]);
    expect(hidden.every((m) => !shown.has(m))).toBe(true);
    expect(hidden.length).toBe(ALL_MODULES.length - shown.size);
  });

  it('reports nothing hidden for the default layout has consistent totals', () => {
    const hidden = hiddenModules(DEFAULT_LAYOUT);
    const shown =
      DEFAULT_LAYOUT.left.length +
      DEFAULT_LAYOUT.right.length +
      DEFAULT_LAYOUT.header.length +
      DEFAULT_LAYOUT.center.length;
    expect(hidden.length + shown).toBe(ALL_MODULES.length);
  });
});

describe('normalizeLayout', () => {
  it('fills header, center and heights on old layouts', () => {
    const next = normalizeLayout({
      left: ['cpu'],
      right: ['globe'],
      widths: { left: 280, right: 300 },
    });
    expect(next.header).toEqual(['clock']);
    expect(next.center).toEqual(['terminal']);
    expect(next.heights.globe).toBe(380);
    expect(next.left).toEqual(['cpu']);
  });
});

describe('maxColWidth', () => {
  it('caps at MAX_COL_WIDTH when center is occupied', () => {
    expect(maxColWidth(280, 1400, true)).toBe(MAX_COL_WIDTH);
  });

  it('lets columns meet when center is empty', () => {
    expect(maxColWidth(400, 1200, false)).toBe(800);
  });

  it('never goes below MIN_COL_WIDTH', () => {
    expect(maxColWidth(2000, 400, false)).toBe(MIN_COL_WIDTH);
  });
});

describe('openCenterTerminal', () => {
  it('restores terminal and shrinks columns that ate the center', () => {
    const next = openCenterTerminal(
      {
        ...DEFAULT_LAYOUT,
        center: [],
        widths: { left: 800, right: 400 },
      },
      1200,
    );
    expect(next.center).toEqual(['terminal']);
    expect(next.widths.left + next.widths.right).toBeLessThanOrEqual(1200 - 280);
  });

  it('keeps a side terminal in place and opens a new one in the center', () => {
    const next = openCenterTerminal(
      {
        ...DEFAULT_LAYOUT,
        left: [...DEFAULT_LAYOUT.left, 'terminal'],
        center: [],
      },
      1400,
    );
    expect(next.left).toContain('terminal');
    expect(next.center).toHaveLength(1);
    expect(next.center[0]).not.toBe('terminal');
    expect(isTerminal(next.center[0])).toBe(true);
  });
});
