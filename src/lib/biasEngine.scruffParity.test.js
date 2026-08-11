import { describe, expect, it } from 'vitest';
import { calculateBias } from './biasEngine';

const row = (close, macd, rsi, boli) => ({ close, macd, rsi, boli });

const FTSE = {
  month: row(1, 1, 0, 0),
  week: row(-1, 1, 0, 0),
  day: row(-1, -1, 0, 0),
  h4: row(1, -1, -1, -1),
  h1: row(0, 1, 1, 0),
  m15: row(0, -1, -1, 0),
  m5: row(0, -1, -1, 0),
};

const GBPUSD = {
  month: row(1, -1, 0, 0),
  week: row(1, 1, 0, 1),
  day: row(1, 1, 0, 1),
  h4: row(-1, 0, -1, 1),
  h1: row(0, -1, -1, 0),
  m15: row(0, -1, -1, 0),
  m5: row(0, -1, -1, 0),
};

const GBPJPY = {
  month: row(-1, -1, 0, 0),
  week: row(1, -1, 0, 0),
  day: row(1, 1, 0, 0),
  h4: row(-1, 1, 0, 1),
  h1: row(0, -1, -1, 0),
  m15: row(0, 0, -1, 0),
  m5: row(0, -1, -1, 0),
};

const noTradeExtra = { h1: 0, m15: -1 };

describe('current Scruff Plus Tools workbook parity', () => {
  it('FTSE matches current workbook', () => {
    const result = calculateBias(FTSE, noTradeExtra);
    expect(result.grade).toBe('B');
    expect(result.gradeLabel).toBe('Good');
    expect(result.tradeDirection).toBe('SELL');
    expect(result.blockTrend).toBe('SELL');
    expect(result.status).toBe('No');
    expect(result.readiness).toBe('Ready');
  });

  it('GBP/USD keeps Status YES while PLUS 1 MIN 1 independently reports Scalp SELL', () => {
    const result = calculateBias(GBPUSD, noTradeExtra);
    expect(result.grade).toBe('A');
    expect(result.gradeLabel).toBe('Very Good');
    expect(result.tradeDirection).toBe('SELL');
    expect(result.blockTrend).toBe('SELL');
    expect(result.status).toBe('YES');
    expect(result.readiness).toBe('Ready');
    expect(result.targetNote).toBe('MED SELL');
    expect(result.extraDirection).toBe('SELL');
    expect(result.extraQuality).toBe('Scalp');
  });

  it('GBP/JPY matches current workbook: B / No, not Scalp', () => {
    const result = calculateBias(GBPJPY, noTradeExtra);
    expect(result.deepTrend).toBe('BEAR');
    expect(result.ddBias).toBe('BUY');
    expect(result.nowBias).toBe('SELL');
    expect(result.tradeDirection).toBe('SELL');
    expect(result.blockTrend).toBe('SELL');
    expect(result.grade).toBe('B');
    expect(result.gradeLabel).toBe('Good');
    expect(result.status).toBe('No');
    expect(result.readiness).toBe('Ready');
  });
});
