import {
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { MAX_MOD_HEIGHT, MIN_MOD_HEIGHT, moduleLabel, type ModuleId } from '../layout/layout';

interface Props {
  id: ModuleId;
  height?: number;
  fill?: boolean;
  onHeightChange?: (id: ModuleId, height: number) => void;
  onHide?: () => void;
  onDragStateChange?: (dragging: boolean) => void;
  children: ReactNode;
}

export function ModuleFrame({
  id,
  height,
  fill,
  onHeightChange,
  onHide,
  onDragStateChange,
  children,
}: Props) {
  const [full, setFull] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const heightRef = useRef(height);
  heightRef.current = height;

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFull(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [full]);

  const onResizeStart = (e: ReactPointerEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = boxRef.current?.offsetHeight ?? heightRef.current ?? 200;
    const move = (ev: PointerEvent) => {
      const next = Math.min(MAX_MOD_HEIGHT, Math.max(MIN_MOD_HEIGHT, startH + ev.clientY - startY));
      onHeightChange?.(id, next);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onDragStart = (e: ReactDragEvent) => {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
    onDragStateChange?.(true);
  };

  return (
    <div
      ref={boxRef}
      className={`mod-frame${full ? ' is-full' : ''}${fill ? ' is-fill' : ''}${!full && height != null ? ' is-sized' : ''}`}
      style={full || (fill && height == null) ? undefined : height != null ? { height } : undefined}
    >
      <div className="mod-bar">
        <div
          className="mod-grip"
          draggable
          title={`drag ${moduleLabel(id)}`}
          onDragStart={onDragStart}
          onDragEnd={() => onDragStateChange?.(false)}
        >
          ⠿
        </div>
        <span className="mod-bar-name">{moduleLabel(id)}</span>
        <span className="mod-bar-spacer" />
        {onHide && (
          <button type="button" className="mod-tool is-hide" title={`hide ${moduleLabel(id)}`} onClick={onHide}>
            ✕
          </button>
        )}
        <button
          type="button"
          className="mod-tool"
          title={full ? 'exit fullscreen' : 'fullscreen'}
          onClick={() => setFull((v) => !v)}
        >
          {full ? 'EXIT' : 'FULL'}
        </button>
      </div>
      <div className="mod-body">{children}</div>
      {!full && (
        <div className="mod-resize" onPointerDown={onResizeStart} title="drag to resize" />
      )}
    </div>
  );
}
