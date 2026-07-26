import type { SessionKind } from '@ciliterm/shared';
import { SHOWCASE_DEMO_FRAMES, type DemoFrame } from './showcase-demo.js';

export const SHOWCASE_SESSION_NAME = 'demo';

const CSI = '\x1b[';
const reset = `${CSI}0m`;
const dim = `${CSI}2m`;
const cyan = `${CSI}36m`;
const bold = `${CSI}1m`;
const green = `${CSI}32m`;
const yellow = `${CSI}33m`;

function prompt(): string {
  return `${green}guest@showcase${reset}:${cyan}/demo${reset}$ `;
}

function replyFor(line: string): string {
  const cmd = line.trim();
  if (!cmd) return '';
  const [bin, ...args] = cmd.split(/\s+/);
  switch (bin) {
    case 'help':
      return (
        lineOut(`${bold}showcase shell${reset} · simulated replies only`) +
        lineOut(`${dim}try:${reset} help  ls  pwd  whoami  uname -a  date  clear  echo …`) +
        lineOut(`${dim}no host commands are executed${reset}`)
      );
    case 'clear':
      return '\x1b[2J\x1b[H';
    case 'pwd':
      return lineOut('/demo');
    case 'whoami':
      return lineOut('guest');
    case 'hostname':
      return lineOut('ciliterm-demo');
    case 'date':
      return lineOut(new Date().toUTCString());
    case 'uname':
      return lineOut('Linux ciliterm-demo 6.x #1 SMP showcase x86_64 GNU/Linux');
    case 'ls':
      return lineOut('README.md  metrics.json  globe.json  panels/');
    case 'cat':
      if (args[0] === '/etc/os-release' || args[0] === 'README.md') {
        return (
          lineOut(`${yellow}NAME${reset}="CiliTerm Showcase"`) +
          lineOut(`${yellow}MODE${reset}="public read-only demo"`) +
          lineOut(`${yellow}NOTE${reset}="HUD + metrics + terminal are simulated"`)
        );
      }
      return lineOut(`cat: ${args[0] ?? '?'}: No such file (simulated)`);
    case 'echo':
      return lineOut(args.join(' '));
    case 'top':
    case 'htop':
      return (
        lineOut(`${dim}PID  NAME           CPU%  MEM%${reset}`) +
        lineOut('120  ciliterm         2.4   3.1') +
        lineOut(' 88  nginx            0.8   1.2') +
        lineOut('201  node             1.6   4.5') +
        lineOut(`${dim}(simulated process table)${reset}`)
      );
    default:
      return (
        lineOut(`${yellow}showcase${reset}: simulated shell — \`${bin}\` is not a live command`) +
        lineOut(`${dim}type ${reset}help${dim} for examples · nothing runs on the host${reset}`)
      );
  }
}

function lineOut(text: string): string {
  return `${text}\r\n`;
}

type OpenOpts = {
  cols?: number;
  rows?: number;
  onData: (data: string) => void;
  onExit: (code: number | null) => void;
};

/**
 * Demo session: intro replay, then an interactive simulated shell.
 * Never opens a PTY / never executes host commands.
 */
export class ShowcaseSession {
  readonly name = SHOWCASE_SESSION_NAME;
  readonly kind: SessionKind = 'managed';
  private timers: NodeJS.Timeout[] = [];
  private stopped = false;
  private interactive = false;
  private lineBuf = '';
  private readonly onData: (data: string) => void;

  constructor(opts: OpenOpts) {
    this.onData = opts.onData;
    this.scheduleNext(SHOWCASE_DEMO_FRAMES, 0);
  }

  private scheduleNext(frames: DemoFrame[], from: number): void {
    if (this.stopped || this.interactive) return;
    if (from >= frames.length) {
      // End intro once; hand off to interactive prompt.
      this.interactive = true;
      this.onData(`\r\n${dim}— interactive demo shell — type ${reset}help${dim} —${reset}\r\n`);
      this.onData(prompt());
      return;
    }
    const frame = frames[from]!;
    const t = setTimeout(() => {
      if (this.stopped || this.interactive) return;
      if (frame.data) this.onData(frame.data);
      this.scheduleNext(frames, from + 1);
    }, Math.max(0, frame.delayMs));
    this.timers.push(t);
  }

  write(data: string): void {
    if (this.stopped) return;
    if (!this.interactive) {
      // First keystroke cancels intro and enters interactive mode.
      this.interactive = true;
      for (const t of this.timers) clearTimeout(t);
      this.timers = [];
      this.onData(`\r\n${dim}(intro skipped)${reset}\r\n`);
      this.onData(prompt());
    }

    for (const ch of data) {
      if (ch === '\r' || ch === '\n') {
        this.onData('\r\n');
        const line = this.lineBuf;
        this.lineBuf = '';
        const out = replyFor(line);
        if (out) this.onData(out);
        this.onData(prompt());
      } else if (ch === '\u007f' || ch === '\b') {
        if (this.lineBuf.length > 0) {
          this.lineBuf = this.lineBuf.slice(0, -1);
          this.onData('\b \b');
        }
      } else if (ch === '\u0003') {
        this.lineBuf = '';
        this.onData('^C\r\n');
        this.onData(prompt());
      } else if (ch === '\u000c') {
        this.onData('\x1b[2J\x1b[H');
        this.onData(prompt());
      } else if (ch >= ' ' || ch === '\t') {
        this.lineBuf += ch;
        this.onData(ch);
      }
    }
  }

  resize(_cols: number, _rows: number): void {
    /* simulated shell ignores geometry */
  }

  async getCwd(): Promise<string | null> {
    return '/demo';
  }

  detach(): void {
    this.stop();
  }

  stop(): void {
    this.stopped = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }
}
