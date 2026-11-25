/**
 * One-shot, lightweight confetti on a <canvas> (≤ 1 s, 60 particles). Skipped entirely
 * when the user prefers reduced motion. No React, no layout work: one fixed canvas.
 */
const COLORS = ['#7C3AED', '#A78BFA', '#34C759', '#FF9500', '#FF2D55', '#32ADE6', '#FFCC00'];

export function celebrate(origin: { x: number; y: number } = { x: 0.5, y: 0.35 }) {
  if (typeof window === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = window.innerWidth;
  const h = window.innerHeight;
  const canvas = document.createElement('canvas');
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = `position:fixed;inset:0;width:${w}px;height:${h}px;pointer-events:none;z-index:300`;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas.remove();
  ctx.scale(dpr, dpr);

  const ox = origin.x * w;
  const oy = origin.y * h;
  const parts = Array.from({ length: 60 }, (_, i) => {
    const angle = (Math.PI * 2 * i) / 60 + Math.random() * 0.3;
    const speed = 5 + Math.random() * 6;
    return {
      x: ox, y: oy,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 4,
      r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4,
      s: 5 + Math.random() * 5, c: COLORS[i % COLORS.length],
    };
  });

  const start = performance.now();
  const DURATION = 950;
  const frame = (now: number) => {
    const t = now - start;
    ctx.clearRect(0, 0, w, h);
    const fade = t > DURATION * 0.6 ? 1 - (t - DURATION * 0.6) / (DURATION * 0.4) : 1;
    ctx.globalAlpha = Math.max(0, fade);
    for (const p of parts) {
      p.vy += 0.35;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      ctx.restore();
    }
    if (t < DURATION) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
