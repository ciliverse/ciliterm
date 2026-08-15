import { useEffect, useState } from 'react';

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

export function Clock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const time = now.toLocaleTimeString('en-GB', { hour12: false });
  const date = now.toISOString().slice(0, 10);

  return (
    <div className="stat">
      <b>{time}</b>
      <span>{date}</span>
      <span>{TZ}</span>
    </div>
  );
}

export function ClockPanel() {
  return (
    <div className="panel">
      <div className="panel-title">
        <span>Clock</span>
      </div>
      <Clock />
    </div>
  );
}
