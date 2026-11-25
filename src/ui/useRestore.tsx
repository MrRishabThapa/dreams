import { useRef, type ChangeEvent } from 'react';
import { restoreBackup, validateBackup, type Backup } from '../db/backup';
import { useActionSheet } from './ActionSheet';
import { useToast } from './Toast';

/**
 * Pick a Dreams backup (.json) and restore it. When `confirmReplace` is set, asks first
 * (restoring replaces everything on this iPhone). Returns an opener and the hidden input.
 */
export function useRestore({ confirmReplace, onDone }: { confirmReplace: boolean; onDone?: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const ask = useActionSheet();
  const toast = useToast();

  const onChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      toast({ message: 'That file isn’t a Dreams backup', tone: 'error' });
      return;
    }
    const problem = validateBackup(parsed);
    if (problem) {
      toast({ message: problem, tone: 'error' });
      return;
    }
    const b = parsed as Backup;
    if (confirmReplace) {
      const when = new Date(b.exported_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      const choice = await ask({
        title: 'Replace all data?',
        message: `Everything on this iPhone is replaced with the backup from ${when} (${b.tables.transactions?.length ?? 0} transactions).`,
        options: [{ label: 'Replace with Backup', value: 'go', destructive: true }],
      });
      if (choice !== 'go') return;
    }
    try {
      await restoreBackup(b);
      toast({ message: 'Backup restored' });
      onDone?.();
    } catch (err) {
      toast({ message: (err as Error).message, tone: 'error' });
    }
  };

  const input = <input ref={ref} type="file" accept="application/json,.json" className="hidden" aria-label="Backup file" onChange={onChange} data-testid="restore-input" />;
  return { open: () => ref.current?.click(), input };
}
