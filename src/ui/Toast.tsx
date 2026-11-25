import { AnimatePresence, motion } from 'framer-motion';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useSpring, SNAPPY } from '../lib/motion';

interface ToastOpts {
  message: string;
  action?: { label: string; onPress: () => void };
  duration?: number;
  tone?: 'default' | 'error';
}
interface ToastItem extends ToastOpts {
  id: number;
}

const Ctx = createContext<(o: ToastOpts) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [item, setItem] = useState<ToastItem | null>(null);
  const timer = useRef<number>();
  const seq = useRef(0);
  const t = useSpring(SNAPPY);

  const show = useCallback((o: ToastOpts) => {
    window.clearTimeout(timer.current);
    const id = ++seq.current;
    setItem({ ...o, id });
    timer.current = window.setTimeout(() => setItem((cur) => (cur?.id === id ? null : cur)), o.duration ?? (o.action ? 5000 : 2600));
  }, []);

  return (
    <Ctx.Provider value={show}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 top-0 z-[200] flex justify-center px-4" style={{ paddingTop: 'calc(var(--safe-top) + 8px)' }}>
          <AnimatePresence>
            {item && (
              <motion.div
                key={item.id}
                role="status"
                aria-live="polite"
                initial={{ y: -80, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -80, opacity: 0 }}
                transition={t}
                drag="y"
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0.6, bottom: 0.1 }}
                onDragEnd={(_, i) => i.offset.y < -20 && setItem(null)}
                className="pointer-events-auto flex min-h-[44px] max-w-[92vw] items-center gap-3 rounded-full bg-[var(--toast-bg)] py-2 pl-5 pr-2 text-[15px] font-medium text-[var(--toast-fg)] shadow-float"
              >
                <span className={`truncate ${item.tone === 'error' ? 'text-expense' : ''}`}>{item.message}</span>
                {item.action ? (
                  <button
                    type="button"
                    className="min-h-[36px] rounded-full px-3 font-semibold text-accent active:opacity-60"
                    onClick={() => {
                      item.action!.onPress();
                      setItem(null);
                    }}
                  >
                    {item.action.label}
                  </button>
                ) : (
                  <span className="w-3" />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>,
        document.body,
      )}
    </Ctx.Provider>
  );
}
