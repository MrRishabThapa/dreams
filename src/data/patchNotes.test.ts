import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PATCH_NOTES } from './patchNotes';

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string };
const parts = (v: string) => v.split('.').map(Number);
const cmp = (a: string, b: string) => {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
};

describe('patch notes', () => {
  it('the newest entry is the version in package.json', () => {
    expect(PATCH_NOTES[0].version).toBe(pkg.version);
  });

  it('versions are valid, unique and sorted newest first, dates never go forward', () => {
    for (const n of PATCH_NOTES) {
      expect(n.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(n.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(new Set(PATCH_NOTES.map((n) => n.version)).size).toBe(PATCH_NOTES.length);
    for (let i = 1; i < PATCH_NOTES.length; i++) {
      expect(cmp(PATCH_NOTES[i - 1].version, PATCH_NOTES[i].version)).toBeGreaterThan(0);
      expect(PATCH_NOTES[i - 1].date >= PATCH_NOTES[i].date).toBe(true);
    }
  });

  it('every release says something, and every item has a keyword and text', () => {
    for (const n of PATCH_NOTES) {
      const items = [...(n.groups.new ?? []), ...(n.groups.improved ?? []), ...(n.groups.fixed ?? [])];
      expect(items.length).toBeGreaterThan(0);
      for (const g of Object.values(n.groups)) expect(g!.length).toBeGreaterThan(0);
      for (const it of items) {
        expect(it.keyword.trim()).not.toBe('');
        expect(it.text.trim()).not.toBe('');
      }
    }
  });
});
