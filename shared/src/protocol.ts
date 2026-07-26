import { z } from 'zod';

/**
 * ciliterm wire protocol - single source of truth shared by client and server.
 *
 * Three WebSocket endpoints:
 *  - /pty      one socket per terminal pane (I/O bound to one session)
 *  - /control  singleton control-plane (sessions + ssh hosts management)
 *  - /sys      metrics stream + filesystem listing
 *
 * All messages are discriminated unions keyed on `t`.
 */

// ---------------------------------------------------------------------------
// Shared value objects
// ---------------------------------------------------------------------------

export const SessionKind = z.enum(['tmux', 'managed']);
export type SessionKind = z.infer<typeof SessionKind>;

export const SessionInfo = z.object({
  name: z.string(),
  kind: SessionKind,
  title: z.string().optional(),
  attached: z.boolean().optional(),
});
export type SessionInfo = z.infer<typeof SessionInfo>;

export const SshHost = z.object({
  id: z.string(),
  label: z.string(),
  host: z.string(),
  port: z.number().int().positive().default(22),
  user: z.string(),
  keyPath: z.string().optional(),
  group: z.string().optional(),
});
export type SshHost = z.infer<typeof SshHost>;

export const SshHostInput = SshHost.partial({ id: true });
export type SshHostInput = z.infer<typeof SshHostInput>;

// ---------------------------------------------------------------------------
// /pty channel
// ---------------------------------------------------------------------------

export const PtyClientMessage = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('attach'),
    session: z.string(),
    cols: z.number().optional(),
    rows: z.number().optional(),
  }),
  z.object({
    t: z.literal('create'),
    name: z.string().optional(),
    command: z.string().optional(),
    hostId: z.string().optional(),
    cwd: z.string().optional(),
    cols: z.number().optional(),
    rows: z.number().optional(),
  }),
  z.object({ t: z.literal('input'), data: z.string() }),
  z.object({
    t: z.literal('resize'),
    cols: z.number().int().positive(),
    rows: z.number().int().positive(),
  }),
]);
export type PtyClientMessage = z.infer<typeof PtyClientMessage>;

export const PtyServerMessage = z.discriminatedUnion('t', [
  z.object({ t: z.literal('ready'), session: z.string(), kind: SessionKind }),
  z.object({ t: z.literal('output'), data: z.string() }),
  z.object({ t: z.literal('cwd'), path: z.string() }),
  z.object({ t: z.literal('exit'), code: z.number().nullable() }),
  z.object({ t: z.literal('error'), message: z.string() }),
]);
export type PtyServerMessage = z.infer<typeof PtyServerMessage>;

// ---------------------------------------------------------------------------
// /control channel
// ---------------------------------------------------------------------------

export const ControlClientMessage = z.discriminatedUnion('t', [
  z.object({ t: z.literal('sessions.list') }),
  z.object({ t: z.literal('sessions.rename'), name: z.string(), newName: z.string() }),
  z.object({ t: z.literal('sessions.kill'), name: z.string() }),
  z.object({ t: z.literal('hosts.list') }),
  z.object({ t: z.literal('hosts.save'), host: SshHostInput }),
  z.object({ t: z.literal('hosts.delete'), id: z.string() }),
]);
export type ControlClientMessage = z.infer<typeof ControlClientMessage>;

export const ControlServerMessage = z.discriminatedUnion('t', [
  z.object({ t: z.literal('sessions'), list: z.array(SessionInfo) }),
  z.object({ t: z.literal('hosts'), list: z.array(SshHost) }),
  z.object({ t: z.literal('error'), message: z.string() }),
]);
export type ControlServerMessage = z.infer<typeof ControlServerMessage>;

// ---------------------------------------------------------------------------
// /sys channel
// ---------------------------------------------------------------------------

export const CpuMetric = z.object({
  load: z.number(),
  cores: z.number(),
  model: z.string(),
});
export type CpuMetric = z.infer<typeof CpuMetric>;

export const MemMetric = z.object({
  usedPct: z.number(),
  total: z.number(),
  used: z.number(),
  free: z.number(),
  swapUsedPct: z.number().nullable(),
});
export type MemMetric = z.infer<typeof MemMetric>;

export const NetMetric = z.object({
  iface: z.string(),
  rxBytesPerSec: z.number(),
  txBytesPerSec: z.number(),
});
export type NetMetric = z.infer<typeof NetMetric>;

export const DiskMetric = z.object({
  fs: z.string(),
  mount: z.string(),
  usePct: z.number(),
  used: z.number(),
  size: z.number(),
});
export type DiskMetric = z.infer<typeof DiskMetric>;

export const ProcessMetric = z.object({
  pid: z.number(),
  name: z.string(),
  cpu: z.number(),
  mem: z.number(),
});
export type ProcessMetric = z.infer<typeof ProcessMetric>;

export const HostMetric = z.object({
  hostname: z.string(),
  platform: z.string(),
  arch: z.string(),
  uptime: z.number(),
  ip: z.string(),
});
export type HostMetric = z.infer<typeof HostMetric>;

export const Metrics = z.object({
  cpu: CpuMetric,
  mem: MemMetric,
  net: NetMetric,
  disk: z.array(DiskMetric),
  processes: z.array(ProcessMetric),
  latency: z.number().nullable(),
  host: HostMetric,
  time: z.number(),
});
export type Metrics = z.infer<typeof Metrics>;

export const FsEntry = z.object({
  name: z.string(),
  isDir: z.boolean(),
  size: z.number(),
});
export type FsEntry = z.infer<typeof FsEntry>;

// Real geolocation data driving the globe (self location + live endpoints).
export const GeoKind = z.enum(['self', 'conn', 'ssh']);
export type GeoKind = z.infer<typeof GeoKind>;

export const GeoPoint = z.object({
  lat: z.number(),
  lng: z.number(),
  label: z.string(),
  ip: z.string(),
  kind: GeoKind,
});
export type GeoPoint = z.infer<typeof GeoPoint>;

export const GeoArc = z.object({
  startLat: z.number(),
  startLng: z.number(),
  endLat: z.number(),
  endLng: z.number(),
  label: z.string(),
  kind: z.enum(['conn', 'ssh']),
});
export type GeoArc = z.infer<typeof GeoArc>;

export const GeoData = z.object({
  self: GeoPoint.nullable(),
  points: z.array(GeoPoint),
  arcs: z.array(GeoArc),
});
export type GeoData = z.infer<typeof GeoData>;

export const SysClientMessage = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('config'),
    intervalMs: z.number().int().positive().optional(),
    includeProcesses: z.boolean().optional(),
  }),
  z.object({ t: z.literal('fs.list'), path: z.string() }),
  z.object({ t: z.literal('geo.request') }),
  z.object({
    t: z.literal('proc.kill'),
    pid: z.number().int().positive(),
    signal: z.enum(['SIGTERM', 'SIGKILL', 'SIGINT']).optional(),
  }),
]);
export type SysClientMessage = z.infer<typeof SysClientMessage>;

export const SysServerMessage = z.discriminatedUnion('t', [
  z.object({ t: z.literal('metrics'), metrics: Metrics }),
  z.object({ t: z.literal('fs.list'), path: z.string(), entries: z.array(FsEntry) }),
  z.object({ t: z.literal('geo'), data: GeoData }),
  z.object({ t: z.literal('error'), message: z.string() }),
]);
export type SysServerMessage = z.infer<typeof SysServerMessage>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function parseMessage<T extends z.ZodTypeAny>(schema: T, raw: unknown): z.infer<T> | null {
  const text = typeof raw === 'string' ? raw : String(raw);
  try {
    const json = JSON.parse(text);
    const result = schema.safeParse(json);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function encode(msg: unknown): string {
  return JSON.stringify(msg);
}
