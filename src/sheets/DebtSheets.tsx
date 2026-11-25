import { Check, X } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Sheet } from '../ui/Sheet';
import { Button, NavButton } from '../ui/Button';
import { Group, Row } from '../ui/List';
import { Segmented } from '../ui/Segmented';
import { Chip, Toggle } from '../ui/bits';
import { Icon } from '../ui/Icon';
import { Money } from '../ui/Money';
import { SwipeRow } from '../ui/SwipeRow';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/ActionSheet';
import { useApp } from '../lib/app';
import { PALETTE } from '../lib/catalog';
import { liveAccounts, useData } from '../db/hooks';
import { createDebt, deleteDebt, getMeta, recordPayment, restore, softDelete, undoDeleteDebt, updateDebt } from '../db/repo';
import { debtHistory, debtStatus, dueLabel, type DebtStatus } from '../domain/debts';
import { formatMoney, parseMoney } from '../domain/money';
import { dayLabel, shortDate, today } from '../domain/dates';
import type { Account, Debt } from '../domain/types';

/* ---------------- shared bits ---------------- */

const AVATAR_COLORS = [PALETTE.orange, PALETTE.teal, PALETTE.pink, PALETTE.green, PALETTE.brown, PALETTE.cyan, PALETTE.red, PALETTE.mint];

/** Initials on a soft color picked from the name, so the same person keeps the same color. */
export function PersonAvatar({ name, size = 36 }: { name: string; size?: number }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: AVATAR_COLORS[h % AVATAR_COLORS.length], fontSize: size * 0.4 }}
    >
      {initials}
    </span>
  );
}

export function DueBadge({ status, dueOn }: { status: DebtStatus; dueOn: string | null }) {
  if (status.settled) return <span className="rounded-full bg-[color-mix(in_srgb,var(--income)_16%,transparent)] px-2 py-0.5 text-caption font-semibold text-income">Settled</span>;
  const label = dueLabel(status, dueOn, shortDate);
  if (!label) return null;
  const tone = status.overdue ? 'bg-expense text-white' : status.dueSoon ? 'bg-[color-mix(in_srgb,var(--warn)_18%,transparent)] text-warn' : 'bg-fill text-label-2';
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-caption font-semibold ${tone}`}>{label}</span>;
}

export function ProgressBar({ value, color = 'var(--accent)' }: { value: number; color?: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="h-[6px] w-full overflow-hidden rounded-full bg-fill" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)}>
      {/* transform-only animation */}
      <div className="h-full w-full origin-left rounded-full transition-transform duration-[450ms] ease-out motion-reduce:transition-none" style={{ transform: `scaleX(${v})`, background: color }} />
    </div>
  );
}

function InputRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="row sep flex min-h-[44px] items-center bg-surface pl-4">
      <span className="row-body flex min-h-[44px] flex-1 items-center gap-3 pr-4">
        <span className="shrink-0 text-body">{label}</span>
        {children}
      </span>
    </label>
  );
}

const inputCls = 'h-11 min-w-0 flex-1 bg-transparent text-right text-[17px] outline-none placeholder:text-label-3';

function AccountRow({ label, account, onPress }: { label: string; account: Account | undefined; onPress: () => void }) {
  return (
    <Row
      title={label}
      onPress={onPress}
      value={
        <span className="flex items-center gap-1.5 text-label-2">
          {account && <Icon name={account.icon} size={16} style={{ color: account.color ?? undefined }} />}
          {account?.name ?? 'Choose'}
        </span>
      }
      chevron
    />
  );
}

function useDefaultAccount(accounts: Account[]): string | null {
  const last = useLiveQuery(() => getMeta<string | null>('lastAccountId', null), []);
  return (accounts.find((a) => a.id === last) ?? accounts[0])?.id ?? null;
}

/* ---------------- create / edit ---------------- */

export function DebtSheet({ open, onClose, debt, direction, z }: { open: boolean; onClose: () => void; debt?: Debt; direction?: Debt['direction']; z: number }) {
  const data = useData();
  const { openSheet, symbol } = useApp();
  const toast = useToast();
  const accounts = liveAccounts(data);
  const existingOpen = useMemo(() => (debt && data ? data.transactions.find((t) => !t.deleted_at && t.debt_id === debt.id && t.debt_event === 'open') : undefined), [debt, data]);
  const defaultAccount = useDefaultAccount(accounts);

  const [dir, setDir] = useState<Debt['direction']>(debt?.direction ?? direction ?? 'owe');
  const [person, setPerson] = useState(debt?.person ?? '');
  const [amount, setAmount] = useState(debt ? formatMoney(debt.amount_minor, { bare: true }).replace(/,/g, '') : '');
  const [openedOn, setOpenedOn] = useState(debt?.opened_on ?? today());
  const [dueOn, setDueOn] = useState<string | null>(debt?.due_on ?? null);
  const [note, setNote] = useState(debt?.note ?? '');
  const [withCash, setWithCash] = useState<boolean>(debt ? !!existingOpen : true);
  const [acct, setAcct] = useState<string | null>(existingOpen?.account_id ?? null);
  const accountId = acct ?? defaultAccount;
  const account = accounts.find((a) => a.id === accountId);

  const parsed = parseMoney(amount);
  const valid = person.trim().length > 0 && parsed !== null && parsed > 0 && (!withCash || !!accountId) && (!dueOn || dueOn >= openedOn);

  const save = async () => {
    if (!valid) return;
    const input = { person, direction: dir, amount_minor: parsed!, opened_on: openedOn, due_on: dueOn, note, cashAccountId: withCash ? accountId : null };
    try {
      if (debt) {
        // can't shrink below what has already been paid
        const paid = data ? debtStatus(debt, data.transactions, today()).paid : 0;
        if (parsed! < paid) {
          toast({ message: `${formatMoney(paid, { symbol })} is already paid`, tone: 'error' });
          return;
        }
        await updateDebt(debt, input);
      } else {
        await createDebt(input);
        toast({ message: dir === 'owe' ? `You owe ${person.trim()} ${formatMoney(parsed!, { symbol })}` : `${person.trim()} owes you ${formatMoney(parsed!, { symbol })}` });
      }
      onClose();
    } catch (e) {
      toast({ message: (e as Error).message, tone: 'error' });
    }
  };

  const cashFooter = withCash
    ? dir === 'owe'
      ? `The ${parsed ? formatMoney(parsed, { symbol }) : 'money'} goes into ${account?.name ?? 'the account'}. Net worth doesn’t change: you have the cash and owe it back.`
      : `The ${parsed ? formatMoney(parsed, { symbol }) : 'money'} leaves ${account?.name ?? 'the account'}. Net worth doesn’t change: they owe it back.`
    : 'Only the debt is recorded (for example, a bill you haven’t paid yet). Net worth changes by the amount.';

  return (
    <Sheet
      open={open}
      onClose={onClose}
      z={z}
      title={debt ? 'Edit Debt' : 'New Debt'}
      label={debt ? 'Edit debt' : 'New debt'}
      left={<NavButton onClick={onClose}>Cancel</NavButton>}
      right={<NavButton bold disabled={!valid} onClick={save}>{debt ? 'Save' : 'Add'}</NavButton>}
    >
      <div className="px-4 pb-5 pt-1">
        <Segmented value={dir} onChange={setDir} options={[{ value: 'owe', label: 'I borrowed' }, { value: 'owed', label: 'I lent' }]} />
      </div>
      <Group>
        <InputRow label={dir === 'owe' ? 'From' : 'To'}>
          <input autoFocus={!debt} value={person} onChange={(e) => setPerson(e.target.value)} placeholder="Name" aria-label="Person" maxLength={40} className={inputCls} />
        </InputRow>
        <InputRow label="Amount">
          <span className="text-label-2">{symbol}</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0" aria-label="Amount" className={`money ${inputCls} !flex-none w-36`} />
        </InputRow>
      </Group>
      {amount.trim() !== '' && parsed === null && <p className="mx-8 mt-2 text-footnote text-expense">Enter a number like 50000 or 1250.50</p>}

      <Group header="Dates" className="mt-6" footer={dueOn && dueOn < openedOn ? 'The due date can’t be before the start date.' : undefined}>
        <InputRow label={dir === 'owe' ? 'Borrowed on' : 'Lent on'}>
          <input type="date" value={openedOn} max="2100-12-31" onChange={(e) => e.target.value && setOpenedOn(e.target.value)} aria-label="Start date" className={inputCls} />
        </InputRow>
        <InputRow label="Due">
          <input type="date" value={dueOn ?? ''} min={openedOn} max="2100-12-31" onChange={(e) => setDueOn(e.target.value || null)} aria-label="Due date" className={`${inputCls} ${dueOn ? '' : 'text-label-3'}`} />
          {dueOn && (
            <button type="button" aria-label="Clear due date" onClick={(e) => { e.preventDefault(); setDueOn(null); }} className="-mr-2 flex h-11 w-8 items-center justify-center text-label-3">
              <X size={18} />
            </button>
          )}
        </InputRow>
      </Group>

      <Group header="Cash" className="mt-6" footer={cashFooter}>
        <Row title={dir === 'owe' ? 'I received the money' : 'I handed over the money'}>
          <Toggle checked={withCash} onChange={setWithCash} label="Record the cash" />
        </Row>
        {withCash && (
          <AccountRow
            label={dir === 'owe' ? 'Into' : 'From'}
            account={account}
            onPress={() => openSheet({ kind: 'pickAccount', title: dir === 'owe' ? 'Into' : 'From', onPick: setAcct })}
          />
        )}
      </Group>

      <Group className="mt-6">
        <label className="row sep flex min-h-[44px] items-center bg-surface pl-4">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" aria-label="Note" maxLength={140} className="row-body h-11 flex-1 bg-transparent pr-4 text-[17px] outline-none placeholder:text-label-3" />
        </label>
      </Group>
    </Sheet>
  );
}

/* ---------------- detail ---------------- */

export function DebtDetailSheet({ open, onClose, id, z }: { open: boolean; onClose: () => void; id: string; z: number }) {
  const data = useData();
  const { openSheet, symbol } = useApp();
  const toast = useToast();
  const confirm = useConfirm();
  const debt = data?.debts.find((d) => d.id === id);
  const accounts = useMemo(() => new Map((data?.accounts ?? []).map((a) => [a.id, a])), [data]);

  if (!data || !debt || debt.deleted_at) return <Sheet open={open} onClose={onClose} z={z} label="Debt detail">{null}</Sheet>;

  const st = debtStatus(debt, data.transactions, today());
  const history = debtHistory(debt, data.transactions);
  const owe = debt.direction === 'owe';

  const del = async () => {
    const n = history.length;
    const msg = n
      ? `The debt with ${debt.person} and its ${n} cash record${n === 1 ? '' : 's'} will be deleted. Account balances go back to how they were.`
      : `The debt with ${debt.person} will be deleted.`;
    if (!(await confirm(msg, 'Delete Debt'))) return;
    const ids = await deleteDebt(debt);
    onClose();
    toast({ message: 'Debt deleted', action: { label: 'Undo', onPress: () => void undoDeleteDebt(debt.id, ids) } });
  };

  const delPayment = async (txId: string) => {
    await softDelete('transactions', [txId]);
    toast({ message: 'Payment deleted', action: { label: 'Undo', onPress: () => void restore('transactions', [txId]) } });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      z={z}
      title={debt.person}
      label="Debt detail"
      left={<NavButton onClick={onClose}>Close</NavButton>}
      right={<NavButton onClick={() => openSheet({ kind: 'debt', debt })}>Edit</NavButton>}
    >
      <div className="flex flex-col items-center px-6 pb-5 pt-1 text-center">
        <PersonAvatar name={debt.person} size={56} />
        <div className="mt-2 text-subhead text-label-2">{owe ? `You owe ${debt.person}` : `${debt.person} owes you`}</div>
        <Money value={st.remaining} animated className="rounded-num mt-0.5 text-[40px] font-bold leading-[48px]" data-testid="debt-remaining" />
        <div className="mt-3 w-full max-w-[280px]">
          <ProgressBar value={st.progress} color={st.settled ? 'var(--income)' : 'var(--accent)'} />
        </div>
        <div className="mt-2 text-footnote text-label-2">
          {owe ? 'Repaid' : 'Collected'} <Money value={st.paid} /> of <Money value={debt.amount_minor} />
        </div>
        <div className="mt-2 min-h-[22px]"><DueBadge status={st} dueOn={debt.due_on} /></div>
      </div>

      {!st.settled && (
        <div className="mx-4 mb-6">
          <Button block onClick={() => openSheet({ kind: 'payment', debtId: debt.id })}>{owe ? 'Record Repayment' : 'Record Collection'}</Button>
        </div>
      )}

      <Group header="History">
        {!st.withCash && (
          <Row
            title={owe ? 'Borrowed' : 'Lent'}
            subtitle={`${dayLabel(debt.opened_on)} · not recorded in an account`}
            value={<Money value={debt.amount_minor} />}
          />
        )}
        {history.map((t) =>
          t.debt_event === 'pay' ? (
            <SwipeRow key={t.id} onDelete={() => void delPayment(t.id)}>
              <Row
                title={owe ? 'Repaid' : 'Collected'}
                subtitle={[dayLabel(t.occurred_on), accounts.get(t.account_id)?.name, t.note].filter(Boolean).join(' · ')}
                value={<Money value={t.amount_minor} className="text-label" />}
              />
            </SwipeRow>
          ) : (
            <Row
              key={t.id}
              title={owe ? 'Borrowed' : 'Lent'}
              subtitle={[dayLabel(t.occurred_on), `${owe ? 'into' : 'from'} ${accounts.get(t.account_id)?.name ?? '—'}`].join(' · ')}
              value={<Money value={t.amount_minor} />}
            />
          ),
        )}
      </Group>
      {history.some((t) => t.debt_event === 'pay') && <p className="mx-8 mt-1.5 text-footnote text-label-2">Swipe left on a payment to delete it.</p>}

      {(debt.note || debt.due_on) && (
        <Group header="Details" className="mt-6">
          {debt.due_on && <Row title="Due" value={shortDate(debt.due_on)} />}
          {debt.note && <Row title={<span className="whitespace-normal">{debt.note}</span>} />}
        </Group>
      )}

      <div className="mx-4 mt-8">
        <Button variant="destructive" size="md" block onClick={del}>Delete Debt</Button>
      </div>
      <p className="mx-8 mt-2 text-center text-footnote text-label-2">{formatMoney(debt.amount_minor, { symbol })} · since {shortDate(debt.opened_on)}</p>
    </Sheet>
  );
}

/* ---------------- record payment ---------------- */

export function PaymentSheet({ open, onClose, debtId, z }: { open: boolean; onClose: () => void; debtId: string; z: number }) {
  const data = useData();
  const { openSheet, symbol } = useApp();
  const toast = useToast();
  const accounts = liveAccounts(data);
  const defaultAccount = useDefaultAccount(accounts);
  const debt = data?.debts.find((d) => d.id === debtId);
  const [amount, setAmount] = useState('');
  const [acct, setAcct] = useState<string | null>(null);
  const [on, setOn] = useState(today());
  const [note, setNote] = useState('');

  if (!data || !debt) return <Sheet open={open} onClose={onClose} z={z} label="Record payment">{null}</Sheet>;

  const owe = debt.direction === 'owe';
  const st = debtStatus(debt, data.transactions, today());
  const accountId = acct ?? defaultAccount;
  const account = accounts.find((a) => a.id === accountId);
  const parsed = parseMoney(amount);
  const over = parsed !== null && parsed > st.remaining;
  const valid = parsed !== null && parsed > 0 && !over && !!accountId;
  const toMoneyInput = (m: number) => formatMoney(m, { bare: true }).replace(/,/g, '');

  const save = async () => {
    if (!valid) return;
    try {
      await recordPayment(debt, { amount_minor: parsed!, account_id: accountId!, occurred_on: on, note });
      const left = st.remaining - parsed!;
      toast({ message: left === 0 ? `Settled with ${debt.person}` : `${formatMoney(left, { symbol })} left` });
      onClose();
    } catch (e) {
      toast({ message: (e as Error).message, tone: 'error' });
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      z={z}
      detents={['medium', 'large']}
      initial="large"
      title={owe ? 'Repayment' : 'Collection'}
      label="Record payment"
      left={<NavButton onClick={onClose}>Cancel</NavButton>}
      right={<NavButton bold disabled={!valid} onClick={save}>Save</NavButton>}
    >
      <p className="mx-8 mb-3 text-center text-subhead text-label-2">
        <Money value={st.remaining} /> left {owe ? `to repay ${debt.person}` : `for ${debt.person} to pay back`}
      </p>
      <Group footer={over ? `That’s more than the ${formatMoney(st.remaining, { symbol })} left.` : undefined}>
        <InputRow label="Amount">
          <span className="text-label-2">{symbol}</span>
          <input autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0" aria-label="Payment amount" className={`money ${inputCls} !flex-none w-36 ${over ? 'text-expense' : ''}`} />
        </InputRow>
      </Group>
      <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-4">
        <Chip onClick={() => setAmount(toMoneyInput(st.remaining))} icon={<Check size={15} />}>All {formatMoney(st.remaining, { symbol })}</Chip>
        {st.remaining >= 200 && <Chip onClick={() => setAmount(toMoneyInput(Math.round(st.remaining / 2)))}>Half</Chip>}
      </div>
      <Group className="mt-6">
        <AccountRow label={owe ? 'Paid from' : 'Received in'} account={account} onPress={() => openSheet({ kind: 'pickAccount', title: owe ? 'Paid from' : 'Received in', onPick: setAcct })} />
        <InputRow label="Date">
          <input type="date" value={on} min={debt.opened_on} max="2100-12-31" onChange={(e) => e.target.value && setOn(e.target.value)} aria-label="Payment date" className={inputCls} />
        </InputRow>
      </Group>
      <Group className="mt-6">
        <label className="row sep flex min-h-[44px] items-center bg-surface pl-4">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" aria-label="Note" maxLength={140} className="row-body h-11 flex-1 bg-transparent pr-4 text-[17px] outline-none placeholder:text-label-3" />
        </label>
      </Group>
    </Sheet>
  );
}

