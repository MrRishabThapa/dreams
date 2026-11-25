import { AnimatePresence, motion, useDragControls, useReducedMotion, type PanInfo } from 'framer-motion';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useSpring } from '../lib/motion';

/* ---------- body scroll lock (ref-counted; keeps scroll position on iOS) ---------- */
let locks = 0;
let savedY = 0;
function lockScroll() {
  if (locks++ === 0) {
    savedY = window.scrollY;
    const b = document.body.style;
    b.position = 'fixed';
    b.top = `-${savedY}px`;
    b.left = '0';
    b.right = '0';
  }
}
function unlockScroll() {
  if (--locks === 0) {
    const b = document.body.style;
    b.position = b.top = b.left = b.right = '';
    window.scrollTo(0, savedY);
  }
}

/* ---------- keyboard awareness via visualViewport ---------- */
let kbInit = false;
export function initKeyboardInset() {
  if (kbInit || typeof window === 'undefined' || !window.visualViewport) return;
  kbInit = true;
  const vv = window.visualViewport;
  const update = () => {
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--kb', `${Math.round(kb)}px`);
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  update();
}

let safeTopCache: number | null = null;
/** Measures env(safe-area-inset-top) once (CSS env() can't be read from JS directly). */
export function getSafeTop(): number {
  if (safeTopCache !== null) return safeTopCache;
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;top:0;visibility:hidden;padding-top:env(safe-area-inset-top)';
  document.body.appendChild(el);
  safeTopCache = parseFloat(getComputedStyle(el).paddingTop) || 0;
  el.remove();
  return safeTopCache;
}

export type Detent = 'medium' | 'large';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  detents?: Detent[];
  initial?: Detent;
  children: ReactNode;
  /** stacking order when several sheets are open */
  z?: number;
  /** label for tests / a11y */
  label?: string;
  /** dismissing by drag or backdrop is blocked (e.g. unsaved changes) */
  onAttemptDismiss?: () => boolean;
  /** content fills the panel as a flex column instead of scrolling (child decides what scrolls) */
  fill?: boolean;
}

export function Sheet(props: SheetProps) {
  return createPortal(<AnimatePresence>{props.open && <SheetPanel key="sheet" {...props} />}</AnimatePresence>, document.body);
}

function SheetPanel({ onClose, title, left, right, detents = ['large'], initial, children, z = 0, label, onAttemptDismiss, fill }: SheetProps) {
  const controls = useDragControls();
  const t = useSpring();
  const reduce = useReducedMotion();
  const [vh, setVh] = useState(() => window.innerHeight);
  const [detent, setDetent] = useState<Detent>(initial ?? detents[0]);
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const onR = () => setVh(window.innerHeight);
    window.addEventListener('resize', onR);
    return () => window.removeEventListener('resize', onR);
  }, []);

  useEffect(() => {
    lockScroll();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && tryClose();
    window.addEventListener('keydown', onKey);
    return () => {
      unlockScroll();
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const safeTop = getSafeTop();
  const largeH = vh - Math.max(safeTop, 20) - 10;
  const mediumH = Math.round(vh * 0.56);
  const offset = detent === 'large' ? 0 : largeH - mediumH;

  const tryClose = () => {
    if (onAttemptDismiss && !onAttemptDismiss()) return;
    onClose();
  };

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const dy = info.offset.y;
    const v = info.velocity.y;
    if (dy < -60 || v < -500) {
      if (detents.includes('large')) setDetent('large');
      return;
    }
    if (dy > 120 || v > 600) {
      if (detent === 'large' && detents.includes('medium') && dy < largeH - mediumH + 80 && v < 1400) setDetent('medium');
      else tryClose();
    }
  };

  return (
    <div className="fixed inset-0" style={{ zIndex: 60 + z * 2 }} role="dialog" aria-modal="true" aria-label={label ?? (typeof title === 'string' ? title : 'Sheet')}>
      <motion.div
        className="absolute inset-0"
        style={{ background: 'var(--dim)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.22 }}
        onClick={tryClose}
      />
      <motion.div
        ref={panelRef}
        className="absolute inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-t-sheet bg-[var(--sheet-bg,var(--bg))]"
        style={{ height: largeH, boxShadow: 'var(--shadow-float)' }}
        initial={reduce ? { opacity: 0, y: offset } : { y: largeH }}
        animate={{ y: offset, opacity: 1 }}
        exit={reduce ? { opacity: 0 } : { y: largeH }}
        transition={t}
        drag="y"
        dragListener={false}
        dragControls={controls}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.08, bottom: 0.9 }}
        dragMomentum={false}
        onDragEnd={onDragEnd}
      >
        <div
          className="chrome shrink-0 touch-none"
          onPointerDown={(e) => controls.start(e)}
        >
          <div className="flex justify-center pt-[6px]">
            <span className="h-[5px] w-9 rounded-full bg-label-3" />
          </div>
          {(title || left || right) && (
            <div className="grid h-[48px] grid-cols-[1fr_auto_1fr] items-center px-4">
              <div className="justify-self-start">{left}</div>
              <div className="max-w-[60vw] truncate text-headline">{title}</div>
              <div className="justify-self-end">{right}</div>
            </div>
          )}
        </div>
        <div
          className={fill ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : 'sheet-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain'}
          style={{ paddingBottom: `calc(max(var(--kb), var(--safe-bottom)) + ${offset}px + ${fill ? 8 : 16}px)` }}
        >
          {children}
        </div>
      </motion.div>
    </div>
  );
}
