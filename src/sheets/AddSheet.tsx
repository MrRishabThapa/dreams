import { CalendarDays, ArrowRight, ChevronDown, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Sheet } from '../ui/Sheet';
import { NavButton, Button } from '../ui/Button';
import { Segmented } from '../ui/Segmented';
import { Keypad, applyKey, type KeyValue } from '../ui/Keypad';
import { Chip } from '../ui/bits';
import { Icon, IconTile } from '../ui/Icon';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/ActionSheet';
import { useApp } from '../lib/app';
import { liveAccounts, liveCategories, useData } from '../db/hooks';
import { getMeta, restore, saveTransaction, softDelete } from '../db/repo';
import { evalExpression, formatMoney, MINUS } from '../domain/money';
import { addDays, shortDate, today } from '../domain/dates';
import type { Transaction, TxType } from '../domain/types';
import { db } from '../db/db';

type Mode = 'expense' | 'income' | 'transfer';

function toExpr(minor: number): string {
  const w = Math.floor(minor / 100);
  const p = minor % 100;
  return p ? `${w}.${String(p).padStart(2, '0').replace(/0$/, '')}` : String(w);
}

export function AddSheet({ open, onClose, tx, type, accountId, z }: { open: boolean; onClose: () => void; tx?: Transaction; type?: TxType; accountId?: string; z: number }) {
  const data = useData();
  const { symbol, openSheet } = useApp();
  const toast = useToast();
  const confirm = useConfirm();
  const editing = !!tx;
  const isAdjust = tx?.type === 'adjust';

  const [mode, setMode] = useState<Mode>(tx && tx.type !== 'adjust' ? (tx.type as Mode) : type && type !== 'adjust' ? (type as Mode) : 'expense');
  const [expr, setExpr] = useState(tx ? toExpr(Math.abs(tx.amount_minor)) : '');
  const [acct, setAcct] = useState<string | null>(tx?.account_id ?? accountId ?? null);
  const [toAcct, setToAcct] = useState<string | null>(tx?.to_account_id ?? null);
  const [cat, setCat] = useState<{ id: string | null; name: string | null }>({ id: tx?.category_id ?? null, name: tx?.category_name ?? null });
  const [date, setDate] = useState(tx?.occurred_on ?? today());
  const [note, setNote] = useState(tx?.note ?? '');
  const [shake, setShake] = useState(0);
  const dateRef = useRef<HTMLInputElement>(null);

  const accounts = liveAccounts(data);
  const lastAccount = useLiveQuery(() => getMeta<string | null>('lastAccountId', null), []);

  // default account: last used → first account
  useEffect(() => {
    if (acct || !data) return;
    const pick = accounts.find((a) => a.id === lastAccount) ?? accounts[0];
    if (pick) setAcct(pick.id);
  }, [data, lastAccount]); // eslint-disable-line react-hooks/exhaustive-deps

  // recent categories first
  const recentCats = useLiveQuery(async () => {
    const recent = await db.transactions.orderBy('updated_at').reverse().limit(60).toArray();
    return recent.filter((t) => !t.deleted_at && t.category_id).map((t) => t.category_id!);
  }, []);
  const cats = useMemo(() => {
    if (mode === 'transfer') return [];
    const list = liveCategories(data, mode);
    const rank = new Map<string, number>();
    (recentCats ?? []).forEach((id, i) => !rank.has(id) && rank.set(id, i));
    return [...list].sort((a, b) => (rank.get(a.id) ?? 999 + a.sort) - (rank.get(b.id) ?? 999 + b.sort));
  }, [data, mode, recentCats]);

  const amount = evalExpression(expr);
  const hasOp = /[+\-×÷]/.test(expr.slice(1));
  const account = accounts.find((a) => a.id === acct) ?? data?.accounts.find((a) => a.id === acct);
  const toAccount = accounts.find((a) => a.id === toAcct) ?? data?.accounts.find((a) => a.id === toAcct);
  const color = mode === 'income' ? 'text-income' : mode === 'expense' ? 'text-label' : 'text-accent';

  const reset = () => {
    setExpr('');
    setNote('');
    setCat({ id: null, name: null });
  };

  const save = async (again: boolean) => {
    const value = amount ?? 0;
    const signed = isAdjust ? (tx!.amount_minor < 0 ? -value : value) : value;
    if (value <= 0 || !acct || (mode === 'transfer' && (!toAcct || toAcct === acct))) {
      setShake((s) => s + 1);
      if (!acct) toast({ message: 'Add an account first', tone: 'error' });
      else if (mode === 'transfer' && (!toAcct || toAcct === acct)) toast({ message: 'Pick a different “to” account', tone: 'error' });
      return;
    }
    let category = cat;
    if (mode !== 'transfer' && !isAdjust && !category.id) {
      const other = liveCategories(data, mode).find((c) => c.name === 'Other');
      category = { id: other?.id ?? null, name: other?.name ?? 'Other' };
    }
    try {
      await saveTransaction({
        id: tx?.id,
        type: isAdjust ? 'adjust' : mode,
        amount_minor: signed,
        account_id: acct,
        to_account_id: mode === 'transfer' ? toAcct : null,
        category_id: category.id,
        category_name: category.name,
        occurred_on: date,
        note,
      });
    } catch (e) {
      toast({ message: (e as Error).message, tone: 'error' });
      return;
    }
    if (again) {
      toast({ message: `Saved ${formatMoney(value, { symbol })}` });
      reset();
    } else onClose();
  };

  const del = async () => {
    if (!tx) return;
    if (!(await confirm('This transaction will be deleted.', 'Delete Transaction'))) return;
    await softDelete('transactions', [tx.id]);
    onClose();
    toast({ message: 'Transaction deleted', action: { label: 'Undo', onPress: () => void restore('transactions', [tx.id]) } });
  };

  const onKey = (k: KeyValue) => setExpr((e) => applyKey(e, k));

  const pickAccount = (which: 'from' | 'to') =>
    openSheet({
      kind: 'pickAccount',
      title: which === 'from' ? (mode === 'transfer' ? 'From' : 'Account') : 'To',
      exclude: which === 'to' ? acct ?? undefined : undefined,
      onPick: (id) => (which === 'from' ? setAcct(id) : setToAcct(id)),
    });

  const title = isAdjust ? 'Edit Adjustment' : editing ? 'Edit' : 'New';

  return (
    <Sheet
      open={open}
      onClose={onClose}
      z={z}
      label="Add transaction"
      fill
      title={title}
      left={<NavButton onClick={onClose}>Cancel</NavButton>}
      right={<NavButton bold onClick={() => save(false)} disabled={!amount}>Save</NavButton>}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {!isAdjust && (
          <div className="px-4">
            <Segmented
              value={mode}
              onChange={(m) => {
                setMode(m);
                setCat({ id: null, name: null });
              }}
              options={[
                { value: 'expense', label: 'Expense' },
                { value: 'income', label: 'Income' },
                { value: 'transfer', label: 'Transfer' },
              ]}
            />
          </div>
        )}

        {/* amount display */}
        <div key={shake} className={`shrink-0 px-5 pb-1 pt-2 text-center ${shake ? 'animate-[shake_.3s]' : ''}`} aria-live="polite">
          <div className="h-5 truncate text-footnote text-label-2 tnum">{hasOp ? expr.replace(/-/g, MINUS) : isAdjust ? (tx!.amount_minor < 0 ? 'Decrease' : 'Increase') : ' '}</div>
          <div className={`rounded-num money flex items-baseline justify-center gap-2 font-bold ${color}`} data-testid="amount">
            <span className="text-[24px] font-semibold text-label-2">{symbol}</span>
            <span className="truncate text-[48px] leading-[56px] tracking-tight">
              {amount === null ? '—' : formatMoney(amount, { bare: true })}
            </span>
          </div>
        </div>

        {/* chips */}
        <div className="no-scrollbar flex shrink-0 gap-2 overflow-x-auto px-4 pb-3 pt-1">
          <Chip onClick={() => pickAccount('from')} icon={account ? <Icon name={account.icon} size={16} style={{ color: account.color ?? undefined }} /> : undefined} aria-label="Account">
            {account?.name ?? 'Account'} <ChevronDown size={14} className="ml-0.5 inline text-label-2" />
          </Chip>
          {mode === 'transfer' && (
            <>
              <ArrowRight size={18} className="shrink-0 self-center text-label-2" />
              <Chip onClick={() => pickAccount('to')} icon={toAccount ? <Icon name={toAccount.icon} size={16} style={{ color: toAccount.color ?? undefined }} /> : undefined} aria-label="To account">
                {toAccount?.name ?? 'To…'} <ChevronDown size={14} className="ml-0.5 inline text-label-2" />
              </Chip>
            </>
          )}
          <Chip active={date === today()} onClick={() => setDate(today())}>Today</Chip>
          <Chip active={date === addDays(today(), -1)} onClick={() => setDate(addDays(today(), -1))}>Yesterday</Chip>
          <span className="relative shrink-0">
            <Chip active={date !== today() && date !== addDays(today(), -1)} icon={<CalendarDays size={16} />} aria-hidden tabIndex={-1}>
              {date !== today() && date !== addDays(today(), -1) ? shortDate(date) : 'Date'}
            </Chip>
            <input
              ref={dateRef}
              type="date"
              aria-label="Pick date"
              value={date}
              max="2100-12-31"
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="absolute inset-0 h-full w-full opacity-0"
            />
          </span>
        </div>

        {/* categories */}
        {mode !== 'transfer' && !isAdjust && (
          <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-4 overflow-y-auto overscroll-contain px-2" role="radiogroup" aria-label="Category">
            {cats.map((c) => {
              const sel = cat.id === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={sel}
                  onClick={() => setCat({ id: c.id, name: c.name })}
                  className="pressable flex flex-col items-center gap-1 rounded-ctl py-1"
                >
                  <span className={`rounded-[13px] p-[2px] ${sel ? 'ring-2 ring-accent ring-offset-2 ring-offset-[var(--sheet-bg)]' : ''}`}>
                    <IconTile name={c.icon} color={c.color} size={40} />
                  </span>
                  <span className={`max-w-full truncate px-1 text-[11px] ${sel ? 'font-semibold text-accent' : 'text-label-2'}`}>{c.name}</span>
                </button>
              );
            })}
          </div>
        )}

        {(mode === 'transfer' || isAdjust) && <div className="flex-1" />}
        <div className="shrink-0 px-4 pt-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note"
            maxLength={140}
            enterKeyHint="done"
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className="h-11 w-full rounded-ctl bg-surface px-4 text-[17px] outline-none placeholder:text-label-3"
          />
        </div>

        <div className="shrink-0 pt-2">
          <Keypad onKey={onKey} />
          <div className="flex gap-2 px-2 pt-2">
            {editing ? (
              <Button variant="destructive" onClick={del} className="w-[50px] px-0" aria-label="Delete transaction">
                <Trash2 size={20} />
              </Button>
            ) : (
              <Button variant="gray" onClick={() => save(true)} className="flex-1 whitespace-nowrap px-3 text-[15px]" disabled={!amount}>
                Save &amp; add another
              </Button>
            )}
            <Button onClick={() => save(false)} className="flex-1" disabled={!amount}>
              Save
            </Button>
          </div>
        </div>
      </div>
    </Sheet>
  );
}

