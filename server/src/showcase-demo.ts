/**
 * Pre-recorded demo frames for showcase mode. No shell is spawned.
 * delays are milliseconds before each chunk is pushed to the client.
 */
export type DemoFrame = { delayMs: number; data: string };

const CSI = '\x1b[';
const reset = `${CSI}0m`;
const dim = `${CSI}2m`;
const cyan = `${CSI}36m`;
const bold = `${CSI}1m`;
const green = `${CSI}32m`;
const yellow = `${CSI}33m`;

function line(text: string): string {
  return `${text}\r\n`;
}

/** Looping showcase script — looks like a terminal session, executes nothing. */
export const SHOWCASE_DEMO_FRAMES: DemoFrame[] = [
  {
    delayMs: 80,
    data: line(`${bold}${cyan}CiliTerm${reset} ${dim}// multi-cluster operator console · showcase${reset}`),
  },
  {
    delayMs: 200,
    data: line(`${dim}mode: READ-ONLY DEMO · keyboard input disabled · no host shell${reset}`),
  },
  { delayMs: 350, data: line('') },
  {
    delayMs: 120,
    data: `${green}guest@showcase${reset}:${cyan}~${reset}$ `,
  },
  { delayMs: 400, data: 'u' },
  { delayMs: 60, data: 'n' },
  { delayMs: 50, data: 'a' },
  { delayMs: 40, data: 'm' },
  { delayMs: 40, data: 'e' },
  { delayMs: 40, data: ' ' },
  { delayMs: 40, data: '-' },
  { delayMs: 40, data: 'a' },
  { delayMs: 180, data: '\r\n' },
  {
    delayMs: 220,
    data: line(`${dim}Linux showcase 6.x · demo node · ciliterm public exhibit${reset}`),
  },
  {
    delayMs: 100,
    data: `${green}guest@showcase${reset}:${cyan}~${reset}$ `,
  },
  { delayMs: 350, data: 'c' },
  { delayMs: 50, data: 'a' },
  { delayMs: 50, data: 't' },
  { delayMs: 50, data: ' ' },
  { delayMs: 40, data: '/' },
  { delayMs: 40, data: 'e' },
  { delayMs: 40, data: 't' },
  { delayMs: 40, data: 'c' },
  { delayMs: 40, data: '/' },
  { delayMs: 40, data: 'o' },
  { delayMs: 40, data: 's' },
  { delayMs: 40, data: '-' },
  { delayMs: 40, data: 'r' },
  { delayMs: 40, data: 'e' },
  { delayMs: 40, data: 'l' },
  { delayMs: 40, data: 'e' },
  { delayMs: 40, data: 'a' },
  { delayMs: 40, data: 's' },
  { delayMs: 40, data: 'e' },
  { delayMs: 200, data: '\r\n' },
  {
    delayMs: 180,
    data:
      line(`${yellow}PRETTY_NAME${reset}="CiliTerm Showcase"`) +
      line(`${yellow}NAME${reset}="Demo Overlay (no real OS shell)"`) +
      line(`${yellow}VERSION${reset}="public-readonly"`),
  },
  {
    delayMs: 100,
    data: `${green}guest@showcase${reset}:${cyan}~${reset}$ `,
  },
  { delayMs: 400, data: 'e' },
  { delayMs: 50, data: 'c' },
  { delayMs: 50, data: 'h' },
  { delayMs: 50, data: 'o' },
  { delayMs: 50, data: ' ' },
  {
    delayMs: 80,
    data: '"HUD · globe · metrics · xterm — try the panels; commands are simulated."',
  },
  { delayMs: 200, data: '\r\n' },
  {
    delayMs: 160,
    data: line(
      `${dim}HUD · globe · metrics · xterm — try the panels; commands are simulated.${reset}`,
    ),
  },
  {
    delayMs: 120,
    data: `${green}guest@showcase${reset}:${cyan}~${reset}$ `,
  },
  { delayMs: 800, data: '' },
  {
    delayMs: 400,
    data: line(
      `\r\n${bold}${cyan}[showcase]${reset} ${dim}replay complete — looping… input remains disabled${reset}\r\n`,
    ),
  },
  { delayMs: 1200, data: '' },
];

/** @deprecated kept for tests; interactive shell lives in showcase-session. */
export const SHOWCASE_INPUT_HINT =
  `\r\n${yellow}[showcase]${reset} simulated shell — type ${reset}help${yellow}; nothing runs on the host.\r\n` +
  `${green}guest@showcase${reset}:${cyan}/demo${reset}$ `;
