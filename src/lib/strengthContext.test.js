import { describe, expect, it } from 'vitest';
import {
  buildPairStrengthContext,
  interpretation,
  movementFromChange,
  rankChange,
  separationLabel,
} from './strengthContext';

// Rows are ordered strongest-first, exactly like the /api/currency-strength
// windows.today.strengths payload.
const today = [
  { currency: 'GBP', strength: 0.60 },
  { currency: 'USD', strength: 0.30 },
  { currency: 'EUR', strength: 0.10 },
  { currency: 'AUD', strength: 0.05 },
  { currency: 'CAD', strength: -0.05 },
  { currency: 'NZD', strength: -0.15 },
  { currency: 'JPY', strength: -0.35 },
  { currency: 'CHF', strength: -0.60 },
];

const separations = [
  { pair: 'GBP/CHF', separation: 1.20 },
  { pair: 'GBP/JPY', separation: 0.95 },
];

// Move GBP up (was rank 3 in 4H, now rank 1) and CHF down (was rank 6, now 8).
const reference4h = [
  { currency: 'USD', strength: 0.5 },
  { currency: 'EUR', strength: 0.4 },
  { currency: 'GBP', strength: 0.3 },
  { currency: 'AUD', strength: 0.1 },
  { currency: 'NZD', strength: -0.1 },
  { currency: 'CHF', strength: -0.2 },
  { currency: 'CAD', strength: -0.3 },
  { currency: 'JPY', strength: -0.4 },
];

describe('strength interpretation helpers', () => {
  it('maps rank changes to movement directions', () => {
    expect(movementFromChange(2)).toBe('climbing');
    expect(movementFromChange(-1)).toBe('falling');
    expect(movementFromChange(0)).toBe('flat');
    expect(movementFromChange(null)).toBe('flat');
  });

  it('reuses the Strength page terminology', () => {
    expect(interpretation({ strength: 0.4 }, 1).helper).toMatch(/momentum/);
    expect(interpretation({ strength: 0.4 }, 0).helper).toBe('Strong — established');
    expect(interpretation({ strength: 0.4 }, -1).helper).toBe('Strong but fading');
    expect(interpretation({ strength: -0.4 }, -1).helper).toBe('Weakening further');
    expect(interpretation({ strength: -0.4 }, 0).helper).toBe('Weak — established');
    expect(interpretation({ strength: -0.4 }, 1).helper).toBe('Weak but recovering');
  });

  it('buckets separation with consistent thresholds', () => {
    expect(separationLabel(1.0, 1.0)).toBe('VERY HIGH');
    expect(separationLabel(0.6, 1.0)).toBe('HIGH');
    expect(separationLabel(0.3, 1.0)).toBe('MED');
    expect(separationLabel(0.1, 1.0)).toBe('LOW');
    expect(separationLabel(0.5, 0)).toBe('LOW');
  });

  it('computes rank change relative to a reference window', () => {
    expect(rankChange('GBP', today, reference4h)).toBe(2); // 3 -> 1
    expect(rankChange('CHF', today, reference4h)).toBe(-2); // 6 -> 8
    expect(rankChange('XAU', today, reference4h)).toBeNull();
  });
});

describe('buildPairStrengthContext', () => {
  it('returns null for non-FX instruments', () => {
    expect(buildPairStrengthContext({ instrument: 'XAUUSD', todayStrengths: today })).toBeNull();
    expect(buildPairStrengthContext({ instrument: 'US30', todayStrengths: today })).toBeNull();
  });

  it('returns null when a currency is outside the eight-currency basket', () => {
    expect(buildPairStrengthContext({ instrument: 'XAU/USD', todayStrengths: today })).toBeNull();
  });

  it('returns null when strength data is unavailable', () => {
    expect(buildPairStrengthContext({ instrument: 'GBP/CHF', todayStrengths: [] })).toBeNull();
    expect(buildPairStrengthContext({ instrument: 'GBP/CHF' })).toBeNull();
  });

  it('flags SUPPORTING when the strong side climbs and the weak side falls', () => {
    const ctx = buildPairStrengthContext({
      instrument: 'GBP/CHF',
      todayStrengths: today,
      referenceStrengths: reference4h,
      separations,
    });
    expect(ctx.state).toBe('SUPPORTING');
    expect(ctx.tone).toBe('supporting');
    expect(ctx.reason).toBe('GBP strong & climbing / CHF weak & falling — separation widening');
    expect(ctx.separationLabel).toBe('VERY HIGH');
  });

  it('orders the sentence stronger-first regardless of pair orientation', () => {
    const ctx = buildPairStrengthContext({
      instrument: 'CHF/GBP',
      todayStrengths: today,
      referenceStrengths: reference4h,
      separations,
    });
    expect(ctx.reason.startsWith('GBP strong & climbing')).toBe(true);
    expect(ctx.stronger).toBe('GBP');
    expect(ctx.weaker).toBe('CHF');
  });

  it('flags FADING when the stronger currency is falling', () => {
    // GBP is the strongest of the pair today but has slipped a rank versus 4H:
    // it was ahead of USD in the reference window and is now behind it.
    const gbpSlipsRef = [
      { currency: 'GBP', strength: 0.90 }, // GBP rank 1 in ref
      { currency: 'USD', strength: 0.50 },
      { currency: 'EUR', strength: 0.40 },
      { currency: 'AUD', strength: 0.20 },
      { currency: 'CAD', strength: 0.10 },
      { currency: 'NZD', strength: 0.00 },
      { currency: 'JPY', strength: -0.20 },
      { currency: 'CHF', strength: -0.40 }, // CHF rank 8 in ref, rank 8 today = flat
    ];
    const gbpSlipsToday = [
      { currency: 'USD', strength: 0.60 },
      { currency: 'GBP', strength: 0.55 }, // GBP now rank 2 (fell from rank 1)
      { currency: 'EUR', strength: 0.10 },
      { currency: 'AUD', strength: 0.05 },
      { currency: 'CAD', strength: -0.05 },
      { currency: 'NZD', strength: -0.15 },
      { currency: 'JPY', strength: -0.35 },
      { currency: 'CHF', strength: -0.60 },
    ];
    const ctx = buildPairStrengthContext({
      instrument: 'GBP/CHF',
      todayStrengths: gbpSlipsToday,
      referenceStrengths: gbpSlipsRef,
      separations,
    });
    expect(ctx.state).toBe('FADING');
    expect(ctx.tone).toBe('fading');
    expect(ctx.reason).toMatch(/still strong, but falling/);
    expect(ctx.reason).toMatch(/separation narrowing/);
  });

  it('flags MIXED when there is no reference movement', () => {
    const ctx = buildPairStrengthContext({
      instrument: 'GBP/CHF',
      todayStrengths: today,
      referenceStrengths: [],
      separations,
    });
    expect(ctx.state).toBe('MIXED');
    expect(ctx.tone).toBe('mixed');
    expect(ctx.reason).toBe('GBP strong but flat / CHF weak but flat — separation stable');
  });

  it('flags MIXED when one widening force is offset by a narrowing one', () => {
    // GBP climbs (widening) but CHF also climbs/recovers (narrowing) => net 0.
    const ref = [
      { currency: 'USD', strength: 0.5 },
      { currency: 'EUR', strength: 0.4 },
      { currency: 'GBP', strength: 0.3 }, // GBP rank 3 -> 1 today = climbing
      { currency: 'AUD', strength: 0.1 },
      { currency: 'CAD', strength: 0.0 },
      { currency: 'NZD', strength: -0.1 },
      { currency: 'CHF', strength: -0.2 }, // CHF rank 7 in ref, rank 8 today = falling
      { currency: 'JPY', strength: -0.4 }, // JPY rank 8 in ref, rank 7 today = climbing
    ];
    // Build a today where CHF recovers instead of falls.
    const todayChfRecovers = [
      { currency: 'GBP', strength: 0.60 }, // rank 1 (was 3) climbing
      { currency: 'USD', strength: 0.30 },
      { currency: 'EUR', strength: 0.10 },
      { currency: 'AUD', strength: 0.05 },
      { currency: 'CHF', strength: -0.05 }, // rank 5 today (was 7 in ref) = climbing/recovering
      { currency: 'NZD', strength: -0.15 },
      { currency: 'CAD', strength: -0.35 },
      { currency: 'JPY', strength: -0.60 },
    ];
    const ctx = buildPairStrengthContext({
      instrument: 'GBP/CHF',
      todayStrengths: todayChfRecovers,
      referenceStrengths: ref,
      separations: [{ pair: 'GBP/JPY', separation: 1.2 }],
    });
    expect(ctx.state).toBe('MIXED');
    expect(ctx.reason).toMatch(/GBP strong & climbing/);
    expect(ctx.reason).toMatch(/CHF weak but recovering/);
    expect(ctx.reason).not.toMatch(/widening|narrowing/);
  });
});
