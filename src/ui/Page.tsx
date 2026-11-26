import { motion, useScroll, useTransform } from 'framer-motion';
import type { ReactNode } from 'react';

/**
 * iOS large-title page. The large title scrolls with the content and fades out as it
 * reaches the bar; the compact title and the translucent bar fade in just after, so the
 * title is never shown twice (opacity only).
 */
export function Page({ title, heading, left, right, children, below }: {
  /** compact bar title (and the large title unless `heading` is given) */
  title: string;
  /** large-title content when it needs more than plain text */
  heading?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  below?: ReactNode;
}) {
  const { scrollY } = useScroll();
  const barOpacity = useTransform(scrollY, [8, 36], [0, 1]);
  const largeOpacity = useTransform(scrollY, [0, 26], [1, 0]);
  const smallTitle = useTransform(scrollY, [26, 42], [0, 1]);
  const largeScale = useTransform(scrollY, [-120, 0], [1.08, 1]);

  return (
    <div className="pb-tabbar min-h-[100dvh]">
      <header className="chrome fixed inset-x-0 top-0 z-40" style={{ paddingTop: 'var(--safe-top)' }}>
        <motion.div className="material hairline-b absolute inset-0" style={{ opacity: barOpacity }} />
        <div className="relative grid h-11 grid-cols-[1fr_minmax(0,auto)_1fr] items-center px-2">
          <div className="flex items-center justify-self-start">{left}</div>
          <motion.div className="max-w-[56vw] truncate text-headline" style={{ opacity: smallTitle }} aria-hidden data-testid="bar-title">
            {title}
          </motion.div>
          <div className="flex items-center justify-self-end">{right}</div>
        </div>
      </header>
      <div style={{ paddingTop: 'calc(var(--safe-top) + 44px)' }}>
        <motion.h1 className="chrome min-w-0 origin-left px-4 pb-2 pt-0.5 text-large-title" style={{ scale: largeScale, opacity: largeOpacity }}>
          {heading ?? title}
        </motion.h1>
        {below}
        {children}
      </div>
    </div>
  );
}
