import { describe, it, expect } from 'vitest';
import {
  calculateBias,
  calculateMinSafeMove,
  getATRForAsset,
  getDefaultInputs,
  atrUnitForInstrument,
  formatAtrValue,
  formatWithUnit,
  engineOptionsFromSettings,
  createEngineSnapshot,
  ENGINE_VERSION,
  BASE_ATR,
} from './biasEngine';

// Canonical reference: current Scruff Plus Tools Prime Bias.xlsx, "Bias Tool".
// These tests assert the workbook formulas, including Excel value types, not an app interpretation of them.

const SNAPSHOT = {
  month: { close: 1, macd: 1, rsi: 0, boli: 0 },
  week:  { close: -1, macd: 1, rsi: 0, boli: 0 },
  day:   { close: 1, macd: -1, rsi: 0, boli: 0 },
  h4:    { close: -1, macd: 1, rsi: 1, boli: 0 },
  h1:    { close: 0, macd: 0, rsi: 1, boli: 0 },
  m15:   { close: 0, macd: 1, rsi: 1, boli: 0 },
  m5:    { close: 0, macd: 1, rsi: 1, boli: 1 },
};

describe('Prime Bias — canonical workbook parity', () => {
  it('matches the saved workbook snapshot', () => {
    const r = calculateBias(SNAPSHOT, null);
    expect(r.deepTrend).toBe('BULL');
    expect(r.deepStrength).toBe('STRONG');
    expect(r.ddBias).toBe('BUY');
    expect(r.ddStrength).toBe('STRONG');
    expect(r.nowBias).toBe('BUY');
    expect(r.nowStrength).toBe('STRONG');
    expect(r.buyScore).toBe(95);
    expect(r.sellScore).toBe(0);
    expect(r.winningScore).toBe(95);
    expect(r.scoreDirection).toBe('BUY');
    expect(r.rawGrade).toBe('F');
    expect(r.grade).toBe('F');
    expect(r.status).toBe('Extended');
    expect(r.readiness).toBe('Ready');
    expect(r.targetQuality).toBe('GOOD');
    expect(r.targetNote).toBe('GOOD BUY');
    expect(r.tradeAction).toBe('BUY');
  });

  it('Extra Check contributes the canonical +5 and can move A to C', () => {
    const inputs = getDefaultInputs();
    inputs.month.close = 1;
    inputs.h4.boli = 1;
    inputs.h1.rsi = 1;
    inputs.m15.rsi = 1;

    const before = calculateBias(inputs, null);
    expect(before.buyScore).toBe(75);
    expect(before.rawGrade).toBe('A');
    expect(before.grade).toBe('A');

    const after = calculateBias(inputs, { h1: 1, m15: 1 });
    expect(after.extraCheckResult).toBe('BUY');
    expect(after.buyScore).toBe(80);
    expect(after.rawGrade).toBe('C');
    expect(after.grade).toBe('C');
  });

  it('K12 blank inputs are No Trade, while UI confirmation may remain not checked', () => {
    const r = calculateBias(SNAPSHOT, null);
    expect(r.extraCheckResult).toBe('NO_TRADE');
    expect(r.extraCheckConfirmation).toBe('NOT_CHECKED');
    expect(r.lightsActive).toBe(false);
  });

  it('AC34 tie with neutral 1H is NILL, never invented BUY', () => {
    const r = calculateBias(getDefaultInputs(), null);
    expect(r.buyScore).toBe(0);
    expect(r.sellScore).toBe(0);
    expect(r.scoreDirection).toBe('NILL');
    expect(r.mainDirection).toBe('NILL');
    expect(r.tradeAction).toBe('NILL');
  });

  it('MODE all-three-different returns workbook blank block', () => {
    const inputs = getDefaultInputs();
    inputs.month.close = 1;
    inputs.week.macd = -1;
    const r = calculateBias(inputs, null);
    expect(r.deepResult).toBeNull();
    expect(r.deepTrend).toBe('');
    expect(r.deepStrength).toBe('');
  });

  it('target quality follows O11 block alignment, not grade', () => {
    const inputs = getDefaultInputs();
    inputs.month.close = 1;
    inputs.day.close = 1;
    inputs.h4.boli = 1;
    inputs.h1.rsi = 1;
    inputs.m15.rsi = 1;
    inputs.m5.rsi = 1;
    const r = calculateBias(inputs, null);
    expect(r.ddBias).toBe('BUY');
    expect(r.nowBias).toBe('BUY');
    expect(r.targetQuality).toBe(r.deepTrend === 'BULL' ? 'GOOD' : 'MED');
  });

  it('P10 preserves workbook AK6 numeric vs AK8 text comparison', () => {
    const inputs = getDefaultInputs();
    inputs.h4.boli = 1;
    inputs.m15.rsi = 1;
    inputs.m5.boli = 1;
    const r = calculateBias(inputs, null);
    expect(r.scoreDirection).toBe('BUY');
    expect(r.status).toBe('No');
  });

  it('locks the workbook type mismatch in both BUY and SELL directions', () => {
    for (const side of [1, -1]) {
      const inputs = getDefaultInputs();
      inputs.h4.boli = side;
      inputs.m15.rsi = side;
      inputs.m5.boli = side;
      const r = calculateBias(inputs, null);
      expect(r.scoreDirection).toBe(side === 1 ? 'BUY' : 'SELL');
      expect(r.status).toBe('No');
      expect(r.status).not.toBe('Scalp');
    }
  });

  it('keeps Status and PLUS 1 MIN 1 as independent workbook outputs', () => {
    const inputs = getDefaultInputs();
    inputs.h4.macd = -1;
    inputs.h1.macd = -1;
    inputs.m15.macd = -1;
    inputs.m5.macd = -1;
    inputs.h1.rsi = -1;
    inputs.m15.rsi = -1;
    inputs.m5.rsi = -1;
    const r = calculateBias(inputs, null);
    expect(['YES', 'No', 'NO', 'Wait', 'Extended']).toContain(r.status);
    expect(r.extraDirection).toBe('SELL');
    expect(r.extraQuality).toBe('GOOD');
  });

  it('P12/Q12 PLUS 1 MINUS 1 is surfaced separately', () => {
    const inputs = getDefaultInputs();
    inputs.h4.macd = 1;
    inputs.h1.macd = 1;
    inputs.m15.macd = 1;
    inputs.m5.macd = -1;
    inputs.m5.rsi = -1;
    const r = calculateBias(inputs, null);
    expect(r.extraDirection).toBe('BUY');
    expect(r.extraQuality).toBe('GOOD');
  });

  it('locks PLUS 1 MIN 1 quality branches for BUY and SELL', () => {
    const cases = [
      { vals: [1, 1, 1, -1], dir: 'BUY', quality: 'GOOD' },
      { vals: [-1, -1, -1, 1], dir: 'SELL', quality: 'GOOD' },
      { vals: [-1, 1, 1, 1], dir: 'BUY', quality: 'Scalp' },
      { vals: [1, -1, -1, -1], dir: 'SELL', quality: 'Scalp' },
      { vals: [1, 1, -1, 1], dir: 'BUY', quality: 'CAREFUL' },
      { vals: [-1, -1, 1, -1], dir: 'SELL', quality: 'CAREFUL' },
    ];
    for (const { vals, dir, quality } of cases) {
      const inputs = getDefaultInputs();
      [inputs.h4.macd, inputs.h1.macd, inputs.m15.macd, inputs.m5.macd] = vals;
      inputs.m5.rsi = dir === 'BUY' ? -1 : 1;
      const r = calculateBias(inputs, null);
      expect(r.extraDirection).toBe(dir);
      expect(r.extraQuality).toBe(quality);
    }
  });

  it('grade cap Q10 forces C when P9 and Q11 disagree', () => {
    const inputs = getDefaultInputs();
    inputs.month.close = 1;
    inputs.week.close = 1;
    inputs.day.close = -1;
    const r = calculateBias(inputs, null);
    if (r.blockTrend !== r.scoreDirection) expect(r.grade).toBe('C');
  });
});

describe('timeframe formula', () => {
  it('uses the ±35 dead-zone', () => {
    const inputs = getDefaultInputs();
    inputs.h1.macd = 1;
    expect(calculateBias(inputs).timeframes.h1.bias).toBe('Neutral');
    inputs.day.close = 1;
    expect(calculateBias(inputs).timeframes.day.bias).toBe('BUY');
  });

  it('uses dominant side rather than net sum', () => {
    const inputs = getDefaultInputs();
    inputs.h4.close = 1;
    inputs.h4.boli = -1;
    const t = calculateBias(inputs).timeframes.h4;
    expect(t.total).toBe(-35);
    expect(t.bias).toBe('SELL');
  });
});

describe('immutable settings/version', () => {
  it('ignores runtime engine overrides', () => {
    expect(engineOptionsFromSettings({ weights: { h1: 99 } })).toEqual({});
  });

  it('uses the canonical version identifier', () => {
    expect(ENGINE_VERSION).toBe('prime-bias-excel-canonical-v4');
  });

  it('snapshots canonical outputs', () => {
    const r = calculateBias(SNAPSHOT, { h1: 1, m15: 1 });
    const snap = createEngineSnapshot(r, r.resolvedOptions, {
      extraCheck: { h1: 1, m15: 1 },
      timestamp: '2026-08-08T12:00:00.000Z',
    });
    expect(snap.engine_version).toBe(ENGINE_VERSION);
    expect(snap.status).toBe(r.status);
    expect(snap.readiness).toBe(r.readiness);
    expect(snap.target_quality).toBe(r.targetQuality);
    expect(snap.trade_direction).toBe(r.tradeDirection);
    expect(snap.extra_direction).toBe(r.extraDirection);
    expect(snap.extra_quality).toBe(r.extraQuality);
  });
});

describe('ATR utilities', () => {
  it('computes minimum safe move', () => {
    expect(calculateMinSafeMove(90, 'A').value).toBe(12.5);
    expect(calculateMinSafeMove(90, 'B').value).toBe(10);
    expect(calculateMinSafeMove(90, 'C').value).toBe(7.5);
    expect(calculateMinSafeMove(90, 'D').value).toBe(5);
  });

  it('uses ATR override then fallback', () => {
    expect(getATRForAsset('EUR/USD', [{ asset: 'EUR/USD', atr: '77' }])).toBe(77);
    expect(getATRForAsset('EUR/USD', [])).toBe(BASE_ATR['EUR/USD']);
  });

  it('formats ATR units', () => {
    expect(atrUnitForInstrument('EUR/USD')).toBe('pips');
    expect(atrUnitForInstrument('US100')).toBe('points');
    expect(formatAtrValue(128.45)).toBe('128.5');
    expect(formatWithUnit(1, 'EUR/USD')).toBe('1 pip');
  });
});
