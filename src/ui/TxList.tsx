import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeftRight, SlidersHorizontal } from 'lucide-react';
import type { Account, Category, Transaction } from '../domain/types';
import { dayLabel } from '../domain/dates';
import { Money } from './Money';
import { IconTile } from './Icon';
import { SwipeRow } from './SwipeRow';
import { useApp } from '../lib/app';
import { useToast } from './Toast';
import { restore, softDelete } from '../db/repo';

export function txTitle(t: Transaction, accounts: Map<string, Account>): string {
  if (t.type === 'transfer') return `${accounts.get(t.account_id)?.name ?? '—'} → ${accounts.get(t.to_account_id ?? '')?.name ?? '—'}`;
  if (t.type === 'adjust') return accounts.get(t.account_id)?.kind === 'investment' ? 'Value update' : 'Balance correction';
  return t.category_name ?? (t.type === 'income' ? 'Income' : 'Expense');
}

/** Amount as seen from `perspective` account (for account detail), else global. */
export function txSigned(t: Transaction, perspective?: string): number {
  if (t.type === 'income') return t.amount_minor;
  if (t.type === 'expense') return -t.amount_minor;
  if (t.type === 'adjust') return t.amount_minor;
  if (perspective) return t.to_account_id === perspective ? t.amount_minor : -t.amount_minor;
  return t.amount_minor;
}

export function TxRow({ t, accounts, categories, perspective }: { t: Transaction; accounts: Map<string, Account>; categories: Map<string, Category>; perspective?: string }) {
  const cat = t.category_id ? categories.get(t.category_id) : undefined;
  const acc = accounts.get(t.account_id);
  const signed = txSigned(t, perspective);
  const tile =
    t.type === 'transfer' ? (
      <span className="inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] bg-[#8E8E93] text-white"><ArrowLeftRight size={19} /></span>
    ) : t.type === 'adjust' ? (
      <span className="inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] bg-[#8E8E93] text-white"><SlidersHorizontal size={18} /></span>
    ) : (
      <IconTile name={cat?.icon ?? (t.type === 'income' ? 'briefcase' : 'circle-ellipsis')} color={cat?.color} size={34} />
    );
  const sub = [t.type === 'transfer' ? 'Transfer' : perspective ? null : acc?.name, t.note].filter(Boolean).join(' · ');
  return (
    <div className="row flex min-h-[56px] items-center gap-3 pl-4">
      {tile}
      <div className="row-body flex min-h-[56px] min-w-0 flex-1 items-center gap-2 py-2 pr-4">
        <div className="min-w-0 flex-1">
          <div className="truncate text-body">{txTitle(t, accounts)}</div>
          {sub && <div className="truncate text-footnote text-label-2">{sub}</div>}
        </div>
        <Money
          value={signed}
          signed={t.type !== 'transfer' || !!perspective}
          className={`text-body ${t.type === 'income' || (t.type !== 'expense' && signed > 0 && t.type !== 'transfer') || (perspective && signed > 0) ? 'text-income' : t.type === 'transfer' && !perspective ? 'text-label-2' : ''}`}
        />
      </div>
    </div>
  );
}

/** Day-grouped transaction list with swipe to edit/delete and undo. */
export function TxGroups({ txs, accounts, categories, perspective }: { txs: Transaction[]; accounts: Map<string, Account>; categories: Map<string, Category>; perspective?: string }) {
  const { openSheet } = useApp();
  const toast = useToast();
  const groups: { day: string; items: Transaction[] }[] = [];
  const sorted = [...txs].sort((a, b) => (a.occurred_on === b.occurred_on ? b.created_at.localeCompare(a.created_at) : b.occurred_on.localeCompare(a.occurred_on)));
  for (const t of sorted) {
    const g = groups[groups.length - 1];
    if (g && g.day === t.occurred_on) g.items.push(t);
    else groups.push({ day: t.occurred_on, items: [t] });
  }
  const del = async (t: Transaction) => {
    await softDelete('transactions', [t.id]);
    toast({ message: 'Transaction deleted', action: { label: 'Undo', onPress: () => void restore('transactions', [t.id]) } });
  };
  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => {
        const dayNet = g.items.reduce((s, t) => s + (t.type === 'income' && !t.debt_id ? t.amount_minor : t.type === 'expense' && !t.debt_id ? -t.amount_minor : 0), 0);
        return (
          <section key={g.day} className="mx-4">
            <h3 className="chrome mb-1.5 flex justify-between px-4 text-footnote uppercase text-label-2">
              <span>{dayLabel(g.day)}</span>
              {dayNet !== 0 && <Money value={dayNet} signed className="normal-case" />}
            </h3>
            <div className="card overflow-hidden">
              <AnimatePresence initial={false}>
                {g.items.map((t) => (
                  <motion.div key={t.id} layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="sep">
                    <SwipeRow onDelete={() => void del(t)} onEdit={() => openSheet({ kind: 'add', tx: t })}>
                      <button type="button" className="block w-full text-left active:bg-surface-3" onClick={() => openSheet({ kind: 'add', tx: t })} aria-label={`Edit ${txTitle(t, accounts)}`}>
                        <TxRow t={t} accounts={accounts} categories={categories} perspective={perspective} />
                      </button>
                    </SwipeRow>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </section>
        );
      })}
    </div>
  );
}
