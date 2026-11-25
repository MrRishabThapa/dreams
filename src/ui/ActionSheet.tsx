import { AnimatePresence, motion } from 'framer-motion';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useSpring } from '../lib/motion';

export interface ActionOption {
  label: string;
  value: string;
  destructive?: boolean;
}
interface Request {
  title?: string;
  message?: string;
  options: ActionOption[];
  cancelLabel?: string;
}

const Ctx = createContext<(r: Request) => Promise<string | null>>(async () => null);
/** iOS-style action sheet. Resolves with the chosen value, or null on cancel. */
export const useActionSheet = () => useContext(Ctx);

/** Convenience: destructive confirm. */
export function useConfirm() {
  const ask = useActionSheet();
  return useCallback(
    async (message: string, confirmLabel: string, title?: string) =>
      (await ask({ title, message, options: [{ label: confirmLabel, value: 'ok', destructive: true }] })) === 'ok',
    [ask],
  );
}

export function ActionSheetProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<Request | null>(null);
  const resolver = useRef<(v: string | null) => void>();
  const t = useSpring();

  const ask = useCallback((r: Request) => {
    resolver.current?.(null);
    setReq(r);
    return new Promise<string | null>((res) => (resolver.current = res));
  }, []);

  const done = (v: string | null) => {
    resolver.current?.(v);
    resolver.current = undefined;
    setReq(null);
  };

  return (
    <Ctx.Provider value={ask}>
      {children}
      {createPortal(
        <AnimatePresence>
          {req && (
            <div className="fixed inset-0 z-[150]" role="alertdialog" aria-modal="true" aria-label={req.title ?? req.message ?? 'Choose'}>
              <motion.div className="absolute inset-0" style={{ background: 'var(--dim)' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => done(null)} />
              <motion.div
                className="absolute inset-x-2 bottom-0 flex flex-col gap-2"
                style={{ paddingBottom: 'calc(var(--safe-bottom) + 8px)' }}
                initial={{ y: 320 }}
                animate={{ y: 0 }}
                exit={{ y: 320 }}
                transition={t}
              >
                <div className="overflow-hidden rounded-[14px] bg-[var(--actionsheet-bg)]">
                  {(req.title || req.message) && (
                    <div className="px-4 py-3.5 text-center">
                      {req.title && <div className="text-footnote font-semibold text-label-2">{req.title}</div>}
                      {req.message && <div className="text-footnote text-label-2">{req.message}</div>}
                    </div>
                  )}
                  {req.options.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => done(o.value)}
                      className={`block h-[57px] w-full text-[20px] active:bg-surface-3 ${o.destructive ? 'text-expense' : 'text-accent'}`}
                      style={{ boxShadow: 'inset 0 0.5px 0 var(--separator)' }}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => done(null)} className="h-[57px] rounded-[14px] bg-surface text-[20px] font-semibold text-accent active:bg-surface-3">
                  {req.cancelLabel ?? 'Cancel'}
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </Ctx.Provider>
  );
}
