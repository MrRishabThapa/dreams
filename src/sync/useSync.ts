import { useSyncExternalStore } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getSyncState, subscribeSync, type SyncState } from './controller';
import { pendingCount } from './engine';

export type ChipStatus = 'synced' | 'pending' | 'offline' | 'error' | 'syncing';

export function useSync(): SyncState & { pending: number; chip: ChipStatus | null } {
  const s = useSyncExternalStore(subscribeSync, getSyncState, getSyncState);
  const pending = useLiveQuery(() => pendingCount(), [], 0) ?? 0;
  let chip: ChipStatus | null = null;
  if (s.configured && s.signedIn) {
    chip = !s.online ? 'offline' : s.syncing ? 'syncing' : s.error && s.error.kind !== 'offline' ? 'error' : pending > 0 ? 'pending' : 'synced';
  }
  return { ...s, pending, chip };
}
