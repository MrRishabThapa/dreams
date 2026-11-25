import { motion } from 'framer-motion';
import { useId } from 'react';
import { useSpring, SNAPPY } from '../lib/motion';

export function Segmented<T extends string>({
  value, options, onChange, className = '',
}: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; className?: string }) {
  const id = useId();
  const t = useSpring(SNAPPY);
  return (
    <div role="tablist" className={`relative flex h-9 rounded-[9px] bg-fill p-[2px] ${className}`}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(o.value)}
            className="relative flex-1 text-[13px] font-semibold leading-none"
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                transition={t}
                className="absolute inset-0 rounded-[7px] bg-[var(--thumb)] shadow-[0_3px_8px_rgba(0,0,0,0.12),0_3px_1px_rgba(0,0,0,0.04)]"
              />
            )}
            <span className="relative z-[1] text-label">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
