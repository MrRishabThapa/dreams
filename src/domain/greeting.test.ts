import { describe, expect, it } from 'vitest';
import { displayName, greetingFor } from './greeting';

describe('greeting', () => {
  it('follows the local hour, with the boundaries on the hour', () => {
    const at = (h: number) => greetingFor(h);
    expect([0, 4].map(at)).toEqual(['Good night', 'Good night']);
    expect([5, 11].map(at)).toEqual(['Good morning', 'Good morning']);
    expect([12, 16].map(at)).toEqual(['Good afternoon', 'Good afternoon']);
    expect([17, 20].map(at)).toEqual(['Good evening', 'Good evening']);
    expect([21, 23].map(at)).toEqual(['Good night', 'Good night']);
  });

  it('every hour of the day has a greeting', () => {
    for (let h = 0; h < 24; h++) expect(greetingFor(h)).toMatch(/^Good (morning|afternoon|evening|night)$/);
  });

  it('a name is trimmed and collapsed; blank means no name', () => {
    expect(displayName('  Rishab  ')).toBe('Rishab');
    expect(displayName('Rishab   Thapa')).toBe('Rishab Thapa');
    expect(displayName('   ')).toBeNull();
    expect(displayName(null)).toBeNull();
    expect(displayName(undefined)).toBeNull();
  });
});
