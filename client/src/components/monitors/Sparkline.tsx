import { useEffect, useRef } from 'react';

interface Props {
  /** Normalized values in [0, 1]. */
  data: number[];
  color?: string;
  /** Optional second series (drawn mirrored below the midline). */
  data2?: number[];
  color2?: string;
  height?: number;
}

interface Pt {
  x: number;
  y: number;
}

export function Sparkline({
  data,
  data2,
  color = '#35e6ff',
  color2 = '#ffae00',
  height = 70,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const paint = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(2, wrap.clientWidth);
      const h = Math.max(2, wrap.clientHeight || height);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const mirror = !!data2;
      const midY = mirror ? h / 2 : h - 1;

      ctx.setLineDash([]);
      ctx.strokeStyle = hexToRgba(color, 0.1);
      ctx.lineWidth = 0.5;
      for (let i = 1; i < 4; i++) {
        const y = Math.round((h * i) / 4) + 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      if (mirror) {
        ctx.strokeStyle = hexToRgba(color, 0.22);
        ctx.beginPath();
        ctx.moveTo(0, midY + 0.5);
        ctx.lineTo(w, midY + 0.5);
        ctx.stroke();
      }

      const PAD = 5;
      const XPAD = 2;
      const drawSeries = (series: number[], col: string, up: boolean, dashed: boolean) => {
        if (series.length < 2) return;
        const usableW = w - XPAD * 2;
        const step = usableW / (series.length - 1);
        const range = (mirror ? h / 2 : h) - PAD;
        const pts: Pt[] = series.map((v, i) => {
          const clamped = Math.max(0, Math.min(1, v));
          const off = range * clamped;
          return { x: XPAD + i * step, y: up ? midY - off : midY + off };
        });

        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[i - 1] ?? pts[i];
          const p1 = pts[i];
          const p2 = pts[i + 1];
          const p3 = pts[i + 2] ?? p2;
          ctx.bezierCurveTo(
            p1.x + (p2.x - p0.x) / 6,
            p1.y + (p2.y - p0.y) / 6,
            p2.x - (p3.x - p1.x) / 6,
            p2.y - (p3.y - p1.y) / 6,
            p2.x,
            p2.y,
          );
        }
        ctx.setLineDash(dashed ? [3.5, 3] : []);
        ctx.strokeStyle = col;
        ctx.lineWidth = 1;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.setLineDash([]);

        const last = pts[pts.length - 1];
        ctx.beginPath();
        ctx.arc(last.x, last.y, 1.6, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.fill();
      };

      drawSeries(data, color, true, false);
      if (data2) drawSeries(data2, color2, false, true);
    };

    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [data, data2, color, color2, height]);

  return (
    <div className="graph-wrap" ref={wrapRef} style={{ height }}>
      <canvas className="graph" ref={ref} />
    </div>
  );
}

/** Thin usage line: dashed track + solid fill. */
export function LineBar({ value, warn }: { value: number; warn?: boolean }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={`line-bar${warn ? ' is-warn' : ''}`} aria-hidden>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

function hexToRgba(hex: string, alpha: number): string {
  let m = hex.replace('#', '').trim();
  if (m.length === 3) m = [...m].map((c) => c + c).join('');
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
