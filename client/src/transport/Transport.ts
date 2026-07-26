export type ConnStatus = 'connecting' | 'open' | 'closed';

/**
 * Transport abstraction decoupling the UI from the wire. The default impl is
 * `WsTransport` (browser WebSocket). A future Tauri build can provide a native
 * transport without touching UI code.
 */
export interface Transport<TSend, TRecv> {
  send(msg: TSend): void;
  onMessage(cb: (msg: TRecv) => void): () => void;
  onStatus(cb: (status: ConnStatus) => void): () => void;
  status(): ConnStatus;
  close(): void;
}
