import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

export function Group({ header, footer, children, className = '' }: { header?: ReactNode; footer?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`mx-4 ${className}`}>
      {header && <h3 className="chrome mb-1.5 px-4 text-footnote uppercase text-label-2">{header}</h3>}
      <div className="card overflow-hidden">{children}</div>
      {footer && <p className="mt-1.5 px-4 text-footnote text-label-2">{footer}</p>}
    </section>
  );
}

interface RowProps {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  value?: ReactNode;
  chevron?: boolean;
  onPress?: () => void;
  destructive?: boolean;
  accent?: boolean;
  last?: boolean;
  className?: string;
  children?: ReactNode;
}

/** Inset grouped row; hairline separator inset from the text (not the icon). */
export function Row({ icon, title, subtitle, value, chevron, onPress, destructive, accent, className = '', children }: RowProps) {
  const Tag = onPress ? 'button' : 'div';
  return (
    <Tag
      type={onPress ? 'button' : undefined}
      onClick={onPress}
      className={`row sep group flex min-h-[44px] w-full items-center gap-3 bg-surface pl-4 text-left ${onPress ? 'active:bg-surface-3' : ''} ${className}`}
    >
      {icon}
      <div className="row-body flex min-h-[44px] min-w-0 flex-1 items-center gap-2 py-2.5 pr-4">
        <div className="min-w-0 flex-1">
          <div className={`truncate text-body ${destructive ? 'text-expense' : accent ? 'text-accent' : ''}`}>{title}</div>
          {subtitle && <div className="truncate text-footnote text-label-2">{subtitle}</div>}
        </div>
        {value !== undefined && <div className="shrink-0 text-body text-label-2">{value}</div>}
        {children}
        {chevron && <ChevronRight size={18} className="shrink-0 text-label-3" strokeWidth={2.4} />}
      </div>
    </Tag>
  );
}
