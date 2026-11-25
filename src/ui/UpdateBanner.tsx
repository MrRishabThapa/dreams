import { AnimatePresence, motion } from 'framer-motion';
import { useRegisterSW } from 'virtual:pwa-register/react';

/** "Update available · Reload". Never swaps code silently (registerType: 'prompt'). */
export function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true });
  return (
    <AnimatePresence>
      {needRefresh && (
        <motion.div
          initial={{ y: -80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -80, opacity: 0 }}
          className="fixed inset-x-0 top-0 z-[190] flex justify-center px-4"
          style={{ paddingTop: 'calc(var(--safe-top) + 8px)' }}
        >
          <div className="flex min-h-[44px] items-center gap-2 rounded-full bg-[var(--toast-bg)] py-1.5 pl-5 pr-1.5 text-[15px] font-medium text-[var(--toast-fg)] shadow-float">
            <span>Update available</span>
            <button type="button" className="min-h-[36px] rounded-full bg-accent px-4 font-semibold text-on-accent" onClick={() => updateServiceWorker(true)}>
              Reload
            </button>
            <button type="button" aria-label="Later" className="min-h-[36px] px-2 text-label-2" onClick={() => setNeedRefresh(false)}>
              Later
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
