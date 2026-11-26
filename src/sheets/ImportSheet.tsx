import { ChevronDown, ClipboardPaste, FileText } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Sheet } from '../ui/Sheet';
import { Button, NavButton } from '../ui/Button';
import { Group, Row } from '../ui/List';
import { Money } from '../ui/Money';
import { useToast } from '../ui/Toast';
import { liveCategories, useBalances, useData } from '../db/hooks';
import { softDelete } from '../db/repo';
import { getMapping, getRules, importRows, rememberMapping, type ImportPick } from '../db/imports';
import {
  applyMapping, EMPTY_MAPPING, headerSignature, mappingReady, markDuplicates, parsePasted, readTable, ruleKey, suggestCategory,
  type DateFormat, type Mapping, type ParsedRow, type Rules, type Table,
} from '../domain/importer';
import { shortDate } from '../domain/dates';

type Step = 'source' | 'paste' | 'map' | 'preview';

const FIELDS: { key: keyof Omit<Mapping, 'dateFormat'>; label: string; hint?: string }[] = [
  { key: 'date', label: 'Date', hint: 'Required' },
  { key: 'description', label: 'Description' },
  { key: 'debit', label: 'Money out (debit)' },
  { key: 'credit', label: 'Money in (credit)' },
  { key: 'amount', label: 'Signed amount', hint: 'Only if there’s one amount column' },
  { key: 'balance', label: 'Balance' },
  { key: 'ref', label: 'Reference / transaction id' },
];

const FORMATS: { value: DateFormat; label: string }[] = [
  { value: 'auto', label: 'Automatic (day before month)' },
  { value: 'dmy', label: 'Day / Month / Year' },
  { value: 'mdy', label: 'Month / Day / Year' },
  { value: 'ymd', label: 'Year-Month-Day' },
];

function Select({ value, onChange, label, children }: { value: string; onChange: (v: string) => void; label: string; children: React.ReactNode }) {
  return (
    <span className="relative inline-flex items-center">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="h-9 max-w-[11rem] appearance-none truncate rounded-lg bg-fill py-0 pl-3 pr-7 text-subhead text-label outline-none"
      >
        {children}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-2 text-label-2" />
    </span>
  );
}

export function ImportSheet({ open, onClose, accountId, z }: { open: boolean; onClose: () => void; accountId: string; z: number }) {
  const data = useData();
  const bal = useBalances(data);
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('source');
  const [table, setTable] = useState<Table | null>(null);
  const [fileName, setFileName] = useState('');
  const [mapping, setMapping] = useState<Mapping>(EMPTY_MAPPING);
  const [paste, setPaste] = useState('');
  const [rules, setRules] = useState<Rules>({});
  const [picks, setPicks] = useState<ImportPick[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const account = data?.accounts.find((a) => a.id === accountId);
  const expenseCats = liveCategories(data, 'expense');
  const incomeCats = liveCategories(data, 'income');

  const toPicks = (rows: ParsedRow[], r: Rules) => {
    const fallback = (t: 'income' | 'expense') => (t === 'income' ? incomeCats : expenseCats).find((c) => c.name === 'Other')?.id ?? null;
    return markDuplicates(accountId, rows, data?.transactions ?? []).map((c) => {
      const s = suggestCategory(c.description, r);
      const okType = s && (c.type === 'income' ? incomeCats : expenseCats).some((x) => x.id === s);
      return { ...c, include: !c.duplicate && !c.error, categoryId: okType ? s : fallback(c.type) };
    });
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    if (f.size > 5_000_000) return setError('That file is over 5 MB. Export a shorter date range.');
    const text = await f.text();
    const t = readTable(text);
    if (!t.rows.length) return setError('No rows found. Is this a CSV statement?');
    setTable(t);
    setFileName(f.name);
    setRules(await getRules());
    setMapping((await getMapping(headerSignature(t))) ?? EMPTY_MAPPING);
    setStep('map');
  };

  const fromMapping = async () => {
    if (!table) return;
    await rememberMapping(headerSignature(table), mapping);
    setPicks(toPicks(applyMapping(table.rows, mapping), rules));
    setStep('preview');
  };

  const fromPaste = async () => {
    const r = await getRules();
    setRules(r);
    const rows = parsePasted(paste);
    if (!rows.length) return setError('Paste at least one line.');
    setError(null);
    setPicks(toPicks(rows, r));
    setStep('preview');
  };

  const chosen = picks.filter((p) => p.include && !p.duplicate && !p.error);
  const net = chosen.reduce((s, p) => s + (p.type === 'income' ? p.amount_minor : -p.amount_minor), 0);
  const current = bal.get(accountId) ?? 0;
  // the statement's own closing balance (latest dated row with a balance), to tie out
  const stmtClosing = useMemo(() => {
    const withBal = picks.filter((p) => p.date && p.balance_minor !== null);
    if (!withBal.length) return null;
    return withBal.reduce((a, b) => (b.date! > a.date! || (b.date === a.date && b.line > a.line) ? b : a)).balance_minor;
  }, [picks]);

  const doImport = async () => {
    if (!data || !chosen.length) return;
    setBusy(true);
    try {
      const r = await importRows(accountId, picks, data.categories);
      toast({ message: `Imported ${r.added} transaction${r.added === 1 ? '' : 's'}`, action: { label: 'Undo', onPress: () => void softDelete('transactions', r.ids) } });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed. Nothing was changed.');
    } finally {
      setBusy(false);
    }
  };

  const set = (k: keyof Mapping, v: number | DateFormat) => setMapping((m) => ({ ...m, [k]: v }));
  const back = step === 'map' || step === 'paste' ? 'source' : step === 'preview' ? (table ? 'map' : 'paste') : null;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      z={z}
      title={step === 'preview' ? 'Preview' : step === 'map' ? 'Match Columns' : 'Import Statement'}
      label="Import statement"
      left={back ? <NavButton onClick={() => { setError(null); setStep(back); }}>Back</NavButton> : <NavButton onClick={onClose}>Cancel</NavButton>}
      right={
        step === 'map' ? <NavButton bold disabled={!mappingReady(mapping)} onClick={fromMapping}>Next</NavButton>
        : step === 'paste' ? <NavButton bold disabled={!paste.trim()} onClick={fromPaste}>Next</NavButton>
        : step === 'preview' ? <NavButton bold disabled={!chosen.length || busy} onClick={doImport}>Import</NavButton>
        : undefined
      }
    >
      <input ref={fileRef} type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" className="hidden" data-testid="import-file" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
      {error && <p className="mx-8 mb-3 text-center text-footnote font-medium text-expense" role="alert">{error}</p>}

      {step === 'source' && (
        <>
          <p className="mx-8 mb-5 mt-1 text-center text-subhead text-label-2">
            Into <span className="font-semibold text-label">{account?.name ?? 'this account'}</span>. Export your statement from the eSewa app, then pick it here. It’s read on this iPhone only; Dreams never logs in to eSewa.
          </p>
          <Group>
            <Row icon={<span className="flex h-[30px] w-[30px] items-center justify-center text-accent"><FileText size={20} /></span>} title="Choose CSV File" accent onPress={() => fileRef.current?.click()} />
            <Row icon={<span className="flex h-[30px] w-[30px] items-center justify-center text-accent"><ClipboardPaste size={20} /></span>} title="Paste Text" accent onPress={() => setStep('paste')} />
          </Group>
          <p className="mx-8 mt-3 text-footnote text-label-2">Importing the same statement twice is safe: rows already in this account are skipped.</p>
        </>
      )}

      {step === 'paste' && (
        <Group footer={<>One transaction per line: date, description, amount. Start the amount with <b>+</b> (or end with Cr) for money in; anything else is money out.</>}>
          <div className="sep bg-surface px-4 py-3">
            <textarea
              autoFocus
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              rows={9}
              aria-label="Pasted transactions"
              placeholder={'2026-11-12 Himalayan Java 350\n12/11/2026, Load from bank, +5,000'}
              className="w-full resize-none bg-transparent font-mono text-[15px] leading-[21px] outline-none placeholder:text-label-3"
            />
          </div>
        </Group>
      )}

      {step === 'map' && table && (
        <>
          <p className="mx-8 mb-4 text-center text-footnote text-label-2">
            {fileName} · {table.rows.length} row{table.rows.length === 1 ? '' : 's'}{table.hasHeader ? '' : ' · no header row'}. Tell Dreams which column is which; it remembers this layout next time.
          </p>
          <Group>
            {FIELDS.map((f) => (
              <Row key={f.key} title={f.label} subtitle={f.hint}>
                <Select value={String(mapping[f.key])} onChange={(v) => set(f.key, Number(v))} label={f.label}>
                  <option value="-1">None</option>
                  {table.header.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </Select>
              </Row>
            ))}
            <Row title="Date format">
              <Select value={mapping.dateFormat} onChange={(v) => set('dateFormat', v as DateFormat)} label="Date format">
                {FORMATS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </Select>
            </Row>
          </Group>
          <Group header="First rows" className="mt-6">
            <div className="no-scrollbar overflow-x-auto">
              <table className="min-w-full text-left text-footnote">
                <thead>
                  <tr>{table.header.map((h, i) => <th key={i} className="whitespace-nowrap px-3 py-2 font-semibold text-label-2">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {table.rows.slice(0, 4).map((r, i) => (
                    <tr key={i} className="border-t-[0.5px] border-separator">{r.map((c, j) => <td key={j} className="whitespace-nowrap px-3 py-2 tnum">{c}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Group>
        </>
      )}

      {step === 'preview' && (
        <>
          <div className="mx-4 mb-4 grid grid-cols-3 gap-2 text-center">
            <Stat n={chosen.length} label="to import" />
            <Stat n={picks.filter((p) => p.duplicate).length} label="already in" />
            <Stat n={picks.filter((p) => p.error).length} label="can’t read" />
          </div>
          <Group footer={stmtClosing !== null ? (current + net === stmtClosing ? 'This matches the statement’s closing balance.' : 'The statement’s balance differs; after importing, use Update Balance to match the eSewa app.') : undefined}>
            <Row title="Balance now" value={<Money value={current} />} />
            <Row title="After import" value={<Money value={current + net} className="text-label" />} />
            {stmtClosing !== null && <Row title="Statement says" value={<Money value={stmtClosing} />} />}
          </Group>
          <Group header="Transactions" className="mt-6">
            {picks.map((p, i) => {
              const cats = p.type === 'income' ? incomeCats : expenseCats;
              const off = !!p.error || p.duplicate;
              return (
                <div key={i} className={`row sep flex items-start gap-3 bg-surface py-2.5 pl-4 pr-4 ${off ? 'opacity-55' : ''}`} data-testid="import-row">
                  <input
                    type="checkbox"
                    checked={p.include && !off}
                    disabled={off}
                    onChange={(e) => setPicks((ps) => ps.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))}
                    aria-label={`Import ${p.description || 'row'}`}
                    className="mt-1 h-5 w-5 shrink-0 accent-[var(--accent)]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate text-body">{p.description || (p.type === 'income' ? 'Money in' : 'Money out')}</span>
                      <Money value={p.type === 'income' ? p.amount_minor : -p.amount_minor} signed tone="auto" className="shrink-0 text-body" />
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-footnote text-label-2">{p.error ?? (p.duplicate ? 'Already imported' : `${shortDate(p.date!)}${p.ref ? ` · ${p.ref}` : ''}`)}</span>
                      <span className="flex-1" />
                      {!off && (
                        <Select value={p.categoryId ?? ''} onChange={(v) => setPicks((ps) => {
                            // the same description elsewhere in this import follows along
                            const k = ruleKey(p.description);
                            return ps.map((x, j) => (j === i || (k && x.type === p.type && ruleKey(x.description) === k) ? { ...x, categoryId: v || null } : x));
                          })} label={`Category for ${p.description || 'row'}`}>
                          {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </Select>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </Group>
          <div className="mx-4 mt-6">
            <Button block disabled={!chosen.length || busy} onClick={doImport}>Import {chosen.length} Transaction{chosen.length === 1 ? '' : 's'}</Button>
          </div>
        </>
      )}
    </Sheet>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="card px-2 py-2.5">
      <div className="text-title3 font-semibold tnum">{n}</div>
      <div className="text-caption text-label-2">{label}</div>
    </div>
  );
}
