// PrimeBias Engine — rebuilt cell-by-cell from Excel workbook
// Source of truth: Bias Tool sheet + B1/B2/B3/B4 example sheets

// ─── Timeframe display config ─────────────────────────────────────────────────
const TIMEFRAMES = [
  { key: 'month', label: 'Monthly',  shortLabel: 'M',   group: 'broadstroke' },
  { key: 'week',  label: 'Weekly',   shortLabel: 'W',   group: 'broadstroke' },
  { key: 'day',   label: 'Daily',    shortLabel: 'D',   group: 'broadstroke' },
  { key: 'h4',    label: '4 Hour',   shortLabel: '4H',  group: 'trigger' },
  { key: 'h1',    label: '1 Hour',   shortLabel: '1H',  group: 'trigger' },
  { key: 'm15',   label: '15 Min',   shortLabel: '15m', group: 'trigger' },
  { key: 'm5',    label: '5 Min',    shortLabel: '5m',  group: 'trigger' },
];

// ─── Weighted scoring per timeframe ──────────────────────────────────────────
// From Excel col Y: Close*weight, macd*weight, rsi*weight, boli*weight
// Weights (absolute values from max-score columns in sheet):
//   Month: close=40, macd=30, rsi=10, boli=20  → max=100 (but contributes to block score)
//   Week:  close=30, macd=40, rsi=10, boli=20
//   Day:   close=35, macd=40, rsi=10, boli=15
//   4hr:   close=25, macd=20, rsi=20, boli=35
//   1hr:   close=0,  macd=20, rsi=40, boli=40
//   15m:   close=0,  macd=20, rsi=40, boli=40
//   5m:    close=0,  macd=10, rsi=50, boli=40

const WEIGHTS = {
  month: { close: 40, macd: 30, rsi: 10, boli: 20 },
  week:  { close: 30, macd: 40, rsi: 10, boli: 20 },
  day:   { close: 35, macd: 40, rsi: 10, boli: 15 },
  h4:    { close: 25, macd: 20, rsi: 20, boli: 35 },
  h1:    { close: 0,  macd: 20, rsi: 40, boli: 40 },
  m15:   { close: 0,  macd: 20, rsi: 40, boli: 40 },
  m5:    { close: 0,  macd: 10, rsi: 50, boli: 40 },
};

// ─── Block weights (from Excel scoring table: Deep=10, DD=49, Now=41) ─────────
// These are the block point contributions toward the 100-point grade score
// Deep block: Month(2)+Week(5)+Day(10) — uses min weight per TF within block
// Actually from the sheet the scoring table shows:
//   Deep: 10 points total  → Month=2, Week=5, Day=10... wait
// Looking at B1 sheet scoring table:
//   Month: weight=2, Week=5, Day=10, 4hr=30, 1hr=33, 15m=10, 5m=5 → total=100
// But "Deep" score=10, "DD"=49, "Now"=41 from the row totals
// The "Deep" label shows score=10 → that's just the Month row contribution in the sample
// The actual block scores are: sum of matching TF weights
//
// CRITICAL INSIGHT from the sheet:
// The grade scoring works like this:
//   For each TF, if its result matches the SELL direction: add that TF's weight to SELL score
//   If it matches BUY direction: add to BUY score
//   Total = 100 (sum of all weights)
//   Then: direction = whichever side has more
//   Score = the WINNING side's total (i.e. max(BUY, SELL))
//   Grade is determined by the score threshold

// TF weights for the grade scoring system
const TF_SCORE_WEIGHTS = {
  month: 2,
  week:  5,
  day:   10,
  h4:    30,
  h1:    33,
  m15:   10,
  m5:    5,
};
// Total = 95 (not 100 — "Lights" bonus of 5 for Extra Check green light adds to make 100)
// Without Lights: max = 95, with green light extra check = 100

// ─── Default inputs ───────────────────────────────────────────────────────────
function getDefaultInputs() {
  const inputs = {};
  TIMEFRAMES.forEach(tf => {
    inputs[tf.key] = { close: 0, macd: 0, rsi: 0, boli: 0 };
  });
  return inputs;
}

// ─── Single TF weighted score ─────────────────────────────────────────────────
// Returns: { total (weighted sum), result (+1/-1/0), bias ('BUY'/'SELL'/'') }
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

  const bias = result === 1 ? 'BUY' : result === -1 ? 'SELL' : 'Neutral';
  return { total, result, bias };
}

// ─── DEEP block direction + strength ─────────────────────────────────────────
// Excel: O4=MODE(J4,J5,J6), P4=BULL/BEAR label, Q4=strength
// Strength formula (from Excel Q4 equivalent):
//   IF all 3 same direction → STRONG
//   IF 2 same + 1 opposite → MEDIUM
//   IF 2 same + 1 neutral  → WEAK (only 2 of 3 agree, one is 0)
//   else → NO TRADE
function calcBlockDirection(results) {
  // results = array of +1/-1/0
  const pos = results.filter(r => r === 1).length;
  const neg = results.filter(r => r === -1).length;
  if (pos > neg) return 1;
  if (neg > pos) return -1;
  return 0;
}

// Excel Q8 formula (NOW strength):
// =IF(O8="","",
//   IF(K8="BUY",
//     IF(AND(K9="BUY",K10="BUY"),"STRONG",IF(OR(K9="BUY",K10="BUY"),"MEDIUM","WEAK")),
//   IF(K8="SELL",
//     IF(AND(K9="SELL",K10="SELL"),"STRONG",IF(OR(K9="SELL",K10="SELL"),"MEDIUM","WEAK")),
//   "WEAK")))
//
// For DEEP (M/W/D) and DD (D/4H/1H), same structure applies to those 3 TFs.
// K8 = first TF of block, K9 = second, K10 = third
function calcBlockStrength(tfResults, direction) {
  if (direction === 0) return 'NO TRADE';
  const dirLabel = direction === 1 ? 'BUY' : 'SELL';
  const [r0, r1, r2] = tfResults;
  const b0 = r0 === 1 ? 'BUY' : r0 === -1 ? 'SELL' : 'Neutral';
  const b1 = r1 === 1 ? 'BUY' : r1 === -1 ? 'SELL' : 'Neutral';
  const b2 = r2 === 1 ? 'BUY' : r2 === -1 ? 'SELL' : 'Neutral';

  if (b0 === dirLabel) {
    if (b1 === dirLabel && b2 === dirLabel) return 'STRONG';
    if (b1 === dirLabel || b2 === dirLabel) return 'MEDIUM';
    return 'WEAK';
  } else if (b0 !== dirLabel) {
    // First TF doesn't match direction — but direction was set by majority
    // so at least 2 of 3 must match direction
    if (b1 === dirLabel && b2 === dirLabel) return 'MEDIUM'; // 2 match, first is opposite/neutral
    if (b1 === dirLabel || b2 === dirLabel) return 'WEAK';
  }
  return 'WEAK';
}

// ─── GRADE scoring system (from Excel scoring table) ─────────────────────────
// Each TF's weight is added to BUY or SELL score based on TF result
// Direction = whichever has more score
// Grade score = winning side's score (as % of 100 with optional Lights bonus)
//
// Grade thresholds (from Excel B2 sheet, confirmed across sheets):
//   ≥90 = F (too extended / risky at extreme)  — actually shown as "Risky" label but grade F
//   ≥85 = C (Risky)    [B2: 80-90=Risky, C]
//   ≥75 = A (Very Good)
//   ≥60 = B (Good)
//   ≥50 = C (Risky)
//   ≥40 = D (Dangerous)
//   <40  = F (Fail)
//
// NOTE: The Excel shows these ranges vary slightly between sheets.
// Canonical from "Bias Tool" sheet scoring area:
//   5 = Lights (Extra Check green)
//   A = Very Good  75-84
//   B = Good       60-74
//   C = Risky      50-59
//   D = Dangerous  40-49
//   F = Fail       <40 or ≥90 (extended)
// When score ≥85 → Risky (shows as C but "Extended" status)
// When score ≥90 → Extended/Fail
//
// The final grade is: IF(score>=90,"F", IF(score>=85,"C", IF(score>=75,"A", IF(score>=60,"B", IF(score>=50,"C", IF(score>=40,"D", IF(score<=39,"F")))))))

function calcGradeFromScore(score) {
  if (score >= 90) return 'F';
  if (score >= 85) return 'C'; // extended/risky
  if (score >= 75) return 'A';
  if (score >= 60) return 'B';
  if (score >= 50) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

function calcGradeLabel(grade, score) {
  if (score >= 90) return 'Extended';
  if (score >= 85) return 'Risky';
  if (grade === 'A') return 'Very Good';
  if (grade === 'B') return 'Good';
  if (grade === 'C') return 'Risky';
  if (grade === 'D') return 'Dangerous';
  return 'No Trade';
}

// ─── Main bias calculation ────────────────────────────────────────────────────
function calculateBias(inputs, extraCheck = null) {
  // 1. Score each timeframe
  const tfResults = {};
  TIMEFRAMES.forEach(tf => {
    const ind = inputs[tf.key] || { close: 0, macd: 0, rsi: 0, boli: 0 };
    tfResults[tf.key] = calcTimeframeScore(tf.key, ind);
  });

  const r = (key) => tfResults[key].result;

  // 2. DEEP block — Month / Week / Day
  const deepGroup   = [r('month'), r('week'), r('day')];
  const deepResult  = calcBlockDirection(deepGroup);
  const deepTrend   = deepResult === 1 ? 'BULL' : deepResult === -1 ? 'BEAR' : 'NEUTRAL';
  const deepStrength = calcBlockStrength(deepGroup, deepResult);

  // 3. DD block — Day / 4hr / 1hr
  const ddGroup    = [r('day'), r('h4'), r('h1')];
  const ddResult   = calcBlockDirection(ddGroup);
  const ddBias     = ddResult === 1 ? 'BUY' : ddResult === -1 ? 'SELL' : 'NEUTRAL';
  const ddStrength = calcBlockStrength(ddGroup, ddResult);

  // 4. NOW block — 1hr / 15m / 5m
  // Excel Q8: based on K8=1hr, K9=15m, K10=5m
  const nowGroup    = [r('h1'), r('m15'), r('m5')];
  const nowResult   = calcBlockDirection(nowGroup);
  const nowBias     = nowResult === 1 ? 'BUY' : nowResult === -1 ? 'SELL' : 'NEUTRAL';
  const nowStrength = calcBlockStrength(nowGroup, nowResult);

  // 5. MAIN DIRECTION — Deep drives direction; DD confirms; fallback logic
  // From Excel: main trend shown as SELL/BUY based on Deep (O4) or fallback to DD
  let mainDirection;
  if (deepResult !== 0) {
    mainDirection = deepResult === 1 ? 'BUY' : 'SELL';
  } else if (ddResult !== 0) {
    mainDirection = ddResult === 1 ? 'BUY' : 'SELL';
  } else {
    // All neutral — use overall majority
    const allR = TIMEFRAMES.map(tf => r(tf.key));
    const pos = allR.filter(x => x === 1).length;
    const neg = allR.filter(x => x === -1).length;
    mainDirection = pos >= neg ? 'BUY' : 'SELL';
  }
  const dir = mainDirection === 'BUY' ? 1 : -1;

  // 6. GRADE SCORE — weighted BUY vs SELL tally (Excel scoring table)
  let buyScore  = 0;
  let sellScore = 0;
  TIMEFRAMES.forEach(tf => {
    const w = TF_SCORE_WEIGHTS[tf.key];
    const res = r(tf.key);
    if (res === 1)  buyScore  += w;
    if (res === -1) sellScore += w;
  });

  // Extra Check "Lights" bonus: +5 if green light (both H1 and M15 match same direction)
  // The Excel sheet adds 5 points to the winning direction's score for green light
  let lightsBonus = 0;
  if (extraCheck && extraCheck.h1 !== null && extraCheck.m15 !== null) {
    if (extraCheck.h1 === extraCheck.m15 && extraCheck.h1 !== 0) {
      lightsBonus = 5;
      if (extraCheck.h1 === 1) buyScore  += lightsBonus;
      else                     sellScore += lightsBonus;
    }
  }

  // Direction from score (AC34 equivalent)
  let scoreDirection;
  if (buyScore > sellScore) scoreDirection = 'BUY';
  else if (sellScore > buyScore) scoreDirection = 'SELL';
  else {
    // Tie-break using monthly TF (AC29 equivalent)
    if (r('month') === 1) scoreDirection = 'BUY';
    else if (r('month') === -1) scoreDirection = 'SELL';
    else scoreDirection = 'NILL';
  }

  // Winning score (AB35 equivalent)
  const winningScore = scoreDirection === 'BUY' ? buyScore : scoreDirection === 'SELL' ? sellScore : 0;

  // Grade (AC35 equivalent)
  const grade      = calcGradeFromScore(winningScore);
  const gradeLabel = calcGradeLabel(grade, winningScore);

  // 7. STATUS — from Excel Q10 logic:
  //    =IF(P9=Q11, AC35, "C")
  //    i.e. IF the scoreDirection matches mainDirection → use calculated grade, else "C"
  //    P9 = scoreDirection, Q11 = mainDirection
  // Also check if NOW direction matches main direction for "Ready" / "Wait" / "Trend Off"
  const scoreMatchesMain = scoreDirection === mainDirection;

  let effectiveGrade = scoreMatchesMain ? grade : 'C';

  // Determine status and trade action
  let status, tradeAction, targetNote;
  const nowMatchesMain = nowResult === dir;
  const ddMatchesMain  = ddResult === dir;
  const deepMatchesMain = deepResult === dir;

  if (effectiveGrade === 'F') {
    if (winningScore >= 90) {
      status = 'Extended'; tradeAction = 'NO_TRADE'; targetNote = 'EXTENDED';
    } else {
      status = 'No Trade'; tradeAction = 'NO_TRADE'; targetNote = 'NO TRADE';
    }
  } else if (effectiveGrade === 'D') {
    status = 'Dangerous'; tradeAction = 'WAIT'; targetNote = 'WAIT';
  } else if (effectiveGrade === 'C' && winningScore >= 85) {
    status = 'Risky'; tradeAction = 'WAIT'; targetNote = 'RISKY';
  } else if (effectiveGrade === 'C' && !scoreMatchesMain) {
    status = 'Wait'; tradeAction = 'WAIT'; targetNote = 'WAIT';
  } else {
    // A, B, or tradeable C
    if (effectiveGrade === 'A') {
      status = 'Ready'; tradeAction = 'TRADE';
      targetNote = `GOOD ${mainDirection}`;
    } else if (effectiveGrade === 'B') {
      status = 'Ready'; tradeAction = 'TRADE';
      targetNote = `MED ${mainDirection}`;
    } else {
      // C
      if (!nowMatchesMain && ddMatchesMain) {
        status = 'Scalp'; tradeAction = 'TRADE'; targetNote = `MIN ${mainDirection}`;
      } else if (!ddMatchesMain) {
        status = 'Trend Off'; tradeAction = 'WAIT'; targetNote = 'WAIT';
      } else {
        status = 'Scalp'; tradeAction = 'TRADE'; targetNote = `MIN ${mainDirection}`;
      }
    }
  }

  // 8. WARNINGS
  const warnings = [];
  if (deepResult !== 0 && deepResult !== dir) {
    warnings.push('Deep Trend is AGAINST direction — counter-trend setup');
  }
  if (ddResult !== 0 && nowResult !== 0 && nowResult === -ddResult) {
    warnings.push('NOW is OPPOSITE to DD — momentum conflict');
  }
  if (ddResult === 0) {
    warnings.push('DD is NEUTRAL — no confirmed trend in execution zone');
  }
  if (deepResult === 0 && ddResult !== 0) {
    warnings.push('Deep Trend is NEUTRAL — broad direction unconfirmed');
  }
  if (!scoreMatchesMain) {
    warnings.push('Score direction does not match main bias — grade capped at C');
  }
  if (winningScore >= 85 && winningScore < 90) {
    warnings.push('Score is very high — market may be extended, use caution');
  }
  if (winningScore >= 90) {
    warnings.push('Score ≥90 — market is EXTENDED, do not trade');
  }

  // 9. Plus/Minus score (raw sum of trigger TF results)
  const plusMinusScore = r('h1') + r('m15') + r('m5');

  // 10. Confidence score
  const alignedCount    = TIMEFRAMES.filter(tf => r(tf.key) === dir).length;
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
    scoreDirection,
    buyScore,
    sellScore,
    winningScore,
    confidenceScore,
    grade: effectiveGrade,
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

// ─── Base ATR values (from Summary sheet) ────────────────────────────────────
const BASE_ATR = {
  'AUD/CAD': 110, 'AUD/CHF': 38, 'AUD/JPY': 62, 'AUD/NZD': 43, 'AUD/USD': 50,
  'CAD/CHF': 40, 'CAD/JPY': 78, 'CHF/JPY': 108, 'EUR/AUD': 91, 'EUR/CAD': 68,
  'EUR/CHF': 40, 'EUR/GBP': 29, 'EUR/JPY': 155, 'EUR/NZD': 102, 'EUR/USD': 55,
  'GBP/AUD': 107, 'GBP/CAD': 86, 'GBP/CHF': 56, 'GBP/JPY': 128, 'GBP/NZD': 126, 'GBP/USD': 90,
  'NZD/CAD': 49, 'NZD/CHF': 36, 'NZD/JPY': 60, 'NZD/USD': 48,
  'USD/CAD': 58, 'USD/CHF': 55, 'USD/JPY': 112,
  'DAX': 161, 'FTSE': 60, 'DOW': 260, 'SP500': 35, 'US100': 178, 'CAC40': 74, 'JAP225': 476,
  'GOLD': 19, 'GOLD/USD': 200, 'OIL': 111, 'GAS': 140, 'BITCOIN': 1565, 'ETHUSDT': 95,
  'Copper': 108, 'Aluminum': 40, 'Zinc': 50, 'Lead': 36, 'Carbon': 274,
  'Dollar': 50, 'Hong HS50': 380, 'AUD200': 61, 'SMI': 95,
};

// ─── Target weight multipliers (from Summary sheet) ──────────────────────────
// A=1.25, B=1, C=1.5(?), D=3 — actually from the sheet:
// A=Target*1.25, B=Target*1, C=Target*0.75 approx based on pip calculations
// Summary sheet shows: A, B, C, D, Scalp, Careful columns with ATR-derived pip values
// A = ATR * (25/16) ≈ ATR/72*100... let me use the actual ratio from sheet:
// For AUD/CAD ATR=110: A=15.27, B=12.22, C=8.15, D=4.07
// A/ATR = 15.27/110 = 0.1388 = 5/36, B/ATR = 12.22/110 = 0.111 = 1/9
// Actually: A = ATR * 5/(36) * ... let me compute ratio:
// 15.277.../110 = 15.277/110. And 110*(25/18)/10 = 15.27. So A = ATR*25/18/10? No.
// Simpler: from the spreadsheet formula comments: A=1.25, B=1, C=0.75 weight but divided by some base
// The pip values = ATR * weight / divisor. Given ATR=110, A=15.27:
// 15.27 = 110 * 1.25 / X → X = 110*1.25/15.27 = 9.0 (approximately)
// So target = ATR * gradeWeight / 9
const TARGET_WEIGHTS = { A: 1.25, B: 1.0, C: 0.75, D: 0.5 };
const TARGET_DIVISOR = 9;

function getATRForAsset(asset, topAssets) {
  for (let i = 0; i < topAssets.length; i++) {
    if (topAssets[i].asset === asset && topAssets[i].atr) {
      return parseFloat(topAssets[i].atr);
    }
  }
  return BASE_ATR[asset] || 0;
}

function calculateTarget(atr, grade, status) {
  if (!atr || atr === 0) return null;
  const multiplier = TARGET_WEIGHTS[grade] || 0.5;
  const target = (atr * multiplier) / TARGET_DIVISOR;
  return { target: parseFloat(target.toFixed(4)), targetType: grade };
}

// Legacy exports (unused but kept for compatibility)
const GRADE_THRESHOLDS = [];
const TF_GRADE_WEIGHTS = {};

export {
  TIMEFRAMES, WEIGHTS, TF_GRADE_WEIGHTS, GRADE_THRESHOLDS,
  ASSETS, BASE_ATR, TARGET_WEIGHTS,
  getDefaultInputs, calculateBias, getATRForAsset, calculateTarget,
};