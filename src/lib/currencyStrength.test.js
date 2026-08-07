import { describe, expect, it } from 'vitest';
import {
  calculatePairSeparations,
  calculateStrength,
  STRENGTH_SYMBOLS,
} from './currencyStrength';

describe('currency strength basket', () => {
  it('contains all 28 unique crosses for the eight major currencies', () => {
    expect(STRENGTH_SYMBOLS).toHaveLength(28);
    expect(new Set(STRENGTH_SYMBOLS).size).toBe(28);
  });

  it('gives base and quote opposite strength contributions', () => {
    const rows = calculateStrength({
      'GBP/JPY': { from: 200, to: 202 },
    });
    const gbp = rows.find((row) => row.currency === 'GBP');
    const jpy = rows.find((row) => row.currency === 'JPY');

    expect(gbp.strength).toBeGreaterThan(0);
    expect(jpy.strength).toBeLessThan(0);
  });

  it('averages each currency across all available direct crosses and centres the basket', () => {
    const prices = {
      'GBP/JPY': { from: 200, to: 204 },
      'GBP/CAD': { from: 1.70, to: 1.734 },
      'JPY/CAD': { from: 0.0085, to: 0.0085 },
      'EUR/USD': { from: 1.10, to: 1.10 },
    };

    const rows = calculateStrength(prices);
    expect(rows[0].currency).toBe('GBP');
    const total = rows.reduce((sum, row) => sum + row.strength, 0);
    expect(total).toBeCloseTo(0, 10);
  });

  it('ranks separation without assigning trade direction', () => {
    const rows = calculateStrength({
      'GBP/JPY': { from: 200, to: 204 },
      'GBP/CAD': { from: 1.70, to: 1.734 },
      'JPY/CAD': { from: 0.0085, to: 0.0085 },
    });
    const separations = calculatePairSeparations(rows);
    expect(separations[0].separation).toBeGreaterThan(0);
    expect(separations[0]).not.toHaveProperty('direction');
    expect(separations[0]).not.toHaveProperty('action');
  });
});
