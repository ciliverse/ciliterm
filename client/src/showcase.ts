import { initToken } from './transport/auth';

const KEY = 'ciliterm.token';

export type HealthInfo = {
  ok: boolean;
  showcase?: boolean;
  publicToken?: string;
  tmux?: boolean;
};

let showcaseMode =
  import.meta.env.VITE_SHOWCASE === '1' || import.meta.env.VITE_SHOWCASE === 'true';

/**
 * Before any WebSocket connects: capture URL token, then (in showcase) pull
 * publicToken from /api/health so nginx-served static builds still authenticate.
 */
export async function initShowcase(): Promise<void> {
  initToken();

  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    if (!res.ok) return;
    const health = (await res.json()) as HealthInfo;
    if (health.showcase) {
      showcaseMode = true;
      if (health.publicToken) {
        try {
          localStorage.setItem(KEY, health.publicToken);
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* offline / local without API — keep VITE_SHOWCASE if set */
  }
}

export function isShowcase(): boolean {
  return showcaseMode;
}
