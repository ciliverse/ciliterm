import { useState } from 'react';
import type { SshHost, SshHostInput } from '@ciliterm/shared';
import { useControl } from '../hooks/useControl';
import { useTabs } from './Terminal/tabsStore';

const EMPTY: SshHostInput = { label: '', host: '', port: 22, user: '', keyPath: '', group: '' };

export function SshManager() {
  const { hosts, send, status } = useControl();
  const { connectHost } = useTabs();
  const [editing, setEditing] = useState<SshHostInput | null>(null);

  const save = (host: SshHostInput) => {
    send({
      t: 'hosts.save',
      host: {
        ...host,
        label: host.label.trim(),
        host: host.host.trim(),
        user: host.user.trim(),
        keyPath: host.keyPath?.trim() || undefined,
        group: host.group?.trim() || undefined,
      },
    });
    setEditing(null);
  };

  return (
    <div className="panel">
      <div className="panel-title">
        <span>SSH Hosts</span>
        <span className="row-actions">
          {status !== 'open' && <span className="sub">offline</span>}
          <button className="mini-btn" onClick={() => setEditing({ ...EMPTY })}>
            + add
          </button>
        </span>
      </div>
      <div className="list">
        {hosts.length === 0 && <div className="metric-row">no saved hosts</div>}
        {hosts.map((h) => (
          <div key={h.id} className="list-item">
            <span
              className="name"
              onClick={() => connectHost(h.id, h.label)}
              title={`ssh ${h.user}@${h.host}:${h.port}`}
            >
              <span className="mono">⇄</span> {h.label}
            </span>
            <span className="row-actions">
              <button className="mini-btn" onClick={() => setEditing(h)}>
                ✎
              </button>
              <button className="mini-btn danger" onClick={() => send({ t: 'hosts.delete', id: h.id })}>
                ✕
              </button>
            </span>
          </div>
        ))}
      </div>

      {editing && <HostModal initial={editing} onCancel={() => setEditing(null)} onSave={save} />}
    </div>
  );
}

function HostModal({
  initial,
  onCancel,
  onSave,
}: {
  initial: SshHostInput;
  onCancel: () => void;
  onSave: (host: SshHostInput) => void;
}) {
  const [value, setValue] = useState<SshHostInput>(initial);
  const set = (patch: Partial<SshHost>) => setValue((v) => ({ ...v, ...patch }));

  const missing: string[] = [];
  if (!value.label.trim()) missing.push('Label');
  if (!value.host.trim()) missing.push('Host');
  if (!value.user.trim()) missing.push('User');
  const valid = missing.length === 0;

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h3>{value.id ? 'EDIT HOST' : 'NEW HOST'}</h3>
        <div className="field">
          <label>Label *</label>
          <input autoFocus value={value.label} onChange={(e) => set({ label: e.target.value })} />
        </div>
        <div className="field">
          <label>Host *</label>
          <input
            value={value.host}
            onChange={(e) => set({ host: e.target.value })}
            placeholder="example.com or 10.0.0.5"
          />
        </div>
        <div className="field">
          <label>User *</label>
          <input value={value.user} onChange={(e) => set({ user: e.target.value })} placeholder="root" />
        </div>
        <div className="field">
          <label>Port</label>
          <input
            type="number"
            value={value.port ?? 22}
            onChange={(e) => set({ port: Number(e.target.value) || 22 })}
          />
        </div>
        <div className="field">
          <label>Key path (optional)</label>
          <input
            value={value.keyPath ?? ''}
            onChange={(e) => set({ keyPath: e.target.value })}
            placeholder="~/.ssh/id_ed25519"
          />
          <div className="sub">Leave empty to use ssh-agent, or type your password in the terminal when prompted.</div>
        </div>
        {!valid && (
          <div className="metric-row" style={{ color: 'var(--orange)' }}>
            required: {missing.join(', ')}
          </div>
        )}
        <div className="modal-actions">
          <button className="mini-btn" onClick={onCancel}>
            cancel
          </button>
          <button
            className="mini-btn"
            disabled={!valid}
            style={{ opacity: valid ? 1 : 0.4, cursor: valid ? 'pointer' : 'not-allowed' }}
            onClick={() => valid && onSave(value)}
          >
            save
          </button>
        </div>
      </div>
    </div>
  );
}
