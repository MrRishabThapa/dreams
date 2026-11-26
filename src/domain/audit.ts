import type { Audit, Category, DreamEntry, ISODate, Ledger, Minor, Month } from './types';
import { monthStats, netWorthParts, inMonth, type MonthStats } from './ledger';
import { addMonths, monthEnd, monthName, monthOf, parseISODate } from './dates';
import { debtRemaining } from './ledger';
import { dreamsFundedIn } from './dreams';
import { formatMoney } from './money';
import { walletMonths, type WalletMonth } from './wallet';

/**
 * A locked, self-contained picture of one month. Closed months render from this
 * alone, so it carries names, icons and colors, not just ids.
 */
export interface AuditSnapshot {
  version: 1;
  month: Month;
  stats: Omit<MonthStats, 'byCategory'>;
  prev: { month: Month; income: Minor; expenses: Minor; saved: Minor; savingsRate: number | null } | null;
  categories: { key: string; categoryId: string | null; name: string; icon: string | null; color: string | null; amount: Minor; share: number; prevAmount: Minor }[];
  topExpenses: { id: string; title: string; note: string; amount: Minor; occurred_on: ISODate; account: string }[];
  dreamsFunded: Minor;
  debtsOutstanding: { iOwe: Minor; owedToMe: Minor; overdue: number };
  /** netWorthChange / |netWorthStart|; null when the start is 0 */
  netWorthChangePct: number | null;
  savingsTarget: Minor | null;
  /** one section per e-wallet (eSewa…), from that account's transactions only; absent in older snapshots */
  wallets?: WalletMonth[];
  summary: string;
  insights: string[];
}

export interface AuditInput {
  ledger: Ledger;
  categories: Category[];
  dreamEntries: DreamEntry[];
  month: Month;
  savingsTarget: Minor | null;
  symbol: string;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function buildAuditSnapshot(input: AuditInput): AuditSnapshot {
  const { ledger, categories, dreamEntries, month, savingsTarget, symbol } = input;
  const m = (v: Minor, signed = false) => formatMoney(v, { symbol, signed });
  const { byCategory, ...stats } = monthStats(ledger, month);
  const prevMonth = addMonths(month, -1);
  const prevFull = monthStats(ledger, prevMonth);
  const hasPrev = ledger.transactions.some((t) => !t.deleted_at && inMonth(t, prevMonth));
  const prev = hasPrev
    ? { month: prevMonth, income: prevFull.income, expenses: prevFull.expenses, saved: prevFull.saved, savingsRate: prevFull.savingsRate }
    : null;

  const catMap = new Map(categories.map((c) => [c.id, c]));
  const prevByKey = new Map(prevFull.byCategory.map((c) => [c.categoryId ?? 'name:' + c.name, c.amount]));
  const cats = byCategory.map((c) => {
    const key = c.categoryId ?? 'name:' + c.name;
    const meta = c.categoryId ? catMap.get(c.categoryId) : undefined;
    return {
      key,
      categoryId: c.categoryId,
      name: meta?.name ?? c.name,
      icon: meta?.icon ?? null,
      color: meta?.color ?? null,
      amount: c.amount,
      share: stats.expenses ? c.amount / stats.expenses : 0,
      prevAmount: hasPrev ? prevByKey.get(key) ?? 0 : 0,
    };
  });

  const accounts = new Map(ledger.accounts.map((a) => [a.id, a.name]));
  const topExpenses = ledger.transactions
    .filter((t) => !t.deleted_at && !t.debt_id && t.type === 'expense' && inMonth(t, month) && accounts.has(t.account_id))
    .sort((a, b) => b.amount_minor - a.amount_minor || a.occurred_on.localeCompare(b.occurred_on) || a.id.localeCompare(b.id))
    .slice(0, 5)
    .map((t) => ({
      id: t.id,
      title: (t.category_id && catMap.get(t.category_id)?.name) || t.category_name || 'Expense',
      note: t.note,
      amount: t.amount_minor,
      occurred_on: t.occurred_on,
      account: accounts.get(t.account_id) ?? '',
    }));

  const end = monthEnd(month);
  const nwEnd = netWorthParts(ledger, end);
  const overdue = ledger.debts.filter((d) => !d.deleted_at && d.due_on && d.due_on <= end && d.opened_on <= end && debtRemaining(d, ledger.transactions, end) > 0).length;
  const netWorthChangePct = stats.netWorthStart === 0 ? null : stats.netWorthChange / Math.abs(stats.netWorthStart);

  const snap: AuditSnapshot = {
    version: 1,
    month,
    stats,
    prev,
    categories: cats,
    topExpenses,
    dreamsFunded: dreamsFundedIn(dreamEntries, month),
    debtsOutstanding: { iOwe: nwEnd.iOwe, owedToMe: nwEnd.owedToMe, overdue },
    netWorthChangePct,
    savingsTarget,
    wallets: walletMonths(ledger, month, categories),
    summary: '',
    insights: [],
  };
  snap.summary = verdict(snap, m);
  snap.insights = insights(snap, m);
  return snap;
}

function verdict(s: AuditSnapshot, m: (v: Minor, signed?: boolean) => string): string {
  const { income, expenses, saved, netWorthChange } = s.stats;
  if (income === 0 && expenses === 0) return netWorthChange === 0 ? 'A quiet month with nothing logged.' : `No income or spending logged; net worth moved ${m(netWorthChange, true)}.`;
  if (saved >= 0) {
    const target = s.savingsTarget;
    if (target && saved >= target) return `You saved ${m(saved)} and beat your ${m(target)} target.`;
    if (target) return `You saved ${m(saved)}, ${m(target - saved)} short of your target.`;
    return `You saved ${m(saved)} of ${m(income)} earned.`;
  }
  return `You spent ${m(-saved)} more than you earned.`;
}

function change(cur: number, prev: number): number | null {
  return prev === 0 ? null : (cur - prev) / prev;
}

function insights(s: AuditSnapshot, m: (v: Minor, signed?: boolean) => string): string[] {
  const out: string[] = [];
  const { income, expenses, savingsRate, netWorthChange, investmentGainLoss } = s.stats;
  const prevName = s.prev ? monthName(s.prev.month) : null;

  const top = s.categories[0];
  if (top && expenses > 0) {
    let line = `${top.name} was ${pct(top.share)} of spending`;
    const ch = change(top.amount, top.prevAmount);
    if (prevName && ch !== null && Math.abs(ch) >= 0.05) line += `, ${ch > 0 ? 'up' : 'down'} ${pct(Math.abs(ch))} on ${prevName}`;
    out.push(line + '.');
  }

  if (s.prev && (expenses > 0 || s.prev.expenses > 0)) {
    const ch = change(expenses, s.prev.expenses);
    if (ch === null) out.push(`You spent ${m(expenses)}; nothing was spent in ${prevName}.`);
    else if (Math.abs(ch) < 0.05) out.push(`Spending held steady at ${m(expenses)}, about the same as ${prevName}.`);
    else out.push(`Spending was ${m(expenses)}, ${ch > 0 ? 'up' : 'down'} ${pct(Math.abs(ch))} on ${prevName}.`);
  }

  if (income > 0 && savingsRate !== null) {
    if (s.savingsTarget) {
      const diff = s.stats.saved - s.savingsTarget;
      out.push(`You saved ${pct(savingsRate)} of income, ${m(Math.abs(diff))} ${diff >= 0 ? 'above' : 'below'} your ${m(s.savingsTarget)} target.`);
    } else out.push(`You saved ${pct(savingsRate)} of your income.`);
  } else if (income === 0 && expenses > 0) {
    out.push('No income was logged, so this month’s spending came from what you already had.');
  }

  const big = s.topExpenses[0];
  if (big) {
    const d = parseISODate(big.occurred_on);
    out.push(`Biggest single expense: ${big.title}${big.note ? ` (${big.note})` : ''}, ${m(big.amount)} on ${d.getDate()} ${monthName(monthOf(big.occurred_on)).slice(0, 3)}.`);
  }

  if (investmentGainLoss !== 0) out.push(`Investments ${investmentGainLoss > 0 ? 'gained' : 'lost'} ${m(Math.abs(investmentGainLoss))} in value.`);
  if (s.debtsOutstanding.overdue > 0) out.push(`${s.debtsOutstanding.overdue} debt${s.debtsOutstanding.overdue === 1 ? ' is' : 's are'} past due at month end.`);
  if (netWorthChange !== 0 && out.length < 5) {
    out.push(`Net worth ${netWorthChange > 0 ? 'grew' : 'fell'} by ${m(Math.abs(netWorthChange))}${s.netWorthChangePct !== null ? ` (${pct(Math.abs(s.netWorthChangePct))})` : ''}.`);
  }
  return out.slice(0, 5);
}

/* ---------- month readiness ---------- */

/** The most recent past month with activity that hasn't been closed (within the last 3 months). */
export function monthReadyToClose(ledger: Ledger, audits: Audit[], today: ISODate): Month | null {
  const current = monthOf(today);
  const closed = new Set(audits.filter((a) => !a.deleted_at && a.closed_at).map((a) => a.month));
  for (let i = 1; i <= 3; i++) {
    const m = addMonths(current, -i);
    if (closed.has(m)) return null;
    if (ledger.transactions.some((t) => !t.deleted_at && inMonth(t, m))) return m;
  }
  return null;
}

/** Months to show as audit chips: from the first month with data to the current month. */
export function auditMonths(ledger: Ledger, today: ISODate): Month[] {
  const current = monthOf(today);
  let first = current;
  for (const t of ledger.transactions) if (!t.deleted_at && t.occurred_on.slice(0, 7) < first) first = t.occurred_on.slice(0, 7);
  for (const d of ledger.debts) if (!d.deleted_at && d.opened_on.slice(0, 7) < first) first = d.opened_on.slice(0, 7);
  const out: Month[] = [];
  for (let m = first; m <= current; m = addMonths(m, 1)) out.push(m);
  return out;
}

/** Snapshot without build-time noise, for comparing a stored snapshot with a fresh one. */
export function comparable(s: AuditSnapshot): string {
  return JSON.stringify(s);
}

/* ---------- plain-text export ---------- */

export function auditText(s: AuditSnapshot, symbol: string, reflection = '', closed = false): string {
  const m = (v: Minor, signed = false) => formatMoney(v, { symbol, signed });
  const st = s.stats;
  const lines: string[] = [];
  const [y, mo] = s.month.split('-');
  lines.push(`Dreams · ${monthName(s.month)} ${y} audit${closed ? ' (closed)' : ''}`, '');
  lines.push(s.summary, '');
  lines.push(`Income      ${m(st.income)}`, `Spent       ${m(st.expenses)}`, `Saved       ${m(st.saved)}${st.savingsRate !== null ? ` (${pct(st.savingsRate)})` : ''}`, '');
  if (s.categories.length) {
    lines.push('Spending by category');
    for (const c of s.categories) lines.push(`  ${c.name.padEnd(14)} ${m(c.amount)} (${pct(c.share)})`);
    lines.push('');
  }
  if (s.topExpenses.length) {
    lines.push('Top expenses');
    for (const t of s.topExpenses) lines.push(`  ${t.occurred_on}  ${t.title}${t.note ? ` · ${t.note}` : ''}  ${m(t.amount)}`);
    lines.push('');
  }
  lines.push('Saved & invested', `  Moved to savings      ${m(st.movedToSavings, true)}`, `  Moved to investments  ${m(st.movedToInvestments, true)}`, `  Investment gain/loss  ${m(st.investmentGainLoss, true)}`, `  Dreams funded         ${m(s.dreamsFunded, true)}`, '');
  for (const w of s.wallets ?? []) {
    lines.push(`${w.name} (e-wallet)`, `  Opening  ${m(w.opening)}`, `  In       ${m(w.totalIn, true)}`, `  Out      ${m(-w.totalOut, true)}`, `  Closing  ${m(w.closing)}`);
    if (w.fees) lines.push(`  Fees     ${m(w.fees)}`);
    if (w.topMerchants.length) lines.push(`  Top: ${w.topMerchants.slice(0, 3).map((x) => `${x.name} ${m(x.amount)}`).join(', ')}`);
    lines.push('');
  }
  lines.push('Debts', `  Borrowed ${m(st.borrowed)} · Lent ${m(st.lent)} · Repaid ${m(st.repaid)} · Collected ${m(st.collected)}`, `  Outstanding: I owe ${m(s.debtsOutstanding.iOwe)}, owed to me ${m(s.debtsOutstanding.owedToMe)}`, '');
  lines.push('Net worth walk', `  Start        ${m(st.netWorthStart)}`, `  Income       ${m(st.income, true)}`, `  Spending     ${m(-st.expenses, true)}`);
  if (st.investmentGainLoss) lines.push(`  Investments  ${m(st.investmentGainLoss, true)}`);
  if (st.corrections) lines.push(`  Corrections  ${m(st.corrections, true)}`);
  if (st.other) lines.push(`  Other        ${m(st.other, true)}`);
  lines.push(`  End          ${m(st.netWorthEnd)}  (${m(st.netWorthChange, true)})`, '');
  if (s.insights.length) {
    lines.push('Insights');
    for (const i of s.insights) lines.push(`  • ${i}`);
    lines.push('');
  }
  if (reflection.trim()) lines.push('Reflection', reflection.trim(), '');
  lines.push(`${y}-${mo}`);
  return lines.join('\n');
}
