import { ChevronLeft, ChevronRight, Eye, EyeOff, Settings, WifiOff } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Page } from '../ui/Page';
import { IconButton, Button } from '../ui/Button';
import { Money } from '../ui/Money';
import { ProgressRing, Sparkline, EmptyState, Art } from '../ui/bits';
import { TxGroups } from '../ui/TxList';
import { useApp } from '../lib/app';
import { liveTxs, useData, useNetWorth } from '../db/hooks';
import { monthStats, netWorthSeries } from '../domain/ledger';
import { addMonths, monthLabel, monthOf, today } from '../domain/dates';
import { formatMoney } from '../domain/money';

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export function useOnline() {
  const [on, setOn] = useState(navigator.onLine);
  useEffect(() => {
    const a = () => setOn(true);
    const b = () => setOn(false);
    window.addEventListener('online', a);
    window.addEventListener('offline', b);
    return () => {
      window.removeEventListener('online', a);
      window.removeEventListener('offline', b);
    };
  }, []);
  return on;
}

export function Home() {
  const data = useData();
  const { hide, setHide, openSheet, settings } = useApp();
  const online = useOnline();
  const nw = useNetWorth(data);
  const now = today();
  const thisMonth = monthOf(now);
  const [month, setMonth] = useState(thisMonth);

  const stats = useMemo(() => (data ? monthStats(data, thisMonth) : null), [data, thisMonth]);
  const series = useMemo(() => (data ? netWorthSeries(data, thisMonth, 6, now) : []), [data, thisMonth, now]);
  const accounts = useMemo(() => new Map((data?.accounts ?? []).map((a) => [a.id, a])), [data]);
  const categories = useMemo(() => new Map((data?.categories ?? []).map((c) => [c.id, c])), [data]);
  const monthTxs = useMemo(() => liveTxs(data).filter((t) => t.occurred_on.startsWith(month)), [data, month]);

  const target = settings?.monthly_savings_target_minor ?? null;
  const symbol = settings?.symbol ?? 'Rs';
  const first = series.find((v) => v !== 0) ?? series[0] ?? 0;
  const delta6 = nw.netWorth - first;

  // Local data loads in a few ms; render nothing rather than flashing zeros that then count up.
  if (!data) return null;

  return (
    <Page
      title={greeting()}
      right={
        <>
          <IconButton label={hide ? 'Show balances' : 'Hide balances'} onClick={() => setHide(!hide)}>
            {hide ? <EyeOff size={22} /> : <Eye size={22} />}
          </IconButton>
          <IconButton label="Settings" onClick={() => openSheet({ kind: 'settings' })}>
            <Settings size={22} />
          </IconButton>
        </>
      }
      below={
        !online ? (
          <div className="chrome mx-4 -mt-1 mb-3 inline-flex items-center gap-1.5 rounded-full bg-fill px-2.5 py-1 text-footnote font-medium text-label-2">
            <WifiOff size={13} /> Offline · saved on this iPhone
          </div>
        ) : null
      }
    >
      {/* net worth hero */}
      <section className="card mx-4 p-5" aria-label="Net worth">
        <div className="text-subhead font-medium text-label-2">Net worth</div>
        <Money
          value={nw.netWorth}
          animated
          className={`rounded-num mt-0.5 block font-bold tracking-tight ${heroSize(formatMoney(nw.netWorth, { symbol }))}`}
          data-testid="net-worth"
        />
        <div className="mt-2 flex items-end justify-between gap-3">
          <div className="min-w-0 pb-0.5 text-footnote font-medium">
            {series.length > 1 && delta6 !== 0 ? (
              <span className={delta6 > 0 ? 'text-income' : 'text-expense'}>
                <Money value={delta6} signed /> <span className="text-label-2">in 6 months</span>
              </span>
            ) : (
              <span className="text-label-2">Your trend appears as months pass</span>
            )}
          </div>
          <Sparkline values={series} width={112} height={36} color={delta6 < 0 ? 'var(--expense)' : 'var(--accent)'} />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Stat label="Assets" value={nw.assets} onPress={() => window.dispatchEvent(new CustomEvent('dreams:tab', { detail: 'money' }))} />
          <Stat label="Owed to me" value={nw.owedToMe} />
          <Stat label="I owe" value={nw.iOwe} />
        </div>
      </section>

      {/* this month */}
      {stats && (
        <section className="card mx-4 mt-4 flex items-center gap-4 p-5" aria-label="This month">
          <div className="min-w-0 flex-1">
            <div className="text-subhead font-medium text-label-2">{monthLabel(thisMonth, true)}</div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <MiniStat label="Income" value={stats.income} className="text-income" />
              <MiniStat label="Spent" value={stats.expenses} />
              <MiniStat label="Saved" value={stats.saved} className={stats.saved < 0 ? 'text-expense' : ''} />
            </div>
          </div>
          <ProgressRing value={target ? stats.saved / target : stats.savingsRate ?? 0} size={58} stroke={6} color={stats.saved < 0 ? 'var(--expense)' : 'var(--income)'}>
            <span className="text-[12px] font-semibold tnum">
              {target ? `${Math.max(0, Math.round((stats.saved / target) * 100))}%` : stats.savingsRate === null ? '—' : `${Math.round(stats.savingsRate * 100)}%`}
            </span>
          </ProgressRing>
        </section>
      )}
      {stats && <p className="mx-8 mt-1.5 text-footnote text-label-2">{target ? <>Ring shows saved vs your <Money value={target} /> target.</> : 'Ring shows your savings rate. Set a target in Settings.'}</p>}

      {/* recent */}
      <div className="mx-4 mb-2 mt-7 flex items-center justify-between">
        <h2 className="text-title3">Transactions</h2>
        <div className="chrome flex items-center">
          <IconButton label="Previous month" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft size={22} /></IconButton>
          <span className="min-w-[78px] text-center text-subhead font-semibold tnum">{monthLabel(month)}</span>
          <IconButton label="Next month" onClick={() => setMonth(addMonths(month, 1))} disabled={month >= thisMonth} className="disabled:opacity-30"><ChevronRight size={22} /></IconButton>
        </div>
      </div>
      {monthTxs.length ? (
        <TxGroups txs={monthTxs} accounts={accounts} categories={categories} />
      ) : (
        <EmptyState
          art={Art.coins}
          title={month === thisMonth ? 'Nothing logged this month' : `Nothing in ${monthLabel(month)}`}
          message="Every rupee you log makes the month-end audit sharper."
          action={<Button size="md" onClick={() => openSheet({ kind: 'add' })}>Add Transaction</Button>}
        />
      )}
    </Page>
  );
}

/** Hero number steps down for crore-sized values so it never truncates at 375pt. */
function heroSize(text: string): string {
  return text.length <= 12 ? 'text-[44px] leading-[52px]' : text.length <= 15 ? 'text-[36px] leading-[44px]' : 'text-[30px] leading-[38px]';
}

function Stat({ label, value, onPress }: { label: string; value: number; onPress?: () => void }) {
  return (
    <button type="button" onClick={onPress} className="pressable min-w-0 rounded-ctl bg-surface-2 px-3 py-2 text-left">
      <div className="truncate text-caption font-medium text-label-2">{label}</div>
      <Money value={value} animated compact className="block truncate text-subhead font-semibold" />
    </button>
  );
}

function MiniStat({ label, value, className = '' }: { label: string; value: number; className?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-caption font-medium text-label-2">{label}</div>
      <Money value={value} animated compact className={`block truncate text-[15px] font-semibold ${className}`} />
    </div>
  );
}
