import { ChartLine, ChartPie, ChevronLeft, ChevronRight, Eye, EyeOff, Settings, WifiOff } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Page } from '../ui/Page';
import { IconButton, Button } from '../ui/Button';
import { Money } from '../ui/Money';
import { ProgressRing, Sparkline, EmptyState, Art } from '../ui/bits';
import { TxGroups } from '../ui/TxList';
import { goToTab, useApp } from '../lib/app';
import { SyncChip } from '../ui/SyncChip';
import { useSync } from '../sync/useSync';
import { liveDreams, liveTxs, useData, useNetWorth } from '../db/hooks';
import { DreamCard } from '../sheets/DreamSheets';
import { dreamProgress } from '../domain/dreams';
import { monthStats, netWorthSeries } from '../domain/ledger';
import { monthReadyToClose } from '../domain/audit';
import { addMonths, monthLabel, monthName, monthOf, today } from '../domain/dates';
import { formatMoney } from '../domain/money';
import { displayName, greetingFor, NAME_MAX } from '../domain/greeting';
import { getMeta, patch, setMeta } from '../db/repo';
import { Segmented } from '../ui/Segmented';
import { ProfitChart } from '../ui/ProfitChart';
import { dailyIndex, hasChart, profitSeries, PROFIT_RANGES, type ProfitRange, type ProfitSeries } from '../domain/profit';
import { shortDate } from '../domain/dates';

type HeroView = 'balance' | 'graph';
/** per-device view choices (the card's tab and the graph range) */
function usePref<T extends string>(key: string, allowed: readonly T[], fallback: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const s = localStorage.getItem(key) as T | null;
      return s && allowed.includes(s) ? s : fallback;
    } catch {
      return fallback;
    }
  });
  const set = (next: T) => {
    setV(next);
    try {
      localStorage.setItem(key, next);
    } catch {
      /* ignore */
    }
  };
  return [v, set];
}

const SINCE: Record<ProfitRange, string> = { '1W': 'this week', '1M': 'this month', '3M': 'in 3 months', '1Y': 'this year', All: 'since you started' };

function sinceLabel(s: ProfitSeries, today: string): string {
  if (s.range === 'All') return `since ${shortDate(s.start)}`;
  const days = { '1W': 7, '1M': 30, '3M': 90, '1Y': 365 }[s.range];
  // clipped to the first recorded day: say so instead of claiming the whole range
  return s.points.length < days && s.start !== today ? `since ${shortDate(s.start)}` : SINCE[s.range];
}

/** Greeting for the current local hour; refreshes every minute and when the app comes back. */
function useGreeting(): string {
  const [hour, setHour] = useState(() => new Date().getHours());
  useEffect(() => {
    const tick = () => setHour(new Date().getHours());
    const vis = () => document.visibilityState === 'visible' && tick();
    const t = window.setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('pageshow', tick);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', vis);
      window.removeEventListener('pageshow', tick);
    };
  }, []);
  return greetingFor(hour);
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
  const greeting = useGreeting();
  const name = displayName(settings?.display_name);
  const promptDone = useLiveQuery(() => getMeta<boolean>('namePromptDone', false), []);
  const online = useOnline();
  const sync = useSync();
  const nw = useNetWorth(data);
  const now = today();
  const thisMonth = monthOf(now);
  const [month, setMonth] = useState(thisMonth);
  const [view, setView] = usePref<HeroView>('dreams.homeView', ['balance', 'graph'], 'balance');
  const [range, setRange] = usePref<ProfitRange>('dreams.profitRange', PROFIT_RANGES, '1M');

  const stats = useMemo(() => (data ? monthStats(data, thisMonth) : null), [data, thisMonth]);
  const series = useMemo(() => (data ? netWorthSeries(data, thisMonth, 6, now) : []), [data, thisMonth, now]);
  const accounts = useMemo(() => new Map((data?.accounts ?? []).map((a) => [a.id, a])), [data]);
  const categories = useMemo(() => new Map((data?.categories ?? []).map((c) => [c.id, c])), [data]);
  const debts = useMemo(() => new Map((data?.debts ?? []).map((d) => [d.id, d])), [data]);
  const dreams = useMemo(() => liveDreams(data).map((d) => ({ d, p: dreamProgress(d, data?.dream_entries ?? [], now) })).sort((a, b) => Number(a.p.done) - Number(b.p.done)), [data, now]);
  // one pass over the ledger per data change, then cheap per range
  const index = useMemo(() => (data ? dailyIndex(data) : null), [data]);
  const profit = useMemo(() => (data && index ? profitSeries(data, range, now, index) : null), [data, index, range, now]);
  const ready = useMemo(() => (data ? monthReadyToClose(data, data.audits, now) : null), [data, now]);
  const monthTxs = useMemo(() => liveTxs(data).filter((t) => t.occurred_on.startsWith(month)), [data, month]);

  const target = settings?.monthly_savings_target_minor ?? null;
  const symbol = settings?.symbol ?? 'Rs';
  const first = series.find((v) => v !== 0) ?? series[0] ?? 0;
  const delta6 = nw.netWorth - first;

  // Local data loads in a few ms; render nothing rather than flashing zeros that then count up.
  if (!data) return null;

  return (
    <Page
      barBlur={false}
      title={greeting}
      heading={
        name ? (
          <span className="block min-w-0" data-testid="greeting">
            <span className="block text-title3 font-semibold text-label-2">{greeting},</span>
            <span className="block truncate">{name}</span>
          </span>
        ) : (
          <span data-testid="greeting">{greeting}</span>
        )
      }
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
        sync.chip ? (
          <div className="mx-4 -mt-1 mb-3"><SyncChip onPress={() => openSheet({ kind: 'sync' })} /></div>
        ) : !online ? (
          <div className="chrome mx-4 -mt-1 mb-3 inline-flex items-center gap-1.5 rounded-full bg-fill px-2.5 py-1 text-footnote font-medium text-label-2">
            <WifiOff size={13} /> Offline · saved on this iPhone
          </div>
        ) : null
      }
    >
      {settings && !name && promptDone === false && <NamePrompt settingsId={settings.id} />}

      {ready && (
        <button
          type="button"
          onClick={() => {
            try {
              sessionStorage.setItem('dreams.auditMonth', ready);
            } catch {
              /* ignore */
            }
            goToTab('audit');
          }}
          className="pressable mx-4 mb-4 flex w-[calc(100%-2rem)] items-center gap-3 rounded-card bg-accent px-4 py-3 text-left text-on-accent"
        >
          <ChartPie size={26} />
          <span className="min-w-0 flex-1">
            <span className="block text-headline">Your {monthName(ready)} audit is ready</span>
            <span className="block text-footnote opacity-85">See where it went, then close the month.</span>
          </span>
          <ChevronRight size={20} />
        </button>
      )}

      {/* main card: net worth, or the profit graph (frosted; with the tab bar, the page's 2 blurred surfaces) */}
      <div className="frost-wrap mx-4">
        <section className="frost p-5" aria-label={view === 'graph' ? 'Profit graph' : 'Net worth'}>
          <Segmented
            value={view}
            onChange={setView}
            className="mb-4"
            options={[
              { value: 'balance', label: 'Balance' },
              { value: 'graph', label: 'Graph' },
            ]}
          />
          {view === 'balance' ? (
            <>
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
                <Stat label="Assets" value={nw.assets} onPress={() => goToTab('money', 'accounts')} />
                <Stat label="Owed to me" value={nw.owedToMe} onPress={() => goToTab('money', 'debts')} />
                <Stat label="I owe" value={nw.iOwe} onPress={() => goToTab('money', 'debts')} />
              </div>
            </>
          ) : profit && index && hasChart(profit, index) ? (
            <>
              <ProfitChart series={profit} symbol={symbol} sinceLabel={sinceLabel(profit, now)} />
              <RangeChips value={range} onChange={setRange} />
            </>
          ) : (
            <div className="flex flex-col items-center py-6 text-center" data-testid="profit-empty">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-accent"><ChartLine size={24} /></span>
              <div className="mt-3 text-headline">Your graph needs two days</div>
              <p className="mt-1 max-w-[260px] text-subhead text-label-2">Log what you spend and earn today; from tomorrow you’ll see profit and loss day by day.</p>
            </div>
          )}
        </section>
      </div>

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

      {/* dreams carousel */}
      {dreams.length > 0 && (
        <section aria-label="Dreams" className="mt-7">
          <div className="mx-4 mb-2 flex items-center justify-between">
            <h2 className="text-title3">Dreams</h2>
            <button type="button" className="min-h-[44px] px-1 text-subhead font-medium text-accent" onClick={() => goToTab('dreams')}>See all</button>
          </div>
          <div className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1" style={{ scrollPaddingLeft: 16 }}>
            {dreams.map(({ d, p }) => (
              <DreamCard key={d.id} dream={d} progress={p} wide onPress={() => openSheet({ kind: 'dreamDetail', id: d.id })} />
            ))}
          </div>
        </section>
      )}

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
        <TxGroups txs={monthTxs} accounts={accounts} categories={categories} debts={debts} />
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

function RangeChips({ value, onChange }: { value: ProfitRange; onChange: (r: ProfitRange) => void }) {
  return (
    <div className="mt-3 grid grid-cols-5 gap-1" role="group" aria-label="Range">
      {PROFIT_RANGES.map((r) => (
        <button
          key={r}
          type="button"
          aria-pressed={value === r}
          onClick={() => onChange(r)}
          className={`h-8 rounded-full text-[13px] font-semibold tnum ${value === r ? 'bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-accent' : 'text-label-2 active:bg-fill'}`}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

/** Asked once: a name for the greeting. "Not now" never asks again; Settings → Profile can set it any time. */
function NamePrompt({ settingsId }: { settingsId: string }) {
  const [value, setValue] = useState('');
  const n = displayName(value);
  const done = () => void setMeta('namePromptDone', true);
  return (
    <section className="card mx-4 mb-4 p-4" aria-label="Your name">
      <label htmlFor="name-prompt" className="block text-headline">What should Dreams call you?</label>
      <p className="mt-0.5 text-footnote text-label-2">For the greeting up top. You can change it in Settings.</p>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!n) return;
          void patch('user_settings', settingsId, { display_name: n }).then(done);
        }}
      >
        <input
          id="name-prompt"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={NAME_MAX}
          placeholder="Your name"
          autoComplete="given-name"
          enterKeyHint="done"
          className="h-11 min-w-0 flex-1 rounded-ctl bg-fill px-3 text-[17px] outline-none placeholder:text-label-3"
        />
        <Button size="md" type="submit" disabled={!n}>Save</Button>
      </form>
      <button type="button" onClick={done} className="mt-1 min-h-[44px] text-subhead text-label-2">Not now</button>
    </section>
  );
}

/** Hero number steps down for crore-sized values so it never truncates at 375pt. */
function heroSize(text: string): string {
  return text.length <= 12 ? 'text-[44px] leading-[52px]' : text.length <= 15 ? 'text-[36px] leading-[44px]' : 'text-[30px] leading-[38px]';
}

function Stat({ label, value, onPress }: { label: string; value: number; onPress?: () => void }) {
  return (
    <button type="button" onClick={onPress} className="pressable min-w-0 rounded-ctl bg-fill px-3 py-2 text-left">
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
