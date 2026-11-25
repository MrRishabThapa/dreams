import { motion, useReducedMotion } from 'framer-motion';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

export function Chip({ active, icon, children, className = '', ...rest }: { active?: boolean; icon?: ReactNode; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`pressable inline-flex h-9 max-w-full shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[15px] font-medium ${
        active ? 'bg-accent text-white' : 'bg-surface text-label shadow-card'
      } ${className}`}
      {...rest}
    >
      {icon}
      <span className="truncate">{children}</span>
    </button>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 ${checked ? 'bg-income' : 'bg-fill'}`}
    >
      <motion.span
        className="absolute left-[2px] top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.15),0_3px_1px_rgba(0,0,0,0.06)]"
        animate={{ x: checked ? 20 : 0 }}
        transition={{ type: 'spring', stiffness: 600, damping: 36 }}
      />
    </button>
  );
}

export function ProgressRing({ value, size = 44, stroke = 5, color = 'var(--accent)', track = 'var(--fill)', children }: { value: number; size?: number; stroke?: number; color?: string; track?: string; children?: ReactNode }) {
  const reduce = useReducedMotion();
  const r = (size - stroke) / 2;
  const v = Math.max(0, Math.min(1, value || 0));
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          initial={false}
          animate={{ pathLength: v } as any}
          transition={reduce ? { duration: 0 } : { duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          style={{ opacity: v === 0 ? 0 : 1 }}
        />
      </svg>
      {children && <span className="absolute inset-0 flex items-center justify-center">{children}</span>}
    </span>
  );
}

export function Sparkline({ values, width = 120, height = 36, color = 'var(--accent)' }: { values: number[]; width?: number; height?: number; color?: string }) {
  if (values.length < 2) return <svg width={width} height={height} aria-hidden />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 3;
  const pts = values.map((v, i) => [pad + (i * (width - pad * 2)) / (values.length - 1), pad + (1 - (v - min) / span) * (height - pad * 2)] as const);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${height} L${pts[0][0].toFixed(1)},${height} Z`;
  const id = `sg${Math.round(values[0])}${values.length}`;
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.22" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="3" fill={color} />
    </svg>
  );
}

export function EmptyState({ art, title, message, action }: { art: ReactNode; title: string; message?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-10 py-10 text-center">
      <div className="mb-4 text-label-3">{art}</div>
      <div className="text-headline">{title}</div>
      {message && <p className="mt-1 text-subhead text-label-2">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Inset grouped text field row. */
export function Field({ label, ...rest }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="row sep flex min-h-[44px] items-center gap-3 bg-surface pl-4">
      <span className="row-body flex min-h-[44px] flex-1 items-center gap-3 pr-4">
        <span className="w-24 shrink-0 text-body">{label}</span>
        <input className="h-11 min-w-0 flex-1 bg-transparent text-right text-[17px] outline-none placeholder:text-label-3" {...rest} />
      </span>
    </label>
  );
}

/** Simple line illustrations for empty states (original, single-stroke). */
export const Art = {
  coins: (
    <svg width="96" height="72" viewBox="0 0 96 72" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <ellipse cx="38" cy="20" rx="22" ry="8" />
      <path d="M16 20v10c0 4.4 9.8 8 22 8s22-3.6 22-8V20" />
      <path d="M16 30v10c0 4.4 9.8 8 22 8 4 0 7.7-.4 11-1" />
      <ellipse cx="62" cy="46" rx="18" ry="7" />
      <path d="M44 46v9c0 3.9 8 7 18 7s18-3.1 18-7v-9" />
    </svg>
  ),
  moon: (
    <svg width="88" height="72" viewBox="0 0 88 72" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M52 58A26 26 0 1 1 40 10a20 20 0 0 0 12 48z" />
      <path d="M66 14l2.5 6 6 2.5-6 2.5-2.5 6-2.5-6-6-2.5 6-2.5z" />
      <circle cx="76" cy="40" r="1.5" />
    </svg>
  ),
  chart: (
    <svg width="88" height="72" viewBox="0 0 88 72" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M10 62h68" />
      <rect x="16" y="38" width="10" height="20" rx="3" />
      <rect x="34" y="24" width="10" height="34" rx="3" />
      <rect x="52" y="44" width="10" height="14" rx="3" />
      <path d="M14 22l18-10 16 8 22-12" />
    </svg>
  ),
  handshake: (
    <svg width="88" height="72" viewBox="0 0 88 72" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 30l14-10 12 4 10-4 12 6 16-8" />
      <path d="M22 20v22l14 12c3 2.5 6 2.5 8 0l16-14" />
      <path d="M72 18v22" />
      <path d="M44 38l-8-6" />
    </svg>
  ),
  list: (
    <svg width="88" height="72" viewBox="0 0 88 72" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="14" y="8" width="60" height="56" rx="10" />
      <path d="M26 24h36M26 36h36M26 48h20" />
    </svg>
  ),
};
