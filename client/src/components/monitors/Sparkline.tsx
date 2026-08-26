import { useEffect, useRef } from 'react';

interface Props {
  /** Normalized values in [0, 1]. */
  data: number[];
  color?: string;
  /** Optional second series (dashed, same baseline). */
  data2?: number[];
  /** Defaults to `color`; a plot reads better on one phosphor than on two hues. */
  color2?: string;
  height?: number;
  /** Samples held, labelled on the time axis so the trace reads as measured. */
  window?: number;
}

interface Pt {
  x: number;
  y: number;
}

export function Sparkline({
  data,
  data2,
  color = '#35e6ff',
  color2,
  height = 70,
  window: span,
}: Props) {
  const traceB = color2 ?? color;
  const ref = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let bufW = 0;
    let bufH = 0;

    const paint = () => {
      const dpr = Math.max(2, Math.min(window.devicePixelRatio || 1, 2));
      const w = Math.max(2, wrap.clientWidth);
      const h = Math.max(2, wrap.clientHeight || height);
      const nextW = Math.floor(w * dpr);
      const nextH = Math.floor(h * dpr);
      if (nextW !== bufW || nextH !== bufH) {
        canvas.width = nextW;
        canvas.height = nextH;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        bufW = nextW;
        bufH = nextH;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // Reserve a band under the plot for the time axis so ticks and its span
      // label sit outside the trace rather than on top of it.
      const AXIS_H = span ? 15 : 8;
      const HEAD = 5;
      const baseY = Math.max(HEAD + 8, h - AXIS_H);
      const plotH = baseY - HEAD;

      ctx.setLineDash([]);
      ctx.lineWidth = 1;

      // Quarter gridlines across the plot.
      ctx.strokeStyle = withAlpha(color, 0.1);
      for (let i = 1; i < 4; i++) {
        const y = Math.round(HEAD + (plotH * i) / 4) + 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Value axis: quarter ticks stepping in from the left edge.
      ctx.strokeStyle = withAlpha(color, 0.3);
      for (let i = 0; i <= 4; i++) {
        const y = Math.round(HEAD + (plotH * i) / 4) + 0.5;
        const major = i === 0 || i === 4;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(major ? 5 : 3, y);
        ctx.stroke();
      }

      // Time axis: a real rule with a tick every sixth of the window.
      const axisY = Math.round(baseY) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, axisY);
      ctx.lineTo(w, axisY);
      ctx.stroke();
      for (let i = 0; i <= 6; i++) {
        const x = Math.round((w - 1) * (i / 6)) + 0.5;
        const major = i % 3 === 0;
        ctx.beginPath();
        ctx.moveTo(x, axisY);
        ctx.lineTo(x, axisY + (major ? 5 : 3));
        ctx.stroke();
      }

      if (span) {
        ctx.fillStyle = withAlpha(color, 0.5);
        ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.textBaseline = 'alphabetic';
        const textY = axisY + 13;
        ctx.textAlign = 'left';
        ctx.fillText(`-${span}s`, 1, textY);
        ctx.textAlign = 'right';
        ctx.fillText('now', w - 1, textY);
      }

      const XPAD = 3;
      const drawSeries = (series: number[], col: string, dashed: boolean) => {
        if (series.length < 2) return;
        const shown = soften(series);
        const usableW = w - XPAD * 2;
        const step = usableW / (shown.length - 1);
        const pts: Pt[] = shown.map((v, i) => {
          const clamped = Math.max(0, Math.min(1, v));
          return { x: XPAD + i * step, y: baseY - plotH * clamped };
        });

        if (!dashed) {
          ctx.beginPath();
          traceCurve(ctx, pts);
          ctx.lineTo(pts[pts.length - 1].x, baseY);
          ctx.lineTo(pts[0].x, baseY);
          ctx.closePath();
          // Anchor the gradient to the trace itself, not the canvas top, so a
          // high reading fades like a haze instead of becoming a solid slab.
          const peakY = Math.min(...pts.map((p) => p.y));
          const grad = ctx.createLinearGradient(0, peakY, 0, baseY);
          grad.addColorStop(0, withAlpha(col, 0.15));
          grad.addColorStop(1, withAlpha(col, 0));
          ctx.fillStyle = grad;
          ctx.fill();
        }

        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.setLineDash(dashed ? [6, 4] : []);

        ctx.beginPath();
        traceCurve(ctx, pts);
        ctx.strokeStyle = withAlpha(col, 0.16);
        ctx.lineWidth = dashed ? 2 : 2.2;
        ctx.stroke();

        ctx.beginPath();
        traceCurve(ctx, pts);
        // Both series share one phosphor, so the dashed one steps back in weight.
        ctx.strokeStyle = dashed ? withAlpha(col, 0.62) : col;
        ctx.lineWidth = dashed ? 1.45 : 1.75;
        ctx.stroke();
        ctx.setLineDash([]);

        const last = pts[pts.length - 1];
        ctx.beginPath();
        ctx.arc(last.x, last.y, 2.1, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(last.x, last.y, 3.2, 0, Math.PI * 2);
        ctx.strokeStyle = withAlpha(col, 0.5);
        ctx.lineWidth = 1;
        ctx.stroke();
      };

      drawSeries(data, color, false);
      if (data2) drawSeries(data2, traceB, true);
    };

    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [data, data2, color, traceB, height, span]);

  return (
    <div className="graph-wrap" ref={wrapRef} style={{ minHeight: height }}>
      <canvas className="graph" ref={ref} />
    </div>
  );
}

/** Usage gauge: dim track, solid fill, needle tick at the reading. */
export function LineBar({ value, warn }: { value: number; warn?: boolean }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={`line-bar${warn ? ' is-warn' : ''}`} aria-hidden>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Keep the latest sample exact; ease the rest so 1s jitter does not look like noise. */
function soften(series: number[]): number[] {
  if (series.length < 3) return series;
  return series.map((v, i) => {
    if (i === 0 || i === series.length - 1) return v;
    return series[i - 1] * 0.22 + v * 0.56 + series[i + 1] * 0.22;
  });
}

function traceCurve(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  ctx.moveTo(pts[0].x, pts[0].y);
  if (pts.length === 2) {
    ctx.lineTo(pts[1].x, pts[1].y);
    return;
  }
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
}

function withAlpha(color: string, alpha: number): string {
  let m = color.replace('#', '').trim();
  if (!/^[\da-f]{3}$|^[\da-f]{6}$/i.test(m)) return color;
  if (m.length === 3) m = [...m].map((c) => c + c).join('');
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
