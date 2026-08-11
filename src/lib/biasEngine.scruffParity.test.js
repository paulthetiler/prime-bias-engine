import { describe, expect, it } from 'vitest';
import { calculateBias } from './biasEngine';

const row = (close, macd, rsi, boli) => ({ close, macd, rsi, boli });

// Winston's comparison marks, now evaluated against the CURRENT Scruff Plus
// Tools workbook rather than the older workbook version he originally used.
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

const EURUSD = {
  month: row(1, -1, 0, 0),
  week: row(1, 1, 0, 0),
  day: row(1, 1, 0, 1),
  h4: row(1, 0, -1, 0),
  h1: row(0, -1, -1, -1),
  m15: row(0, -1, 1, -1),
  m5: row(0, -1, -1, 0),
};

const noTradeExtra = { h1: 0, m15: -1 };

function macdOnly(h4, h1, m15, m5) {
  return {
    month: row(0, 0, 0, 0),
    week: row(0, 0, 0, 0),
    day: row(0, 0, 0, 0),
    h4: row(0, h4, 0, 0),
    h1: row(0, h1, 0, 0),
    m15: row(0, m15, 0, 0),
    m5: row(0, m5, 0, 0),
  };
}

describe('current Scruff Plus Tools workbook parity', () => {
  it('FTSE reproduces B / Good / SELL / No with workbook readiness', () => {
    const result = calculateBias(FTSE, noTradeExtra);
    expect(result.grade).toBe('B');
    expect(result.gradeLabel).toBe('Good');
    expect(result.tradeDirection).toBe('SELL');
    expect(result.blockTrend).toBe('SELL');
    expect(result.status).toBe('No');
    // M10 returns Ready whenever Trend is aligned unless status is Wait.
    expect(result.readiness).toBe('Ready');
  });

  it('GBP/USD reproduces A / Very Good / YES and PLUS 1 MINUS 1 Scalp SELL', () => {
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

  it('GBP/JPY uses workbook 10/49/41 Trend maths: SELL wins 51 to 49', () => {
    const result = calculateBias(GBPJPY, noTradeExtra);
    expect(result.deepTrend).toBe('BEAR');
    expect(result.ddBias).toBe('BUY');
    expect(result.nowBias).toBe('SELL');
    expect(result.tradeDirection).toBe('SELL');
    expect(result.blockTrend).toBe('SELL');
    expect(result.grade).toBe('B');
    expect(result.gradeLabel).toBe('Good');
    expect(result.status).toBe('Scalp');
    expect(result.readiness).toBe('Ready');
  });

  it('EUR/USD blank DD still resolves Trend from weighted DEEP/NOW and allows workbook Scalp', () => {
    const result = calculateBias(EURUSD, { h1: -1, m15: 1 });
    expect(result.deepTrend).toBe('BULL');
    expect(result.ddBias).toBe('');
    expect(result.nowBias).toBe('SELL');
    expect(result.blockTrend).toBe('SELL');
    expect(result.tradeDirection).toBe('SELL');
    expect(result.grade).toBe('C');
    expect(result.gradeLabel).toBe('Risky');
    expect(result.status).toBe('Scalp');
    expect(result.readiness).toBe('Ready');
  });
});

describe('current workbook P12/Q12 — PLUS 1 MINUS 1', () => {
  const cases = [
    { name: 'all sell MACD => GOOD SELL', macd: [-1, -1, -1, -1], direction: 'SELL', quality: 'GOOD' },
    { name: '4H neutral with H1/15m/5m sell => Scalp SELL', macd: [0, -1, -1, -1], direction: 'SELL', quality: 'Scalp' },
    { name: '15m neutral with 4H/H1/5m sell => CAREFUL SELL', macd: [-1, -1, 0, -1], direction: 'SELL', quality: 'CAREFUL' },
    { name: '5m neutral with 4H/H1/15m sell => GOOD SELL', macd: [-1, -1, -1, 0], direction: 'SELL', quality: 'GOOD' },
    { name: 'all buy MACD => GOOD BUY', macd: [1, 1, 1, 1], direction: 'BUY', quality: 'GOOD' },
    { name: '4H neutral with H1/15m/5m buy => Scalp BUY', macd: [0, 1, 1, 1], direction: 'BUY', quality: 'Scalp' },
    { name: '15m neutral with 4H/H1/5m buy => CAREFUL BUY', macd: [1, 1, 0, 1], direction: 'BUY', quality: 'CAREFUL' },
    { name: 'only two matching H1 direction => blank', macd: [0, -1, -1, 0], direction: '', quality: '' },
    { name: 'neutral H1 can never produce a direction', macd: [-1, 0, -1, -1], direction: '', quality: '' },
  ];

  for (const testCase of cases) {
    it(testCase.name, () => {
      const [h4, h1, m15, m5] = testCase.macd;
      const result = calculateBias(macdOnly(h4, h1, m15, m5));
      expect(result.extraDirection).toBe(testCase.direction);
      expect(result.extraQuality).toBe(testCase.quality);
    });
  }
});
