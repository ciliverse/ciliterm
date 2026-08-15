import { useEffect, useState } from 'react';
import type { FsEntry } from '@ciliterm/shared';
import { getSys } from '../transport/clients';
import { focusBus } from '../utils/focusBus';
import { bytes } from '../utils/format';

export function Filesystem({ cwd }: { cwd: string | undefined }) {
  const [path, setPath] = useState<string | undefined>(cwd);
  const [entries, setEntries] = useState<FsEntry[]>([]);

  // Follow the active terminal's working directory.
  useEffect(() => {
    if (cwd) setPath(cwd);
  }, [cwd]);

  useEffect(() => {
    const sys = getSys();
    const off = sys.onMessage((msg) => {
      if (msg.t === 'fs.list') {
        setPath(msg.path);
        setEntries(msg.entries);
      }
    });
    return off;
  }, []);

  useEffect(() => {
    if (path) getSys().send({ t: 'fs.list', path });
  }, [path]);

  const join = (name: string) => (path ? `${path.replace(/\/$/, '')}/${name}` : name);

  return (
    <div className="panel">
      <div className="panel-title">
        <span>Files</span>
        <span className="sub" title={path}>
          {path ? shorten(path) : '—'}
        </span>
      </div>
      <div className="list">
        <div className="list-item" onClick={() => path && setPath(parent(path))}>
          <span className="name">📁 ..</span>
        </div>
        {entries.map((e) => (
          <div
            key={e.name}
            className="list-item"
            onClick={() =>
              e.isDir ? setPath(join(e.name)) : focusBus.sendInput(`'${join(e.name)}'`)
            }
            title={e.isDir ? 'open directory' : 'insert path into terminal'}
          >
            <span className="name">
              {e.isDir ? '📁' : '📄'} {e.name}
            </span>
            {!e.isDir && <span className="mono">{bytes(e.size)}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function parent(p: string): string {
  const trimmed = p.replace(/\/+$/, '');
  const idx = trimmed.lastIndexOf('/');
  return idx <= 0 ? '/' : trimmed.slice(0, idx);
}

function shorten(p: string): string {
  return p.length > 28 ? '…' + p.slice(-27) : p;
}
