import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { PaneSpec } from './TerminalPane';

export interface Pane extends PaneSpec {
  title: string;
  cwd?: string;
}

export interface Tab {
  id: string;
  title: string;
  /** Set true once the user renames the tab, so auto-titles stop overriding it. */
  renamed?: boolean;
  panes: Pane[];
  activePaneId: string;
  /** Flex ratios per pane (same length as panes). Undefined = equal split. */
  sizes?: number[];
}

const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

function makePane(spec: Omit<PaneSpec, 'id'>, title: string): Pane {
  return { id: uid(), title, ...spec };
}

interface TabsContextValue {
  tabs: Tab[];
  activeTabId: string;
  activeCwd: string | undefined;
  newTab: (spec?: Omit<PaneSpec, 'id'>, title?: string) => void;
  attachSession: (name: string) => void;
  connectHost: (hostId: string, label: string) => void;
  closeTab: (id: string) => void;
  closeActiveTab: () => void;
  setActiveTab: (id: string) => void;
  nextTab: () => void;
  prevTab: () => void;
  selectTabIndex: (index: number) => void;
  renameTab: (id: string, title: string) => void;
  splitActive: () => void;
  closePane: (tabId: string, paneId: string) => void;
  setActivePane: (tabId: string, paneId: string) => void;
  setPaneSizes: (tabId: string, sizes: number[]) => void;
  updatePane: (tabId: string, paneId: string, patch: Partial<Pane>) => void;
  setTabTitleAuto: (tabId: string, title: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

export function TabsProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<Tab[]>(() => {
    const pane = makePane({ create: {} }, 'local');
    return [{ id: uid(), title: 'local', panes: [pane], activePaneId: pane.id }];
  });
  const [activeTabId, setActiveTabId] = useState<string>(() => '');

  // Ensure an active tab id once tabs exist.
  const effectiveActive =
    activeTabId && tabs.some((t) => t.id === activeTabId) ? activeTabId : tabs[0]?.id;

  const addTab = useCallback((pane: Pane, title: string) => {
    const tab: Tab = { id: uid(), title, panes: [pane], activePaneId: pane.id };
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
  }, []);

  const newTab = useCallback(
    (spec: Omit<PaneSpec, 'id'> = { create: {} }, title = 'local') => {
      addTab(makePane(spec, title), title);
    },
    [addTab],
  );

  const attachSession = useCallback(
    (name: string) => addTab(makePane({ attach: name }, name), name),
    [addTab],
  );

  const connectHost = useCallback(
    (hostId: string, label: string) => addTab(makePane({ create: { hostId } }, label), label),
    [addTab],
  );

  const closeTab = useCallback((id: string) => {
    setTabs((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const closeActiveTab = useCallback(() => {
    setTabs((prev) => (prev.length > 1 ? prev.filter((t) => t.id !== effectiveActive) : prev));
  }, [effectiveActive]);

  const selectTabIndex = useCallback(
    (index: number) => {
      const tab = tabs[index];
      if (tab) setActiveTabId(tab.id);
    },
    [tabs],
  );

  const nextTab = useCallback(() => {
    const i = tabs.findIndex((t) => t.id === effectiveActive);
    if (i >= 0 && tabs.length > 1) setActiveTabId(tabs[(i + 1) % tabs.length].id);
  }, [tabs, effectiveActive]);

  const prevTab = useCallback(() => {
    const i = tabs.findIndex((t) => t.id === effectiveActive);
    if (i >= 0 && tabs.length > 1)
      setActiveTabId(tabs[(i - 1 + tabs.length) % tabs.length].id);
  }, [tabs, effectiveActive]);

  const renameTab = useCallback((id: string, title: string) => {
    const clean = title.trim();
    if (!clean) return;
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, title: clean, renamed: true } : t)));
  }, []);

  const setTabTitleAuto = useCallback((tabId: string, title: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === tabId && !t.renamed ? { ...t, title } : t)),
    );
  }, []);

  const splitActive = useCallback(() => {
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== effectiveActive) return t;
        if (t.panes.length >= 3) return t;
        const pane = makePane({ create: {} }, 'split');
        const panes = [...t.panes, pane];
        return {
          ...t,
          panes,
          activePaneId: pane.id,
          sizes: panes.map(() => 1),
        };
      }),
    );
  }, [effectiveActive]);

  const setPaneSizes = useCallback((tabId: string, sizes: number[]) => {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, sizes } : t)));
  }, []);

  const closePane = useCallback((tabId: string, paneId: string) => {
    setTabs((prev) =>
      prev
        .map((t) => {
          if (t.id !== tabId) return t;
          const panes = t.panes.filter((p) => p.id !== paneId);
          if (panes.length === 0) return null;
          return { ...t, panes, activePaneId: panes[0].id, sizes: panes.map(() => 1) };
        })
        .filter((t): t is Tab => t !== null),
    );
  }, []);

  const setActivePane = useCallback((tabId: string, paneId: string) => {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, activePaneId: paneId } : t)));
  }, []);

  const updatePane = useCallback((tabId: string, paneId: string, patch: Partial<Pane>) => {
    setTabs((prev) =>
      prev.map((t) =>
        t.id === tabId
          ? { ...t, panes: t.panes.map((p) => (p.id === paneId ? { ...p, ...patch } : p)) }
          : t,
      ),
    );
  }, []);

  const activeCwd = useMemo(() => {
    const tab = tabs.find((t) => t.id === effectiveActive);
    const pane = tab?.panes.find((p) => p.id === tab.activePaneId);
    return pane?.cwd;
  }, [tabs, effectiveActive]);

  const value: TabsContextValue = {
    tabs,
    activeTabId: effectiveActive ?? '',
    activeCwd,
    newTab,
    attachSession,
    connectHost,
    closeTab,
    closeActiveTab,
    setActiveTab: setActiveTabId,
    nextTab,
    prevTab,
    selectTabIndex,
    renameTab,
    splitActive,
    closePane,
    setActivePane,
    setPaneSizes,
    updatePane,
    setTabTitleAuto,
  };

  return <TabsContext.Provider value={value}>{children}</TabsContext.Provider>;
}

export function useTabs(): TabsContextValue {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('useTabs must be used within TabsProvider');
  return ctx;
}
