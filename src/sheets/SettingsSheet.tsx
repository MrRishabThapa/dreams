import { useEffect, useState } from 'react';
import { Sheet } from '../ui/Sheet';
import { NavButton } from '../ui/Button';
import { Group, Row } from '../ui/List';
import { Segmented } from '../ui/Segmented';
import { Toggle } from '../ui/bits';
import { useToast } from '../ui/Toast';
import { useActionSheet } from '../ui/ActionSheet';
import { useApp } from '../lib/app';
import { patch, resetAll } from '../db/repo';
import { formatMoney, parseMoney } from '../domain/money';

export function SettingsSheet({ open, onClose, z }: { open: boolean; onClose: () => void; z: number }) {
  const { settings, setTheme, hide, setHide } = useApp();
  const toast = useToast();
  const ask = useActionSheet();
  const [symbol, setSymbol] = useState(settings?.symbol ?? 'Rs');
  const [target, setTarget] = useState(settings?.monthly_savings_target_minor ? formatMoney(settings.monthly_savings_target_minor, { bare: true }).replace(/,/g, '') : '');
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
  }, []);

  if (!settings) return null;

  const saveSymbol = () => {
    const s = symbol.trim().slice(0, 6) || 'Rs';
    if (s !== settings.symbol) void patch('user_settings', settings.id, { symbol: s });
  };
  const saveTarget = () => {
    const v = target.trim() === '' ? null : parseMoney(target);
    if (v === null && target.trim() !== '') return toast({ message: 'Enter a number', tone: 'error' });
    if (v !== settings.monthly_savings_target_minor) void patch('user_settings', settings.id, { monthly_savings_target_minor: v && v > 0 ? v : null });
  };

  const reset = async () => {
    const a = await ask({ title: 'Erase all data?', message: 'Every account, transaction and setting on this iPhone will be erased. This cannot be undone.', options: [{ label: 'Erase All Data', value: 'go', destructive: true }] });
    if (a !== 'go') return;
    const b = await ask({ title: 'Are you absolutely sure?', message: 'There is no backup unless you exported one.', options: [{ label: 'Yes, Erase Everything', value: 'go', destructive: true }] });
    if (b !== 'go') return;
    await resetAll();
    try {
      localStorage.removeItem('dreams.hide');
    } catch {
      /* ignore */
    }
    location.reload();
  };

  return (
    <Sheet open={open} onClose={onClose} z={z} title="Settings" label="Settings" right={<NavButton bold onClick={onClose}>Done</NavButton>}>
      <Group header="Appearance" className="mt-2">
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

      <Group header="Data" className="mt-6" footer={persisted ? 'Storage is persistent: iOS won’t clear it to free space.' : 'Storage is best-effort. Add Dreams to your Home Screen and keep a backup.'}>
        <Row title="Storage" value={persisted === null ? '—' : persisted ? 'Persistent' : 'Best-effort'} />
        <Row title="Sync" value="Coming soon" />
        <Row title="Backup & export" value="Coming soon" />
      </Group>

      <Group className="mt-6">
        <Row title="Erase all data" destructive onPress={reset} />
      </Group>

      <p className="mt-6 text-center text-footnote text-label-2">Dreams {__APP_VERSION__} · Know your money. Fund your dreams.</p>
    </Sheet>
  );
}
