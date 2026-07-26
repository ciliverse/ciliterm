import { createRoot } from 'react-dom/client';
import '@xterm/xterm/css/xterm.css';
import './theme.css';
import { App } from './App';
import { SettingsProvider } from './settings/settings';
import { TabsProvider } from './components/Terminal/tabsStore';
import { initShowcase } from './showcase';

// Note: StrictMode is intentionally omitted - its double-invoked mount effects
// would spawn duplicate pty sessions and WebSocket connections in dev.
async function boot() {
  // Capture URL token + showcase publicToken before any transport connects.
  await initShowcase();
  createRoot(document.getElementById('root')!).render(
    <SettingsProvider>
      <TabsProvider>
        <App />
      </TabsProvider>
    </SettingsProvider>,
  );
}

void boot();
