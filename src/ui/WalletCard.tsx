import { TrendingDown, TrendingUp } from 'lucide-react';
import { Money } from './Money';
import { monthName } from '../domain/dates';
import type { WalletMonth } from '../domain/wallet';

const pct = (x: number) => `${Math.round(x * 100)}%`;

function Line({ label, value, signed = false, strong, muted }: { label: string; value: number; signed?: boolean; strong?: boolean; muted?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between py-1 ${strong ? 'font-semibold' : ''} ${muted ? 'text-label-2' : ''}`}>
      <span className="text-subhead">{label}</span>
      <Money value={value} signed={signed} className="text-subhead" />
    </div>
  );
}

function Change({ cur, prev, label, invert }: { cur: number; prev: number; label: string; invert?: boolean }) {
  if (prev === 0) return null;
  const ch = (cur - prev) / prev;
  if (Math.abs(ch) < 0.005) return <span className="text-footnote text-label-2">{label} same as last month</span>;
  const good = invert ? ch < 0 : ch > 0;
  const Icon = ch > 0 ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 text-footnote font-medium ${good ? 'text-income' : 'text-expense'}`}>
      <Icon size={14} /> {label} {ch > 0 ? 'up' : 'down'} {pct(Math.abs(ch))}
    </span>
  );
}

/**
 * One e-wallet for one month: opening + in − out = closing, from this account's own
 * transactions. A view only: transfers in and out are listed but never count as income
 * or spending anywhere.
 */
export function WalletCard({ w, title }: { w: WalletMonth; title?: string }) {
  const prevName = w.prev ? monthName(w.prev.month).slice(0, 3) : '';
  return (
    <section className="card mx-4 p-5" aria-label={`${w.name} audit`}>
      <h2 className="mb-2 text-headline">{title ?? `${w.name} · ${monthName(w.month)}`}</h2>
      <Line label="Opening balance" value={w.opening} muted />
      <Line label="Total in" value={w.totalIn} />
      <Line label="Total out" value={-w.totalOut} signed />
      <div className="mt-1 border-t-[0.5px] border-separator pt-1">
        <Line label="Closing balance" value={w.closing} strong />
      </div>

      {(w.transfersIn > 0 || w.transfersOut > 0 || w.corrections !== 0 || w.fees > 0 || w.debtIn > 0 || w.debtOut > 0) && (
        <div className="mt-3 rounded-xl bg-fill px-3 py-2">
          {w.income > 0 && <Line label="Income" value={w.income} />}
          {w.expenses > 0 && <Line label="Spending" value={-w.expenses} signed />}
          {w.transfersIn > 0 && <Line label="Loaded (transfers in)" value={w.transfersIn} />}
          {w.transfersOut > 0 && <Line label="Sent to accounts" value={-w.transfersOut} signed />}
          {(w.debtIn > 0 || w.debtOut > 0) && <Line label="Debts" value={w.debtIn - w.debtOut} signed />}
          {w.corrections !== 0 && <Line label="Corrections" value={w.corrections} signed />}
          {w.fees > 0 && <Line label="Fees and charges (in spending)" value={w.fees} muted />}
        </div>
      )}

      {w.topCategories.length > 0 && (
        <>
          <h3 className="mt-4 text-footnote font-semibold uppercase text-label-2">Top categories</h3>
          {w.topCategories.slice(0, 3).map((c) => <Line key={c.name} label={c.name} value={c.amount} />)}
        </>
      )}
      {w.topMerchants.length > 0 && (
        <>
          <h3 className="mt-3 text-footnote font-semibold uppercase text-label-2">Top merchants</h3>
          {w.topMerchants.slice(0, 3).map((m) => <Line key={m.name} label={m.count > 1 ? `${m.name} ×${m.count}` : m.name} value={m.amount} />)}
        </>
      )}

      {w.prev && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          <Change cur={w.totalIn} prev={w.prev.totalIn} label={`In vs ${prevName}`} />
          <Change cur={w.expenses} prev={w.prev.expenses} label={`Spending vs ${prevName}`} invert />
        </div>
      )}
      {w.count === 0 && <p className="mt-2 text-footnote text-label-2">No activity this month.</p>}
    </section>
  );
}
