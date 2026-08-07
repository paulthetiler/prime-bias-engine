import { describe, expect, it } from 'vitest';
import {
  calculatePairSeparations,
  calculateStrength,
  currencyReturnsVsUsd,
  STRENGTH_SYMBOLS,
} from './currencyStrength';

describe('currency strength basket', () => {
  it('uses seven USD crosses so one live request fits the free API minute limit', () => {
    expect(STRENGTH_SYMBOLS).toHaveLength(7);
    expect(new Set(STRENGTH_SYMBOLS).size).toBe(7);
  });

  it('handles USD/base pairs with the correct inverted sign', () => {
    const returns = currencyReturnsVsUsd({
      'GBP/USD': { from: 1.25, to: 1.275 },
      'USD/JPY': { from: 150, to: 147 },
    });
    expect(returns.GBP).toBeGreaterThan(0);
    expect(returns.JPY).toBeGreaterThan(0);
  });

  it('centres the eight-currency relative basket around zero', () => {
    const prices = {
      'EUR/USD': { from: 1.10, to: 1.111 },
      'GBP/USD': { from: 1.25, to: 1.275 },
      'AUD/USD': { from: 0.66, to: 0.6633 },
      'NZD/USD': { from: 0.60, to: 0.594 },
      'USD/JPY': { from: 150, to: 147 },
      'USD/CHF': { from: 0.90, to: 0.9045 },
      'USD/CAD': { from: 1.35, to: 1.377 },
    };
    const rows = calculateStrength(prices);
    expect(rows).toHaveLength(8);
    const total = rows.reduce((sum, row) => sum + row.strength, 0);
    expect(total).toBeCloseTo(0, 10);
  });

  it('reconstructs cross separation without assigning trade direction', () => {
    const rows = calculateStrength({
      'EUR/USD': { from: 1.10, to: 1.10 },
      'GBP/USD': { from: 1.25, to: 1.275 },
      'AUD/USD': { from: 0.66, to: 0.66 },
      'NZD/USD': { from: 0.60, to: 0.60 },
      'USD/JPY': { from: 150, to: 147 },
      'USD/CHF': { from: 0.90, to: 0.90 },
      'USD/CAD': { from: 1.35, to: 1.35 },
    });
    const separations = calculatePairSeparations(rows);
    const gbpJpy = separations.find((row) => row.pair === 'GBP/JPY');
    expect(gbpJpy?.separation).toBeGreaterThan(0);
    expect(gbpJpy).not.toHaveProperty('direction');
    expect(gbpJpy).not.toHaveProperty('action');
  });
});
