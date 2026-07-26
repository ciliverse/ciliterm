import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { SshHost, type SshHostInput } from '@ciliterm/shared';
import { CONFIG_DIR, HOSTS_FILE } from './config.js';

export { buildSshCommand } from './ssh-cmd.js';

/** Persistent SSH host book stored at ~/.config/ciliterm/hosts.json (no passwords). */
export class HostStore {
  private hosts: SshHost[] = [];

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      const raw = fs.readFileSync(HOSTS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      const result = SshHost.array().safeParse(parsed);
      this.hosts = result.success ? result.data : [];
    } catch {
      this.hosts = [];
    }
  }

  private persist(): void {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(HOSTS_FILE, JSON.stringify(this.hosts, null, 2), { mode: 0o600 });
  }

  list(): SshHost[] {
    return this.hosts;
  }

  save(input: SshHostInput): SshHost[] {
    const host = SshHost.parse({ ...input, id: input.id ?? randomUUID() });
    const idx = this.hosts.findIndex((h) => h.id === host.id);
    if (idx >= 0) this.hosts[idx] = host;
    else this.hosts.push(host);
    this.persist();
    return this.hosts;
  }

  delete(id: string): SshHost[] {
    this.hosts = this.hosts.filter((h) => h.id !== id);
    this.persist();
    return this.hosts;
  }

  get(id: string): SshHost | undefined {
    return this.hosts.find((h) => h.id === id);
  }
}
