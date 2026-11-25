import { motion, useScroll, useTransform } from 'framer-motion';
import type { ReactNode } from 'react';

/**
 * iOS large-title page. The large title scrolls with content; a compact bar with a
 * translucent material fades in (opacity only) once the title scrolls under it.
 */
export function Page({ title, left, right, children, below }: { title: string; left?: ReactNode; right?: ReactNode; children: ReactNode; below?: ReactNode }) {
  const { scrollY } = useScroll();
  const barOpacity = useTransform(scrollY, [8, 36], [0, 1]);
  const smallTitle = useTransform(scrollY, [30, 46], [0, 1]);
  const largeScale = useTransform(scrollY, [-120, 0], [1.08, 1]);

  return (
    <div className="pb-tabbar min-h-[100dvh]">
      <header className="chrome fixed inset-x-0 top-0 z-40" style={{ paddingTop: 'var(--safe-top)' }}>
        <motion.div className="material hairline-b absolute inset-0" style={{ opacity: barOpacity }} />
        <div className="relative grid h-11 grid-cols-[1fr_auto_1fr] items-center px-2">
          <div className="flex items-center justify-self-start">{left}</div>
          <motion.div className="text-headline" style={{ opacity: smallTitle }} aria-hidden>
            {title}
          </motion.div>
          <div className="flex items-center justify-self-end">{right}</div>
        </div>
      </header>
      <div style={{ paddingTop: 'calc(var(--safe-top) + 44px)' }}>
        <motion.h1 className="chrome origin-left px-4 pb-2 pt-0.5 text-large-title" style={{ scale: largeScale }}>
          {title}
        </motion.h1>
        {below}
        {children}
      </div>
    </div>
  );
}
