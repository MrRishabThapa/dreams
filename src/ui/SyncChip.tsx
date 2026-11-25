import { Cloud, CloudOff, CloudAlert, RefreshCw } from 'lucide-react';
import { useSync } from '../sync/useSync';

/** Synced · N pending · Offline · Sync error (only when signed in to sync). */
export function SyncChip({ onPress, className = '' }: { onPress?: () => void; className?: string }) {
  const { chip, pending } = useSync();
  if (!chip) return null;
  const map = {
    synced: { icon: <Cloud size={13} />, text: 'Synced', tone: 'text-label-2' },
    syncing: { icon: <RefreshCw size={13} className="animate-spin motion-reduce:animate-none" />, text: 'Syncing…', tone: 'text-label-2' },
    pending: { icon: <Cloud size={13} />, text: `${pending} pending`, tone: 'text-accent' },
    offline: { icon: <CloudOff size={13} />, text: pending ? `Offline · ${pending} pending` : 'Offline', tone: 'text-label-2' },
    error: { icon: <CloudAlert size={13} />, text: 'Sync error', tone: 'text-expense' },
  }[chip];
  return (
    <button
      type="button"
      onClick={onPress}
      data-testid="sync-chip"
      aria-label={`Sync status: ${map.text}`}
      className={`chrome inline-flex min-h-[28px] items-center gap-1.5 rounded-full bg-fill px-2.5 py-1 text-footnote font-medium ${map.tone} ${className}`}
    >
      {map.icon}
      {map.text}
    </button>
  );
}
