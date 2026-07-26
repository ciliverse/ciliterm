const KEY = 'ciliterm.token';

/**
 * Capture a `?token=` handed out by the server on first load, persist it, and
 * strip it from the visible URL so it isn't left in the address bar or history.
 * Call once before any transport connects.
 */
export function initToken(): void {
  try {
    const url = new URL(location.href);
    const token = url.searchParams.get('token');
    if (token) {
      localStorage.setItem(KEY, token);
      url.searchParams.delete('token');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
  } catch {
    /* ignore */
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
