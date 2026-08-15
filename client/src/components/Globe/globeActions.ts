export interface GlobePane {
  create?: { hostId?: string };
}

export interface GlobeTab {
  id: string;
  panes: GlobePane[];
}

export function findTabForHost(tabs: GlobeTab[], hostId: string): GlobeTab | null {
  return tabs.find((tab) => tab.panes.some((p) => p.create?.hostId === hostId)) ?? null;
}

export function resolveGlobeAction(
  point: { hostId?: string },
  tabs: GlobeTab[],
): 'jump' | 'connect' | null {
  if (!point.hostId) return null;
  return findTabForHost(tabs, point.hostId) ? 'jump' : 'connect';
}
