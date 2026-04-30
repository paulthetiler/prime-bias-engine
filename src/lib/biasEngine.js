// PrimeBias Engine - faithful recreation of the Excel Bias Tool logic

// Indicator weights per timeframe (Close, MACD, RSI, Boli)
const WEIGHTS = {
  month: { close: 40, macd: 30, rsi: 10, boli: 20 },
  week:  { close: 30, macd: 40, rsi: 10, boli: 20 },
  day:   { close: 35, macd: 40, rsi: 10, boli: 15 },
  h4:    { close: 25, macd: 20, rsi: 20, boli: 35 },
  h1:    { close: 0,  macd: 20, rsi: 40, boli: 40 },
  m15:   { close: 0,  macd: 20, rsi: 40, boli: 40 },
  m5:    { close: 0,  macd: 10, rsi: 50, boli: 40 },
};

// Timeframe display config
const TIMEFRAMES = [
  { key: 'month', label: 'Monthly',  shortLabel: 'M',   row: 1, group: 'broadstroke' },
  { key: 'week',  label: 'Weekly',   shortLabel: 'W',   row: 2, group: 'broadstroke' },
  { key: 'day',   label: 'Daily',    shortLabel: 'D',   row: 3, group: 'broadstroke' },
  { key: 'h4',    label: '4 Hour',   shortLabel: '4H',  row: 4, group: 'trigger' },
  { key: 'h1',    label: '1 Hour',   shortLabel: '1H',  row: 5, group: 'trigger' },
  { key: 'm15',   label: '15 Min',   shortLabel: '15m', row: 6, group: 'trigger' },
  { key: 'm5',    label: '5 Min',    shortLabel: '5m',  row: 7, group: 'trigger' },
];

// Default empty inputs
function getDefaultInputs() {
  const inputs = {};
  TIMEFRAMES.forEach(tf => {
    inputs[tf.key] = { close: 0, macd: 0, rsi: 0, boli: 0 };
  });
  return inputs;
}

// Calculate weighted score for a single timeframe
// Returns a signed integer total and a result: +1=BUY, -1=SELL, 0=neutral
function calcTimeframeScore(tfKey, indicators) {
  const w = WEIGHTS[tfKey];
  const total =
    (indicators.close * w.close) +
    (indicators.macd  * w.macd)  +
    (indicators.rsi   * w.rsi)   +
    (indicators.boli  * w.boli);

  let result = 0;
  if (total > 0) result = 1;
  else if (total < 0) result = -1;

  const bias = result === 1 ? 'BUY' : result === -1 ? 'SELL' : '';
  return { total, result, bias, indicators };
}

// Raw signal sum for a group of indicators (-1/0/+1 each)
// Used for NOW strength per Excel: sum of raw values, not weighted score counting
function rawSum(indicators, tfKey) {
  // For H1/M15/M5: close is disabled (0), so sum macd+rsi+boli
  // For others: sum all four
  return (indicators.close || 0) + (indicators.macd || 0) + (indicators.rsi || 0) + (indicators.boli || 0);
}

// Strength from raw summed value per Excel logic:
//   |sum| = 1 → WEAK
//   |sum| = 2 → MEDIUM
//   |sum| = 3 or 4 → STRONG
function strengthFromSum(sum) {
  const abs = Math.abs(sum);
  if (abs >= 3) return 'STRONG';
  if (abs === 2) return 'MEDIUM';
  if (abs === 1) return 'WEAK';
  return 'NO TRADE';
}

// MODE helper: majority vote of an array of results (+1/-1/0)
// Returns +1 or -1 based on majority; 0 if tied (neutral)
function mode(results) {
  const pos = results.filter(r => r === 1).length;
  const neg = results.filter(r => r === -1).length;
  if (pos > neg) return 1;
  if (neg > pos) return -1;
  return 0;
}

// Strength for Deep/DD blocks (group of 3 timeframe results)
function groupStrength(group, direction) {
  if (direction === 0) return 'NO TRADE';
  const agreeCount    = group.filter(r => r === direction).length;
  const oppositeCount = group.filter(r => r === -direction).length;
  const neutralCount  = group.filter(r => r === 0).length;

  if (agreeCount === 3)                        return 'STRONG';
  if (agreeCount === 2 && oppositeCount === 1) return 'MEDIUM';
  if (agreeCount === 2 && neutralCount === 1)  return 'WEAK';
  return 'NO TRADE';
}

// Downgrade grade by N levels: A→B→C→D→F
function downgrade(grade, levels = 1) {
  const ladder = ['A', 'B', 'C', 'D', 'F'];
  const idx = ladder.indexOf(grade);
  return ladder[Math.min(idx + levels, ladder.length - 1)];
}

// ─── Main bias calculation ────────────────────────────────────────────────────
function calculateBias(inputs) {
  const tfResults = {};
  TIMEFRAMES.forEach(tf => {
    const ind = inputs[tf.key] || { close: 0, macd: 0, rsi: 0, boli: 0 };
    tfResults[tf.key] = calcTimeframeScore(tf.key, ind);
  });

  // ── 1. DEEP — MODE of M / W / D
  const deepGroup    = [tfResults.month.result, tfResults.week.result, tfResults.day.result];
  const deepResult   = mode(deepGroup);
  const deepTrend    = deepResult === 1 ? 'BULL' : deepResult === -1 ? 'BEAR' : 'NEUTRAL';
  const deepStrength = groupStrength(deepGroup, deepResult);

  // ── 2. DD — MODE of D / 4H / 1H
  const ddGroup    = [tfResults.day.result, tfResults.h4.result, tfResults.h1.result];
  const ddResult   = mode(ddGroup);
  const ddBias     = ddResult === 1 ? 'BUY' : ddResult === -1 ? 'SELL' : 'NEUTRAL';
  const ddStrength = groupStrength(ddGroup, ddResult);

  // ── 3. NOW — MODE of 1H / 15M / 5M (direction via majority vote)
  const nowGroup  = [tfResults.h1.result, tfResults.m15.result, tfResults.m5.result];
  const nowResult = mode(nowGroup);
  const nowBias   = nowResult === 1 ? 'BUY' : nowResult === -1 ? 'SELL' : 'NEUTRAL';

  // NOW strength: uses raw value summation per Excel spec (NOT signal counting)
  // Sum the raw indicator values across H1 + M15 + M5
  const h1Ind  = inputs.h1  || { close: 0, macd: 0, rsi: 0, boli: 0 };
  const m15Ind = inputs.m15 || { close: 0, macd: 0, rsi: 0, boli: 0 };
  const m5Ind  = inputs.m5  || { close: 0, macd: 0, rsi: 0, boli: 0 };
  // H1/M15/M5 don't use close — sum MACD+RSI+Boli for each, then total
  const nowRawSum = 
    (h1Ind.macd + h1Ind.rsi + h1Ind.boli) +
    (m15Ind.macd + m15Ind.rsi + m15Ind.boli) +
    (m5Ind.macd + m5Ind.rsi + m5Ind.boli);
  const nowStrength = nowResult !== 0 ? strengthFromSum(nowRawSum) : 'NO TRADE';

  // ── 4. PLUS/MINUS SCORE — raw sum of 1H + 15M + 5M results
  const plusMinusScore = tfResults.h1.result + tfResults.m15.result + tfResults.m5.result;

  // ── 5. OVERALL DIRECTION
  let mainDirection;
  if (deepResult !== 0) {
    mainDirection = deepResult === 1 ? 'BUY' : 'SELL';
  } else if (ddResult !== 0) {
    mainDirection = ddResult === 1 ? 'BUY' : 'SELL';
  } else {
    const allResults  = TIMEFRAMES.map(tf => tfResults[tf.key].result);
    const overallMode = mode(allResults);
    mainDirection = overallMode >= 0 ? 'BUY' : 'SELL';
  }

  const dir        = mainDirection === 'BUY' ? 1 : -1;
  const deepAligns = deepResult === dir;
  const ddAligns   = ddResult === dir;
  const nowAligns  = nowResult === dir;

  // Alignment flags
  const deepDdAgree   = deepResult !== 0 && ddResult !== 0 && deepResult === ddResult;
  const ddNowAgree    = ddResult !== 0 && nowResult !== 0 && ddResult === nowResult;
  const nowOppositeDD = ddResult !== 0 && nowResult !== 0 && nowResult === -ddResult;

  // ── 6. BASE GRADE — count how many of [DEEP, DD, NOW, TREND(dir)] align
  //    Treat TREND as always aligning (it's derived from the stack), so count Deep+DD+Now
  //    3/3 aligned → A, 2/3 → B, 1/3 → C, 0/3 → NO TRADE
  //    Special: if alignment = 2/3 and M5 confirms direction → grade stays B (M5 decides)
  const alignedBlocks = [deepAligns, ddAligns, nowAligns].filter(Boolean).length;

  let grade       = 'F';
  let gradeLabel  = 'No Trade';
  let status      = 'No Trade';
  let tradeAction = 'NO_TRADE';

  if (alignedBlocks === 3) {
    grade = 'A'; gradeLabel = 'Ready'; status = 'Ready'; tradeAction = 'TRADE';

  } else if (alignedBlocks === 2) {
    // M5 decides direction on 2/4 alignment
    const m5Aligns = tfResults.m5.result === dir;
    if (m5Aligns) {
      // M5 confirms, but cap at C if NOW is WEAK
      grade = nowStrength === 'WEAK' ? 'C' : 'B';
      gradeLabel = grade === 'B' ? 'Good' : 'Scalp';
      status = 'Ready'; tradeAction = 'TRADE';
    } else {
      grade = 'C'; gradeLabel = 'Scalp'; status = 'Scalp'; tradeAction = 'TRADE';
    }

  } else if (alignedBlocks === 1) {
    grade = 'C'; gradeLabel = 'Scalp'; status = 'Scalp'; tradeAction = 'TRADE';

  } else {
    grade = 'F'; gradeLabel = 'No Trade'; status = 'No Trade'; tradeAction = 'NO_TRADE';
  }

  // ── 7. DOWNGRADE RULES (applied after base grade)
  if (grade !== 'F') {
    // Rule 1: NOW strength is WEAK → downgrade 1 level
    if (nowStrength === 'WEAK') {
      grade = downgrade(grade, 1);
    }

    // Rule 2: DD conflicts with NOW → downgrade 1 level
    if (nowOppositeDD) {
      grade = downgrade(grade, 1);
    }

    // Rule 3: Mixed BUY/SELL signals across stack → downgrade 1 level
    const hasMixed = deepAligns !== ddAligns || ddAligns !== nowAligns;
    if (hasMixed) {
      grade = downgrade(grade, 1);
    }

    // Re-derive labels after downgrades
    if (grade === 'A') { gradeLabel = 'Ready'; status = 'Ready'; tradeAction = 'TRADE'; }
    else if (grade === 'B') { gradeLabel = 'Good'; status = 'Ready'; tradeAction = 'TRADE'; }
    else if (grade === 'C') { gradeLabel = 'Scalp'; status = 'Scalp'; tradeAction = 'TRADE'; }
    else if (grade === 'D') { gradeLabel = 'Wait'; status = nowOppositeDD ? 'Danger' : 'Wait'; tradeAction = 'WAIT'; }
    else { gradeLabel = 'No Trade'; status = 'No Trade'; tradeAction = 'NO_TRADE'; }
  }

  // ── 8. TARGET label
  const dirLabel = mainDirection === 'BUY' ? 'BUY' : 'SELL';
  let targetNote = '';
  if (grade === 'A') targetNote = `GOOD ${dirLabel}`;
  else if (grade === 'B') targetNote = deepDdAgree ? `MED ${dirLabel}` : `MIN ${dirLabel}`;
  else if (grade === 'C') targetNote = `MIN ${dirLabel}`;
  else if (grade === 'D') targetNote = status === 'Danger' ? 'DANGER' : 'WAIT';
  else targetNote = 'NO TRADE';

  // ── 9. WARNINGS
  const warnings = [];
  if (deepResult !== 0 && deepResult !== dir) {
    warnings.push('Deep Trend is AGAINST direction — counter-trend setup');
  }
  if (nowOppositeDD) {
    warnings.push('NOW is OPPOSITE to DD — momentum conflict, do not trade');
  }
  if (ddResult === 0) {
    warnings.push('DD is NEUTRAL — no confirmed trend in execution zone');
  }
  if (deepResult === 0 && ddResult !== 0) {
    warnings.push('Deep Trend is NEUTRAL — broad direction unconfirmed');
  }
  if (nowStrength === 'WEAK' && nowResult !== 0) {
    warnings.push('NOW momentum is WEAK — reduced confidence in execution timing');
  }

  // ── 10. Confidence score
  const alignedCount    = TIMEFRAMES.filter(tf => tfResults[tf.key].result === dir).length;
  const confidenceScore = Math.round((alignedCount / TIMEFRAMES.length) * 100);

  return {
    timeframes: tfResults,
    deepTrend,
    deepResult,
    deepStrength,
    ddBias,
    ddResult,
    ddStrength,
    nowBias,
    nowResult,
    nowStrength,
    plusMinusScore,
    mainDirection,
    confidenceScore,
    grade,
    gradeLabel,
    strength: ddStrength,
    warnings,
    tradeAction,
    status,
    targetNote,
  };
}

// ─── Asset list ───────────────────────────────────────────────────────────────
const ASSETS = [
  'AUD/CAD','AUD/CHF','AUD/JPY','AUD/NZD','AUD/USD',
  'CAD/CHF','CAD/JPY','CHF/JPY','EUR/AUD','EUR/CAD',
  'EUR/CHF','EUR/GBP','EUR/JPY','EUR/NZD','EUR/USD',
  'GBP/AUD','GBP/CAD','GBP/CHF','GBP/JPY','GBP/NZD','GBP/USD',
  'NZD/CAD','NZD/CHF','NZD/JPY','NZD/USD',
  'USD/CAD','USD/CHF','USD/JPY',
  'DAX','FTSE','DOW','SP500','US100','CAC40','JAP225',
  'GOLD','GOLD/USD','OIL','GAS','BITCOIN','ETHUSDT',
  'Copper','Aluminum','Zinc','Lead','Carbon',
  'Dollar','Hong HS50','AUD200','SMI',
];

// Base ATR values for each asset
const BASE_ATR = {
  'AUD/CAD': 0.0055, 'AUD/CHF': 0.0062, 'AUD/JPY': 0.78, 'AUD/NZD': 0.0082, 'AUD/USD': 0.0078,
  'CAD/CHF': 0.0070, 'CAD/JPY': 0.86, 'CHF/JPY': 1.25, 'EUR/AUD': 0.0155, 'EUR/CAD': 0.0155,
  'EUR/CHF': 0.0095, 'EUR/GBP': 0.0095, 'EUR/JPY': 1.35, 'EUR/NZD': 0.0188, 'EUR/USD': 0.0120,
  'GBP/AUD': 0.0210, 'GBP/CAD': 0.0190, 'GBP/CHF': 0.0130, 'GBP/JPY': 1.65, 'GBP/NZD': 0.0250, 'GBP/USD': 0.0145,
  'NZD/CAD': 0.0068, 'NZD/CHF': 0.0075, 'NZD/JPY': 0.95, 'NZD/USD': 0.0095,
  'USD/CAD': 0.0095, 'USD/CHF': 0.0110, 'USD/JPY': 1.50,
  'DAX': 200, 'FTSE': 150, 'DOW': 250, 'SP500': 80, 'US100': 200, 'CAC40': 120, 'JAP225': 800,
  'GOLD': 25, 'GOLD/USD': 25, 'OIL': 2.5, 'GAS': 0.35, 'BITCOIN': 3500, 'ETHUSDT': 250,
  'Copper': 0.025, 'Aluminum': 35, 'Zinc': 85, 'Lead': 45, 'Carbon': 0.95,
  'Dollar': 1.5, 'Hong HS50': 800, 'AUD200': 350, 'SMI': 250,
};

// Target weight multipliers
const TARGET_WEIGHTS = {
  A: 1.25,
  B: 1,
  C: 0.75,
  D: 0.5,
};

// Get ATR for an asset, considering top 5 overrides
function getATRForAsset(asset, topAssets) {
  for (let i = 0; i < topAssets.length; i++) {
    if (topAssets[i].asset === asset && topAssets[i].atr) {
      return topAssets[i].atr;
    }
  }
  return BASE_ATR[asset] || 0;
}

// Calculate target price from ATR
function calculateTarget(atr, grade, status) {
  if (!atr || atr === 0) return null;
  const baseUnit = atr;
  const multiplier = TARGET_WEIGHTS[grade] || 0.5;
  const target = baseUnit * multiplier;
  return { target: parseFloat(target.toFixed(6)), targetType: grade };
}

// Unused but kept for legacy export compatibility
const GRADE_THRESHOLDS = [];
const TF_GRADE_WEIGHTS = {};

export {
  TIMEFRAMES, WEIGHTS, TF_GRADE_WEIGHTS, GRADE_THRESHOLDS,
  ASSETS, BASE_ATR, TARGET_WEIGHTS,
  getDefaultInputs, calculateBias, getATRForAsset, calculateTarget,
};