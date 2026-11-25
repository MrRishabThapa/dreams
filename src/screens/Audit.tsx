import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Lock, LockOpen, Share2, FileSpreadsheet, Lightbulb, TrendingDown, TrendingUp } from 'lucide-react';
import { Page } from '../ui/Page';
import { Button } from '../ui/Button';
import { Group, Row } from '../ui/List';
import { EmptyState, ProgressRing, Art } from '../ui/bits';
import { IconTile } from '../ui/Icon';
import { Money } from '../ui/Money';
import { Sheet } from '../ui/Sheet';
import { NavButton } from '../ui/Button';
import { TxGroups } from '../ui/TxList';
import { Donut, PairBars, RankedBars, SERIES } from '../ui/charts';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/ActionSheet';
import { useApp } from '../lib/app';
import { useData, liveTxs } from '../db/hooks';
import { closeMonth, reopenMonth, saveAuditDraft } from '../db/repo';
import { shareOrDownload, transactionsCSV } from '../db/backup';
import { auditMonths, auditText, buildAuditSnapshot, monthReadyToClose, type AuditSnapshot } from '../domain/audit';
import { formatMoney, parseMoney } from '../domain/money';
import { monthLabel, monthName, monthOf, shortDate, today } from '../domain/dates';
import type { Month } from '../domain/types';

const pct = (x: number) => `${Math.round(x * 100)}%`;

function readMonth(): Month | null {
  try {
    return sessionStorage.getItem('dreams.auditMonth');
  } catch {
    return null;
  }
}

export function AuditScreen() {
  const data = useData();
  const { settings, symbol, openSheet } = useApp();
  const toast = useToast();
  const confirm = useConfirm();
  const now = today();
  const months = useMemo(() => (data ? auditMonths(data, now) : []), [data, now]);
  const ready = useMemo(() => (data ? monthReadyToClose(data, data.audits, now) : null), [data, now]);
  const [month, setMonthState] = useState<Month>(() => readMonth() ?? monthOf(now));
  const setMonth = (m: Month) => {
    setMonthState(m);
    try {
      sessionStorage.setItem('dreams.auditMonth', m);
    } catch {
      /* ignore */
    }
  };
  const chips = useRef<HTMLDivElement>(null);

  // default to the month that is ready to close on first open
  useEffect(() => {
    if (!readMonth() && ready) setMonthState(ready);
  }, [ready]);
  useEffect(() => {
    chips.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [month, months.length]);

  const audit = data?.audits.find((a) => !a.deleted_at && a.month === month);
  const closed = !!audit?.closed_at;
  const live = useMemo(
    () =>
      data && !closed
        ? buildAuditSnapshot({ ledger: data, categories: data.categories, dreamEntries: data.dream_entries, month, savingsTarget: settings?.monthly_savings_target_minor ?? null, symbol })
        : null,
    [data, closed, month, settings?.monthly_savings_target_minor, symbol],
  );
  const snap: AuditSnapshot | null = closed ? (audit!.snapshot as AuditSnapshot) : live;

  const [reflection, setReflection] = useState('');
  const [nextTarget, setNextTarget] = useState('');
  useEffect(() => {
    setReflection(audit?.reflection ?? '');
    setNextTarget(audit?.next_savings_target_minor ? formatMoney(audit.next_savings_target_minor, { bare: true }).replace(/,/g, '') : '');
  }, [audit?.id, month]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return null;
  const hasAny = months.length > 1 || liveTxs(data).length > 0;
  const isCurrent = month === monthOf(now);
  const targetParsed = nextTarget.trim() === '' ? null : parseMoney(nextTarget);

  const saveDraft = async () => {
    if (closed || !live) return;
    if ((audit?.reflection ?? '') === reflection && (audit?.next_savings_target_minor ?? null) === targetParsed) return;
    if (targetParsed === null && nextTarget.trim() !== '') return;
    await saveAuditDraft(month, live, reflection, targetParsed);
  };

  const close = async () => {
    if (!live) return;
    if (nextTarget.trim() !== '' && targetParsed === null) return toast({ message: 'Enter the target as a number', tone: 'error' });
    await closeMonth(month, live, reflection, targetParsed);
    toast({ message: `${monthName(month)} closed` });
  };
  const reopen = async () => {
    if (!(await confirm(`${monthName(month)} goes back to live numbers. Your reflection is kept.`, 'Reopen Month'))) return;
    await reopenMonth(month);
    toast({ message: `${monthName(month)} reopened` });
  };

  const shareText = async () => {
    if (!snap) return;
    const r = await shareOrDownload(`dreams-audit-${month}.txt`, 'text/plain', auditText(snap, symbol, reflection, closed));
    if (r === 'downloaded') toast({ message: 'Audit saved as a text file' });
  };
  const shareCsv = async () => {
    const txs = data.transactions.filter((t) => t.occurred_on.startsWith(month));
    const r = await shareOrDownload(`dreams-${month}.csv`, 'text/csv', transactionsCSV(txs, data.accounts, data.categories, data.debts));
    if (r === 'downloaded') toast({ message: 'Transactions saved as CSV' });
  };

  return (
    <Page
      title="Audit"
      below={
        hasAny ? (
          <div ref={chips} className="no-scrollbar chrome mb-4 flex gap-2 overflow-x-auto px-4" role="tablist" aria-label="Month">
            {months.map((m) => {
              const a = data.audits.find((x) => !x.deleted_at && x.month === m);
              const sel = m === month;
              return (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={sel}
                  onClick={() => setMonth(m)}
                  className={`pressable inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[15px] font-medium ${sel ? 'bg-accent text-on-accent' : 'bg-surface text-label shadow-card'}`}
                >
                  {a?.closed_at && <Lock size={13} aria-label="closed" />}
                  {monthLabel(m)}
                </button>
              );
            })}
          </div>
        ) : null
      }
    >
      {!hasAny || !snap ? (
        <EmptyState
          art={Art.chart}
          title="Your first audit"
          message="Log what comes in and goes out. At month end you’ll see where it went, what you saved and how your net worth moved."
          action={<Button size="md" onClick={() => openSheet({ kind: 'add' })}>Add Transaction</Button>}
        />
      ) : (
        <Report
          snap={snap}
          closed={closed}
          closedAt={audit?.closed_at ?? null}
          isCurrent={isCurrent}
          onCategory={(key, name) => openSheet({ kind: 'categoryTxs', month, key, name })}
          footer={
            <>
              {/* 9. reflection */}
              <Group header="Reflection" className="mt-6" footer={closed ? undefined : 'Saved as you type. It’s locked in when you close the month.'}>
                <div className="sep bg-surface px-4 py-3">
                  <textarea
                    value={reflection}
                    onChange={(e) => setReflection(e.target.value)}
                    onBlur={saveDraft}
                    readOnly={closed}
                    rows={4}
                    aria-label="Reflection"
                    placeholder="What went well? What will I change?"
                    className="w-full resize-none bg-transparent text-[17px] leading-[22px] outline-none placeholder:text-label-3"
                  />
                </div>
                <label className="row sep flex min-h-[44px] items-center bg-surface pl-4">
                  <span className="row-body flex flex-1 items-center gap-3 pr-4">
                    <span className="flex-1 text-body">Next month’s target</span>
                    <span className="text-label-2">{symbol}</span>
                    <input
                      value={nextTarget}
                      onChange={(e) => setNextTarget(e.target.value)}
                      onBlur={saveDraft}
                      readOnly={closed}
                      inputMode="decimal"
                      placeholder={settings?.monthly_savings_target_minor ? formatMoney(settings.monthly_savings_target_minor, { bare: true }) : 'None'}
                      aria-label="Next month's savings target"
                      className="money h-11 w-28 bg-transparent text-right text-[17px] outline-none placeholder:text-label-3"
                    />
                  </span>
                </label>
              </Group>

              {/* 10. close month */}
              <div className="mx-4 mt-6 flex flex-col gap-2">
                {closed ? (
                  <>
                    <div className="flex items-center justify-center gap-2 text-subhead text-label-2">
                      <Lock size={15} /> Closed {audit?.closed_at ? shortDate(audit.closed_at.slice(0, 10)) : ''}. Showing the locked snapshot.
                    </div>
                    <Button variant="gray" size="md" onClick={reopen}><LockOpen size={18} /> Reopen Month</Button>
                  </>
                ) : (
                  <Button onClick={close} disabled={isCurrent} aria-label="Close month">
                    <Lock size={18} /> {isCurrent ? `Close after ${monthName(month)} ends` : `Close ${monthName(month)}`}
                  </Button>
                )}
              </div>

              {/* exports */}
              <Group header="Export" className="mt-6">
                <Row icon={<span className="flex h-[30px] w-[30px] items-center justify-center text-accent"><Share2 size={20} /></span>} title="Share audit as text" accent onPress={shareText} />
                <Row icon={<span className="flex h-[30px] w-[30px] items-center justify-center text-accent"><FileSpreadsheet size={20} /></span>} title={`${monthName(month)} transactions (CSV)`} accent onPress={shareCsv} />
              </Group>
            </>
          }
        />
      )}
    </Page>
  );
}

function Card({ title, children, className = '', label }: { title?: string; children: ReactNode; className?: string; label?: string }) {
  return (
    <section className={`card mx-4 p-5 ${className}`} aria-label={label ?? title}>
      {title && <h2 className="mb-3 text-headline">{title}</h2>}
      {children}
    </section>
  );
}

function Delta({ cur, prev, invert, prevName }: { cur: number; prev: number; invert?: boolean; prevName: string }) {
  if (prev === 0) return null;
  const ch = (cur - prev) / prev;
  if (Math.abs(ch) < 0.005) return <span className="text-footnote text-label-2">Same as {prevName}</span>;
  const good = invert ? ch < 0 : ch > 0;
  const Icon = ch > 0 ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 text-footnote font-medium ${good ? 'text-income' : 'text-expense'}`}>
      <Icon size={14} /> {pct(Math.abs(ch))} vs {prevName}
    </span>
  );
}

function Line({ label, value, signed = true, strong, muted }: { label: ReactNode; value: number; signed?: boolean; strong?: boolean; muted?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between py-1.5 ${strong ? 'font-semibold' : ''} ${muted ? 'text-label-2' : ''}`}>
      <span className="text-body">{label}</span>
      <Money value={value} signed={signed} className="text-body" />
    </div>
  );
}

function Report({ snap, closed, closedAt, isCurrent, onCategory, footer }: { snap: AuditSnapshot; closed: boolean; closedAt: string | null; isCurrent: boolean; onCategory: (key: string, name: string) => void; footer: ReactNode }) {
  const s = snap.stats;
  const prevName = snap.prev ? monthName(snap.prev.month).slice(0, 3) : '';
  const slices = snap.categories.map((c, i) => ({ key: c.key, label: c.name, value: c.amount, color: c.color ?? SERIES[i % SERIES.length] }));
  const top = slices.slice(0, 6);
  const rest = slices.slice(6).reduce((a, x) => a + x.value, 0);
  const donutSlices = rest > 0 ? [...top, { key: '_rest', label: 'Everything else', value: rest, color: '#8E8E93' }] : top;
  const rate = s.savingsRate;

  return (
    <div className="flex flex-col gap-4">
      {/* 1. verdict */}
      <Card label="Verdict">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-subhead font-medium text-label-2">{monthLabel(snap.month, true)}</span>
              {closed && <span className="inline-flex items-center gap-1 rounded-full bg-fill px-2 py-0.5 text-caption font-semibold text-label-2"><Lock size={11} /> Closed</span>}
              {!closed && isCurrent && <span className="rounded-full bg-fill px-2 py-0.5 text-caption font-semibold text-label-2">In progress</span>}
            </div>
            <div className="mt-1 text-footnote text-label-2">Net worth change</div>
            <Money value={s.netWorthChange} signed tone="auto" className="rounded-num block text-[32px] font-bold leading-[38px]" data-testid="audit-nw-change" />
            {snap.netWorthChangePct !== null && <div className="text-footnote font-medium text-label-2">{snap.netWorthChangePct >= 0 ? '+' : '−'}{pct(Math.abs(snap.netWorthChangePct))} on the month</div>}
          </div>
          <ProgressRing value={rate !== null ? Math.max(0, rate) : 0} size={72} stroke={8} color={s.saved < 0 ? 'var(--expense)' : 'var(--income)'}>
            <span className="flex flex-col items-center leading-none">
              <span className="text-[15px] font-bold tnum">{rate === null ? '—' : pct(rate)}</span>
              <span className="mt-0.5 text-[10px] text-label-2">saved</span>
            </span>
          </ProgressRing>
        </div>
        <p className="mt-3 text-body">{snap.summary}</p>
      </Card>

      {/* 2. income vs spent */}
      <Card title="Income vs spent">
        <PairBars a={{ label: 'Income', value: s.income, color: 'var(--income)' }} b={{ label: 'Spent', value: s.expenses, color: 'var(--expense)' }} />
        {snap.prev && (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            <Delta cur={s.income} prev={snap.prev.income} prevName={prevName} />
            <Delta cur={s.expenses} prev={snap.prev.expenses} invert prevName={prevName} />
          </div>
        )}
      </Card>

      {/* 3. spending by category */}
      {slices.length > 0 && (
        <section aria-label="Spending by category">
          <div className="card mx-4 flex flex-col items-center px-5 pb-2 pt-5">
            <h2 className="mb-3 self-start text-headline">Spending by category</h2>
            <Donut
              slices={donutSlices}
              onSlice={(k) => k !== '_rest' && onCategory(k, slices.find((x) => x.key === k)?.label ?? '')}
              center={<><span className="text-caption text-label-2">Spent</span><Money value={s.expenses} compact className="text-headline" /></>}
            />
            <div className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1 pb-3">
              {donutSlices.map((x) => (
                <span key={x.key} className="inline-flex items-center gap-1.5 text-footnote text-label-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: x.color }} />
                  {x.label} {pct(x.value / (s.expenses || 1))}
                </span>
              ))}
            </div>
          </div>
          <div className="card mx-4 mt-3 overflow-hidden">
            <RankedBars
              rows={snap.categories.map((c, i) => ({
                key: c.key, label: c.name, value: c.amount, color: c.color ?? SERIES[i % SERIES.length],
                icon: <IconTile name={c.icon ?? 'circle-ellipsis'} color={c.color ?? SERIES[i % SERIES.length]} size={30} />,
                sub: <span className="text-footnote text-label-2 tnum">{pct(c.share)}</span>,
              }))}
              onPress={(k) => onCategory(k, snap.categories.find((c) => c.key === k)?.name ?? '')}
            />
          </div>
          <p className="mx-8 mt-1.5 text-footnote text-label-2">Tap a category to see its transactions.</p>
        </section>
      )}

      {/* 4. top 5 */}
      {snap.topExpenses.length > 0 && (
        <Group header="Top expenses">
          {snap.topExpenses.map((t, i) => (
            <Row
              key={t.id}
              icon={<span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-fill text-footnote font-semibold tnum">{i + 1}</span>}
              title={t.title}
              subtitle={[shortDate(t.occurred_on), t.account, t.note].filter(Boolean).join(' · ')}
              value={<Money value={t.amount} className="text-label" />}
            />
          ))}
        </Group>
      )}

      {/* 5. saved & invested */}
      <Card title="Saved & invested">
        <Line label="Moved to savings" value={s.movedToSavings} />
        <Line label="Moved to investments" value={s.movedToInvestments} />
        <Line label="Investment gain / loss" value={s.investmentGainLoss} />
        <Line label="Dreams funded" value={snap.dreamsFunded} />
      </Card>

      {/* 6. debts */}
      <Card title="Debts">
        <div className="grid grid-cols-2 gap-x-4">
          <Line label="Borrowed" value={s.borrowed} signed={false} />
          <Line label="Lent" value={s.lent} signed={false} />
          <Line label="Repaid" value={s.repaid} signed={false} />
          <Line label="Collected" value={s.collected} signed={false} />
        </div>
        <div className="mt-2 border-t-[0.5px] border-separator pt-2">
          <Line label="I owe at month end" value={snap.debtsOutstanding.iOwe} signed={false} />
          <Line label="Owed to me at month end" value={snap.debtsOutstanding.owedToMe} signed={false} />
          {snap.debtsOutstanding.overdue > 0 && <div className="pt-1 text-footnote font-medium text-expense">{snap.debtsOutstanding.overdue} past due</div>}
        </div>
      </Card>

      {/* 7. net worth walk */}
      <Card title="Net worth walk" label="Net worth walk">
        <Line label="Start of month" value={s.netWorthStart} signed={false} muted />
        <Line label="Income" value={s.income} />
        <Line label="Spending" value={-s.expenses} />
        {s.investmentGainLoss !== 0 && <Line label="Investment gain / loss" value={s.investmentGainLoss} />}
        {s.corrections !== 0 && <Line label="Corrections" value={s.corrections} />}
        {s.other !== 0 && <Line label={<span>Other <span className="text-footnote text-label-2">(debts without cash, etc.)</span></span>} value={s.other} />}
        <div className="mt-1 border-t-[0.5px] border-separator pt-1">
          <Line label="End of month" value={s.netWorthEnd} signed={false} strong />
        </div>
      </Card>

      {/* 8. insights */}
      {snap.insights.length > 0 && (
        <Card title="Insights">
          <ul className="flex flex-col gap-2.5">
            {snap.insights.map((i) => (
              <li key={i} className="flex gap-2.5 text-body">
                <Lightbulb size={18} className="mt-0.5 shrink-0 text-accent" />
                <span>{i}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {footer}
      {closed && closedAt && <span className="sr-only">Closed on {closedAt}</span>}
    </div>
  );
}

/* ---------------- category drill-down ---------------- */

export function CategoryTxsSheet({ open, onClose, month, keyId, name, z }: { open: boolean; onClose: () => void; month: Month; keyId: string; name: string; z: number }) {
  const data = useData();
  const accounts = useMemo(() => new Map((data?.accounts ?? []).map((a) => [a.id, a])), [data]);
  const categories = useMemo(() => new Map((data?.categories ?? []).map((c) => [c.id, c])), [data]);
  const txs = useMemo(
    () =>
      liveTxs(data).filter(
        (t) => t.type === 'expense' && !t.debt_id && t.occurred_on.startsWith(month) && (keyId.startsWith('name:') ? !t.category_id && (t.category_name ?? 'Other') === keyId.slice(5) : t.category_id === keyId),
      ),
    [data, month, keyId],
  );
  const total = txs.reduce((s, t) => s + t.amount_minor, 0);
  return (
    <Sheet open={open} onClose={onClose} z={z} title={name} label="Category transactions" detents={['medium', 'large']} initial="large" right={<NavButton bold onClick={onClose}>Done</NavButton>}>
      <p className="mx-8 mb-4 text-center text-subhead text-label-2">
        {monthLabel(month, true)} · {txs.length} transaction{txs.length === 1 ? '' : 's'} · <Money value={total} />
      </p>
      <TxGroups txs={txs} accounts={accounts} categories={categories} />
      {txs.length === 0 && <p className="mx-8 text-center text-subhead text-label-2">No transactions left in this category.</p>}
      <p className="sr-only">{formatMoney(total)}</p>
    </Sheet>
  );
}
