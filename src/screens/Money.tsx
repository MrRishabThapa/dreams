import { ChevronRight, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Page } from '../ui/Page';
import { IconButton, Button } from '../ui/Button';
import { Segmented } from '../ui/Segmented';
import { Group, Row } from '../ui/List';
import { IconTile } from '../ui/Icon';
import { Money } from '../ui/Money';
import { EmptyState, Art } from '../ui/bits';
import { useApp } from '../lib/app';
import { liveAccounts, liveDebts, useBalances, useData, type Data } from '../db/hooks';
import { DueBadge, PersonAvatar, ProgressBar } from '../sheets/DebtSheets';
import { debtStatus, type DebtStatus } from '../domain/debts';
import { today } from '../domain/dates';
import type { Debt } from '../domain/types';
import { GROUP_ORDER, KIND_META } from '../lib/catalog';

type Seg = 'accounts' | 'debts';

function readSeg(): Seg {
  try {
    return sessionStorage.getItem('dreams.moneySeg') === 'debts' ? 'debts' : 'accounts';
  } catch {
    return 'accounts';
  }
}

export function MoneyScreen() {
  const data = useData();
  const bal = useBalances(data);
  const { openSheet } = useApp();
  const [seg, setSegState] = useState<Seg>(readSeg);
  const setSeg = (v: Seg) => {
    setSegState(v);
    try {
      sessionStorage.setItem('dreams.moneySeg', v);
    } catch {
      /* ignore */
    }
  };
  useEffect(() => {
    const h = (e: Event) => setSegState((e as CustomEvent<Seg>).detail);
    window.addEventListener('dreams:moneySeg', h);
    return () => window.removeEventListener('dreams:moneySeg', h);
  }, []);
  const accounts = liveAccounts(data);
  const archived = liveAccounts(data, true).filter((a) => a.archived);
  const total = accounts.reduce((s, a) => s + (bal.get(a.id) ?? 0), 0);

  // Local data loads in a few ms; render nothing rather than flashing zeros that then count up.
  if (!data) return null;

  return (
    <Page
      title="Money"
      right={
        seg === 'accounts' ? (
          <IconButton label="Add account" onClick={() => openSheet({ kind: 'account' })}><Plus size={26} /></IconButton>
        ) : (
          <IconButton label="Add debt" onClick={() => openSheet({ kind: 'debt' })}><Plus size={26} /></IconButton>
        )
      }
      below={
        <div className="px-4 pb-4">
          <Segmented value={seg} onChange={setSeg} options={[{ value: 'accounts', label: 'Accounts' }, { value: 'debts', label: 'Debts' }]} />
        </div>
      }
    >
      {seg === 'accounts' ? (
        <>
          <div className="mx-4 mb-5 flex items-baseline justify-between px-1">
            <span className="text-subhead text-label-2">Total in accounts</span>
            <Money value={total} animated className="rounded-num text-title3" />
          </div>
          <div className="flex flex-col gap-6">
            {GROUP_ORDER.map((g) => {
              const list = accounts.filter((a) => KIND_META[a.kind].group === g);
              if (!list.length) return null;
              const sum = list.reduce((s, a) => s + (bal.get(a.id) ?? 0), 0);
              return (
                <Group key={g} header={<span className="flex justify-between"><span>{g}</span><Money value={sum} className="normal-case" /></span>}>
                  {list.map((a) => (
                    <Row
                      key={a.id}
                      icon={<IconTile name={a.icon} color={a.color} />}
                      title={a.name}
                      subtitle={a.name === KIND_META[a.kind].label ? undefined : KIND_META[a.kind].label}
                      value={<Money value={bal.get(a.id) ?? 0} className={`${(bal.get(a.id) ?? 0) < 0 ? 'text-expense' : 'text-label'}`} />}
                      chevron
                      onPress={() => openSheet({ kind: 'accountDetail', id: a.id })}
                    />
                  ))}
                </Group>
              );
            })}
            <Group>
              <Row icon={<span className="flex h-[30px] w-[30px] items-center justify-center text-accent"><Plus size={22} /></span>} title="Add Account" accent onPress={() => openSheet({ kind: 'account' })} />
            </Group>
            {archived.length > 0 && (
              <Group header="Archived">
                {archived.map((a) => (
                  <Row key={a.id} icon={<IconTile name={a.icon} color="#8E8E93" />} title={a.name} chevron onPress={() => openSheet({ kind: 'accountDetail', id: a.id })} />
                ))}
              </Group>
            )}
          </div>
        </>
      ) : (
        <DebtsList data={data} />
      )}
    </Page>
  );
}

function DebtsList({ data }: { data: Data }) {
  const { openSheet } = useApp();
  const now = today();
  const rows = useMemo(
    () =>
      liveDebts(data)
        .map((d) => ({ d, st: debtStatus(d, data.transactions, now) }))
        // overdue first, then nearest due date, then newest
        .sort((a, b) => {
          const ad = a.st.daysToDue ?? 99999;
          const bd = b.st.daysToDue ?? 99999;
          return ad !== bd ? ad - bd : b.d.opened_on.localeCompare(a.d.opened_on);
        }),
    [data, now],
  );
  const open = rows.filter((r) => !r.st.settled);
  const iOwe = open.filter((r) => r.d.direction === 'owe');
  const owedToMe = open.filter((r) => r.d.direction === 'owed');
  const settled = rows.filter((r) => r.st.settled);
  const sum = (list: typeof rows) => list.reduce((s, r) => s + r.st.remaining, 0);

  if (!rows.length) {
    return (
      <EmptyState
        art={Art.handshake}
        title="No debts"
        message="Track money you borrowed or lent, with payments and due dates."
        action={<Button size="md" onClick={() => openSheet({ kind: 'debt' })}>Add Debt</Button>}
      />
    );
  }

  const row = ({ d, st }: { d: Debt; st: DebtStatus }) => (
    <button
      key={d.id}
      type="button"
      onClick={() => openSheet({ kind: 'debtDetail', id: d.id })}
      aria-label={`${d.person}, ${d.direction === 'owe' ? 'I owe' : 'owes me'}`}
      className="row sep flex w-full items-center gap-3 bg-surface pl-4 text-left active:bg-surface-3"
    >
      <PersonAvatar name={d.person} size={36} />
      <span className="row-body flex min-w-0 flex-1 flex-col gap-1.5 py-3 pr-4">
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-body">{d.person}</span>
          <Money value={st.remaining} className={`text-body ${st.settled ? 'text-label-2' : ''}`} />
          <ChevronRight size={18} className="-mr-1 shrink-0 text-label-3" strokeWidth={2.4} />
        </span>
        {!st.settled && (
          <span className="flex items-center gap-2">
            <span className="flex-1"><ProgressBar value={st.progress} color={st.overdue ? 'var(--expense)' : 'var(--accent)'} /></span>
            <DueBadge status={st} dueOn={d.due_on} />
          </span>
        )}
        {st.settled && <span className="text-footnote text-label-2">Settled · <Money value={d.amount_minor} /></span>}
      </span>
    </button>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="mx-4 grid grid-cols-2 gap-3">
        <Summary label="I owe" value={sum(iOwe)} count={iOwe.length} />
        <Summary label="Owed to me" value={sum(owedToMe)} count={owedToMe.length} />
      </div>
      {iOwe.length > 0 && <Group header="I owe">{iOwe.map(row)}</Group>}
      {owedToMe.length > 0 && <Group header="Owed to me">{owedToMe.map(row)}</Group>}
      <Group>
        <Row icon={<span className="flex h-[30px] w-[30px] items-center justify-center text-accent"><Plus size={22} /></span>} title="Add Debt" accent onPress={() => openSheet({ kind: 'debt' })} />
      </Group>
      {settled.length > 0 && <Group header="Settled">{settled.map(row)}</Group>}
    </div>
  );
}

function Summary({ label, value, count }: { label: string; value: number; count: number }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-footnote font-medium text-label-2">{label}</div>
      <Money value={value} animated className="rounded-num block truncate text-title3" />
      <div className="text-caption text-label-2">{count === 0 ? 'Nothing open' : `${count} open`}</div>
    </div>
  );
}
