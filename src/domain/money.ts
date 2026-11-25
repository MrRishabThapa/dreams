import type { Minor } from './types';

const groupFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

export const MINUS = '−';

export interface FormatOpts {
  symbol?: string;
  /** always show sign (+/−) */
  signed?: boolean;
  /** show paisa even if zero */
  forceDecimals?: boolean;
  /** omit the symbol */
  bare?: boolean;
}

/** Formats integer paisa as e.g. `Rs 1,20,000` or `−Rs 50.25` (lakh/crore grouping). */
export function formatMoney(minor: Minor, opts: FormatOpts = {}): string {
  const { symbol = 'Rs', signed = false, forceDecimals = false, bare = false } = opts;
  const neg = minor < 0;
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100);
  const paisa = abs % 100;
  let s = groupFmt.format(whole);
  if (paisa !== 0 || forceDecimals) s += '.' + (paisa < 10 ? '0' : '') + paisa;
  const withSym = bare ? s : `${symbol} ${s}`;
  if (neg) return MINUS + withSym;
  if (signed && minor > 0) return '+' + withSym;
  return withSym;
}

/** Compact form for chips/axes: Rs 1.2L, Rs 3.4Cr, Rs 12K. */
export function formatCompact(minor: Minor, symbol = 'Rs'): string {
  const neg = minor < 0;
  const r = Math.abs(minor) / 100;
  let s: string;
  if (r >= 1e7) s = trim(r / 1e7) + 'Cr';
  else if (r >= 1e5) s = trim(r / 1e5) + 'L';
  else if (r >= 1e3) s = trim(r / 1e3) + 'K';
  else s = String(Math.round(r));
  return (neg ? MINUS : '') + symbol + ' ' + s;
}

function trim(n: number): string {
  return (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, '');
}

/** Parses a typed decimal string ("1,250.5") into paisa. Returns null if invalid. */
export function parseMoney(input: string): Minor | null {
  const s = input.replace(/[,\s]/g, '').replace(MINUS, '-');
  if (!/^-?\d*(\.\d{0,2})?$/.test(s) || s === '' || s === '-' || s === '.') return null;
  const neg = s.startsWith('-');
  const [w, f = ''] = s.replace('-', '').split('.');
  const v = Number(w || '0') * 100 + Number((f + '00').slice(0, 2));
  return neg ? -v : v;
}

/** Rounds a rational (num/den, bigints) half away from zero into a Number. */
function roundDiv(num: bigint, den: bigint): number {
  const neg = num < 0n !== den < 0n;
  const n = num < 0n ? -num : num;
  const d = den < 0n ? -den : den;
  const q = (n * 2n + d) / (d * 2n);
  return Number(neg ? -q : q);
}

export type Op = '+' | '-' | '×' | '÷';

/**
 * Evaluates a keypad expression like "250+120×2" in paisa with normal precedence.
 * Operands may have up to 2 decimals. Returns null on invalid or divide-by-zero.
 * A trailing operator is ignored ("250+" = 250).
 */
export function evalExpression(expr: string): Minor | null {
  const src = expr.replace(/[,\s]/g, '').replace(/\*/g, '×').replace(/\//g, '÷').replace(MINUS, '-');
  if (src === '') return 0;
  const tokens: (number | Op)[] = [];
  const re = /(\d+(?:\.\d{0,2})?|\.\d{1,2})|([+\-×÷])/gy;
  let m: RegExpExecArray | null;
  let pos = 0;
  while (pos < src.length) {
    re.lastIndex = pos;
    m = re.exec(src);
    if (!m) return null;
    pos = re.lastIndex;
    if (m[1] !== undefined) {
      const v = parseMoney(m[1]);
      if (v === null) return null;
      tokens.push(v);
    } else tokens.push(m[2] as Op);
  }
  while (tokens.length && typeof tokens[tokens.length - 1] !== 'number') tokens.pop();
  if (!tokens.length) return 0;
  // unary leading minus
  if (tokens[0] === '-' && typeof tokens[1] === 'number') {
    tokens.splice(0, 2, -(tokens[1] as number));
  }
  if (typeof tokens[0] !== 'number') return null;
  // first pass: × ÷ (operands are paisa; scale back by 100)
  const sum: (number | Op)[] = [tokens[0]];
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i];
    const b = tokens[i + 1];
    if (typeof op !== 'string' || typeof b !== 'number') return null;
    if (op === '×' || op === '÷') {
      const a = sum.pop() as number;
      if (op === '×') sum.push(roundDiv(BigInt(a) * BigInt(b), 100n));
      else {
        if (b === 0) return null;
        sum.push(roundDiv(BigInt(a) * 100n, BigInt(b)));
      }
    } else sum.push(op, b);
  }
  let total = sum[0] as number;
  for (let i = 1; i < sum.length; i += 2) {
    total = sum[i] === '+' ? total + (sum[i + 1] as number) : total - (sum[i + 1] as number);
  }
  return Number.isSafeInteger(total) ? total : null;
}

/** Integer percentage helper; returns null when denominator is 0. */
export function ratio(num: Minor, den: Minor): number | null {
  return den === 0 ? null : num / den;
}
