import { describe, it, expect } from 'vitest';
import {
  nonNegMoney, normalizeMood, computeNetPnl, resultFromNet, reconcileResult,
  projectedBalance, riskPct, realisedR, estimatedPoints,
  financialCompletenessState, MOODS, COMPLETENESS_LABEL,
} from './tradeFinancials';

describe('nonNegMoney', () => {
  it('takes the magnitude of a finite number', () => {
    expect(nonNegMoney(5)).toBe(5);
    expect(nonNegMoney(-5)).toBe(5);
    expect(nonNegMoney('3.5')).toBe(3.5);
    expect(nonNegMoney(0)).toBe(0);
  });
  it('is null for missing/invalid (never 0)', () => {
    for (const bad of [null, undefined, '', NaN, 'x']) expect(nonNegMoney(bad)).toBeNull();
  });
});

describe('normalizeMood', () => {
  it('accepts only known moods', () => {
    for (const m of MOODS) expect(normalizeMood(m)).toBe(m);
    expect(normalizeMood('zen')).toBeNull();
    expect(normalizeMood(null)).toBeNull();
  });
});

describe('computeNetPnl (net = gross − fees)', () => {
  it('subtracts fees from signed gross', () => {
    expect(computeNetPnl(200, 5)).toBe(195);
    expect(computeNetPnl(-100, 5)).toBe(-105); // documented loss example
    expect(computeNetPnl(0, 3)).toBe(-3);      // break-even with fees
    expect(computeNetPnl(50, null)).toBe(50);  // missing fees = 0
  });
  it('is null when no gross was entered (incomplete)', () => {
    expect(computeNetPnl(null, 5)).toBeNull();
    expect(computeNetPnl('', 5)).toBeNull();
  });
});

describe('resultFromNet', () => {
  it('maps sign to outcome', () => {
    expect(resultFromNet(10)).toBe('win');
    expect(resultFromNet(-10)).toBe('loss');
    expect(resultFromNet(0)).toBe('breakeven');
    expect(resultFromNet(null)).toBeNull();
  });
});

describe('reconcileResult', () => {
  it('net P&L is authoritative when present', () => {
    expect(reconcileResult('win', -5)).toEqual({ result: 'loss', changed: true });
    expect(reconcileResult('loss', 5)).toEqual({ result: 'win', changed: true });
    expect(reconcileResult('win', 5)).toEqual({ result: 'win', changed: false });
    expect(reconcileResult('win', 0)).toEqual({ result: 'breakeven', changed: true });
  });
  it('keeps the selected outcome when there is no net P&L', () => {
    expect(reconcileResult('loss', null)).toEqual({ result: 'loss', changed: false });
    expect(reconcileResult('not_taken', null)).toEqual({ result: 'not_taken', changed: false });
  });
});

describe('projectedBalance', () => {
  it('adds net P&L to the balance before', () => {
    expect(projectedBalance(10000, 250)).toBe(10250);
    expect(projectedBalance(10000, -250)).toBe(9750);
  });
  it('is null when an input is unavailable', () => {
    expect(projectedBalance(null, 250)).toBeNull();
    expect(projectedBalance(10000, null)).toBeNull();
  });
});

describe('riskPct', () => {
  it('is amount risked / balance before × 100', () => {
    expect(riskPct(100, 10000)).toBe(1);
    expect(riskPct(250, 5000)).toBe(5);
  });
  it('is null unless both are positive', () => {
    expect(riskPct(0, 10000)).toBeNull();
    expect(riskPct(100, 0)).toBeNull();
    expect(riskPct(null, 10000)).toBeNull();
    expect(riskPct(100, -1)).toBeNull();
  });
});

describe('realisedR (true R, not P&L/invested)', () => {
  it('is net P&L / amount risked', () => {
    expect(realisedR(200, 100)).toBe(2);
    expect(realisedR(-50, 100)).toBe(-0.5);
    expect(realisedR(0, 100)).toBe(0);
  });
  it('is null without a positive risk or a net result', () => {
    expect(realisedR(200, 0)).toBeNull();
    expect(realisedR(200, null)).toBeNull();
    expect(realisedR(null, 100)).toBeNull();
  });
});

describe('estimatedPoints (labelled fallback only)', () => {
  it('is net P&L / position size', () => {
    expect(estimatedPoints(300, 1.5)).toBe(200);
    expect(estimatedPoints(-60, 2)).toBe(-30);
  });
  it('is null without a positive size or a net result', () => {
    expect(estimatedPoints(300, 0)).toBeNull();
    expect(estimatedPoints(null, 1.5)).toBeNull();
  });
});

describe('financialCompletenessState', () => {
  it('outcome_only when no net P&L', () => {
    expect(financialCompletenessState({ result: 'win' })).toBe('outcome_only');
    expect(financialCompletenessState({ net_pnl: null, account_id: 'a', amount_risked: 5 })).toBe('outcome_only');
  });
  it('account_unassigned when net exists but no account', () => {
    expect(financialCompletenessState({ net_pnl: 100, amount_risked: 50 })).toBe('account_unassigned');
  });
  it('risk_incomplete when net + account but no positive risk', () => {
    expect(financialCompletenessState({ net_pnl: 100, account_id: 'a' })).toBe('risk_incomplete');
    expect(financialCompletenessState({ net_pnl: 100, account_id: 'a', amount_risked: 0 })).toBe('risk_incomplete');
  });
  it('complete when net, account and positive risk are all present', () => {
    expect(financialCompletenessState({ net_pnl: 100, account_id: 'a', amount_risked: 50 })).toBe('complete');
    // break-even (net 0) with account + risk is still complete
    expect(financialCompletenessState({ net_pnl: 0, account_id: 'a', amount_risked: 50 })).toBe('complete');
  });
  it('every state has a label', () => {
    for (const s of ['complete', 'outcome_only', 'risk_incomplete', 'account_unassigned']) {
      expect(COMPLETENESS_LABEL[s]).toBeTruthy();
    }
  });
});
