import { useMemo, useState, type ReactNode } from 'react';
import { Check, Minus, Plus, X } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { Button, NavButton } from '../ui/Button';
import { Group, Row } from '../ui/List';
import { Chip, ProgressRing, Toggle } from '../ui/bits';
import { Icon } from '../ui/Icon';
import { Money } from '../ui/Money';
import { SwipeRow } from '../ui/SwipeRow';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/ActionSheet';
import { celebrate } from '../ui/confetti';
import { useApp } from '../lib/app';
import { liveAccounts, useData } from '../db/hooks';
import {
  addDreamMoney, createDream, deleteDream, deleteDreamEntry, undoDeleteDream, undoDeleteDreamEntry, updateDream,
} from '../db/repo';
import { DREAM_COLOR_KEYS, DREAM_COLORS, DREAM_ICONS, dreamColor, dreamProgress, liveEntries, type DreamProgress } from '../domain/dreams';
import { formatMoney, parseMoney } from '../domain/money';
import { dayLabel, monthLabel, shortDate, today } from '../domain/dates';
import type { Dream } from '../domain/types';

/* ---------------- card ---------------- */

function etaText(p: DreamProgress): string {
  if (p.done) return 'Done';
  if (p.etaMonth) return `About ${monthLabel(p.etaMonth)}`;
  return 'Add money to see an ETA';
}

export function DreamCard({ dream, progress, onPress, wide }: { dream: Dream; progress: DreamProgress; onPress: () => void; wide?: boolean }) {
  const c = dreamColor(dream.color);
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={`${dream.title}, ${Math.round(progress.progress * 100)}%`}
      className={`pressable relative flex shrink-0 snap-start flex-col overflow-hidden rounded-card p-4 text-left ${wide ? 'w-[240px]' : 'w-full'}`}
      style={{ background: `linear-gradient(145deg, ${c.from}, ${c.to})`, color: c.ink }}
    >
      <div className="flex items-start justify-between">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/55">
          <Icon name={dream.icon} size={21} />
        </span>
        <ProgressRing value={progress.progress} size={44} stroke={5} color={c.ink} track="rgba(255,255,255,0.55)">
          {progress.done ? <Check size={18} strokeWidth={3} /> : <span className="text-[11px] font-bold tnum">{Math.round(progress.progress * 100)}%</span>}
        </ProgressRing>
      </div>
      <div className="mt-3 truncate text-headline">{dream.title}</div>
      <div className="mt-0.5 text-footnote font-medium opacity-80">
        <Money value={progress.saved} compact /> of <Money value={progress.target} compact />
      </div>
      <div className="mt-2 text-caption font-semibold opacity-75">{etaText(progress)}</div>
    </button>
  );
}

/* ---------------- create / edit ---------------- */

export function DreamSheet({ open, onClose, dream, z }: { open: boolean; onClose: () => void; dream?: Dream; z: number }) {
  const { symbol } = useApp();
  const toast = useToast();
  const [title, setTitle] = useState(dream?.title ?? '');
  const [target, setTarget] = useState(dream ? formatMoney(dream.target_minor, { bare: true }).replace(/,/g, '') : '');
  const [targetOn, setTargetOn] = useState<string | null>(dream?.target_on ?? null);
  const [icon, setIcon] = useState(dream?.icon ?? 'plane');
  const [color, setColor] = useState(dream?.color ?? 'lilac');
  const parsed = parseMoney(target);
  const valid = title.trim().length > 0 && parsed !== null && parsed > 0;

  const save = async () => {
    if (!valid) return;
    const input = { title, icon, color, target_minor: parsed!, target_on: targetOn };
    try {
      if (dream) await updateDream(dream, input);
      else {
        await createDream(input);
        toast({ message: `${title.trim()} added` });
      }
      onClose();
    } catch (e) {
      toast({ message: (e as Error).message, tone: 'error' });
    }
  };

  const previewDream: Dream = {
    id: 'preview', title: title.trim() || 'Your dream', icon, color, target_minor: parsed && parsed > 0 ? parsed : 10_000_000, target_on: targetOn,
    completed_at: null, created_at: '', updated_at: '', deleted_at: null,
  };
  const c = DREAM_COLORS[color];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      z={z}
      title={dream ? 'Edit Dream' : 'New Dream'}
      label={dream ? 'Edit dream' : 'New dream'}
      left={<NavButton onClick={onClose}>Cancel</NavButton>}
      right={<NavButton bold disabled={!valid} onClick={save}>{dream ? 'Save' : 'Add'}</NavButton>}
    >
      <div className="mx-auto w-[200px] pb-5 pt-1" aria-hidden>
        <DreamCard dream={previewDream} progress={{ saved: 0, target: previewDream.target_minor, remaining: previewDream.target_minor, progress: 0.35, done: false, avgMonthly: 0, etaMonths: null, etaMonth: null, neededMonthly: null, behind: false }} onPress={() => undefined} />
      </div>
      <Group>
        <FieldRow label="Name">
          <input autoFocus={!dream} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Trip to Japan" aria-label="Dream name" maxLength={40} className={inputCls} />
        </FieldRow>
        <FieldRow label="Target">
          <span className="text-label-2">{symbol}</span>
          <input value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" placeholder="0" aria-label="Target amount" className={`money ${inputCls} !flex-none w-36`} />
        </FieldRow>
        <FieldRow label="By">
          <input type="date" value={targetOn ?? ''} min={today()} max="2100-12-31" onChange={(e) => setTargetOn(e.target.value || null)} aria-label="Target date" className={`${inputCls} ${targetOn ? '' : 'text-label-3'}`} />
          {targetOn && (
            <button type="button" aria-label="Clear target date" onClick={(e) => { e.preventDefault(); setTargetOn(null); }} className="-mr-2 flex h-11 w-8 items-center justify-center text-label-3">
              <X size={18} />
            </button>
          )}
        </FieldRow>
      </Group>
      {target.trim() !== '' && parsed === null && <p className="mx-8 mt-2 text-footnote text-expense">Enter a number like 120000</p>}

      <Group header="Icon" className="mt-6">
        <div className="grid grid-cols-8 gap-1 p-2" role="radiogroup" aria-label="Icon">
          {DREAM_ICONS.map((i) => (
            <button key={i} type="button" role="radio" aria-checked={icon === i} aria-label={i} onClick={() => setIcon(i)}
              className={`flex h-11 items-center justify-center rounded-ctl ${icon === i ? 'bg-accent text-on-accent' : 'text-label-2 active:bg-fill'}`}>
              <Icon name={i} size={21} />
            </button>
          ))}
        </div>
      </Group>
      <Group header="Color" className="mt-6">
        <div className="flex justify-between px-4 py-3" role="radiogroup" aria-label="Color">
          {DREAM_COLOR_KEYS.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={color === k} aria-label={DREAM_COLORS[k].label} onClick={() => setColor(k)}
              className={`h-11 w-11 rounded-full ${color === k ? 'ring-2 ring-accent ring-offset-2 ring-offset-[var(--surface)]' : ''}`}
              style={{ background: `linear-gradient(145deg, ${DREAM_COLORS[k].from}, ${DREAM_COLORS[k].to})` }} />
          ))}
        </div>
      </Group>
      <p className="sr-only">Selected color {c.label}</p>
    </Sheet>
  );
}

const inputCls = 'h-11 min-w-0 flex-1 bg-transparent text-right text-[17px] outline-none placeholder:text-label-3';

function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="row sep flex min-h-[44px] items-center bg-surface pl-4">
      <span className="row-body flex min-h-[44px] flex-1 items-center gap-3 pr-4">
        <span className="shrink-0 text-body">{label}</span>
        {children}
      </span>
    </label>
  );
}

/* ---------------- detail ---------------- */

export function DreamDetailSheet({ open, onClose, id, z }: { open: boolean; onClose: () => void; id: string; z: number }) {
  const data = useData();
  const { openSheet, symbol } = useApp();
  const toast = useToast();
  const confirm = useConfirm();
  const dream = data?.dreams.find((d) => d.id === id);
  const accounts = useMemo(() => new Map((data?.accounts ?? []).map((a) => [a.id, a])), [data]);

  if (!data || !dream || dream.deleted_at) return <Sheet open={open} onClose={onClose} z={z} label="Dream detail">{null}</Sheet>;

  const p = dreamProgress(dream, data.dream_entries, today());
  const entries = liveEntries(dream, data.dream_entries).sort((a, b) => (b.entered_on === a.entered_on ? b.created_at.localeCompare(a.created_at) : b.entered_on.localeCompare(a.entered_on)));
  const c = dreamColor(dream.color);

  const del = async () => {
    if (!(await confirm(`${dream.title} and its ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} will be deleted. Money moved between accounts stays where it is.`, 'Delete Dream'))) return;
    const ids = await deleteDream(dream);
    onClose();
    toast({ message: `${dream.title} deleted`, action: { label: 'Undo', onPress: () => void undoDeleteDream(dream.id, ids) } });
  };

  return (
    <Sheet open={open} onClose={onClose} z={z} title={dream.title} label="Dream detail" left={<NavButton onClick={onClose}>Close</NavButton>} right={<NavButton onClick={() => openSheet({ kind: 'dream', dream })}>Edit</NavButton>}>
      <section className="mx-4 flex flex-col items-center rounded-card px-5 pb-5 pt-6 text-center" style={{ background: `linear-gradient(160deg, ${c.from}, ${c.to})`, color: c.ink }}>
        <ProgressRing value={p.progress} size={128} stroke={11} color={c.ink} track="rgba(255,255,255,0.5)">
          <span className="flex flex-col items-center">
            <Icon name={dream.icon} size={26} />
            <span className="rounded-num mt-1 text-[22px] font-bold tnum" data-testid="dream-percent">{Math.round(p.progress * 100)}%</span>
          </span>
        </ProgressRing>
        <Money value={p.saved} animated className="rounded-num mt-4 text-[34px] font-bold leading-[40px]" data-testid="dream-saved" />
        <div className="text-subhead font-medium opacity-80">of <Money value={p.target} /></div>
        <div className="mt-2 text-footnote font-semibold opacity-80">
          {p.done ? `Reached${dream.completed_at ? ` · ${shortDate(dream.completed_at.slice(0, 10))}` : ''}` : etaText(p)}
        </div>
      </section>

      <div className="mx-4 mb-6 mt-4 flex gap-2">
        <Button className="flex-1" onClick={() => openSheet({ kind: 'dreamMoney', dreamId: dream.id, mode: 'add' })}><Plus size={20} /> Add Money</Button>
        <Button variant="gray" className="flex-1" disabled={p.saved === 0} onClick={() => openSheet({ kind: 'dreamMoney', dreamId: dream.id, mode: 'withdraw' })}><Minus size={20} /> Take Out</Button>
      </div>

      <Group header="Plan" footer={p.done ? undefined : 'Pace is the average of what you added over the last 3 months.'}>
        <Row title="Still needed" value={<Money value={p.remaining} />} />
        <Row title="Pace" value={p.avgMonthly > 0 ? <><Money value={Math.round(p.avgMonthly)} /> / month</> : 'No recent money'} />
        {dream.target_on && <Row title="Target date" value={shortDate(dream.target_on)} />}
        {p.neededMonthly !== null && (
          <Row title="Needed per month" value={<span className={p.behind ? 'text-warn' : ''}><Money value={p.neededMonthly} /></span>} />
        )}
      </Group>

      <Group header="History" className="mt-6">
        {entries.length === 0 && <Row title={<span className="text-label-2">No money added yet</span>} />}
        {entries.map((e) => (
          <SwipeRow
            key={e.id}
            onDelete={async () => {
              const { txIds } = await deleteDreamEntry(e);
              toast({ message: 'Entry deleted', action: { label: 'Undo', onPress: () => void undoDeleteDreamEntry(e, txIds) } });
            }}
          >
            <Row
              title={e.amount_minor >= 0 ? 'Added' : 'Taken out'}
              subtitle={[dayLabel(e.entered_on), e.transaction_id ? transferLabel(e.transaction_id, data.transactions, accounts) : 'Earmarked', e.note].filter(Boolean).join(' · ')}
              value={<Money value={e.amount_minor} signed className={e.amount_minor > 0 ? 'text-income' : 'text-label'} />}
            />
          </SwipeRow>
        ))}
      </Group>
      {entries.length > 0 && <p className="mx-8 mt-1.5 text-footnote text-label-2">Swipe left on an entry to delete it. A linked transfer is deleted with it.</p>}

      <div className="mx-4 mt-8">
        <Button variant="destructive" size="md" block onClick={del}>Delete Dream</Button>
      </div>
      <p className="mx-8 mt-2 text-center text-footnote text-label-2">Target {formatMoney(dream.target_minor, { symbol })}</p>
    </Sheet>
  );
}

function transferLabel(txId: string, txs: { id: string; account_id: string; to_account_id: string | null; deleted_at: string | null }[], accounts: Map<string, { name: string }>) {
  const t = txs.find((x) => x.id === txId && !x.deleted_at);
  if (!t) return 'Earmarked';
  return `${accounts.get(t.account_id)?.name ?? '—'} → ${accounts.get(t.to_account_id ?? '')?.name ?? '—'}`;
}

/* ---------------- add / take out money ---------------- */

export function DreamMoneySheet({ open, onClose, dreamId, mode, z }: { open: boolean; onClose: () => void; dreamId: string; mode: 'add' | 'withdraw'; z: number }) {
  const data = useData();
  const { openSheet, symbol } = useApp();
  const toast = useToast();
  const accounts = liveAccounts(data);
  const dream = data?.dreams.find((d) => d.id === dreamId);
  const [amount, setAmount] = useState('');
  const [on, setOn] = useState(today());
  const [note, setNote] = useState('');
  const [move, setMove] = useState(false);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);

  if (!data || !dream) return <Sheet open={open} onClose={onClose} z={z} label="Dream money">{null}</Sheet>;

  const p = dreamProgress(dream, data.dream_entries, today());
  const savingsAcct = accounts.find((a) => a.kind === 'savings') ?? accounts[accounts.length - 1];
  const otherAcct = accounts.find((a) => a.id !== savingsAcct?.id);
  // add: everyday account → savings; take out: savings → everyday account
  const fromId = from ?? (mode === 'add' ? otherAcct?.id : savingsAcct?.id) ?? null;
  const toId = to ?? (mode === 'add' ? savingsAcct?.id : otherAcct?.id) ?? null;
  const canMove = accounts.length >= 2;
  const parsed = parseMoney(amount);
  const over = mode === 'withdraw' && parsed !== null && parsed > p.saved;
  const valid = parsed !== null && parsed > 0 && !over && (!move || (!!fromId && !!toId && fromId !== toId));
  const toInput = (m: number) => formatMoney(m, { bare: true }).replace(/,/g, '');

  const save = async () => {
    if (!valid) return;
    try {
      const { completed } = await addDreamMoney(dream, {
        amount_minor: parsed!, mode, entered_on: on, note,
        transfer: move ? { from_account_id: fromId!, to_account_id: toId! } : null,
      });
      onClose();
      if (completed) {
        celebrate();
        toast({ message: `${dream.title} is fully funded` });
      } else toast({ message: `${mode === 'add' ? 'Added' : 'Took out'} ${formatMoney(parsed!, { symbol })}` });
    } catch (e) {
      toast({ message: (e as Error).message, tone: 'error' });
    }
  };

  const accountRow = (label: string, id: string | null, set: (v: string) => void, exclude?: string | null) => {
    const a = accounts.find((x) => x.id === id);
    return (
      <Row
        title={label}
        chevron
        onPress={() => openSheet({ kind: 'pickAccount', title: label, exclude: exclude ?? undefined, onPick: set })}
        value={<span className="flex items-center gap-1.5">{a && <Icon name={a.icon} size={16} style={{ color: a.color ?? undefined }} />}{a?.name ?? 'Choose'}</span>}
      />
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      z={z}
      title={mode === 'add' ? 'Add Money' : 'Take Out'}
      label="Dream money"
      left={<NavButton onClick={onClose}>Cancel</NavButton>}
      right={<NavButton bold disabled={!valid} onClick={save}>Save</NavButton>}
    >
      <p className="mx-8 mb-3 text-center text-subhead text-label-2">
        {dream.title}: <Money value={p.saved} /> of <Money value={p.target} />
      </p>
      <Group footer={over ? `This dream has ${formatMoney(p.saved, { symbol })} saved.` : undefined}>
        <FieldRow label="Amount">
          <span className="text-label-2">{symbol}</span>
          <input autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0" aria-label="Dream amount" className={`money ${inputCls} !flex-none w-36 ${over ? 'text-expense' : ''}`} />
        </FieldRow>
      </Group>
      <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-4">
        {mode === 'add' && p.remaining > 0 && <Chip onClick={() => setAmount(toInput(p.remaining))} icon={<Check size={15} />}>Rest {formatMoney(p.remaining, { symbol })}</Chip>}
        {mode === 'add' && p.neededMonthly !== null && p.neededMonthly < p.remaining && <Chip onClick={() => setAmount(toInput(p.neededMonthly!))}>Monthly {formatMoney(p.neededMonthly, { symbol })}</Chip>}
        {mode === 'withdraw' && p.saved > 0 && <Chip onClick={() => setAmount(toInput(p.saved))}>All {formatMoney(p.saved, { symbol })}</Chip>}
      </div>

      <Group
        className="mt-6"
        footer={
          !canMove
            ? 'Add a second account (for example a savings account) to move real money too.'
            : move
              ? 'A transfer between your accounts is recorded too. Net worth doesn’t change.'
              : 'Only earmarked: your account balances stay as they are.'
        }
      >
        <Row title={mode === 'add' ? 'Also move money from an account' : 'Also move money back to an account'}>
          <Toggle checked={move && canMove} onChange={(v) => canMove && setMove(v)} label="Also move money" />
        </Row>
        {move && canMove && (
          <>
            {accountRow('From', fromId, setFrom, toId)}
            {accountRow('To', toId, setTo, fromId)}
          </>
        )}
      </Group>

      <Group className="mt-6">
        <FieldRow label="Date">
          <input type="date" value={on} max="2100-12-31" onChange={(e) => e.target.value && setOn(e.target.value)} aria-label="Date" className={inputCls} />
        </FieldRow>
        <label className="row sep flex min-h-[44px] items-center bg-surface pl-4">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" aria-label="Note" maxLength={140} className="row-body h-11 flex-1 bg-transparent pr-4 text-[17px] outline-none placeholder:text-label-3" />
        </label>
      </Group>
    </Sheet>
  );
}
