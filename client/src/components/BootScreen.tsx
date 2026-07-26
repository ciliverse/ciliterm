import { useEffect, useRef, useState } from 'react';

const STEPS = [
  'ciliterm bootloader v0.1.0',
  'initializing render pipeline',
  'mounting virtual filesystem',
  'spawning pty subsystem',
  'linking transport /pty /control /sys',
  'calibrating globe telemetry',
  'loading theme engine',
  'restoring workspace layout',
  'system online',
];

/** Pseudo boot timestamp so the log reads like a kernel trace. */
function ts(i: number): string {
  const v = (i * 0.37 + (i % 3) * 0.08 + 0.12).toFixed(2);
  return v.padStart(5, ' ');
}

export function BootScreen({ onDone }: { onDone: () => void }) {
  const [count, setCount] = useState(0);
  const [exiting, setExiting] = useState(false);
  const doneRef = useRef(false);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    setExiting(true);
    setTimeout(onDone, 560);
  };

  useEffect(() => {
    if (count < STEPS.length) {
      const t = setTimeout(() => setCount((c) => c + 1), count === 0 ? 320 : 210);
      return () => clearTimeout(t);
    }
    const t = setTimeout(finish, 650);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  useEffect(() => {
    const skip = () => finish();
    window.addEventListener('keydown', skip);
    window.addEventListener('pointerdown', skip);
    return () => {
      window.removeEventListener('keydown', skip);
      window.removeEventListener('pointerdown', skip);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const progress = Math.round((count / STEPS.length) * 100);
  const ready = count >= STEPS.length;

  return (
    <div className={`boot ${exiting ? 'boot-exit' : ''}`} role="dialog" aria-label="booting">
      <div className="boot-scan" />
      <div className="boot-inner">
        <div className="boot-logo" data-text="CILITERM">
          CILITERM
        </div>
        <div className="boot-sub">// web terminal · secure shell workstation</div>

        <div className="boot-log">
          {STEPS.slice(0, count).map((s, i) => (
            <div className="boot-line" key={s}>
              <span className="boot-ts">[{ts(i)}]</span>
              <span className="boot-ok">OK</span>
              <span className="boot-msg">{s}</span>
            </div>
          ))}
          {ready && (
            <div className="boot-line boot-ready">
              <span className="boot-msg">ENTERING SHELL</span>
              <span className="boot-cursor">▋</span>
            </div>
          )}
        </div>

        <div className="boot-progress">
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className="boot-hint">press any key to skip</div>
      </div>
    </div>
  );
}
