import {
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import {
  MAX_COL_WIDTH,
  MIN_COL_WIDTH,
  MODULE_LABELS,
  type ColumnId,
  type ModuleId,
} from '../layout/layout';

interface Props {
  side: ColumnId;
  ids: ModuleId[];
  width: number;
  dragging: boolean;
  renderModule: (id: ModuleId) => ReactNode;
  onMove: (id: ModuleId, toCol: ColumnId, index: number) => void;
  onHide: (id: ModuleId) => void;
  onWidthChange: (w: number) => void;
  onDragStateChange: (dragging: boolean) => void;
}

function clamp(w: number) {
  return Math.max(MIN_COL_WIDTH, Math.min(MAX_COL_WIDTH, w));
}

export function LayoutSidebar({
  side,
  ids,
  width,
  dragging,
  renderModule,
  onMove,
  onHide,
  onWidthChange,
  onDragStateChange,
}: Props) {
  const [w, setW] = useState(width);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const colRef = useRef<HTMLDivElement>(null);
  const resizing = useRef(false);

  useEffect(() => {
    if (!resizing.current) setW(width);
  }, [width]);

  const computeIndex = (clientY: number): number => {
    const items = colRef.current?.querySelectorAll<HTMLElement>('[data-mod]');
    if (!items) return ids.length;
    let idx = 0;
    items.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (clientY > r.top + r.height / 2) idx += 1;
    });
    return idx;
  };

  const onDragOver = (e: ReactDragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropIndex(computeIndex(e.clientY));
  };

  const onDrop = (e: ReactDragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain') as ModuleId;
    if (id) onMove(id, side, computeIndex(e.clientY));
    setDropIndex(null);
    onDragStateChange(false);
  };

  const startResize = (e: ReactPointerEvent) => {
    e.preventDefault();
    resizing.current = true;
    const startX = e.clientX;
    const startW = w;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const delta = ev.clientX - startX;
      setW(clamp(side === 'left' ? startW + delta : startW - delta));
    };
    const up = () => {
      resizing.current = false;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setW((cur) => {
        onWidthChange(cur);
        return cur;
      });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const splitter = (
    <div className="lay-splitter" onPointerDown={startResize} title="drag to resize" />
  );

  const column = (
    <div
      className={`lay-col ${dragging ? 'drag-active' : ''}`}
      ref={colRef}
      onDragOver={onDragOver}
      onDragLeave={() => setDropIndex(null)}
      onDrop={onDrop}
    >
      {ids.map((id, i) => (
        <div className="lay-item" data-mod={id} key={id}>
          {dropIndex === i && <div className="lay-drop-line" />}
          <div
            className="lay-grip"
            draggable
            title={`drag ${MODULE_LABELS[id]}`}
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', id);
              e.dataTransfer.effectAllowed = 'move';
              onDragStateChange(true);
            }}
            onDragEnd={() => {
              setDropIndex(null);
              onDragStateChange(false);
            }}
          >
            ⠿
          </div>
          <button className="lay-hide" title={`hide ${MODULE_LABELS[id]}`} onClick={() => onHide(id)}>
            ✕
          </button>
          {renderModule(id)}
        </div>
      ))}
      {dropIndex === ids.length && <div className="lay-drop-line" />}
      {ids.length === 0 && <div className="lay-empty">drop panels here</div>}
    </div>
  );

  return (
    <aside className={`sidebar lay-sidebar ${side}`} style={{ width: w }}>
      {side === 'right' && splitter}
      {column}
      {side === 'left' && splitter}
    </aside>
  );
}
