import type { Debt, ISODate, Minor, Transaction } from './types';
import { debtPaid, debtRemaining } from './ledger';
import { parseISODate } from './dates';

export interface DebtStatus {
  paid: Minor;
  remaining: Minor;
  /** paid / amount, 0..1 */
  progress: number;
  settled: boolean;
  overdue: boolean;
  /** due within the next 7 days (and not overdue) */
  dueSoon: boolean;
  /** whole days until due (negative when overdue); null without a due date */
  daysToDue: number | null;
  /** an `open` transaction moved cash when the debt was created */
  withCash: boolean;
}

export function debtStatus(debt: Debt, txs: Transaction[], today: ISODate): DebtStatus {
  const paid = debtPaid(debt, txs);
  const remaining = debtRemaining(debt, txs);
  const settled = remaining === 0;
  const daysToDue = debt.due_on ? Math.round((parseISODate(debt.due_on).getTime() - parseISODate(today).getTime()) / 86400000) : null;
  return {
    paid,
    remaining,
    progress: debt.amount_minor > 0 ? Math.min(1, paid / debt.amount_minor) : 0,
    settled,
    overdue: !settled && daysToDue !== null && daysToDue < 0,
    dueSoon: !settled && daysToDue !== null && daysToDue >= 0 && daysToDue <= 7,
    daysToDue,
    withCash: txs.some((t) => !t.deleted_at && t.debt_id === debt.id && t.debt_event === 'open'),
  };
}

/** Live transactions of one debt, oldest first (open, then payments). */
export function debtHistory(debt: Debt, txs: Transaction[]): Transaction[] {
  return txs
    .filter((t) => !t.deleted_at && t.debt_id === debt.id)
    .sort((a, b) => (a.occurred_on === b.occurred_on ? a.created_at.localeCompare(b.created_at) : a.occurred_on.localeCompare(b.occurred_on)));
}

/** Short due label: "Due today", "Due in 3 days", "5 days overdue", "Due 12 Dec". */
export function dueLabel(s: DebtStatus, dueOn: ISODate | null, short: (d: ISODate) => string): string | null {
  if (!dueOn || s.settled || s.daysToDue === null) return null;
  const d = s.daysToDue;
  if (d < 0) return `${-d} day${d === -1 ? '' : 's'} overdue`;
  if (d === 0) return 'Due today';
  if (d === 1) return 'Due tomorrow';
  if (d <= 7) return `Due in ${d} days`;
  return `Due ${short(dueOn)}`;
}

/** The transaction type that moves cash for a debt event. */
export function debtTxType(direction: Debt['direction'], event: 'open' | 'pay'): 'income' | 'expense' {
  // I owe: borrowing brings cash in, repaying sends it out. Owed to me: lending sends out, collecting brings in.
  if (direction === 'owe') return event === 'open' ? 'income' : 'expense';
  return event === 'open' ? 'expense' : 'income';
}
