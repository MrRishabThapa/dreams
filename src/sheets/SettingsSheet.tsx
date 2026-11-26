import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Cloud, CloudOff, Download, FileSpreadsheet, Lock, ScrollText, Tags, Upload } from 'lucide-react';
import { SyncChip } from '../ui/SyncChip';
import { useSync } from '../sync/useSync';
import { Sheet } from '../ui/Sheet';
import { NavButton } from '../ui/Button';
import { Group, Row } from '../ui/List';
import { Segmented } from '../ui/Segmented';
import { Toggle } from '../ui/bits';
import { useToast } from '../ui/Toast';
import { useActionSheet } from '../ui/ActionSheet';
import { useRestore } from '../ui/useRestore';
import { useApp } from '../lib/app';
import { getMeta, patch, resetAll } from '../db/repo';
import { useData } from '../db/hooks';
import { backupNudge, exportBackupFile, shareOrDownload, transactionsCSV } from '../db/backup';
import { formatMoney, parseMoney } from '../domain/money';
import { today } from '../domain/dates';
import { Logo } from '../ui/Logo';
import { displayName, NAME_MAX } from '../domain/greeting';

const ic = (el: React.ReactNode) => <span className="flex h-[30px] w-[30px] items-center justify-center text-accent">{el}</span>;

export function SettingsSheet({ open, onClose, z }: { open: boolean; onClose: () => void; z: number }) {
  const { settings, setTheme, hide, setHide, openSheet } = useApp();
  const data = useData();
  const toast = useToast();
  const ask = useActionSheet();
  const restore = useRestore({ confirmReplace: true, onDone: onClose });
  const sync = useSync();
  const [name, setName] = useState(settings?.display_name ?? '');
  const [symbol, setSymbol] = useState(settings?.symbol ?? 'Rs');
  const [target, setTarget] = useState(settings?.monthly_savings_target_minor ? formatMoney(settings.monthly_savings_target_minor, { bare: true }).replace(/,/g, '') : '');
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const lastBackup = useLiveQuery(() => getMeta<string | null>('lastBackupAt', null), []);
  const lockOn = useLiveQuery(async () => {
    const l = await getMeta<{ faceId?: unknown } | null>('appLock', null);
    return l ? (l.faceId ? 'face' : 'pin') : null;
  }, []);

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
  }, []);

  if (!settings) return null;

  const hasData = !!data && data.transactions.some((t) => !t.deleted_at);
  // with sync on there is a cloud copy, so the backup nudge goes quiet
  const nudge = sync.signedIn ? null : backupNudge(lastBackup ?? null, hasData);
  const lastLabel = lastBackup ? new Date(lastBackup).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Never';

  const saveName = () => {
    const n = displayName(name);
    setName(n ?? '');
    if (n !== (displayName(settings.display_name) ?? null)) void patch('user_settings', settings.id, { display_name: n });
  };
  const saveSymbol = () => {
    const s = symbol.trim().slice(0, 6) || 'Rs';
    if (s !== settings.symbol) void patch('user_settings', settings.id, { symbol: s });
  };
  const saveTarget = () => {
    const v = target.trim() === '' ? null : parseMoney(target);
    if (v === null && target.trim() !== '') return toast({ message: 'Enter a number', tone: 'error' });
    if (v !== settings.monthly_savings_target_minor) void patch('user_settings', settings.id, { monthly_savings_target_minor: v && v > 0 ? v : null });
  };

  const backup = async () => {
    const r = await exportBackupFile();
    if (r === 'downloaded') toast({ message: 'Backup saved to Downloads. Keep it somewhere safe.' });
    if (r === 'shared') toast({ message: 'Backup shared' });
  };
  const csv = async () => {
    if (!data) return;
    const r = await shareOrDownload(`dreams-transactions-${today()}.csv`, 'text/csv', transactionsCSV(data.transactions, data.accounts, data.categories, data.debts));
    if (r === 'downloaded') toast({ message: 'Transactions saved as CSV' });
  };

  const reset = async () => {
    const a = await ask({ title: 'Erase all data?', message: 'Every account, transaction and setting on this iPhone will be erased. This cannot be undone.', options: [{ label: 'Erase All Data', value: 'go', destructive: true }] });
    if (a !== 'go') return;
    const b = await ask({ title: 'Are you absolutely sure?', message: 'There is no copy anywhere unless you backed up.', options: [{ label: 'Yes, Erase Everything', value: 'go', destructive: true }] });
    if (b !== 'go') return;
    await resetAll();
    try {
      localStorage.removeItem('dreams.hide');
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
    location.reload();
  };

  return (
    <Sheet open={open} onClose={onClose} z={z} title="Settings" label="Settings" right={<NavButton bold onClick={onClose}>Done</NavButton>}>
      {restore.input}
      <Group header="Profile" className="mt-2" footer="Used to greet you on Home. It syncs with your other devices.">
        <label className="row sep flex min-h-[44px] items-center bg-surface pl-4">
          <span className="row-body flex flex-1 items-center gap-3 pr-4">
            <span className="shrink-0 text-body">Your name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              maxLength={NAME_MAX}
              placeholder="Optional"
              autoComplete="given-name"
              enterKeyHint="done"
              aria-label="Your name"
              className="h-11 min-w-0 flex-1 bg-transparent text-right text-[17px] text-label-2 outline-none placeholder:text-label-3"
            />
          </span>
        </label>
      </Group>

      <Group header="Appearance" className="mt-6">
        <div className="sep px-4 py-3">
          <Segmented
            value={settings.theme}
            onChange={setTheme}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </div>
        <Row title="Hide balances">
          <Toggle checked={hide} onChange={setHide} label="Hide balances" />
        </Row>
      </Group>

      <Group header="Security" className="mt-6" footer="A screen lock: it hides Dreams from others, it doesn’t encrypt this iPhone’s data.">
        <Row icon={ic(<Lock size={20} />)} title="App Lock" value={lockOn ? (lockOn === 'face' ? 'Face ID' : 'PIN') : 'Off'} chevron onPress={() => openSheet({ kind: 'appLock' })} />
      </Group>

      <Group header="Money" className="mt-6" footer="Amounts use lakh/crore grouping, e.g. Rs 1,20,000.">
        <label className="row sep flex min-h-[44px] items-center bg-surface pl-4">
          <span className="row-body flex flex-1 items-center gap-3 pr-4">
            <span className="flex-1 text-body">Currency symbol</span>
            <input value={symbol} onChange={(e) => setSymbol(e.target.value)} onBlur={saveSymbol} maxLength={6} aria-label="Currency symbol" className="h-11 w-24 bg-transparent text-right text-[17px] text-label-2 outline-none" />
          </span>
        </label>
        <label className="row sep flex min-h-[44px] items-center bg-surface pl-4">
          <span className="row-body flex flex-1 items-center gap-3 pr-4">
            <span className="flex-1 text-body">Monthly savings target</span>
            <input value={target} onChange={(e) => setTarget(e.target.value)} onBlur={saveTarget} inputMode="decimal" placeholder="None" aria-label="Monthly savings target" className="money h-11 w-32 bg-transparent text-right text-[17px] text-label-2 outline-none placeholder:text-label-3" />
          </span>
        </label>
      </Group>

      <Group className="mt-6">
        <Row icon={ic(<Tags size={20} />)} title="Categories" chevron onPress={() => openSheet({ kind: 'categories' })} />
      </Group>

      <Group header="Sync" className="mt-6" footer={sync.signedIn ? undefined : 'Sign in to back up to your Supabase project and keep devices in step.'}>
        <Row
          icon={ic(sync.signedIn ? <Cloud size={20} /> : <CloudOff size={20} className="text-label-2" />)}
          title="Sync"
          value={sync.signedIn ? <SyncChip /> : <span className="text-label-2">{sync.configured ? 'Off' : 'Not set up'}</span>}
          chevron
          onPress={() => openSheet({ kind: 'sync' })}
        />
      </Group>

      <Group header="Backup & export" className="mt-6" footer={nudge ?? 'A backup is one file with everything. Restoring it replaces what’s on this iPhone.'}>
        <Row title="Last backup" value={<span className={nudge ? 'font-medium text-warn' : ''} data-testid="last-backup">{lastLabel}</span>} />
        <Row icon={ic(<Download size={20} />)} title="Back Up Now" accent onPress={backup} />
        <Row icon={ic(<Upload size={20} />)} title="Restore from Backup" accent onPress={restore.open} />
        <Row icon={ic(<FileSpreadsheet size={20} />)} title="Export Transactions (CSV)" accent onPress={csv} />
      </Group>

      <Group header="Data" className="mt-6" footer={persisted ? 'Storage is persistent: iOS won’t clear it to free space.' : 'Storage is best-effort. Add Dreams to your Home Screen and keep a backup.'}>
        <Row title="Storage" value={persisted === null ? '—' : persisted ? 'Persistent' : 'Best-effort'} />
        <Row title="Erase all data" destructive onPress={reset} />
      </Group>

      <Group header="About" className="mt-6">
        <div className="row sep flex items-center gap-3 bg-surface px-4 py-3" data-testid="about-row">
          <Logo size={52} label="Dreams logo" />
          <div className="min-w-0 flex-1">
            <div className="text-headline">Dreams</div>
            <div className="text-footnote text-label-2">Version {__APP_VERSION__} · Know your money. Fund your dreams.</div>
          </div>
        </div>
        <Row icon={ic(<ScrollText size={20} />)} title="Patch notes" value={`v${__APP_VERSION__}`} chevron onPress={() => openSheet({ kind: 'patchNotes' })} />
      </Group>
    </Sheet>
  );
}
