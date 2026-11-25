import { AnimatePresence, motion } from 'framer-motion';
import { useSync } from '../sync/useSync';
import { dismissSyncBanner, syncNow } from '../sync/controller';
import { useSpring, SNAPPY } from '../lib/motion';
import { useApp } from '../lib/app';

/** Auto-sync off + back online + local changes → "You're online. Sync N changes?" */
export function SyncBanner() {
  const s = useSync();
  const { settings } = useApp();
  const t = useSpring(SNAPPY);
  const show = s.configured && s.signedIn && s.online && !s.syncing && !s.dismissed && !settings?.auto_sync && s.pending > 0;
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={t}
          className="pointer-events-none fixed inset-x-0 z-[45] flex justify-center px-4"
          // above the tab bar, so it never covers the navigation bar's buttons
          style={{ bottom: 'calc(var(--tabbar-h) + var(--safe-bottom) + 14px)' }}
          role="status"
          aria-label="Sync changes"
        >
          <div className="pointer-events-auto flex min-h-[44px] items-center gap-1 rounded-full bg-[var(--toast-bg)] py-1.5 pl-4 pr-1.5 text-[14px] font-medium text-[var(--toast-fg)] shadow-float">
            <span className="mr-1 whitespace-nowrap">You’re online. Sync {s.pending} change{s.pending === 1 ? '' : 's'}?</span>
            <button type="button" className="min-h-[36px] rounded-full bg-accent px-4 font-semibold text-on-accent" onClick={() => void syncNow()}>
              Sync
            </button>
            <button type="button" className="min-h-[36px] px-2.5 text-label-2" onClick={dismissSyncBanner}>
              Later
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
