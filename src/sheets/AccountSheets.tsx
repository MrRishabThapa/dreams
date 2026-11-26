import { Archive, ArrowLeftRight, Check, FileDown, Plus, RefreshCw, SlidersHorizontal, Trash2, TrendingUp } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Sheet } from '../ui/Sheet';
import { NavButton, Button } from '../ui/Button';
import { Group, Row } from '../ui/List';
import { IconTile } from '../ui/Icon';
import { Money } from '../ui/Money';
import { TxGroups } from '../ui/TxList';
import { EmptyState, Art } from '../ui/bits';
import { useToast } from '../ui/Toast';
import { useActionSheet, useConfirm } from '../ui/ActionSheet';
import { useApp } from '../lib/app';
import { liveAccounts, liveTxs, useBalances, useData } from '../db/hooks';
import { correctBalance, createAccount, deleteAccount, patch, undoDeleteAccount } from '../db/repo';
import { KIND_META, KIND_ORDER } from '../lib/catalog';
import { formatMoney, parseMoney } from '../domain/money';
import { monthOf, today } from '../domain/dates';
import { getConfirmed, reconcile } from '../db/imports';
import { confirmNudge, lastConfirmed, walletMonth } from '../domain/wallet';
import { WalletCard } from '../ui/WalletCard';
import type { Account, AccountKind } from '../domain/types';

/* ---------------- pick account ---------------- */

export function PickAccountSheet({ open, onClose, title, exclude, onPick, z }: { open: boolean; onClose: () => void; title: string; exclude?: string; onPick: (id: string) => void; z: number }) {
  const data = useData();
  const bal = useBalances(data);
  const { openSheet } = useApp();
  const accounts = liveAccounts(data).filter((a) => a.id !== exclude);
  return (
    <Sheet open={open} onClose={onClose} z={z} title={title} detents={['medium', 'large']} label={`Pick ${title}`} right={<NavButton onClick={onClose}>Done</NavButton>}>
      <Group className="mt-2">
        {accounts.map((a) => (
          <Row
            key={a.id}
            icon={<IconTile name={a.icon} color={a.color} />}
            title={a.name}
            value={<Money value={bal.get(a.id) ?? 0} />}
            onPress={() => {
              onPick(a.id);
              onClose();
            }}
          />
        ))}
        <Row icon={<span className="flex h-[30px] w-[30px] items-center justify-center text-accent"><Plus size={22} /></span>} title="New account" accent onPress={() => openSheet({ kind: 'account' })} />
      </Group>
    </Sheet>
  );
}

/* ---------------- create / edit account ---------------- */

export function AccountSheet({ open, onClose, account, z }: { open: boolean; onClose: () => void; account?: Account; z: number }) {
  const toast = useToast();
  const { symbol } = useApp();
  const [name, setName] = useState(account?.name ?? '');
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? 'bank');
  const [opening, setOpening] = useState(account ? formatMoney(account.opening_minor, { bare: true }).replace(/,/g, '') : '');
  const parsed = opening.trim() === '' ? 0 : parseMoney(opening);
  const valid = name.trim().length > 0 && parsed !== null;

  const save = async () => {
    if (!valid) return;
    if (account) {
      await patch('accounts', account.id, { name: name.trim(), kind, opening_minor: parsed!, icon: KIND_META[kind].icon, color: KIND_META[kind].color });
    } else {
      await createAccount({ name: name.trim(), kind, opening_minor: parsed! });
      toast({ message: `${name.trim()} added` });
    }
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      z={z}
      title={account ? 'Edit Account' : 'New Account'}
      label={account ? 'Edit account' : 'New account'}
      left={<NavButton onClick={onClose}>Cancel</NavButton>}
      right={<NavButton bold disabled={!valid} onClick={save}>{account ? 'Save' : 'Add'}</NavButton>}
    >
      <div className="flex flex-col items-center pb-5 pt-2">
        <IconTile name={KIND_META[kind].icon} color={KIND_META[kind].color} size={64} />
      </div>
      <Group>
        <label className="row sep flex min-h-[44px] items-center bg-surface pl-4">
          <input
            autoFocus={!account}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Account name"
            aria-label="Account name"
            maxLength={40}
            className="row-body h-11 flex-1 bg-transparent pr-4 text-[17px] outline-none placeholder:text-label-3"
          />
        </label>
      </Group>
      <Group header="Type" className="mt-6">
        {KIND_ORDER.map((k) => (
          <Row key={k} icon={<IconTile name={KIND_META[k].icon} color={KIND_META[k].color} />} title={KIND_META[k].label} onPress={() => setKind(k)}>
            {kind === k && <Check size={20} className="text-accent" strokeWidth={2.6} />}
          </Row>
        ))}
      </Group>
      <Group header={account ? 'Opening balance' : 'Current balance'} footer={account ? 'The balance when you started tracking. To fix today’s balance, use Correct balance instead.' : 'What this account holds right now.'} className="mt-6">
        <label className="row sep flex min-h-[44px] items-center bg-surface pl-4">
          <span className="row-body flex flex-1 items-center gap-2 pr-4">
            <span className="text-label-2">{symbol}</span>
            <input
              inputMode="decimal"
              value={opening}
              onChange={(e) => setOpening(e.target.value)}
              placeholder="0"
              aria-label="Balance"
              className="money h-11 flex-1 bg-transparent text-[17px] outline-none placeholder:text-label-3"
            />
          </span>
        </label>
      </Group>
      {parsed === null && <p className="mx-8 mt-2 text-footnote text-expense">Enter a number like 25000 or 1250.50</p>}
    </Sheet>
  );
}

/* ---------------- correct balance / update value ---------------- */

export function CorrectSheet({ open, onClose, account, z }: { open: boolean; onClose: () => void; account: Account; z: number }) {
  const data = useData();
  const bal = useBalances(data);
  const toast = useToast();
  const { symbol } = useApp();
  const current = bal.get(account.id) ?? 0;
  const [val, setVal] = useState('');
  const [note, setNote] = useState('');
  const inv = account.kind === 'investment';
  const wallet = account.kind === 'wallet';
  // for an e-wallet, an empty field means "it matches": confirming without a change
  const target = wallet && val.trim() === '' ? current : parseMoney(val);
  const diff = target === null ? 0 : target - current;

  const save = async () => {
    if (target === null) return;
    if (wallet) {
      const r = await reconcile(account.id, current, target, today(), note.trim() || 'Balance checked');
      toast({ message: r.tx ? `Balance updated (${formatMoney(diff, { symbol, signed: true })})` : 'Balance confirmed' });
      return onClose();
    }
    const t = await correctBalance(account.id, current, target, today(), note);
    toast({ message: t ? `${inv ? 'Value updated' : 'Balance corrected'} (${formatMoney(diff, { symbol, signed: true })})` : 'No change' });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      z={z}
      detents={['medium', 'large']}
      title={inv ? 'Update Value' : wallet ? 'Update Balance' : 'Correct Balance'}
      label={inv ? 'Update value' : wallet ? 'Update balance' : 'Correct balance'}
      left={<NavButton onClick={onClose}>Cancel</NavButton>}
      right={<NavButton bold disabled={target === null} onClick={save}>{wallet && diff === 0 ? 'Confirm' : 'Save'}</NavButton>}
    >
      <Group footer={inv ? 'The difference is recorded as investment gain or loss.' : wallet ? `Open the ${account.name} app and type the balance it shows. Leave it empty if it matches. The difference is recorded as a correction, not as income or spending.` : 'The difference is recorded as a correction, not as income or spending.'}>
        <Row title="Dreams thinks" value={<Money value={current} />} />
        <label className="row sep flex min-h-[44px] items-center bg-surface pl-4">
          <span className="row-body flex flex-1 items-center gap-3 pr-4">
            <span className="text-body">{inv ? 'Current value' : wallet ? 'Balance in the app' : 'Actual balance'}</span>
            <input
              autoFocus
              inputMode="decimal"
              value={val}
              onChange={(e) => setVal(e.target.value)}
              placeholder={formatMoney(current, { bare: true })}
              aria-label={inv ? 'Current value' : wallet ? 'Balance in the app' : 'Actual balance'}
              className="money h-11 min-w-0 flex-1 bg-transparent text-right text-[17px] outline-none placeholder:text-label-3"
            />
          </span>
        </label>
        {target !== null && (!wallet || val.trim() !== '') && <Row title="Difference" value={<Money value={diff} signed tone="auto" />} />}
      </Group>
      <Group className="mt-6">
        <label className="row sep flex min-h-[44px] items-center bg-surface pl-4">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="row-body h-11 flex-1 bg-transparent pr-4 text-[17px] outline-none placeholder:text-label-3" />
        </label>
      </Group>
    </Sheet>
  );
}

/* ---------------- account detail ---------------- */

export function AccountDetailSheet({ open, onClose, id, z }: { open: boolean; onClose: () => void; id: string; z: number }) {
  const data = useData();
  const bal = useBalances(data);
  const { openSheet } = useApp();
  const toast = useToast();
  const ask = useActionSheet();
  const confirm = useConfirm();
  const account = data?.accounts.find((a) => a.id === id);
  const accounts = useMemo(() => new Map((data?.accounts ?? []).map((a) => [a.id, a])), [data]);
  const categories = useMemo(() => new Map((data?.categories ?? []).map((c) => [c.id, c])), [data]);
  const debts = useMemo(() => new Map((data?.debts ?? []).map((d) => [d.id, d])), [data]);
  const txs = liveTxs(data).filter((t) => t.account_id === id || t.to_account_id === id);
  const balance = bal.get(id) ?? 0;
  const confirmed = useLiveQuery(() => getConfirmed(), []);
  const now = today();
  const wm = useMemo(
    () => (data && account?.kind === 'wallet' ? walletMonth(data, account, monthOf(now), data.categories) : null),
    [data, account, now],
  );

  if (!account) return <Sheet open={open} onClose={onClose} z={z}>{null}</Sheet>;
  const inv = account.kind === 'investment';
  const wallet = account.kind === 'wallet';
  const nudge = wallet ? confirmNudge(lastConfirmed(account.id, data?.transactions ?? [], confirmed?.[account.id] ?? null), now) : null;

  const more = async () => {
    const choice = await ask({
      title: account.name,
      options: [
        { label: 'Edit Account', value: 'edit' },
        { label: account.archived ? 'Unarchive' : 'Archive', value: 'archive' },
        { label: 'Delete Account', value: 'delete', destructive: true },
      ],
    });
    if (choice === 'edit') openSheet({ kind: 'account', account });
    if (choice === 'archive') {
      if (!account.archived && balance !== 0) {
        toast({ message: 'Move or correct the balance to 0 before archiving', tone: 'error' });
        return;
      }
      await patch('accounts', account.id, { archived: !account.archived });
      toast({ message: account.archived ? 'Unarchived' : 'Archived' });
    }
    if (choice === 'delete') {
      const n = txs.length;
      if (!(await confirm(`${account.name} and its ${n} transaction${n === 1 ? '' : 's'} (including transfers into it) will be deleted.`, 'Delete Account'))) return;
      const { txIds } = await deleteAccount(account.id);
      onClose();
      toast({ message: `${account.name} deleted`, action: { label: 'Undo', onPress: () => void undoDeleteAccount(account.id, txIds) } });
    }
  };

  return (
    <Sheet open={open} onClose={onClose} z={z} title={account.name} label="Account detail" left={<NavButton onClick={onClose}>Close</NavButton>} right={<NavButton onClick={more}>Edit</NavButton>}>
      <div className="flex flex-col items-center px-4 pb-5 pt-2">
        <IconTile name={account.icon} color={account.color} size={52} />
        <div className="mt-2 text-subhead text-label-2">{KIND_META[account.kind].label}{account.archived ? ' · Archived' : ''}</div>
        <Money value={balance} animated className="rounded-num mt-1 text-[40px] font-bold leading-[48px]" />
        {nudge && (
          <button type="button" onClick={() => openSheet({ kind: 'correct', account })} className={`mt-1 min-h-[32px] text-footnote ${nudge.stale ? 'font-medium text-warn' : 'text-label-2'}`} data-testid="confirm-nudge">
            {nudge.text}
          </button>
        )}
      </div>
      <div className={`mx-4 mb-6 grid gap-2 ${wallet ? 'grid-cols-4' : 'grid-cols-3'}`}>
        <Action icon={inv ? <TrendingUp size={20} /> : wallet ? <RefreshCw size={20} /> : <SlidersHorizontal size={20} />} label={inv ? 'Update value' : wallet ? 'Balance' : 'Correct'} aria={wallet ? 'Update balance' : undefined} onPress={() => openSheet({ kind: 'correct', account })} />
        {wallet && <Action icon={<FileDown size={20} />} label="Import" aria="Import statement" onPress={() => openSheet({ kind: 'import', accountId: account.id })} />}
        <Action icon={<ArrowLeftRight size={20} />} label="Transfer" onPress={() => openSheet({ kind: 'add', type: 'transfer', accountId: account.id })} />
        <Action icon={<Plus size={20} />} label="Add" onPress={() => openSheet({ kind: 'add', accountId: account.id })} />
      </div>
      {wm && (
        <div className="mb-6">
          <WalletCard w={wm} title="This month" />
        </div>
      )}
      {txs.length ? (
        <TxGroups txs={txs} accounts={accounts} categories={categories} debts={debts} perspective={account.id} />
      ) : (
        <EmptyState art={Art.list} title="No transactions yet" message="Money in and out of this account shows up here." />
      )}
      <div className="mx-4 mt-8 flex gap-2">
        <Button variant="gray" size="md" className="flex-1" onClick={more}><Archive size={18} /> More</Button>
        <Button variant="destructive" size="md" className="flex-1" onClick={async () => {
          if (!(await confirm(`${account.name} and its transactions will be deleted.`, 'Delete Account'))) return;
          const { txIds } = await deleteAccount(account.id);
          onClose();
          toast({ message: `${account.name} deleted`, action: { label: 'Undo', onPress: () => void undoDeleteAccount(account.id, txIds) } });
        }}><Trash2 size={18} /> Delete</Button>
      </div>
    </Sheet>
  );
}

function Action({ icon, label, onPress, aria }: { icon: React.ReactNode; label: string; onPress: () => void; aria?: string }) {
  return (
    <button type="button" onClick={onPress} aria-label={aria} className="pressable card flex h-[64px] flex-col items-center justify-center gap-1 text-accent">
      {icon}
      <span className="text-footnote font-medium">{label}</span>
    </button>
  );
}
