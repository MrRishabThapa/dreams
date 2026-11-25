import { describe, expect, it } from 'vitest';
import { dreamProgress, dreamSaved, avgMonthlyContribution, dreamsFundedIn } from './dreams';
import type { Dream, DreamEntry } from './types';

const stamp = '2026-01-01T00:00:00Z';
const dream = (p: Partial<Dream> = {}): Dream => ({
  id: 'd1', title: 'Japan', icon: 'plane', color: 'sky', target_minor: 12_000_000, target_on: null, completed_at: null,
  created_at: stamp, updated_at: stamp, deleted_at: null, ...p,
});
let n = 0;
const entry = (amount: number, on: string, p: Partial<DreamEntry> = {}): DreamEntry => ({
  id: `e${++n}`, dream_id: 'd1', amount_minor: amount, entered_on: on, note: '', transaction_id: null,
  created_at: stamp, updated_at: stamp, deleted_at: null, ...p,
});

describe('dreams', () => {
  it('saved sums live entries and never goes below 0', () => {
    expect(dreamSaved(dream(), [entry(500, '2026-11-01'), entry(-200, '2026-11-02'), entry(9999, '2026-11-02', { deleted_at: 'x' })])).toBe(300);
    expect(dreamSaved(dream(), [entry(-200, '2026-11-02')])).toBe(0);
  });

  it('average contribution uses the last 3 months including this one', () => {
    const es = [entry(3_000_000, '2026-09-10'), entry(1_500_000, '2026-10-10'), entry(1_500_000, '2026-11-10'), entry(9_000_000, '2026-08-31')];
    expect(avgMonthlyContribution(dream(), es, '2026-11-25')).toBe(2_000_000);
  });

  it('ETA: Rs 40,000 of Rs 1,20,000 at Rs 20,000/month → 4 months', () => {
    const es = [entry(2_000_000, '2026-09-10'), entry(2_000_000, '2026-10-10'), entry(2_000_000, '2026-11-10'), entry(-2_000_000, '2026-11-11')];
    const p = dreamProgress(dream(), es, '2026-11-25');
    expect(p.saved).toBe(4_000_000);
    expect(p.remaining).toBe(8_000_000);
    expect(p.progress).toBeCloseTo(1 / 3);
    expect(p.avgMonthly).toBeCloseTo(4_000_000 / 3);
    expect(p.etaMonths).toBe(6);
    expect(p.etaMonth).toBe('2027-05');
  });

  it('ETA hidden when pace ≤ 0; needed monthly and behind with a target date', () => {
    const p = dreamProgress(dream({ target_on: '2027-02-15' }), [entry(4_000_000, '2026-01-01')], '2026-11-25');
    expect(p.etaMonths).toBeNull();
    expect(p.neededMonthly).toBe(2_000_000); // 80,000 over Nov, Dec, Jan, Feb
    expect(p.behind).toBe(true);
  });

  it('done when saved reaches target', () => {
    const p = dreamProgress(dream({ target_minor: 1000 }), [entry(1200, '2026-11-01')], '2026-11-25');
    expect(p.done).toBe(true);
    expect(p.progress).toBe(1);
    expect(p.etaMonths).toBeNull();
  });

  it('funded in a month', () => {
    expect(dreamsFundedIn([entry(500, '2026-11-01'), entry(-100, '2026-11-20'), entry(700, '2026-10-01')], '2026-11')).toBe(400);
  });
});
