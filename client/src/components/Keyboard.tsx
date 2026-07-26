import { useState } from 'react';
import { focusBus } from '../utils/focusBus';

type Role = 'shift' | 'caps';

interface Key {
  label: string;
  send: string;
  /** Payload/label when Shift is active (symbols, punctuation). */
  shiftLabel?: string;
  shiftSend?: string;
  /** Relative width in keyboard units (1u = a letter key). */
  u?: number;
  /** Modifier keys toggle state; control keys ignore Shift/Caps. */
  role?: Role;
  sticky?: boolean;
}

const letters = (chars: string): Key[] => [...chars].map((c) => ({ label: c, send: c }));

const symbols = (pairs: [string, string][]): Key[] =>
  pairs.map(([base, sh]) => ({ label: base, send: base, shiftLabel: sh, shiftSend: sh }));

// Every row sums to 15 units so all four edges line up into one solid block.
const ROWS: Key[][] = [
  [
    ...symbols([
      ['`', '~'],
      ['1', '!'],
      ['2', '@'],
      ['3', '#'],
      ['4', '$'],
      ['5', '%'],
      ['6', '^'],
      ['7', '&'],
      ['8', '*'],
      ['9', '('],
      ['0', ')'],
      ['-', '_'],
      ['=', '+'],
    ]),
    { label: '⌫', send: '\x7f', u: 2, sticky: true },
  ],
  [
    { label: 'Tab', send: '\t', u: 2, sticky: true },
    ...letters('qwertyuiop'),
    ...symbols([
      ['[', '{'],
      [']', '}'],
      ['\\', '|'],
    ]),
  ],
  [
    { label: 'Caps', send: '', u: 1.75, role: 'caps', sticky: true },
    ...letters('asdfghjkl'),
    ...symbols([
      [';', ':'],
      ["'", '"'],
    ]),
    { label: 'Enter', send: '\r', u: 2.25, sticky: true },
  ],
  [
    { label: '⇧', send: '', u: 2.25, role: 'shift', sticky: true },
    ...letters('zxcvbnm'),
    ...symbols([
      [',', '<'],
      ['.', '>'],
      ['/', '?'],
    ]),
    { label: 'Del', send: '\x1b[3~', u: 2.75, sticky: true },
  ],
  [
    { label: 'Esc', send: '\x1b', u: 1.5, sticky: true },
    { label: 'Ctrl+C', send: '\x03', u: 1.5, sticky: true },
    { label: 'Ctrl+D', send: '\x04', u: 1.5, sticky: true },
    { label: '←', send: '\x1b[D', u: 1, sticky: true },
    { label: '↑', send: '\x1b[A', u: 1, sticky: true },
    { label: '↓', send: '\x1b[B', u: 1, sticky: true },
    { label: '→', send: '\x1b[C', u: 1, sticky: true },
    { label: 'Space', send: ' ', u: 6.5 },
  ],
];

const isLetter = (s: string) => s.length === 1 && /[a-z]/i.test(s);

export function Keyboard() {
  const [shift, setShift] = useState(false);
  const [caps, setCaps] = useState(false);
  const upper = shift !== caps; // XOR: caps flips the shift state for letters

  const handle = (k: Key) => () => {
    if (k.role === 'shift') return setShift((s) => !s);
    if (k.role === 'caps') return setCaps((c) => !c);

    let payload = k.send;
    if (shift && k.shiftSend) payload = k.shiftSend;
    else if (isLetter(k.send) && upper) payload = k.send.toUpperCase();
    if (payload) focusBus.sendInput(payload);

    if (shift && !k.sticky) setShift(false); // one-shot shift
  };

  const display = (k: Key): string => {
    if (shift && k.shiftLabel) return k.shiftLabel;
    if (isLetter(k.send) && upper) return k.send.toUpperCase();
    return k.label;
  };

  return (
    <div className="panel keyboard">
      {ROWS.map((row, i) => (
        <div className="kb-row" key={i}>
          {row.map((k, j) => {
            const active = (k.role === 'shift' && shift) || (k.role === 'caps' && caps);
            return (
              <button
                className={`kb-key${active ? ' active' : ''}`}
                key={`${k.label}-${j}`}
                style={{ flex: `${k.u ?? 1} 1 0` }}
                onClick={handle(k)}
              >
                {display(k)}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
