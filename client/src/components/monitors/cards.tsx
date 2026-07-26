import type { Metrics } from '@ciliterm/shared';
import { Sparkline } from './Sparkline';
import { bytes, rate, uptime } from '../../utils/format';
import { resolveTheme } from '../../theme/themes';
import { useSettings } from '../../settings/settings';
import type { MetricsHistory } from '../../hooks/useMetricsHistory';

interface CardProps {
  metrics: Metrics | null;
  hist: MetricsHistory;
  onKill?: (pid: number, signal?: 'SIGTERM' | 'SIGKILL' | 'SIGINT') => void;
}

function useColors() {
  const { settings } = useSettings();
  return resolveTheme(settings.themeId, settings.customThemes).colors;
}

function Waiting({ title }: { title: string }) {
  return (
    <div className="panel">
      <div className="panel-title">{title}</div>
      <div className="metric-row">waiting for metrics…</div>
    </div>
  );
}

export function CpuCard({ metrics, hist }: CardProps) {
  const colors = useColors();
  if (!metrics) return <Waiting title="CPU" />;
  const { cpu } = metrics;
  return (
    <div className="panel">
      <div className="panel-title">
        <span>CPU</span>
        <span className="sub">{cpu.cores} cores</span>
      </div>
      <div className="metric-row">
        <span>{cpu.model || 'processor'}</span>
        <b>{cpu.load.toFixed(1)}%</b>
      </div>
      <div className={`bar ${cpu.load > 85 ? 'warn' : ''}`}>
        <span style={{ width: `${cpu.load}%` }} />
      </div>
      <Sparkline data={hist.cpu} color={colors.primary} />
    </div>
  );
}

export function MemoryCard({ metrics, hist }: CardProps) {
  const colors = useColors();
  if (!metrics) return <Waiting title="Memory" />;
  const { mem } = metrics;
  return (
    <div className="panel">
      <div className="panel-title">
        <span>Memory</span>
        <span className="sub">{bytes(mem.total)}</span>
      </div>
      <div className="metric-row">
        <span>
          {bytes(mem.used)} / {bytes(mem.total)}
        </span>
        <b>{mem.usedPct.toFixed(1)}%</b>
      </div>
      <div className={`bar ${mem.usedPct > 85 ? 'warn' : ''}`}>
        <span style={{ width: `${mem.usedPct}%` }} />
      </div>
      <Sparkline data={hist.mem} color={colors.green} />
      {mem.swapUsedPct !== null && (
        <div className="metric-row" style={{ marginTop: 4 }}>
          <span>swap</span>
          <b>{mem.swapUsedPct.toFixed(0)}%</b>
        </div>
      )}
    </div>
  );
}

export function NetworkCard({ metrics, hist }: CardProps) {
  const colors = useColors();
  if (!metrics) return <Waiting title="Network" />;
  const { net } = metrics;
  return (
    <div className="panel">
      <div className="panel-title">
        <span>Network</span>
        <span className="sub">{net.iface}</span>
      </div>
      <div className="metric-row">
        <span style={{ color: colors.primary }}>↓ {rate(net.rxBytesPerSec)}</span>
        <span style={{ color: colors.secondary }}>↑ {rate(net.txBytesPerSec)}</span>
      </div>
      <Sparkline
        data={hist.rx}
        data2={hist.tx}
        color={colors.primary}
        color2={colors.secondary}
        height={64}
      />
    </div>
  );
}

export function DiskCard({ metrics }: CardProps) {
  if (!metrics) return <Waiting title="Disk" />;
  return (
    <div className="panel">
      <div className="panel-title">Disk</div>
      <div className="list" style={{ maxHeight: 140 }}>
        {metrics.disk.map((d) => (
          <div key={d.mount}>
            <div className="metric-row">
              <span className="name" title={`${d.fs} → ${d.mount}`}>
                {d.mount}
              </span>
              <b>{d.usePct.toFixed(0)}%</b>
            </div>
            <div className={`bar ${d.usePct > 90 ? 'warn' : ''}`}>
              <span style={{ width: `${d.usePct}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProcessesCard({ metrics, onKill }: CardProps) {
  if (!metrics) return <Waiting title="Processes" />;
  const kill = (pid: number, name: string) => {
    if (!onKill) return;
    if (window.confirm(`Kill process ${name} (pid ${pid})?`)) onKill(pid);
  };
  return (
    <div className="panel">
      <div className="panel-title">
        <span>Processes</span>
        <span className="sub">top cpu</span>
      </div>
      <div className="list">
        {metrics.processes.map((p) => {
          const level = p.cpu >= 80 ? 'danger' : p.cpu >= 40 ? 'warn' : '';
          return (
            <div key={p.pid} className={`list-item proc-row ${level}`}>
              <span className="name">
                <span className="mono">{p.pid}</span> {p.name}
              </span>
              <span className="proc-right">
                <b>{p.cpu.toFixed(1)}%</b>
                {onKill && (
                  <button
                    className="proc-kill"
                    title={`kill ${p.name}`}
                    onClick={() => kill(p.pid, p.name)}
                  >
                    ✕
                  </button>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SysInfoCard({ metrics }: CardProps) {
  if (!metrics) return <Waiting title="System Info" />;
  const { host, latency } = metrics;
  return (
    <div className="panel">
      <div className="panel-title">System Info</div>
      <div className="metric-row">
        <span>host</span>
        <b>{host.hostname}</b>
      </div>
      <div className="metric-row">
        <span>os</span>
        <b>
          {host.platform} / {host.arch}
        </b>
      </div>
      <div className="metric-row">
        <span>ip</span>
        <b>{host.ip}</b>
      </div>
      <div className="metric-row">
        <span>uptime</span>
        <b>{uptime(host.uptime)}</b>
      </div>
      <div className="metric-row">
        <span>latency</span>
        <b>{latency !== null ? `${latency.toFixed(0)} ms` : 'n/a'}</b>
      </div>
    </div>
  );
}
