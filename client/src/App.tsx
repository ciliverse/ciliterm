import {
  Suspense,
  lazy,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useSettings } from './settings/settings';
import { applyTheme, applyCrtIntensity, resolveTheme } from './theme/themes';
import { moveModule, hideModule, type ColumnId, type ModuleId } from './layout/layout';
import { useMetrics } from './hooks/useMetrics';
import { useMetricsHistory } from './hooks/useMetricsHistory';
import { useControl } from './hooks/useControl';
import { useTabs } from './components/Terminal/tabsStore';
import { TerminalArea } from './components/Terminal/TerminalArea';
import {
  CpuCard,
  MemoryCard,
  NetworkCard,
  DiskCard,
  ProcessesCard,
  SysInfoCard,
} from './components/monitors/cards';
import { Filesystem } from './components/Filesystem';
import { Keyboard } from './components/Keyboard';
import { SessionBar } from './components/SessionBar';
import { SshManager } from './components/SshManager';
import { LayoutSidebar } from './components/LayoutSidebar';
import { SettingsModal } from './components/SettingsModal';
import { BootScreen } from './components/BootScreen';
import { CommandPalette, type Command } from './components/CommandPalette';
import { Clock } from './components/Clock';
import { PanelErrorBoundary } from './components/PanelErrorBoundary';
import { rate } from './utils/format';
import { isShowcase } from './showcase';

// three.js + three-globe are heavy; load them only when the Globe panel renders.
const Globe = lazy(() => import('./components/Globe/Globe').then((m) => ({ default: m.Globe })));

export function App() {
  const showcase = isShowcase();
  const { settings, update } = useSettings();
  const { metrics, status: sysStatus, kill } = useMetrics(
    // Showcase needs snappy ticks so bars/sparklines visibly animate.
    showcase ? Math.min(settings.sysIntervalMs, 700) : settings.sysIntervalMs,
    settings.includeProcesses,
  );
  const hist = useMetricsHistory(metrics);
  const { status: ctrlStatus, hosts, sessions } = useControl();
  const {
    activeCwd,
    newTab,
    splitActive,
    closeActiveTab,
    nextTab,
    prevTab,
    attachSession,
    connectHost,
  } = useTabs();
  const [showSettings, setShowSettings] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [booting, setBooting] = useState(settings.bootScreen);
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const { layout } = settings;

  // Close mobile drawers when returning to desktop width.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const onChange = () => {
      if (!mq.matches) {
        setLeftOpen(false);
        setRightOpen(false);
      }
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.add('theme-switching');
    applyTheme(resolveTheme(settings.themeId, settings.customThemes));
    applyCrtIntensity(settings.crtIntensity);
    const t = window.setTimeout(() => root.classList.remove('theme-switching'), 380);
    return () => clearTimeout(t);
  }, [settings.themeId, settings.customThemes, settings.crtIntensity]);

  useLayoutEffect(() => {
    document.documentElement.dataset.motion = settings.motion ? 'on' : 'off';
  }, [settings.motion]);

  const conn =
    ctrlStatus === 'open' && sysStatus === 'open'
      ? 'open'
      : ctrlStatus === 'closed'
        ? 'closed'
        : 'connecting';

  const commands = useMemo<Command[]>(() => {
    const base: Command[] = [
      { id: 'new-tab', title: 'New terminal tab', hint: 'Ctrl+Shift+T', run: () => newTab() },
      { id: 'split', title: 'Split pane', hint: 'Ctrl+Shift+D', run: splitActive },
      { id: 'close-tab', title: 'Close tab', hint: 'Ctrl+Shift+W', run: closeActiveTab },
      { id: 'next-tab', title: 'Next tab', hint: 'Ctrl+Shift+→', run: nextTab },
      { id: 'prev-tab', title: 'Previous tab', hint: 'Ctrl+Shift+←', run: prevTab },
      {
        id: 'toggle-kbd',
        title: `${settings.showKeyboard ? 'Hide' : 'Show'} on-screen keyboard`,
        keywords: 'keyboard',
        run: () => update({ showKeyboard: !settings.showKeyboard }),
      },
      { id: 'settings', title: 'Open settings', keywords: 'preferences theme layout', run: () => setShowSettings(true) },
    ];
    if (showcase) return base;
    const hostCmds: Command[] = hosts.map((h) => ({
      id: `ssh-${h.id}`,
      title: `Connect SSH: ${h.label}`,
      hint: `${h.user}@${h.host}`,
      keywords: `ssh connect ${h.host} ${h.user} ${h.group ?? ''}`,
      run: () => connectHost(h.id, h.label),
    }));
    const sessionCmds: Command[] = sessions.map((s) => ({
      id: `sess-${s.name}`,
      title: `Attach session: ${s.name}`,
      hint: 'session',
      keywords: `session attach tmux ${s.name}`,
      run: () => attachSession(s.name),
    }));
    return [...base, ...hostCmds, ...sessionCmds];
  }, [
    showcase,
    hosts,
    sessions,
    settings.showKeyboard,
    newTab,
    splitActive,
    closeActiveTab,
    nextTab,
    prevTab,
    connectHost,
    attachSession,
    update,
  ]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.shiftKey) {
        const k = e.key.toLowerCase();
        if (k === 'p') {
          e.preventDefault();
          setShowPalette((v) => !v);
        } else if (k === 't') {
          e.preventDefault();
          newTab();
        } else if (k === 'w') {
          e.preventDefault();
          closeActiveTab();
        } else if (k === 'd') {
          e.preventDefault();
          splitActive();
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          nextTab();
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          prevTab();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [newTab, closeActiveTab, splitActive, nextTab, prevTab]);

  const renderModule = (id: ModuleId): ReactNode => {
    switch (id) {
      case 'sessions':
        return <SessionBar />;
      case 'ssh':
        if (showcase) {
          return (
            <div className="panel">
              <div className="panel-title">
                <span>SSH Hosts</span>
                <span className="sub">disabled</span>
              </div>
              <div className="metric-row">showcase: SSH is disabled on the public demo</div>
            </div>
          );
        }
        return <SshManager />;
      case 'cpu':
        return <CpuCard metrics={metrics} hist={hist} />;
      case 'memory':
        return <MemoryCard metrics={metrics} hist={hist} />;
      case 'network':
        return <NetworkCard metrics={metrics} hist={hist} />;
      case 'disk':
        return <DiskCard metrics={metrics} hist={hist} />;
      case 'processes':
        return (
          <ProcessesCard metrics={metrics} hist={hist} onKill={showcase ? undefined : kill} />
        );
      case 'sysinfo':
        return <SysInfoCard metrics={metrics} hist={hist} />;
      case 'globe':
        return (
          <PanelErrorBoundary label="globe">
            <Suspense
              fallback={<div className="panel globe-panel globe-loading">loading globe…</div>}
            >
              <Globe lowPower={settings.lowPowerGlobe} />
            </Suspense>
          </PanelErrorBoundary>
        );
      case 'filesystem':
        // Showcase still shows the Files panel with simulated listings from the server.
        return <Filesystem cwd={showcase ? '/demo' : activeCwd} />;
    }
  };

  const onMove = (id: ModuleId, toCol: ColumnId, index: number) =>
    update({ layout: moveModule(layout, id, toCol, index) });
  const onHide = (id: ModuleId) => update({ layout: hideModule(layout, id) });

  const sidebar = (side: ColumnId, ids: ModuleId[]) =>
    (ids.length > 0 || dragging) && (
      <LayoutSidebar
        side={side}
        ids={ids}
        width={layout.widths[side]}
        dragging={dragging}
        renderModule={renderModule}
        onMove={onMove}
        onHide={onHide}
        onWidthChange={(width) =>
          update({ layout: { ...layout, widths: { ...layout.widths, [side]: width } } })
        }
        onDragStateChange={setDragging}
      />
    );

  const closeDrawers = () => {
    setLeftOpen(false);
    setRightOpen(false);
  };

  return (
    <div className={`app${settings.motion ? ' motion-on' : ''}`}>
      <header className="topbar">
        <button
          className={`toggle-btn mobile-only ${leftOpen ? 'active' : ''}`}
          onClick={() => {
            setLeftOpen((v) => !v);
            setRightOpen(false);
          }}
          title="Panels"
          aria-label="Toggle left panels"
        >
          ☰
        </button>
        <div className="brand">
          CILI<span className="accent">TERM</span>
        </div>
        {showcase && (
          <div className="stat showcase-badge" title="Public read-only exhibit — no host shell">
            <span className="badge-full">READ-ONLY DEMO</span>
            <span className="badge-short">DEMO</span>
          </div>
        )}
        {metrics && (
          <>
            <div className="stat desk-stat">
              CPU <b>{metrics.cpu.load.toFixed(0)}%</b>
            </div>
            <div className="stat desk-stat">
              MEM <b>{metrics.mem.usedPct.toFixed(0)}%</b>
            </div>
            <div className="stat desk-stat">
              NET <b>{rate(metrics.net.rxBytesPerSec + metrics.net.txBytesPerSec)}</b>
            </div>
            <div className="stat mobile-stat">
              <b>{metrics.cpu.load.toFixed(0)}%</b>
            </div>
          </>
        )}
        <div className="spacer" />
        <div className="toggle-group">
          <button
            className={`toggle-btn mobile-only ${rightOpen ? 'active' : ''}`}
            onClick={() => {
              setRightOpen((v) => !v);
              setLeftOpen(false);
            }}
            title="Globe / files"
            aria-label="Toggle right panels"
          >
            ◉
          </button>
          <button
            className="toggle-btn desk-only"
            onClick={() => setShowPalette(true)}
            title="Command palette (Ctrl+Shift+P)"
          >
            ⌘
          </button>
          <button
            className={`toggle-btn ${settings.showKeyboard ? 'active' : ''}`}
            onClick={() => update({ showKeyboard: !settings.showKeyboard })}
          >
            KBD
          </button>
          <button className="toggle-btn" onClick={() => setShowSettings(true)}>
            ⚙
          </button>
        </div>
        <div className="desk-only">
          <Clock />
        </div>
        <span className={`conn-dot conn-${conn}`} title={`connection: ${conn}`} />
      </header>

      <div
        className={`body${leftOpen ? ' drawer-left-open' : ''}${rightOpen ? ' drawer-right-open' : ''}`}
      >
        {(leftOpen || rightOpen) && (
          <button
            type="button"
            className="drawer-scrim"
            aria-label="Close panels"
            onClick={closeDrawers}
          />
        )}
        {sidebar('left', layout.left)}

        <main className="center">
          <TerminalArea />
          {settings.showKeyboard && <Keyboard />}
        </main>

        {sidebar('right', layout.right)}
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showPalette && (
        <CommandPalette commands={commands} onClose={() => setShowPalette(false)} />
      )}
      {booting && <BootScreen onDone={() => setBooting(false)} />}
    </div>
  );
}
