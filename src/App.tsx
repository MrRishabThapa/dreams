import { motion } from 'framer-motion';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { AppProvider, useApp, type SheetEntry } from './lib/app';
import { ToastProvider } from './ui/Toast';
import { ActionSheetProvider } from './ui/ActionSheet';
import { TabBar, type Tab } from './ui/TabBar';
import { UpdateBanner } from './ui/UpdateBanner';
import { Home } from './screens/Home';
import { MoneyScreen } from './screens/Money';
import { AuditScreen, DreamsScreen } from './screens/Placeholders';
import { Onboarding } from './screens/Onboarding';
import { AddSheet } from './sheets/AddSheet';
import { AccountDetailSheet, AccountSheet, CorrectSheet, PickAccountSheet } from './sheets/AccountSheets';
import { SettingsSheet } from './sheets/SettingsSheet';
import { getMeta } from './db/repo';
import { db } from './db/db';

export function App() {
  return (
    <AppProvider>
      <ToastProvider>
        <ActionSheetProvider>
          <Root />
          <UpdateBanner />
        </ActionSheetProvider>
      </ToastProvider>
    </AppProvider>
  );
}

function Root() {
  const onboarded = useLiveQuery(async () => {
    const flag = await getMeta('onboarded', false);
    return flag && (await db.accounts.count()) > 0;
  }, []);
  if (onboarded === undefined) return null;
  if (!onboarded) return <Onboarding onDone={() => undefined} />;
  return <Shell />;
}

const TABS: Tab[] = ['home', 'money', 'dreams', 'audit'];

function readTab(): Tab {
  try {
    const t = sessionStorage.getItem('dreams.tab') as Tab | null;
    return t && TABS.includes(t) ? t : 'home';
  } catch {
    return 'home';
  }
}

function Shell() {
  const [tab, setTab] = useState<Tab>(readTab);
  const { openSheet, sheets } = useApp();

  const go = (t: Tab) => {
    if (t === tab) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setTab(t);
    window.scrollTo(0, 0);
    try {
      sessionStorage.setItem('dreams.tab', t);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    const h = (e: Event) => go((e as CustomEvent<Tab>).detail);
    window.addEventListener('dreams:tab', h);
    return () => window.removeEventListener('dreams:tab', h);
  });

  return (
    <>
      {/* Keyed fade-in only. No exit/wait: AnimatePresence mode="wait" could stall on rapid
          tab switches and leave the content blank. */}
      <motion.main key={tab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}>
        {tab === 'home' && <Home />}
        {tab === 'money' && <MoneyScreen />}
        {tab === 'dreams' && <DreamsScreen />}
        {tab === 'audit' && <AuditScreen />}
      </motion.main>
      <TabBar tab={tab} onTab={go} onAdd={() => openSheet({ kind: 'add' })} />
      {sheets.map((s, i) => (
        <SheetFor key={s.key} entry={s} z={i} />
      ))}
    </>
  );
}

function SheetFor({ entry, z }: { entry: SheetEntry; z: number }) {
  const { closeSheet } = useApp();
  const close = () => closeSheet(entry.key);
  const { req, open } = entry;
  switch (req.kind) {
    case 'add':
      return <AddSheet open={open} onClose={close} z={z} tx={req.tx} type={req.type} accountId={req.accountId} />;
    case 'account':
      return <AccountSheet open={open} onClose={close} z={z} account={req.account} />;
    case 'accountDetail':
      return <AccountDetailSheet open={open} onClose={close} z={z} id={req.id} />;
    case 'correct':
      return <CorrectSheet open={open} onClose={close} z={z} account={req.account} />;
    case 'pickAccount':
      return <PickAccountSheet open={open} onClose={close} z={z} title={req.title} exclude={req.exclude} onPick={req.onPick} />;
    case 'settings':
      return <SettingsSheet open={open} onClose={close} z={z} />;
  }
}
