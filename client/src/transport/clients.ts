import {
  ControlServerMessage,
  SysServerMessage,
  type ControlClientMessage,
  type SysClientMessage,
} from '@ciliterm/shared';
import { WsTransport } from './WsTransport';

let controlSingleton: WsTransport<ControlClientMessage, typeof ControlServerMessage> | null = null;
let sysSingleton: WsTransport<SysClientMessage, typeof SysServerMessage> | null = null;

export function getControl(): WsTransport<ControlClientMessage, typeof ControlServerMessage> {
  if (!controlSingleton) {
    controlSingleton = new WsTransport({ path: '/control', recvSchema: ControlServerMessage });
  }
  return controlSingleton;
}

export function getSys(): WsTransport<SysClientMessage, typeof SysServerMessage> {
  if (!sysSingleton) {
    sysSingleton = new WsTransport({ path: '/sys', recvSchema: SysServerMessage });
  }
  return sysSingleton;
}
