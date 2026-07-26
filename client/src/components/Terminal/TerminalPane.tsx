import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import { PtyServerMessage, type PtyClientMessage } from '@ciliterm/shared';
import { WsTransport } from '../../transport/WsTransport';
import type { ConnStatus } from '../../transport/Transport';
import { useSettings } from '../../settings/settings';
import { resolveTheme, terminalTheme } from '../../theme/themes';
import { focusBus } from '../../utils/focusBus';
import { useTabs } from './tabsStore';

export interface PaneSpec {
  id: string;
  attach?: string;
  create?: { command?: string; hostId?: string; name?: string };
}

interface Props {
  spec: PaneSpec;
  focused: boolean;
  onFocus: () => void;
  onCwd: (path: string) => void;
  onTitle: (title: string) => void;
  onClose: () => void;
  canClose: boolean;
}

export function TerminalPane({ spec, focused, onFocus, onCwd, onTitle, onClose, canClose }: Props) {
  const holderRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const transportRef = useRef<WsTransport<PtyClientMessage, typeof PtyServerMessage> | null>(null);
  const attachedName = useRef<string | null>(spec.attach ?? null);
  const { settings } = useSettings();
  const { newTab, splitActive } = useTabs();
  const activeTheme = resolveTheme(settings.themeId, settings.customThemes);
  const rawPasteRef = useRef(settings.rawPaste);
  rawPasteRef.current = settings.rawPaste;

  const [status, setStatus] = useState<ConnStatus>('connecting');
  const [showSearch, setShowSearch] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  // Mount xterm + transport once.
  useEffect(() => {
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: settings.fontFamily,
      fontSize: settings.fontSize,
      allowTransparency: true,
      scrollback: 10000,
      theme: terminalTheme(activeTheme),
    });
    const fit = new FitAddon();
    const search = new SearchAddon();
    term.loadAddon(fit);
    term.loadAddon(search);
    term.loadAddon(new WebLinksAddon());
    term.open(holderRef.current!);
    try {
      term.loadAddon(new WebglAddon());
    } catch {
      /* webgl not available - canvas renderer is fine */
    }
    fit.fit();

    termRef.current = term;
    fitRef.current = fit;
    searchRef.current = search;

    const transport = new WsTransport({ path: '/pty', recvSchema: PtyServerMessage });
    transportRef.current = transport;

    const sendInitial = () => {
      const { cols, rows } = term;
      if (attachedName.current) {
        transport.send({ t: 'attach', session: attachedName.current, cols, rows });
      } else if (spec.create) {
        transport.send({ t: 'create', ...spec.create, cols, rows });
      } else if (spec.attach) {
        transport.send({ t: 'attach', session: spec.attach, cols, rows });
      } else {
        transport.send({ t: 'create', cols, rows });
      }
    };

    const offStatus = transport.onStatus((s) => {
      setStatus(s);
      if (s === 'open') sendInitial();
    });

    const offMsg = transport.onMessage((msg) => {
      switch (msg.t) {
        case 'ready':
          attachedName.current = msg.session;
          onTitle(msg.session);
          break;
        case 'output':
          term.write(msg.data);
          break;
        case 'cwd':
          onCwd(msg.path);
          break;
        case 'exit':
          term.writeln(`\r\n\x1b[2m[session ended: ${msg.code ?? 0}]\x1b[0m`);
          break;
        case 'error':
          term.writeln(`\r\n\x1b[31m[error] ${msg.message}\x1b[0m`);
          break;
      }
    });

    const dataDisp = term.onData((data) => transport.send({ t: 'input', data }));

    // When raw paste is on, bypass xterm's bracketed-paste wrapping and send the
    // clipboard text verbatim so shells that don't support it don't show `^[[200~`.
    const onPaste = (e: ClipboardEvent) => {
      if (!rawPasteRef.current) return;
      const text = e.clipboardData?.getData('text');
      if (!text) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      transport.send({ t: 'input', data: text });
    };
    holderRef.current!.addEventListener('paste', onPaste, true);

    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
        transport.send({ t: 'resize', cols: term.cols, rows: term.rows });
      } catch {
        /* ignore */
      }
    });
    ro.observe(holderRef.current!);

    const holder = holderRef.current;
    return () => {
      ro.disconnect();
      dataDisp.dispose();
      holder?.removeEventListener('paste', onPaste, true);
      offMsg();
      offStatus();
      transport.close();
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply font settings changes.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.fontFamily = settings.fontFamily;
    term.options.fontSize = settings.fontSize;
    try {
      fitRef.current?.fit();
    } catch {
      /* ignore */
    }
  }, [settings.fontFamily, settings.fontSize]);

  // Recolor the terminal when the theme changes.
  useEffect(() => {
    const term = termRef.current;
    if (term) term.options.theme = terminalTheme(activeTheme);
  }, [activeTheme]);

  useEffect(() => {
    if (focused) {
      termRef.current?.focus();
      focusBus.setActiveInput((data) => transportRef.current?.send({ t: 'input', data }));
    }
  }, [focused]);

  const runSearch = (text: string, next = true) => {
    setSearchText(text);
    if (!text) return;
    if (next) searchRef.current?.findNext(text);
    else searchRef.current?.findPrevious(text);
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      setShowSearch((v) => !v);
    } else if (e.key === 'Escape' && showSearch) {
      setShowSearch(false);
    }
  };

  const copySelection = async () => {
    const text = termRef.current?.getSelection();
    if (text) await navigator.clipboard.writeText(text).catch(() => {});
  };

  const pasteClipboard = async () => {
    const text = await navigator.clipboard.readText().catch(() => '');
    if (!text) return;
    if (rawPasteRef.current) transportRef.current?.send({ t: 'input', data: text });
    else termRef.current?.paste(text);
  };

  const clearTerminal = () => termRef.current?.clear();

  const openMenu = (e: ReactMouseEvent) => {
    e.preventDefault();
    onFocus();
    setMenu({ x: e.clientX, y: e.clientY });
  };

  // Dismiss the context menu on any outside interaction.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('mousedown', close);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
    };
  }, [menu]);

  const menuItems: { label: string; run: () => void; disabled?: boolean }[] = [
    { label: 'Copy', run: copySelection, disabled: !termRef.current?.hasSelection() },
    { label: 'Paste', run: pasteClipboard },
    { label: 'Clear', run: clearTerminal },
    { label: 'Search', run: () => setShowSearch(true) },
    { label: 'Split pane', run: splitActive },
    { label: 'New tab', run: () => newTab() },
    ...(canClose ? [{ label: 'Close pane', run: onClose }] : []),
  ];

  return (
    <div
      className={`pane ${focused ? 'focused' : ''}`}
      onMouseDown={onFocus}
      onKeyDown={onKeyDown}
      onContextMenu={openMenu}
      tabIndex={-1}
    >
      <div className="pane-overlay">
        {status !== 'open' ? (status === 'connecting' ? 'RECONNECTING…' : 'OFFLINE') : ''}
        {canClose && (
          <button className="mini-btn danger" style={{ marginLeft: 6 }} onClick={onClose}>
            ✕
          </button>
        )}
      </div>
      {showSearch && (
        <div className="pane-search">
          <input
            autoFocus
            placeholder="search…"
            value={searchText}
            onChange={(e) => runSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') runSearch(searchText, !e.shiftKey);
              if (e.key === 'Escape') setShowSearch(false);
            }}
          />
        </div>
      )}
      <div className="xterm-holder" ref={holderRef} />
      {menu && (
        <div
          className="ctx-menu"
          style={{ left: menu.x, top: menu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {menuItems.map((item) => (
            <button
              key={item.label}
              className="ctx-item"
              disabled={item.disabled}
              onClick={() => {
                setMenu(null);
                item.run();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
