import { describe, expect, it } from 'vitest';
import {
  applyMapping, dedupeKey, detectDelimiter, EMPTY_MAPPING, headerSignature, markDuplicates, noteFor, parseAmount,
  parseDate, parseDelimited, parsePasted, readTable, splitNote, suggestCategory, ruleKey, type Mapping,
} from './importer';
import { tx } from './fixtures';

describe('parseAmount (paisa)', () => {
  it.each([
    ['1,250.50', 125050],
    ['Rs 1,00,000', 10000000],
    ['NPR 350', 35000],
    ['Rs. 99.9', 9990],
    ['(150.00)', -15000],
    ['-150', -15000],
    ['−150', -15000],
    ['+75', 7500],
    ['150 Dr', -15000],
    ['150 CR', 15000],
    ['.5', 50],
    ['0', 0],
  ])('%s → %i', (s, v) => expect(parseAmount(s)).toBe(v));

  it('rounds half away from zero at the third decimal', () => {
    expect(parseAmount('10.005')).toBe(1001);
    expect(parseAmount('10.004')).toBe(1000);
    expect(parseAmount('-10.005')).toBe(-1001);
    expect(parseAmount('0.999')).toBe(100);
  });

  it.each(['', 'abc', '2026-11-12', '12/11/2026', '1.2.3', 'Rs'])('rejects %j', (s) => expect(parseAmount(s)).toBeNull());

  it('always returns an integer', () => {
    for (const s of ['0.1', '0.2', '1234.56', '99999.995', '0.07']) expect(Number.isInteger(parseAmount(s))).toBe(true);
    expect(parseAmount('0.1')! + parseAmount('0.2')!).toBe(30);
  });
});

describe('parseDate', () => {
  it('reads common statement formats', () => {
    expect(parseDate('2026-11-05', 'auto')).toBe('2026-11-05');
    expect(parseDate('2026/11/05 14:32:10', 'auto')).toBe('2026-11-05');
    expect(parseDate('05/11/2026', 'auto')).toBe('2026-11-05');
    expect(parseDate('5-11-26', 'auto')).toBe('2026-11-05');
    expect(parseDate('05 Nov 2026', 'auto')).toBe('2026-11-05');
    expect(parseDate('5-Nov-2026 2:30 PM', 'auto')).toBe('2026-11-05');
    expect(parseDate('Nov 5, 2026', 'auto')).toBe('2026-11-05');
    expect(parseDate('2026-11-05T09:00:00+05:45', 'auto')).toBe('2026-11-05');
  });
  it('honours an explicit order', () => {
    expect(parseDate('11/05/2026', 'mdy')).toBe('2026-11-05');
    expect(parseDate('11/05/2026', 'dmy')).toBe('2026-05-11');
    expect(parseDate('2026-11-05', 'dmy')).toBeNull();
  });
  it('rejects impossible and Bikram Sambat dates', () => {
    expect(parseDate('31/02/2026', 'auto')).toBeNull();
    expect(parseDate('2083-07-20', 'auto')).toBeNull();
    expect(parseDate('hello', 'auto')).toBeNull();
  });
});

describe('CSV reading', () => {
  it('handles quotes, escaped quotes, CRLF and a BOM', () => {
    const rows = parseDelimited('﻿a,"b, c","say ""hi"""\r\n1,2,3\r\n', ',');
    expect(rows).toEqual([['a', 'b, c', 'say "hi"'], ['1', '2', '3']]);
  });
  it('detects the delimiter', () => {
    expect(detectDelimiter('Date;Desc;Amount\n2026-11-01;Tea;50\n2026-11-02;Bus;30')).toBe(';');
    expect(detectDelimiter('Date\tDesc\tAmount\n2026-11-01\tTea\t50')).toBe('\t');
    expect(detectDelimiter('Date,Desc,Amount\n2026-11-01,"Tea, milk",50')).toBe(',');
  });
  it('skips title lines above the table and detects the header', () => {
    const t = readTable('eSewa Statement\nFrom 2026-11-01 to 2026-11-30\nDate,Description,Dr,Cr,Balance\n2026-11-01,Tea,50,,950\n');
    expect(t.hasHeader).toBe(true);
    expect(t.header).toEqual(['Date', 'Description', 'Dr', 'Cr', 'Balance']);
    expect(t.rows).toEqual([['2026-11-01', 'Tea', '50', '', '950']]);
  });
  it('names columns when there is no header, and the signature tells layouts apart', () => {
    const t = readTable('2026-11-01,Tea,50\n2026-11-02,Bus,30\n');
    expect(t.hasHeader).toBe(false);
    expect(t.header).toEqual(['Column 1', 'Column 2', 'Column 3']);
    expect(headerSignature(t)).toBe('cols:3|,');
    expect(headerSignature(readTable('Date,Amount\n2026-11-01,5'))).toBe('date|amount|,');
  });
});

const map = (p: Partial<Mapping>): Mapping => ({ ...EMPTY_MAPPING, ...p });

describe('applyMapping', () => {
  const rows = [
    ['05/11/2026', 'QR Payment Himalayan Java', '350.00', '', '1,650.00', 'TXN1'],
    ['06/11/2026', 'Load from bank', '', '5,000', '6,650.00', 'TXN2'],
    ['bad', 'Broken', '10', '', '', ''],
    ['07/11/2026', 'Nothing', '', '', '', ''],
  ];
  it('maps debit → expense and credit → income, in positive paisa', () => {
    const out = applyMapping(rows, map({ date: 0, description: 1, debit: 2, credit: 3, balance: 4, ref: 5 }));
    expect(out[0]).toMatchObject({ date: '2026-11-05', type: 'expense', amount_minor: 35000, ref: 'TXN1', balance_minor: 165000, error: null });
    expect(out[1]).toMatchObject({ date: '2026-11-06', type: 'income', amount_minor: 500000, error: null });
    expect(out[2].error).toBe('Date not understood');
    expect(out[3].error).toBe('No amount');
  });
  it('treats a debit written with a minus sign as money out too', () => {
    const out = applyMapping([['2026-11-05', 'Fee', '-5', '']], map({ date: 0, description: 1, debit: 2, credit: 3 }));
    expect(out[0]).toMatchObject({ type: 'expense', amount_minor: 500 });
  });
  it('uses the sign of a single amount column', () => {
    const out = applyMapping([['2026-11-05', 'Tea', '-50.5'], ['2026-11-06', 'Refund', '20']], map({ date: 0, description: 1, amount: 2 }));
    expect(out.map((r) => [r.type, r.amount_minor])).toEqual([['expense', 5050], ['income', 2000]]);
  });
});

describe('paste mode', () => {
  it('reads one transaction per line; + or Cr is money in, anything else out', () => {
    const out = parsePasted('2026-11-12 Coffee at Himalayan Java 350\n12/11/2026, Salary, +50,000\n13 Nov 2026 Refund 200 Cr\n\nno date here 50\n2026-11-14 Bus fare Rs 30.50');
    expect(out.map((r) => [r.date, r.description, r.type, r.amount_minor, r.error])).toEqual([
      ['2026-11-12', 'Coffee at Himalayan Java', 'expense', 35000, null],
      ['2026-11-12', 'Salary', 'income', 5000000, null],
      ['2026-11-13', 'Refund', 'income', 20000, null],
      [null, 'no date here', 'expense', 5000, 'Start the line with a date'],
      ['2026-11-14', 'Bus fare', 'expense', 3050, null],
    ]);
  });
});

describe('dedupe', () => {
  const acc = 'wallet-1';
  const parsed = applyMapping(
    [
      ['2026-11-05', 'Tea', '50', '', 'R1'],
      ['2026-11-05', 'Tea', '50', '', 'R2'],
      ['2026-11-06', 'Bus', '30', '', ''],
      ['2026-11-06', 'Bus', '30', '', ''],
    ],
    map({ date: 0, description: 1, debit: 2, credit: 3, ref: 4 }),
  );

  it('a fresh import has no duplicates, even of identical rows', () => {
    expect(markDuplicates(acc, parsed, []).filter((c) => c.duplicate)).toHaveLength(0);
  });

  it('re-importing the same file is a no-op', () => {
    const imported = parsed.map((r) => tx({ type: r.type, amount_minor: r.amount_minor, account_id: acc, occurred_on: r.date!, note: noteFor(r.description, r.ref) }));
    expect(markDuplicates(acc, parsed, imported).every((c) => c.duplicate)).toBe(true);
  });

  it('counts per key: one Bus already there means only the second is new', () => {
    const one = [tx({ type: 'expense', amount_minor: 3000, account_id: acc, occurred_on: '2026-11-06', note: 'Bus' })];
    expect(markDuplicates(acc, parsed, one).map((c) => c.duplicate)).toEqual([false, false, true, false]);
  });

  it('ignores other accounts, deleted rows, and a different sign', () => {
    const others = [
      tx({ type: 'expense', amount_minor: 3000, account_id: 'bank', occurred_on: '2026-11-06', note: 'Bus' }),
      tx({ type: 'expense', amount_minor: 3000, account_id: acc, occurred_on: '2026-11-06', note: 'Bus', deleted_at: '2026-11-07T00:00:00Z' }),
      tx({ type: 'income', amount_minor: 3000, account_id: acc, occurred_on: '2026-11-06', note: 'Bus' }),
    ];
    expect(markDuplicates(acc, parsed, others).some((c) => c.duplicate)).toBe(false);
  });

  it('a ref wins over the description; descriptions compare case- and space-insensitively', () => {
    expect(dedupeKey(acc, '2026-11-05', -5000, 'R1', 'Tea')).toBe(dedupeKey(acc, '2026-11-05', -5000, 'r1', 'Something else'));
    expect(dedupeKey(acc, '2026-11-05', -5000, '', 'Tea  Shop')).toBe(dedupeKey(acc, '2026-11-05', -5000, '', 'tea shop'));
    expect(dedupeKey(acc, '2026-11-05', -5000, '', 'Tea')).not.toBe(dedupeKey(acc, '2026-11-05', -5000, '', 'Coffee'));
  });

  it('notes carry the ref and split back', () => {
    expect(noteFor('QR Pay', 'ABC')).toBe('QR Pay · Ref ABC');
    expect(splitNote('QR Pay · Ref ABC')).toEqual({ description: 'QR Pay', ref: 'ABC' });
    expect(splitNote('Ref ABC')).toEqual({ description: '', ref: 'ABC' });
    expect(splitNote('Coffee with Ref friends')).toEqual({ description: 'Coffee with Ref friends', ref: '' });
  });
});

describe('category rules', () => {
  it('suggests by exact description, then by the longest phrase it contains', () => {
    const rules = { 'himalayan java': 'food', ntc: 'bills', 'ntc topup': 'phone' };
    expect(suggestCategory('Himalayan Java', rules)).toBe('food');
    expect(suggestCategory('QR payment HIMALAYAN JAVA 0042', rules)).toBe('food');
    expect(suggestCategory('NTC Topup 9841000000', rules)).toBe('phone');
    expect(suggestCategory('Nabil transfer', rules)).toBeNull();
    expect(ruleKey('Bus #12 · Ref X9')).toBe('bus');
  });
});
