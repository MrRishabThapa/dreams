/**
 * Local write notifications. Every user write through the repo calls emitWrite(); the sync
 * controller listens to schedule a debounced auto-sync. Rows applied by a sync pull are
 * written directly (not through the repo), so pulls never trigger another sync.
 */
type Listener = () => void;
const listeners = new Set<Listener>();

export function onWrite(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emitWrite(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* a listener must never break a write */
    }
  }
}
