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

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const mirror = !!data2;
    const midY = mirror ? h / 2 : h;

    // grid
    ctx.strokeStyle = hexToRgba(color, 0.07);
    ctx.lineWidth = 1;
    for (let y = 0; y <= h + 0.5; y += h / 4) {
      ctx.beginPath();
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(w, Math.round(y) + 0.5);
      ctx.stroke();
    }

    // emphasized midline in mirror mode
    if (mirror) {
      ctx.strokeStyle = 'rgba(120,180,210,0.28)';
      ctx.beginPath();
      ctx.moveTo(0, midY + 0.5);
      ctx.lineTo(w, midY + 0.5);
      ctx.stroke();
    }

    // Catmull-Rom spline traced as bezier segments for a smooth curve.
    const traceCurve = (pts: Pt[]) => {
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i - 1] ?? pts[i];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[i + 2] ?? p2;
        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
      }
    };

    const PAD = 6; // headroom so peaks / glow / end dots never clip
    const XPAD = 3;
    const drawSeries = (series: number[], col: string, up: boolean) => {
      if (series.length < 2) return;
      const usableW = w - XPAD * 2;
      const step = usableW / (series.length - 1);
      const range = (mirror ? h / 2 : h) - PAD;
      const pts: Pt[] = series.map((v, i) => {
        const clamped = Math.max(0, Math.min(1, v));
        const off = range * clamped;
        return { x: XPAD + i * step, y: up ? midY - off : midY + off };
      });

      // gradient area fill under the curve toward the midline
      ctx.beginPath();
      traceCurve(pts);
      ctx.lineTo(pts[pts.length - 1].x, midY);
      ctx.lineTo(pts[0].x, midY);
      ctx.closePath();
      const grad = up
        ? ctx.createLinearGradient(0, 0, 0, midY)
        : ctx.createLinearGradient(0, midY, 0, h);
      grad.addColorStop(0, hexToRgba(col, up ? 0.38 : 0.05));
      grad.addColorStop(1, hexToRgba(col, up ? 0.05 : 0.38));
      ctx.fillStyle = grad;
      ctx.fill();

      // glowing smooth stroke
      ctx.beginPath();
      traceCurve(pts);
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.8;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.shadowColor = col;
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // live dot at the latest sample
      const last = pts[pts.length - 1];
      ctx.beginPath();
      ctx.arc(last.x, last.y, 2.4, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;
    };

    drawSeries(data, color, true);
    if (data2) drawSeries(data2, color2, false);
  }, [data, data2, color, color2]);

  return <canvas className="graph" ref={ref} style={{ height }} />;
}

function hexToRgba(hex: string, alpha: number): string {
  const m = hex.replace('#', '');
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
