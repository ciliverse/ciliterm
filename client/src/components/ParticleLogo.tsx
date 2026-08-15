import { useEffect, useRef } from 'react';
import { useSettings } from '../settings/settings';

interface Dot {
  tx: number;
  ty: number;
  sx: number;
  sy: number;
  r: number;
  g: number;
  b: number;
  size: number;
  phase: number;
}

function readCss(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function parseRgb(hex: string): { r: number; g: number; b: number } {
  let m = hex.replace('#', '').trim();
  if (m.length === 3) m = [...m].map((c) => c + c).join('');
  if (m.length !== 6) return { r: 53, g: 230, b: 255 };
  return {
    r: parseInt(m.slice(0, 2), 16),
    g: parseInt(m.slice(2, 4), 16),
    b: parseInt(m.slice(4, 6), 16),
  };
}

function shade(c: { r: number; g: number; b: number }, t: number) {
  const k = 0.72 + t * 0.5;
  return {
    r: Math.max(0, Math.min(255, Math.round(c.r * k))),
    g: Math.max(0, Math.min(255, Math.round(c.g * k))),
    b: Math.max(0, Math.min(255, Math.round(c.b * k))),
  };
}

function drawSpaced(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  tracking: number,
): { left: number; right: number } {
  const widths = [...text].map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + tracking * (text.length - 1);
  let x = cx - total / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < text.length; i++) {
    ctx.fillText(text[i], x + widths[i] / 2, cy);
    x += widths[i] + tracking;
  }
  return { left: cx - total / 2, right: cx + total / 2 };
}

function sampleWord(w: number, h: number, cyan: string, orange: string, coarse: boolean): Dot[] {
  const scale = 2;
  const off = document.createElement('canvas');
  off.width = Math.max(2, Math.floor(w * scale));
  off.height = Math.max(2, Math.floor(h * scale));
  const ctx = off.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];
  ctx.scale(scale, scale);
  ctx.clearRect(0, 0, w, h);

  const fontSize = Math.min(w / 8.6, h * 0.48);
  ctx.font = `700 ${fontSize}px "JetBrains Mono", "Fira Code", Menlo, monospace`;
  const tracking = fontSize * 0.14;
  const gap = fontSize * 0.28;
  const ciliW = ctx.measureText('CILI').width + tracking * 3;
  const termW = ctx.measureText('TERM').width + tracking * 3;
  const total = ciliW + gap + termW;
  const cy = h * 0.52;
  const leftCx = w / 2 - total / 2 + ciliW / 2;
  const rightCx = w / 2 + total / 2 - termW / 2;

  ctx.fillStyle = cyan;
  drawSpaced(ctx, 'CILI', leftCx, cy, tracking);
  ctx.fillStyle = orange;
  drawSpaced(ctx, 'TERM', rightCx, cy, tracking);

  const { data } = ctx.getImageData(0, 0, off.width, off.height);
  const step = Math.max(4, Math.round(scale * (coarse ? 7 : w < 420 ? 5.4 : 4.8)));
  const rowH = step * 0.86;
  const dots: Dot[] = [];
  const mid = w / 2;
  const cRgb = parseRgb(cyan);
  const oRgb = parseRgb(orange);

  for (let row = 0, y = 0; y < off.height; row++, y += rowH) {
    const ox = (row % 2) * (step * 0.5);
    for (let x = ox; x < off.width; x += step) {
      const ix = Math.min(off.width - 1, Math.floor(x));
      const iy = Math.min(off.height - 1, Math.floor(y));
      const i = (iy * off.width + ix) * 4;
      if (data[i + 3] < 90) continue;
      const jitter = 0.35;
      const px = x / scale + (Math.random() - 0.5) * jitter;
      const py = y / scale + (Math.random() - 0.5) * jitter;
      const base = px < mid ? cRgb : oRgb;
      const tint = shade(base, 0.15 + Math.random() * 0.85);
      const ang = Math.random() * Math.PI * 2;
      const dist = 48 + Math.random() * Math.min(w, h) * 0.62;
      dots.push({
        tx: px,
        ty: py,
        sx: w / 2 + Math.cos(ang) * dist,
        sy: h / 2 + Math.sin(ang) * dist,
        r: tint.r,
        g: tint.g,
        b: tint.b,
        size: 1.55 + Math.random() * 0.7,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }
  return dots;
}

function hexPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    const px = x + r * Math.cos(a);
    const py = y + r * Math.sin(a);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export function ParticleLogo() {
  const { settings } = useSettings();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const motion =
      settings.motion && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarse = settings.lowPowerGlobe;
    let dots: Dot[] = [];
    let raf = 0;
    let running = true;
    const born = performance.now();
    const lines = Array.from({ length: coarse ? 4 : 8 }, () => ({
      i: 0,
      j: 0,
      delay: Math.random() * 0.35,
    }));

    const paint = (now: number) => {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      const t = (now - born) / 1000;
      const intro = motion ? Math.min(1, t / 1.4) : 1;
      const ease = 1 - (1 - intro) ** 3;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';

      if (motion && intro < 1 && dots.length > 1) {
        ctx.lineWidth = 1;
        for (const line of lines) {
          const a = dots[line.i];
          const b = dots[line.j];
          if (!a || !b) continue;
          const local = Math.max(0, Math.min(1, (intro - line.delay) / 0.45));
          if (local <= 0) continue;
          ctx.strokeStyle = `rgba(${a.r},${a.g},${a.b},${0.28 * (1 - intro)})`;
          ctx.beginPath();
          ctx.moveTo(a.sx, a.sy);
          ctx.lineTo(a.sx + (b.tx - a.sx) * local, a.sy + (b.ty - a.sy) * local);
          ctx.stroke();
        }
      }

      for (const p of dots) {
        const x = p.sx + (p.tx - p.sx) * ease;
        const y = p.sy + (p.ty - p.sy) * ease;
        const float = motion && intro >= 1 ? Math.sin(t * 1.05 + p.phase) * 0.65 : 0;
        const twinkle = motion
          ? 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 2.2 + p.phase * 1.7))
          : 0.85;
        hexPath(ctx, x, y + float, p.size);
        ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${twinkle})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(${Math.min(255, p.r + 40)},${Math.min(255, p.g + 40)},${Math.min(255, p.b + 40)},${0.35 * twinkle})`;
        ctx.lineWidth = 0.4;
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(80, wrap.clientWidth);
      const h = Math.max(64, wrap.clientHeight);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cyan = readCss('--cyan', '#35e6ff');
      const orange = readCss('--orange', '#ffae00');
      dots = sampleWord(w, h, cyan, orange, coarse);
      for (const line of lines) {
        line.i = Math.floor(Math.random() * Math.max(1, dots.length));
        line.j = Math.floor(Math.random() * Math.max(1, dots.length));
      }
      paint(performance.now());
    };

    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    const tick = (now: number) => {
      if (!running) return;
      paint(now);
      raf = requestAnimationFrame(tick);
    };

    if (motion) raf = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [settings.themeId, settings.motion, settings.lowPowerGlobe, settings.customThemes]);

  return (
    <div className="particle-logo" ref={wrapRef}>
      <canvas ref={canvasRef} aria-label="CILITERM" />
    </div>
  );
}
