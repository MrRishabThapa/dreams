import { useLiveQuery } from 'dexie-react-hooks';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getSettings, patch } from '../db/repo';
import { ensureSyncSlots } from '../db/sync';
import type { Account, Debt, Dream, Transaction, TxType, UserSettings } from '../domain/types';

export type SheetReq =
  | { kind: 'add'; tx?: Transaction; type?: TxType; accountId?: string }
  | { kind: 'account'; account?: Account }
  | { kind: 'accountDetail'; id: string }
  | { kind: 'correct'; account: Account }
  | { kind: 'import'; accountId: string }
  | { kind: 'pickAccount'; title: string; exclude?: string; onPick: (id: string) => void }
  | { kind: 'settings' }
  | { kind: 'debt'; debt?: Debt; direction?: Debt['direction'] }
  | { kind: 'debtDetail'; id: string }
  | { kind: 'payment'; debtId: string }
  | { kind: 'dream'; dream?: Dream }
  | { kind: 'dreamDetail'; id: string }
  | { kind: 'dreamMoney'; dreamId: string; mode: 'add' | 'withdraw' }
  | { kind: 'categoryTxs'; month: string; key: string; name: string }
  | { kind: 'appLock' }
  | { kind: 'sync' }
  | { kind: 'categories' }
  | { kind: 'patchNotes' }
  /** onSaved: a new category was added from a picker (it gets selected there) */
  | { kind: 'category'; category?: import('../domain/types').Category; type: 'income' | 'expense'; onSaved?: (c: import('../domain/types').Category) => void };

export interface SheetEntry {
  key: number;
  req: SheetReq;
  open: boolean;
}

interface AppCtx {
  settings: UserSettings | undefined;
  symbol: string;
  hide: boolean;
  setHide: (v: boolean) => void;
  setTheme: (t: UserSettings['theme']) => void;
  sheets: SheetEntry[];
  openSheet: (r: SheetReq) => void;
  closeSheet: (key: number) => void;
  closeAll: () => void;
}

const Ctx = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp outside AppProvider');
  return c;
}

/** Safe outside the provider (kit gallery). */
export function useSymbol(): string {
  return useContext(Ctx)?.symbol ?? 'Rs';
}

function readHide(): boolean {
  try {
    return localStorage.getItem('dreams.hide') === '1';
  } catch {
    return false;
  }
}

export function applyTheme(t: UserSettings['theme']) {
  const root = document.documentElement;
  if (t === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t);
  try {
    localStorage.setItem('dreams.theme', t);
  } catch {
    /* private mode */
  }
  const dark = t === 'dark' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#000000' : '#F2F2F7'));
}

let seq = 0;

export function AppProvider({ children }: { children: ReactNode }) {
  const settings = useLiveQuery(() => getSettings(), []);
  const [hide, setHideState] = useState(readHide);
  const [sheets, setSheets] = useState<SheetEntry[]>([]);

  useEffect(() => {
    document.documentElement.setAttribute('data-hide-balances', String(hide));
    try {
      localStorage.setItem('dreams.hide', hide ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [hide]);

  useEffect(() => {
    void ensureSyncSlots();
  }, []);

  useEffect(() => {
    if (settings) applyTheme(settings.theme);
  }, [settings?.theme]); // eslint-disable-line react-hooks/exhaustive-deps

  const setTheme = useCallback(
    (t: UserSettings['theme']) => {
      applyTheme(t);
      if (settings) void patch('user_settings', settings.id, { theme: t });
    },
    [settings],
  );

  const openSheet = useCallback((req: SheetReq) => setSheets((s) => [...s, { key: ++seq, req, open: true }]), []);
  const closeSheet = useCallback((key: number) => {
    setSheets((s) => s.map((e) => (e.key === key ? { ...e, open: false } : e)));
    window.setTimeout(() => setSheets((s) => s.filter((e) => e.key !== key)), 450);
  }, []);
  const closeAll = useCallback(() => {
    setSheets((s) => s.map((e) => ({ ...e, open: false })));
    window.setTimeout(() => setSheets([]), 450);
  }, []);

  const value = useMemo<AppCtx>(
    () => ({ settings, symbol: settings?.symbol ?? 'Rs', hide, setHide: setHideState, setTheme, sheets, openSheet, closeSheet, closeAll }),
    [settings, hide, setTheme, sheets, openSheet, closeSheet, closeAll],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function isStandalone(): boolean {
  return (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

/** Switches to a tab from anywhere; optionally preselects the Money tab's segment. */
export function goToTab(tab: 'home' | 'money' | 'dreams' | 'audit', moneySeg?: 'accounts' | 'debts') {
  if (moneySeg) {
    try {
      sessionStorage.setItem('dreams.moneySeg', moneySeg);
    } catch {
      /* ignore */
    }
  }
  window.dispatchEvent(new CustomEvent('dreams:tab', { detail: tab }));
  if (moneySeg) window.dispatchEvent(new CustomEvent('dreams:moneySeg', { detail: moneySeg }));
}
