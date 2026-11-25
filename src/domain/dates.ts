import type { ISODate, Month } from './types';

const pad = (n: number) => (n < 10 ? '0' + n : String(n));

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function today(): ISODate {
  return toISODate(new Date());
}

/** Parses `YYYY-MM-DD` as a local date at noon (avoids DST edge cases). */
export function parseISODate(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = parseISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function monthOf(s: ISODate): Month {
  return s.slice(0, 7);
}

export function monthStart(m: Month): ISODate {
  return `${m}-01`;
}

export function monthEnd(m: Month): ISODate {
  const [y, mo] = m.split('-').map(Number);
  const last = new Date(y, mo, 0).getDate();
  return `${m}-${pad(last)}`;
}

export function addMonths(m: Month, n: number): Month {
  const [y, mo] = m.split('-').map(Number);
  const idx = y * 12 + (mo - 1) + n;
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function monthLabel(m: Month, long = false): string {
  const [y, mo] = m.split('-').map(Number);
  return `${(long ? MONTHS_LONG : MONTHS)[mo - 1]} ${y}`;
}

export function monthName(m: Month): string {
  return MONTHS_LONG[Number(m.slice(5, 7)) - 1];
}

/** "Today", "Yesterday", "Monday", or "12 Nov" / "12 Nov 2025". */
export function dayLabel(s: ISODate, now: ISODate = today()): string {
  if (s === now) return 'Today';
  if (s === addDays(now, -1)) return 'Yesterday';
  const d = parseISODate(s);
  const diff = (parseISODate(now).getTime() - d.getTime()) / 86400000;
  if (diff > 0 && diff < 7) return DAYS[d.getDay()];
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return s.slice(0, 4) === now.slice(0, 4) ? base : `${base} ${d.getFullYear()}`;
}

export function shortDate(s: ISODate): string {
  const d = parseISODate(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
