import type { z } from 'zod';
import { encode, parseMessage } from '@ciliterm/shared';
import type { ConnStatus, Transport } from './Transport';
import { getToken } from './auth';

export interface WsTransportOptions<TRecv extends z.ZodTypeAny> {
  path: string;
  recvSchema: TRecv;
  autoReconnect?: boolean;
}

/** Reconnecting WebSocket transport with zod-validated inbound messages. */
export class WsTransport<TSend, TRecv extends z.ZodTypeAny>
  implements Transport<TSend, z.infer<TRecv>>
{
  private ws: WebSocket | null = null;
  private readonly url: string;
  private readonly recvSchema: TRecv;
  private readonly autoReconnect: boolean;
  private msgHandlers = new Set<(m: z.infer<TRecv>) => void>();
  private statusHandlers = new Set<(s: ConnStatus) => void>();
  private currentStatus: ConnStatus = 'connecting';
  private outbox: string[] = [];
  private reconnectDelay = 500;
  private closedByUser = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: WsTransportOptions<TRecv>) {
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    const token = getToken();
    const query = token ? `?token=${encodeURIComponent(token)}` : '';
    this.url = `${scheme}://${location.host}${opts.path}${query}`;
    this.recvSchema = opts.recvSchema;
    this.autoReconnect = opts.autoReconnect ?? true;
    this.connect();
  }

  private setStatus(s: ConnStatus): void {
    this.currentStatus = s;
    for (const h of this.statusHandlers) h(s);
  }

  private connect(): void {
    this.setStatus('connecting');
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectDelay = 500;
      this.setStatus('open');
      for (const raw of this.outbox) ws.send(raw);
      this.outbox = [];
    };

    ws.onmessage = (ev) => {
      const parsed = parseMessage(this.recvSchema, ev.data);
      if (parsed) for (const h of this.msgHandlers) h(parsed);
    };

    ws.onclose = () => {
      this.ws = null;
      this.setStatus('closed');
      if (!this.closedByUser && this.autoReconnect) {
        this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectDelay);
        this.reconnectDelay = Math.min(this.reconnectDelay * 1.6, 5000);
      }
    };

    ws.onerror = () => ws.close();
  }

  send(msg: TSend): void {
    const raw = encode(msg);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(raw);
    else this.outbox.push(raw);
  }

  onMessage(cb: (m: z.infer<TRecv>) => void): () => void {
    this.msgHandlers.add(cb);
    return () => this.msgHandlers.delete(cb);
  }

  onStatus(cb: (s: ConnStatus) => void): () => void {
    this.statusHandlers.add(cb);
    cb(this.currentStatus);
    return () => this.statusHandlers.delete(cb);
  }

  status(): ConnStatus {
    return this.currentStatus;
  }

  close(): void {
    this.closedByUser = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }
}
