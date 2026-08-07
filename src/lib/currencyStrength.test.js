import { describe, expect, it } from 'vitest';
import {
  calculatePairSeparations,
  calculateStrength,
  returnsVsUsd,
} from './currencyStrength';

describe('currency strength proof of concept', () => {
  const prices = {
    'EUR/USD': { from: 1.10, to: 1.111 },       // EUR +1%
    'GBP/USD': { from: 1.25, to: 1.275 },       // GBP +2%
    'AUD/USD': { from: 0.66, to: 0.6633 },      // AUD +0.5%
    'NZD/USD': { from: 0.60, to: 0.594 },       // NZD -1%
    'USD/JPY': { from: 150, to: 147 },           // JPY strengthens ~2.04%
    'USD/CHF': { from: 0.90, to: 0.9045 },       // CHF weakens ~0.5%
    'USD/CAD': { from: 1.35, to: 1.377 },        // CAD weakens ~1.96%
  };

  it('inverts USD/base crosses so quote strength has the correct sign', () => {
    const returns = returnsVsUsd(prices);
    expect(returns.GBP).toBeGreaterThan(0);
    expect(returns.JPY).toBeGreaterThan(0);
    expect(returns.CAD).toBeLessThan(0);
  });

  it('ranks currencies from strongest to weakest and centres the basket', () => {
    const rows = calculateStrength(prices);
    expect(rows[0].currency).toBe('JPY');
    expect(rows.at(-1).currency).toBe('CAD');
    const total = rows.reduce((sum, row) => sum + row.strength, 0);
    expect(total).toBeCloseTo(0, 10);
  });

  it('ranks the most separated currencies without assigning trade direction', () => {
    const rows = calculateStrength(prices);
    const separations = calculatePairSeparations(rows);
    expect(separations[0].separation).toBeGreaterThan(0);
    expect(separations[0]).not.toHaveProperty('direction');
    expect(separations[0]).not.toHaveProperty('action');
  });
});
