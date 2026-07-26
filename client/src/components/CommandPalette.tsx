import { useEffect, useMemo, useRef, useState } from 'react';

export interface Command {
  id: string;
  title: string;
  /** Small right-aligned hint (shortcut or category). */
  hint?: string;
  /** Extra searchable terms. */
  keywords?: string;
  run: () => void;
}

/** Subsequence match with a light score; returns null when it doesn't match. */
function score(query: string, text: string): number | null {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  const idx = t.indexOf(q);
  if (idx >= 0) return 1000 - idx; // contiguous match ranks highest
  let qi = 0;
  let last = -1;
  let gaps = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      if (last >= 0) gaps += i - last - 1;
      last = i;
      qi++;
    }
  }
  return qi === q.length ? 100 - gaps : null;
}

export function CommandPalette({
  commands,
  onClose,
}: {
  commands: Command[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const scored = commands
      .map((c) => ({ c, s: score(query, `${c.title} ${c.keywords ?? ''}`) }))
      .filter((r): r is { c: Command; s: number } => r.s !== null)
      .sort((a, b) => b.s - a.s);
    return scored.map((r) => r.c);
  }, [commands, query]);

  useEffect(() => {
    setSel(0);
  }, [query]);

  useEffect(() => {
    listRef.current?.querySelector('.cmd-item.sel')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const choose = (cmd: Command | undefined) => {
    if (!cmd) return;
    onClose();
    cmd.run();
  };

  return (
    <div className="cmd-backdrop" onMouseDown={onClose}>
      <div className="cmd-palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          autoFocus
          className="cmd-input"
          placeholder="Type a command, SSH host, or session…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setSel((s) => Math.min(s + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setSel((s) => Math.max(s - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              choose(results[sel]);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onClose();
            }
          }}
        />
        <div className="cmd-list" ref={listRef}>
          {results.length === 0 && <div className="cmd-empty">no matching commands</div>}
          {results.map((c, i) => (
            <div
              key={c.id}
              className={`cmd-item ${i === sel ? 'sel' : ''}`}
              onMouseEnter={() => setSel(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(c);
              }}
            >
              <span className="cmd-title">{c.title}</span>
              {c.hint && <span className="cmd-hint">{c.hint}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
