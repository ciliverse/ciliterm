import { useControl } from '../hooks/useControl';
import { useTabs } from './Terminal/tabsStore';
import { isShowcase } from '../showcase';

export function SessionBar() {
  const showcase = isShowcase();
  const { sessions, send } = useControl();
  const { attachSession, newTab } = useTabs();

  return (
    <div className="panel">
      <div className="panel-title">
        <span>Sessions</span>
        {!showcase && (
          <button className="mini-btn" onClick={() => newTab()}>
            + new
          </button>
        )}
        {showcase && <span className="sub">demo replay</span>}
      </div>
      <div className="list">
        {sessions.length === 0 && <div className="metric-row">no persistent sessions</div>}
        {sessions.map((s) => (
          <div key={s.name} className="list-item">
            <span className="name" onClick={() => attachSession(s.name)} title="attach">
              <span className="mono">{s.kind === 'tmux' ? '⧉' : '▸'}</span> {s.name}
              {s.attached ? ' •' : ''}
            </span>
            {!showcase && (
              <span className="row-actions">
                <button
                  className="mini-btn"
                  onClick={() => {
                    const next = prompt('Rename session', s.name);
                    if (next && next !== s.name)
                      send({ t: 'sessions.rename', name: s.name, newName: next });
                  }}
                >
                  ✎
                </button>
                <button
                  className="mini-btn danger"
                  onClick={() => {
                    if (confirm(`Kill session ${s.name}?`))
                      send({ t: 'sessions.kill', name: s.name });
                  }}
                >
                  ✕
                </button>
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
