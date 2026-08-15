import { describe, it, expect } from 'vitest';
import { findTabForHost, resolveGlobeAction } from '../client/src/components/Globe/globeActions';

const tabs = [
  { id: 't-local', panes: [{ create: {} }] },
  { id: 't-prod', panes: [{ create: { hostId: 'h-prod' } }] },
];

describe('findTabForHost', () => {
  it('returns the tab whose pane was created for that host', () => {
    expect(findTabForHost(tabs, 'h-prod')?.id).toBe('t-prod');
    expect(findTabForHost(tabs, 'missing')).toBeNull();
  });
});

describe('resolveGlobeAction', () => {
  it('jumps when a tab is already open for the host', () => {
    expect(resolveGlobeAction({ hostId: 'h-prod' }, tabs)).toBe('jump');
  });

  it('connects when the host has no open tab', () => {
    expect(resolveGlobeAction({ hostId: 'h-new' }, tabs)).toBe('connect');
  });

  it('does nothing for a bare connection', () => {
    expect(resolveGlobeAction({ ip: '1.1.1.1' }, tabs)).toBeNull();
  });
});
