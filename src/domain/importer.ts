import type { ISODate, Minor, Transaction } from './types';

/**
 * Statement import, parsed entirely on the device. The eSewa export format isn't known
 * yet, so this is generic: detect the delimiter and header, let the user map columns
 * (remembered per header), preview, then import. Re-importing the same file is safe.
 */

/* ---------- CSV ---------- */

export type Delimiter = ',' | ';' | '\t' | '|';
const DELIMS: Delimiter[] = [',', ';', '\t', '|'];

/** Splits text into rows of cells. Handles quotes, "" escapes, CRLF and newlines inside quotes. */
export function parseDelimited(text: string, delim: Delimiter): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"' && cell.trim() === '') {
      quoted = true;
      cell = '';
    } else if (c === delim) {
      row.push(cell.trim());
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c !== ''));
}

/** The delimiter that splits the first lines into the most consistent number of columns. */
export function detectDelimiter(text: string): Delimiter {
  const sample = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 20).join('\n');
  let best: Delimiter = ',';
  let bestScore = -1;
  for (const d of DELIMS) {
    const rows = parseDelimited(sample, d);
    if (!rows.length) continue;
    const counts = rows.map((r) => r.length);
    const mode = counts.sort((a, b) => counts.filter((x) => x === b).length - counts.filter((x) => x === a).length)[0];
    if (mode < 2) continue;
    const score = rows.filter((r) => r.length === mode).length * 10 + mode;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

/** True when the first row looks like a header: no cell parses as a date or an amount. */
export function looksLikeHeader(row: string[]): boolean {
  if (!row.length) return false;
  return row.every((c) => c === '' || (parseAmount(c) === null && parseDate(c, 'auto') === null));
}

export interface Table {
  delimiter: Delimiter;
  header: string[];
  rows: string[][];
  hasHeader: boolean;
}

/** Some statements put a title and account details above the table: skip to the first wide row. */
export function readTable(text: string, delimiter: Delimiter = detectDelimiter(text)): Table {
  const all = parseDelimited(text, delimiter);
  const width = Math.max(0, ...all.map((r) => r.length));
  const start = Math.max(0, all.findIndex((r) => r.length >= Math.min(width, 3)));
  const body = all.slice(start);
  const hasHeader = looksLikeHeader(body[0] ?? []);
  const cols = Math.max(0, ...body.map((r) => r.length));
  const header = hasHeader ? pad(body[0], cols).map((h, i) => h || `Column ${i + 1}`) : Array.from({ length: cols }, (_, i) => `Column ${i + 1}`);
  return { delimiter, header, rows: (hasHeader ? body.slice(1) : body).map((r) => pad(r, cols)), hasHeader };
}

const pad = (r: string[], n: number) => (r.length >= n ? r : [...r, ...Array(n - r.length).fill('')]);

/** Identifies a statement layout, so the mapping can be remembered for the next import. */
export function headerSignature(t: Table): string {
  return (t.hasHeader ? t.header.map((h) => h.toLowerCase().replace(/\s+/g, ' ')).join('|') : `cols:${t.header.length}`) + `|${t.delimiter}`;
}

/* ---------- values ---------- */

/**
 * Parses money text into paisa, rounding half away from zero at the third decimal.
 * Accepts "Rs 1,250.50", "NPR 1,00,000", "(150.00)", "-150", "150 Dr" and "150 CR". A decimal
 * comma ("1.250,5") is not supported: Nepal uses dots. Returns null for empty or non-numeric text.
 */
export function parseAmount(input: string): Minor | null {
  let s = input.trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  const dc = /\s*\b(dr|cr)\.?$/i.exec(s);
  if (dc) {
    if (dc[1].toLowerCase() === 'dr') neg = !neg;
    s = s.slice(0, dc.index);
  }
  s = s.replace(/^(rs\.?|npr|रु\.?)\s*/i, '').replace(/\s*(rs\.?|npr)$/i, '');
  s = s.replace(/[,\s ]/g, '').replace(/[−–]/g, '-');
  if (s.startsWith('+')) s = s.slice(1);
  else if (s.startsWith('-')) {
    neg = !neg;
    s = s.slice(1);
  }
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(s)) return null;
  const [w, f = ''] = s.split('.');
  let v = Number(w || '0') * 100 + Number((f + '00').slice(0, 2));
  if (Number(f[2] ?? '0') >= 5) v += 1;
  if (!Number.isSafeInteger(v)) return null;
  return neg && v !== 0 ? -v : v;
}

export type DateFormat = 'auto' | 'ymd' | 'dmy' | 'mdy';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function iso(y: number, m: number, d: number): ISODate | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Parses a statement date (any time part is ignored). "auto" reads Y-M-D, then D/M/Y
 * (the Nepal and India default), and month names; pick "mdy" for US-style files.
 * Bikram Sambat dates (year 2070–2090) are rejected rather than misread.
 */
export function parseDate(input: string, fmt: DateFormat): ISODate | null {
  const s = input.trim().replace(/[T ]\d{1,2}:\d{2}(:\d{2})?(\.\d+)?\s*(am|pm)?\s*(z|[+-]\d{2}:?\d{2})?$/i, '').trim();
  if (!s) return null;
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) {
    if (fmt === 'dmy' || fmt === 'mdy') return null;
    if (+m[1] >= 2070) return null; // BS year
    return iso(+m[1], +m[2], +m[3]);
  }
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s);
  if (m) {
    if (fmt === 'ymd') return null;
    if (m[3].length === 4 && +m[3] >= 2070) return null;
    return fmt === 'mdy' ? iso(+m[3], +m[1], +m[2]) : iso(+m[3], +m[2], +m[1]);
  }
  m = /^(\d{1,2})[\s-]([a-z]{3,9})[\s,-]+(\d{2}|\d{4})$/i.exec(s);
  if (m) {
    const mo = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    return mo < 0 ? null : iso(+m[3], mo + 1, +m[1]);
  }
  m = /^([a-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/i.exec(s);
  if (m) {
    const mo = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    return mo < 0 ? null : iso(+m[3], mo + 1, +m[2]);
  }
  return null;
}

/* ---------- mapping ---------- */

/** Column indexes; -1 = not mapped. Either debit/credit or a single signed amount column. */
export interface Mapping {
  date: number;
  description: number;
  debit: number;
  credit: number;
  /** a single signed column (negative = money out); used when debit and credit aren't mapped */
  amount: number;
  balance: number;
  ref: number;
  dateFormat: DateFormat;
}

export const EMPTY_MAPPING: Mapping = { date: -1, description: -1, debit: -1, credit: -1, amount: -1, balance: -1, ref: -1, dateFormat: 'auto' };

export function mappingReady(m: Mapping): boolean {
  return m.date >= 0 && (m.debit >= 0 || m.credit >= 0 || m.amount >= 0);
}

export interface ParsedRow {
  /** 0-based row in the source */
  line: number;
  date: ISODate | null;
  description: string;
  /** positive paisa */
  amount_minor: Minor;
  type: 'income' | 'expense';
  ref: string;
  balance_minor: Minor | null;
  /** why this row can't be imported, if it can't */
  error: string | null;
}

/** Applies a mapping. Debit → expense, credit → income; a signed amount uses its sign. */
export function applyMapping(rows: string[][], m: Mapping): ParsedRow[] {
  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');
  return rows.map((r, line) => {
    const date = parseDate(cell(r, m.date), m.dateFormat);
    let signed: Minor | null = null;
    if (m.debit >= 0 || m.credit >= 0) {
      const d = parseAmount(cell(r, m.debit));
      const c = parseAmount(cell(r, m.credit));
      // statements show both columns as positive numbers; a debit is money out
      if (d && !c) signed = -Math.abs(d);
      else if (c && !d) signed = Math.abs(c);
      else if (c && d) signed = Math.abs(c) - Math.abs(d);
    } else signed = parseAmount(cell(r, m.amount));
    const description = cell(r, m.description).replace(/\s+/g, ' ');
    let error: string | null = null;
    if (!date) error = cell(r, m.date) ? 'Date not understood' : 'No date';
    else if (signed === null) error = 'No amount';
    else if (signed === 0) error = 'Amount is 0';
    return {
      line,
      date,
      description,
      amount_minor: Math.abs(signed ?? 0),
      type: (signed ?? 0) > 0 ? 'income' : 'expense',
      ref: cell(r, m.ref),
      balance_minor: parseAmount(cell(r, m.balance)),
      error,
    };
  });
}

/* ---------- paste mode ---------- */

/**
 * One transaction per line: a date, a description and an amount, in that order, separated
 * by spaces, commas or tabs. "+" (or "Cr") means money in; no sign, "−" or "Dr" means out.
 *   2026-11-12 Coffee at Himalayan Java 350
 *   12/11/2026, Salary, +50,000
 */
export function parsePasted(text: string, fmt: DateFormat = 'auto'): ParsedRow[] {
  const out: ParsedRow[] = [];
  text.split(/\r?\n/).forEach((raw, line) => {
    const s = raw.trim();
    if (!s) return;
    const dm = /^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{1,2}[\s-][A-Za-z]{3,9}[\s,-]+\d{2,4})[\s,;\t|]+/.exec(s);
    const am = /[\s,;\t|]((?:[+\-−]\s?)?(?:rs\.?\s*|npr\s*)?[\d,]+(?:\.\d+)?(?:\s*(?:dr|cr)\.?)?)$/i.exec(s);
    const date = dm ? parseDate(dm[1], fmt) : null;
    const rest = s.slice(dm ? dm[0].length : 0, am ? am.index : undefined).replace(/^[\s,;\t|]+|[\s,;\t|]+$/g, '');
    let amount = am ? parseAmount(am[1].replace(/\s/g, ' ')) : null;
    const explicitIn = am && (/^\+/.test(am[1].trim()) || /cr\.?$/i.test(am[1].trim()));
    if (amount !== null && amount > 0 && !explicitIn) amount = -amount;
    let error: string | null = null;
    if (!date) error = 'Start the line with a date';
    else if (amount === null) error = 'End the line with an amount';
    else if (amount === 0) error = 'Amount is 0';
    out.push({
      line,
      date,
      description: rest.replace(/\s+/g, ' '),
      amount_minor: Math.abs(amount ?? 0),
      type: (amount ?? 0) > 0 ? 'income' : 'expense',
      ref: '',
      balance_minor: null,
      error,
    });
  });
  return out;
}

/* ---------- dedupe ---------- */

/** FNV-1a, 32-bit, as 8 hex chars. Only for telling descriptions apart, not for security. */
export function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export const normDesc = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Imported notes carry the reference as a suffix: "QR payment · Ref 123ABC". */
export function noteFor(description: string, ref: string): string {
  const d = description.trim();
  const r = ref.trim();
  return r ? (d ? `${d} · Ref ${r}` : `Ref ${r}`) : d;
}

export function splitNote(note: string): { description: string; ref: string } {
  const m = /^(?:(.*?)\s*·\s*)?Ref\s+(\S+)$/.exec(note.trim());
  return m ? { description: (m[1] ?? '').trim(), ref: m[2] } : { description: note.trim(), ref: '' };
}

/** (account, date, signed amount, ref or description hash). */
export function dedupeKey(accountId: string, date: ISODate, signedMinor: Minor, ref: string, description: string): string {
  return `${accountId}|${date}|${signedMinor}|${ref.trim() ? 'r:' + ref.trim().toLowerCase() : 'd:' + hash(normDesc(description))}`;
}

export function txKey(t: Transaction): string | null {
  if (t.type !== 'income' && t.type !== 'expense') return null;
  const { description, ref } = splitNote(t.note);
  return dedupeKey(t.account_id, t.occurred_on, t.type === 'income' ? t.amount_minor : -t.amount_minor, ref, description);
}

export interface Candidate extends ParsedRow {
  key: string;
  duplicate: boolean;
}

/**
 * Marks rows that are already in the account. Counts are kept per key, so two genuinely
 * identical coffees on the same day are both imported once, and never twice.
 */
export function markDuplicates(accountId: string, rows: ParsedRow[], existing: Transaction[]): Candidate[] {
  const have = new Map<string, number>();
  for (const t of existing) {
    if (t.deleted_at || t.account_id !== accountId) continue;
    const k = txKey(t);
    if (k) have.set(k, (have.get(k) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const key = r.date ? dedupeKey(accountId, r.date, r.type === 'income' ? r.amount_minor : -r.amount_minor, r.ref, r.description) : `bad:${r.line}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return { ...r, key, duplicate: !r.error && n <= (have.get(key) ?? 0) };
  });
}

/* ---------- category rules ---------- */

/** description → category id, learned from what the user picks. */
export type Rules = Record<string, string>;

export const ruleKey = (description: string) =>
  normDesc(splitNote(description).description).replace(/[0-9#:/\\._-]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Exact match first, then the longest remembered phrase the description contains. */
export function suggestCategory(description: string, rules: Rules): string | null {
  const k = ruleKey(description);
  if (!k) return null;
  if (rules[k]) return rules[k];
  let best: string | null = null;
  let len = 0;
  for (const [phrase, id] of Object.entries(rules)) {
    if (phrase.length >= 3 && phrase.length > len && k.includes(phrase)) {
      best = id;
      len = phrase.length;
    }
  }
  return best;
}
