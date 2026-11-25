import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'filled' | 'tinted' | 'plain' | 'gray' | 'destructive';

const styles: Record<Variant, string> = {
  filled: 'bg-accent text-white',
  tinted: 'bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-accent',
  gray: 'bg-fill text-label',
  plain: 'text-accent',
  destructive: 'bg-[color-mix(in_srgb,var(--expense)_14%,transparent)] text-expense',
};

export function Button({
  variant = 'filled', size = 'lg', block, className = '', children, ...rest
}: { variant?: Variant; size?: 'lg' | 'md' | 'sm'; block?: boolean; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const sz = size === 'lg' ? 'h-[50px] px-5 text-headline rounded-ctl' : size === 'md' ? 'h-11 px-4 text-[15px] font-semibold rounded-ctl' : 'h-8 px-3 text-[15px] font-medium rounded-full';
  return (
    <button
      type="button"
      className={`pressable inline-flex items-center justify-center gap-2 ${sz} ${styles[variant]} ${block ? 'w-full' : ''} disabled:opacity-40 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Text button for nav bars (Cancel / Save). Min 44pt target. */
export function NavButton({ children, bold, className = '', ...rest }: { bold?: boolean; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`min-h-[44px] min-w-[44px] px-1 text-body text-accent active:opacity-50 disabled:opacity-30 ${bold ? 'font-semibold' : ''} ${className}`} {...rest}>
      {children}
    </button>
  );
}

/** Round icon button (gear, eye). */
export function IconButton({ children, label, className = '', ...rest }: { label: string; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" aria-label={label} className={`pressable inline-flex h-11 w-11 items-center justify-center rounded-full text-accent ${className}`} {...rest}>
      {children}
    </button>
  );
}
