import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { splitAtZero, type ProfitPoint, type ProfitSeries } from '../domain/profit';
import { formatMoney } from '../domain/money';
import { shortDate } from '../domain/dates';

const H = 168;
const PAD_TOP = 14;
const PAD_BOTTOM = 12;

const pctText = (p: number | null) => (p === null ? '' : `${p >= 0 ? '+' : '−'}${Math.abs(p * 100).toFixed(Math.abs(p) < 0.1 ? 1 : 0)}%`);

/**
 * Stock-style "profit vs day" line. Above the dashed zero line it's green, below it red
 * (split exactly at the crossings), with a fading area fill. Drag across it to scrub; let go
 * to return to the latest day. Vertical swipes still scroll the page (touch-action: pan-y).
 */
export function ProfitChart({ series, symbol, sinceLabel }: { series: ProfitSeries; symbol: string; sinceLabel: string }) {
  const uid = useId().replace(/:/g, '');
  const reduce = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(320);
  const [active, setActive] = useState<number | null>(null);
  const frame = useRef(0);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    setW(el.clientWidth || 320);
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width) || 320));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const pts = series.points;
  const geo = useMemo(() => {
    const vals = pts.map((p) => p.profit);
    let lo = Math.min(0, ...vals);
    let hi = Math.max(0, ...vals);
    if (lo === hi) [lo, hi] = [-1, 1];
    const span = hi - lo;
    lo -= span * 0.06;
    hi += span * 0.06;
    const n = Math.max(pts.length - 1, 1);
    const x = (i: number) => (i / n) * w;
    const y = (v: number) => PAD_TOP + ((hi - v) / (hi - lo)) * (H - PAD_TOP - PAD_BOTTOM);
    const parts = splitAtZero(pts.map((p, i) => ({ x: x(i), y: p.profit }))).map((s) => ({
      sign: s.sign,
      pts: s.points.map((q) => ({ x: q.x, y: y(q.y) })),
    }));
    const line = (ps: { x: number; y: number }[]) => ps.map((q, i) => `${i ? 'L' : 'M'}${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join('');
    const y0 = y(0);
    return {
      x, y, y0,
      parts: parts.map((p) => ({
        sign: p.sign,
        line: line(p.pts),
        area: `${line(p.pts)}L${p.pts[p.pts.length - 1].x.toFixed(1)} ${y0.toFixed(1)}L${p.pts[0].x.toFixed(1)} ${y0.toFixed(1)}Z`,
      })),
    };
  }, [pts, w]);

  const shown: ProfitPoint = pts[active ?? pts.length - 1];
  const up = shown.profit >= 0;
  const pct = series.baseline === 0 ? null : shown.profit / Math.abs(series.baseline);

  const pick = (clientX: number) => {
    const el = box.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const i = Math.round(((clientX - r.left) / r.width) * (pts.length - 1));
    const next = Math.min(pts.length - 1, Math.max(0, i));
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => setActive(next));
  };
  const release = () => {
    cancelAnimationFrame(frame.current);
    setActive(null);
  };

  const cx = active === null ? null : geo.x(active);
  const tipLeft = cx === null ? 0 : Math.min(Math.max(cx - 78, 0), Math.max(w - 156, 0));

  return (
    <div>
      {/* headline: latest, or the day under your finger */}
      <div className="flex items-baseline gap-2" aria-live="polite">
        <span className={`rounded-num money money-private text-[34px] font-bold leading-[40px] tracking-tight ${up ? 'text-gain' : 'text-loss'}`} data-testid="profit-value" data-value={shown.profit}>
          <span aria-hidden className="mr-1 text-[22px] align-[3px]">{up ? '▲' : '▼'}</span>
          {formatMoney(shown.profit, { symbol, signed: true })}
        </span>
        {pct !== null && (
          <span className={`money money-private text-subhead font-semibold ${up ? 'text-gain' : 'text-loss'}`} data-testid="profit-pct">{pctText(pct)}</span>
        )}
      </div>
      <div className="mt-0.5 h-5 truncate text-footnote text-label-2">
        {active === null ? <>{up ? 'Profit' : 'Loss'} {sinceLabel}</> : <>{shortDate(shown.date)}</>}
      </div>

      <div
        ref={box}
        className="relative mt-3 select-none"
        style={{ height: H, touchAction: 'pan-y' }}
        onPointerDown={(e) => pick(e.clientX)}
        onPointerMove={(e) => {
          // only while pressed: a finger, or a mouse with its button down
          if (e.pointerType === 'mouse' && !(e.buttons & 1)) return;
          pick(e.clientX);
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onPointerLeave={release}
        role="img"
        aria-label={`Profit ${sinceLabel}: ${formatMoney(series.profit, { symbol, signed: true })}`}
        data-testid="profit-chart"
      >
        <svg width={w} height={H} className="block overflow-visible" aria-hidden>
          <defs>
            <linearGradient id={`g-${uid}`} gradientUnits="userSpaceOnUse" x1="0" y1={PAD_TOP} x2="0" y2={geo.y0}>
              <stop offset="0" stopColor="var(--gain)" stopOpacity="0.32" />
              <stop offset="1" stopColor="var(--gain)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id={`r-${uid}`} gradientUnits="userSpaceOnUse" x1="0" y1={H - PAD_BOTTOM} x2="0" y2={geo.y0}>
              <stop offset="0" stopColor="var(--loss)" stopOpacity="0.30" />
              <stop offset="1" stopColor="var(--loss)" stopOpacity="0" />
            </linearGradient>
            <clipPath id={`c-${uid}`}>
              <motion.rect
                key={`${series.range}-${pts.length}`}
                x={0}
                y={-4}
                height={H + 8}
                initial={{ width: reduce ? w : 0 }}
                animate={{ width: w }}
                transition={{ duration: reduce ? 0 : 0.7, ease: [0.22, 1, 0.36, 1] }}
              />
            </clipPath>
          </defs>
          <line x1={0} x2={w} y1={geo.y0} y2={geo.y0} stroke="var(--label-3)" strokeWidth={1} strokeDasharray="3 4" />
          <g clipPath={`url(#c-${uid})`}>
            {geo.parts.map((p, i) => (
              <path key={`a${i}`} d={p.area} fill={`url(#${p.sign > 0 ? 'g' : 'r'}-${uid})`} />
            ))}
            {geo.parts.map((p, i) => (
              <path key={`l${i}`} d={p.line} fill="none" stroke={p.sign > 0 ? 'var(--gain)' : 'var(--loss)'} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
            ))}
          </g>
          {cx !== null && (
            <g>
              <line x1={cx} x2={cx} y1={0} y2={H} stroke="var(--label-2)" strokeWidth={1} />
              <circle cx={cx} cy={geo.y(shown.profit)} r={5.5} fill={up ? 'var(--gain)' : 'var(--loss)'} stroke="var(--frost-solid)" strokeWidth={2.5} />
            </g>
          )}
        </svg>
        {active !== null && (
          <div
            className="pointer-events-none absolute top-1 w-[156px] rounded-[12px] bg-[var(--frost-solid)] px-2.5 py-1.5 text-caption shadow-float"
            style={{ left: tipLeft }}
            data-testid="profit-tooltip"
          >
            <div className="font-semibold text-label">{shortDate(shown.date)}</div>
            <div className={`money money-private font-semibold ${up ? 'text-gain' : 'text-loss'}`}>{up ? '▲' : '▼'} {formatMoney(shown.profit, { symbol, signed: true })}</div>
            <div className="money money-private text-label-2">In {formatMoney(shown.income, { symbol })} · Out {formatMoney(shown.expense, { symbol })}</div>
          </div>
        )}
      </div>
    </div>
  );
}
