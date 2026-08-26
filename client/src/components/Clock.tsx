import { useEffect, useRef } from 'react';

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const TZ_LABEL = TZ.replace(/_/g, ' ').replace('/', ' / ');

function pad(n: number, width = 2): string {
  return n.toString().padStart(width, '0');
}

function splitTime(now: Date) {
  return {
    hms: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
    ms: pad(now.getMilliseconds(), 3),
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
  };
}

export function Clock() {
  const start = splitTime(new Date());
  const hmsRef = useRef<HTMLSpanElement>(null);
  const msRef = useRef<HTMLSpanElement>(null);
  const dateRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let lastHms = start.hms;
    let lastDate = start.date;
    const id = window.setInterval(() => {
      const t = splitTime(new Date());
      if (msRef.current) msRef.current.textContent = `.${t.ms}`;
      if (hmsRef.current && t.hms !== lastHms) {
        hmsRef.current.textContent = t.hms;
        lastHms = t.hms;
      }
      if (dateRef.current && t.date !== lastDate) {
        dateRef.current.textContent = t.date;
        lastDate = t.date;
      }
    }, 80);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="clock">
      <div className="clock-time">
        <span className="clock-hms" ref={hmsRef}>
          {start.hms}
        </span>
        <span className="clock-ms" ref={msRef}>
          .{start.ms}
        </span>
      </div>
      <div className="clock-meta">
        <span className="clock-date" ref={dateRef}>
          {start.date}
        </span>
        <span className="clock-tz">{TZ_LABEL}</span>
      </div>
    </div>
  );
}

export function ClockPanel() {
  return (
    <div className="panel clock-panel">
      <div className="panel-title">
        <span>Clock</span>
      </div>
      <Clock />
    </div>
  );
}
