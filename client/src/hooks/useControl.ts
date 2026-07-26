import { useEffect, useState } from 'react';
import type { SessionInfo, SshHost, ControlClientMessage } from '@ciliterm/shared';
import type { ConnStatus } from '../transport/Transport';
import { getControl } from '../transport/clients';

export function useControl() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [hosts, setHosts] = useState<SshHost[]>([]);
  const [status, setStatus] = useState<ConnStatus>('connecting');

  useEffect(() => {
    const control = getControl();
    const offMsg = control.onMessage((msg) => {
      if (msg.t === 'sessions') setSessions(msg.list);
      else if (msg.t === 'hosts') setHosts(msg.list);
    });
    const offStatus = control.onStatus((s) => {
      setStatus(s);
      if (s === 'open') {
        control.send({ t: 'sessions.list' });
        control.send({ t: 'hosts.list' });
      }
    });
    return () => {
      offMsg();
      offStatus();
    };
  }, []);

  const send = (msg: ControlClientMessage) => getControl().send(msg);

  return { sessions, hosts, status, send };
}
