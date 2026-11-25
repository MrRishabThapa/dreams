import { describe, expect, it } from 'vitest';
import { evalExpression, formatCompact, formatMoney, parseMoney } from './money';

describe('formatMoney', () => {
  it('uses lakh/crore grouping', () => {
    expect(formatMoney(12000000)).toBe('Rs 1,20,000');
    expect(formatMoney(1234567890)).toBe('Rs 1,23,45,678.90');
    expect(formatMoney(0)).toBe('Rs 0');
  });
  it('uses a true minus and optional plus', () => {
    expect(formatMoney(-5025)).toBe('−Rs 50.25');
    expect(formatMoney(100, { signed: true })).toBe('+Rs 1');
    expect(formatMoney(5, { symbol: 'NPR' })).toBe('NPR 0.05');
  });
  it('compacts', () => {
    expect(formatCompact(12000000)).toBe('Rs 1.2L');
    expect(formatCompact(1200000000)).toBe('Rs 1.2Cr');
    expect(formatCompact(1250000)).toBe('Rs 12.5K');
  });
});

describe('parseMoney', () => {
  it('parses to paisa without float error', () => {
    expect(parseMoney('0.1')).toBe(10);
    expect(parseMoney('0.29')).toBe(29);
    expect(parseMoney('1,00,000.5')).toBe(10000050);
    expect(parseMoney('19.99')).toBe(1999);
    expect(parseMoney('abc')).toBeNull();
    expect(parseMoney('1.234')).toBeNull();
  });
});

describe('evalExpression', () => {
  it('adds and subtracts in paisa', () => {
    expect(evalExpression('250+120')).toBe(37000);
    expect(evalExpression('0.1+0.2')).toBe(30);
    expect(evalExpression('100-0.01')).toBe(9999);
  });
  it('respects precedence', () => {
    expect(evalExpression('250+120×2')).toBe(49000);
    expect(evalExpression('100÷3')).toBe(3333);
    expect(evalExpression('200÷3')).toBe(6667);
    expect(evalExpression('1.5×1.5')).toBe(225);
  });
  it('handles edge cases', () => {
    expect(evalExpression('')).toBe(0);
    expect(evalExpression('250+')).toBe(25000);
    expect(evalExpression('5÷0')).toBeNull();
    expect(evalExpression('-5+10')).toBe(500);
  });
});
