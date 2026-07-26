import { useRef, useState } from 'react';
import { TerminalPane } from './TerminalPane';
import { useTabs } from './tabsStore';

export function TerminalArea() {
  const {
    tabs,
    activeTabId,
    newTab,
    closeTab,
    setActiveTab,
    renameTab,
    splitActive,
    closePane,
    setActivePane,
    setPaneSizes,
    updatePane,
  } = useTabs();

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];
  const panesRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');

  const beginEdit = (id: string, title: string) => {
    setEditingId(id);
    setEditVal(title);
  };
  const commitEdit = () => {
    if (editingId) renameTab(editingId, editVal);
    setEditingId(null);
  };

  const panes = activeTab?.panes ?? [];
  const sizes = activeTab?.sizes ?? panes.map(() => 1);

  // Drag a divider to reallocate flex-grow between two adjacent panes.
  const startResize = (index: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    const container = panesRef.current;
    if (!container || !activeTab) return;
    const startX = e.clientX;
    const width = container.getBoundingClientRect().width;
    const base = [...sizes];
    const total = base[index] + base[index + 1];
    const move = (ev: PointerEvent) => {
      const deltaRatio = ((ev.clientX - startX) / width) * panes.length;
      let a = base[index] + deltaRatio;
      let b = base[index + 1] - deltaRatio;
      const min = 0.2;
      if (a < min) {
        a = min;
        b = total - min;
      } else if (b < min) {
        b = min;
        a = total - min;
      }
      const next = [...base];
      next[index] = a;
      next[index + 1] = b;
      setPaneSizes(activeTab.id, next);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div className="term-area">
      <div className="tabbar">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab ${tab.id === activeTabId ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
            onDoubleClick={() => beginEdit(tab.id, tab.title)}
            title="Double-click to rename"
          >
            {editingId === tab.id ? (
              <input
                className="tab-edit"
                autoFocus
                value={editVal}
                onChange={(e) => setEditVal(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onBlur={commitEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitEdit();
                  if (e.key === 'Escape') setEditingId(null);
                }}
              />
            ) : (
              <span>{tab.title}</span>
            )}
            <button
              className="close"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
            >
              ✕
            </button>
          </div>
        ))}
        <button className="tab-add" onClick={() => newTab()} title="New terminal (Ctrl+Shift+T)">
          +
        </button>
        <button className="tab-add" onClick={splitActive} title="Split pane (Ctrl+Shift+D)">
          ⬒
        </button>
      </div>

      <div className="panes" ref={panesRef}>
        {panes.map((pane, i) => (
          <div className="pane-slot" key={pane.id} style={{ flexGrow: sizes[i] ?? 1 }}>
            <TerminalPane
              spec={pane}
              focused={pane.id === activeTab.activePaneId}
              canClose={panes.length > 1}
              onFocus={() => setActivePane(activeTab.id, pane.id)}
              onClose={() => closePane(activeTab.id, pane.id)}
              onCwd={(path) => updatePane(activeTab.id, pane.id, { cwd: path })}
              onTitle={(title) =>
                updatePane(activeTab.id, pane.id, {
                  title: pane.title === 'local' ? title : pane.title,
                })
              }
            />
            {i < panes.length - 1 && (
              <div className="pane-splitter" onPointerDown={startResize(i)} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
