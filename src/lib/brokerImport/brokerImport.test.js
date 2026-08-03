import { describe, it, expect } from 'vitest';
import {
  parseNumber, parseMagnitude, parseDirection, parseInstrument,
  normalizeInstrument, parseDateTime,
} from './parse';
import { looksLikeCashFlow, selectAdapter, splitTradeBlocks } from './adapters';
import { reconcileMoney, classifyResult } from './money';
import { matchTrade, findDuplicateByRef } from './match';
import { parseBrokerText, buildResultUpdate } from './index';

// ── primitives: numbers ────────────────────────────────────────────────────────
describe('parseNumber', () => {
  it('parses plain, thousands and signed numbers', () => {
    expect(parseNumber('1,234.56')).toBe(1234.56);
    expect(parseNumber('-1,234.56')).toBe(-1234.56);
    expect(parseNumber('+1240.50')).toBe(1240.5);
    expect(parseNumber('$1,000')).toBe(1000);
  });
  it('treats accounting parentheses as negative', () => {
    expect(parseNumber('(1,234.56)')).toBe(-1234.56);
    expect(parseNumber('(75.00)')).toBe(-75);
  });
  it('handles unicode minus and european decimals', () => {
    expect(parseNumber('−500.25')).toBe(-500.25);
    expect(parseNumber('1.234,56')).toBe(1234.56);
    expect(parseNumber('1240,50')).toBe(1240.5);
  });
  it('returns null when there is no number', () => {
    expect(parseNumber('n/a')).toBeNull();
    expect(parseNumber('')).toBeNull();
    expect(parseNumber(null)).toBeNull();
  });
  it('parseMagnitude is always non-negative', () => {
    expect(parseMagnitude('-7.00')).toBe(7);
    expect(parseMagnitude('(12.5)')).toBe(12.5);
  });
});

// ── primitives: direction / instrument ─────────────────────────────────────────
describe('direction & instrument', () => {
  it('normalises directions including long/short', () => {
    expect(parseDirection('Buy')).toBe('BUY');
    expect(parseDirection('SELL')).toBe('SELL');
    expect(parseDirection('long')).toBe('BUY');
    expect(parseDirection('Short')).toBe('SELL');
    expect(parseDirection('hold')).toBeNull();
  });
  it('extracts FX pairs, metals, crypto and indices', () => {
    expect(parseInstrument('EUR/USD')).toBe('EUR/USD');
    expect(parseInstrument('eurusd')).toBe('EUR/USD');
    expect(parseInstrument('GBP-JPY closed')).toBe('GBP/JPY');
    expect(parseInstrument('XAUUSD')).toBe('XAUUSD');
    expect(parseInstrument('BTCUSD')).toBe('BTCUSD');
    expect(parseInstrument('Traded US30 today')).toBe('US30');
    expect(parseInstrument('Symbol: AAPL')).toBe('AAPL');
  });
  it('normalizeInstrument collapses separators/case', () => {
    expect(normalizeInstrument('EUR/USD')).toBe('EURUSD');
    expect(normalizeInstrument('eur-usd')).toBe('EURUSD');
    expect(normalizeInstrument('US 30')).toBe('US30');
  });
});

// ── primitives: dates ──────────────────────────────────────────────────────────
describe('parseDateTime', () => {
  it('parses ISO and MetaTrader formats', () => {
    expect(parseDateTime('2026-01-15T14:30:00Z')).toBe('2026-01-15T14:30:00.000Z');
    expect(parseDateTime('2026.01.15 14:30:00')).toBe('2026-01-15T14:30:00.000Z');
  });
  it('parses day-first slashes and named months', () => {
    expect(parseDateTime('15/01/2026 14:30')).toBe('2026-01-15T14:30:00.000Z');
    expect(parseDateTime('15 Jan 2026 14:30')).toBe('2026-01-15T14:30:00.000Z');
  });
  it('uses the unambiguous number as the day', () => {
    // 15 can only be a day → month is 01.
    expect(parseDateTime('01/15/2026')).toBe('2026-01-15T00:00:00.000Z');
  });
  it('returns null for junk', () => {
    expect(parseDateTime('yesterday')).toBeNull();
    expect(parseDateTime('')).toBeNull();
  });
});

// ── money reconciliation ───────────────────────────────────────────────────────
describe('reconcileMoney', () => {
  it('derives net from gross and fees', () => {
    expect(reconcileMoney({ grossPnl: 100, fees: 7 })).toEqual({ grossPnl: 100, fees: 7, netPnl: 93, result: 'win' });
  });
  it('derives gross from net and fees', () => {
    expect(reconcileMoney({ netPnl: 93, fees: 7 })).toEqual({ grossPnl: 100, fees: 7, netPnl: 93, result: 'win' });
  });
  it('classifies a loss from a negative sign', () => {
    expect(reconcileMoney({ grossPnl: -250, fees: 5 })).toEqual({ grossPnl: -250, fees: 5, netPnl: -255, result: 'loss' });
  });
  it('treats zero as breakeven and missing fee as unknown', () => {
    const r = reconcileMoney({ grossPnl: 0 });
    expect(r.result).toBe('breakeven');
    expect(r.fees).toBeNull();
    expect(r.netPnl).toBe(0);
  });
  it('returns nulls when there is no money at all', () => {
    expect(reconcileMoney({})).toEqual({ grossPnl: null, fees: null, netPnl: null, result: null });
  });
  it('classifyResult keys off the sign only', () => {
    expect(classifyResult(5)).toBe('win');
    expect(classifyResult(-5)).toBe('loss');
    expect(classifyResult(0)).toBe('breakeven');
    expect(classifyResult(null)).toBeNull();
  });
});

// ── cash-flow guard ────────────────────────────────────────────────────────────
describe('looksLikeCashFlow', () => {
  it('flags deposits, withdrawals and balances', () => {
    expect(looksLikeCashFlow('Deposit 1,000.00')).toBe(true);
    expect(looksLikeCashFlow('Withdrawal -500')).toBe(true);
    expect(looksLikeCashFlow('Balance: 10,240.00')).toBe(true);
    expect(looksLikeCashFlow('Buy EURUSD profit 120')).toBe(false);
  });

  it('never reports a deposit line as trade profit', () => {
    const { trades, warnings } = parseBrokerText('Deposit: 5,000.00 to account');
    expect(trades).toHaveLength(0);
    expect(warnings.join(' ')).toMatch(/deposit|withdrawal|balance/i);
  });
});

// ── generic adapter, single trade ──────────────────────────────────────────────
describe('parseBrokerText — generic single trade', () => {
  const text = [
    'Symbol: EUR/USD',
    'Type: Sell',
    'Volume: 1.00',
    'Open Price: 1.2600',
    'Close Price: 1.2500',
    'Open Time: 2026-01-15 09:00:00',
    'Close Time: 2026-01-15 14:30:00',
    'Commission: -7.00',
    'Profit: 1000.00',
    'Ticket: 55512345',
  ].join('\n');

  it('extracts all labelled fields with high confidence', () => {
    const { trades } = parseBrokerText(text);
    expect(trades).toHaveLength(1);
    const { fields, money } = trades[0];
    expect(fields.instrument.value).toBe('EUR/USD');
    expect(fields.direction.value).toBe('SELL');
    expect(fields.positionSize.value).toBe(1);
    expect(fields.entryPrice.value).toBe(1.26);
    expect(fields.exitPrice.value).toBe(1.25);
    expect(fields.brokerRef.value).toBe('55512345');
    expect(fields.openedAt.value).toBe('2026-01-15T09:00:00.000Z');
  });

  it('treats profit as gross when a fee is listed, and nets it', () => {
    const { trades } = parseBrokerText(text);
    expect(trades[0].money).toEqual({ grossPnl: 1000, fees: 7, netPnl: 993, result: 'win' });
  });
});

// ── loss detection ─────────────────────────────────────────────────────────────
describe('loss import', () => {
  it('records a negative P/L as a loss', () => {
    const { trades } = parseBrokerText('GBPUSD sell\nP/L: (250.00)\nOrder 999');
    expect(trades[0].money.result).toBe('loss');
    expect(trades[0].money.netPnl).toBe(-250);
  });
});

// ── MetaTrader adapter + multi-trade ───────────────────────────────────────────
describe('MetaTrader statement', () => {
  const rows = [
    '12345678 2026.01.15 14:30:00 buy 1.00 eurusd 1.2500 1.2600 -7.00 0.00 100.00',
    '12345679 2026.01.16 10:00:00 sell 0.50 gbpjpy 190.50 190.00 -3.50 0.00 -50.00',
  ].join('\n');

  it('is selected over generic and yields one trade per row', () => {
    expect(selectAdapter(rows).adapter.id).toBe('metatrader');
    const { adapter, trades } = parseBrokerText(rows);
    expect(adapter).toBe('metatrader');
    expect(trades).toHaveLength(2);
    expect(trades[0].fields.instrument.value).toBe('EUR/USD');
    expect(trades[0].fields.direction.value).toBe('BUY');
    expect(trades[0].money.result).toBe('win');
    expect(trades[1].money.result).toBe('loss');
    expect(trades[1].fields.brokerRef.value).toBe('12345679');
  });
});

describe('splitTradeBlocks', () => {
  it('splits multiple one-line trades', () => {
    const blocks = splitTradeBlocks('Buy EURUSD +100\nSell GBPUSD -50');
    expect(blocks).toHaveLength(2);
  });
  it('keeps a single labelled trade as one block', () => {
    const blocks = splitTradeBlocks('Symbol: EURUSD\nType: Buy\nProfit: 100');
    expect(blocks).toHaveLength(1);
  });
  it('drops cash-flow lines', () => {
    const blocks = splitTradeBlocks('Deposit 1000\nWithdrawal 200');
    expect(blocks.join('')).not.toMatch(/buy|sell/i);
  });
});

// ── matching ───────────────────────────────────────────────────────────────────
describe('matchTrade', () => {
  const trade = { instrument: 'EUR/USD', direction: 'SELL', entry_price: 1.26, created_at: '2026-01-15T09:00:00Z' };

  it('scores an exact match as strong', () => {
    const { trades } = parseBrokerText('Symbol: EURUSD\nType: Sell\nEntry: 1.2600\nOpen Time: 2026-01-15 09:00:00\nProfit: 100');
    const m = matchTrade(trades[0].fields, trade);
    expect(m.level).toBe('strong');
    expect(m.mismatches).toHaveLength(0);
  });

  it('flags a different instrument as a mismatch', () => {
    const { trades } = parseBrokerText('Symbol: GBPUSD\nType: Sell\nEntry: 1.2600\nProfit: 100');
    const m = matchTrade(trades[0].fields, trade);
    expect(m.mismatches.some(x => x.field === 'instrument')).toBe(true);
    expect(m.level).not.toBe('strong');
  });

  it('flags a wrong direction', () => {
    const { trades } = parseBrokerText('Symbol: EURUSD\nType: Buy\nEntry: 1.2600\nProfit: 100');
    const m = matchTrade(trades[0].fields, trade);
    expect(m.mismatches.some(x => x.field === 'direction')).toBe(true);
  });
});

// ── duplicate detection ────────────────────────────────────────────────────────
describe('findDuplicateByRef', () => {
  const existing = [
    { id: 'a', broker_ref: '12345678' },
    { id: 'b', broker_ref: null },
  ];
  it('finds a clashing reference', () => {
    expect(findDuplicateByRef('12345678', existing)?.id).toBe('a');
    expect(findDuplicateByRef('12345678', existing, 'a')).toBeNull(); // same trade, not a clash
  });
  it('is case/space insensitive and null-safe', () => {
    expect(findDuplicateByRef(' 12345678 ', existing)?.id).toBe('a');
    expect(findDuplicateByRef(null, existing)).toBeNull();
    expect(findDuplicateByRef('99999', existing)).toBeNull();
  });
});

// ── save payload ───────────────────────────────────────────────────────────────
describe('buildResultUpdate', () => {
  it('produces consistent signed columns with net = gross − fees', () => {
    const u = buildResultUpdate({ grossPnl: 100, fees: 7, entryPrice: '1.25', brokerRef: 42, source: 'screenshot' });
    expect(u.gross_pnl).toBe(100);
    expect(u.net_pnl).toBe(93);
    expect(u.pnl).toBe(93);
    expect(u.result).toBe('win');
    expect(u.entry_price).toBe(1.25);
    expect(u.broker_ref).toBe('42');
    expect(u.import_source).toBe('screenshot');
  });
  it('keeps a loss negative and omits screenshot when not given', () => {
    const u = buildResultUpdate({ netPnl: -255, fees: 5 });
    expect(u.net_pnl).toBe(-255);
    expect(u.result).toBe('loss');
    expect('screenshot_url' in u).toBe(false);
  });
});
