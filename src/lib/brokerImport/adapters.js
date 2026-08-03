// Broker-import adapters.
//
// An adapter turns a lump of broker text (a pasted history, or the OCR of a
// screenshot) into one or more normalised trade extractions. Each adapter is
// self-contained and declares:
//
//   id      — stable machine name
//   label   — human name for the review screen ("Recognised as: MetaTrader")
//   detect(text) → 0..1  how strongly this adapter recognises the format
//   parse(text)  → Extraction[]  the trades it can pull out
//
// New brokers are added by writing another adapter object and registering it in
// ADAPTERS — the journal flow never has to change. `selectAdapter` picks the
// best-scoring adapter and `parseBrokerText` (see index.js) drives it.
//
// IMPORTANT: adapters must never report a deposit, withdrawal, transfer or
// account-balance line as trade profit. `looksLikeCashFlow` guards every P/L
// read, so a "Balance: 10,240.00" line can't masquerade as a +10,240 win.

import {
  CONFIDENCE, emptyExtraction, field,
  parseNumber, parseMagnitude, parseDirection, parseInstrument, parseDateTime,
} from './parse';

const { HIGH, MEDIUM } = CONFIDENCE;

/** Lines that describe money movements, not trades — never a P/L source. */
const CASHFLOW_RE = /\b(deposit|withdraw\w*|transfer|balance|credit|equity|free\s?margin|rollover\s?credit)\b/i;

/** True when a snippet is about account cash flow rather than a trade result. */
export function looksLikeCashFlow(text) {
  return CASHFLOW_RE.test(String(text || ''));
}

// Find the first value following any of the given labels on the same line.
// e.g. labelValue(text, ['profit','p/l','pnl']) → "+1,240.50"
function labelValue(text, labels) {
  const alt = labels.map(l => l.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')).join('|');
  const re = new RegExp(`(?:${alt})\\s*[:=\\-]?\\s*([^\\n\\r|,]*?[0-9][^\\n\\r|]*)`, 'i');
  const m = String(text).match(re);
  return m ? m[1].trim() : null;
}

function labelToken(text, labels) {
  const alt = labels.join('|');
  const re = new RegExp(`(?:${alt})\\s*[:=\\-]?\\s*([A-Za-z0-9][A-Za-z0-9./#-]*)`, 'i');
  const m = String(text).match(re);
  return m ? m[1].trim() : null;
}

// ── Generic adapter ────────────────────────────────────────────────────────────
// Label-driven: works on almost any "key: value" broker dump. Deliberately the
// lowest-confidence fallback so a specific adapter always wins when it matches.
const generic = {
  id: 'generic',
  label: 'Generic broker text',
  detect() { return 0.2; },
  parse(text) {
    return splitTradeBlocks(text).map(block => parseBlockGeneric(block));
  },
};

function parseBlockGeneric(block) {
  const ex = emptyExtraction();

  // Instrument — prefer a labelled symbol, else sniff the whole block.
  const instLabelled = labelToken(block, ['symbol', 'instrument', 'pair', 'market', 'ticker', 'security']);
  const inst = parseInstrument(instLabelled || '') || parseInstrument(block);
  if (inst) ex.instrument = field(inst, instLabelled ? HIGH : MEDIUM, instLabelled || inst);

  // Direction.
  const dirLabelled = labelToken(block, ['type', 'side', 'direction', 'action', 'order\\s?type']);
  const dir = parseDirection(dirLabelled) || parseDirection(block);
  if (dir) ex.direction = field(dir, dirLabelled ? HIGH : MEDIUM, dirLabelled || dir);

  // Money — never read cash-flow lines as P/L.
  readMoney(block, ex);

  // Prices.
  const entryRaw = labelValue(block, ['entry price', 'open price', 'price open', 'entry', 'opening price', 'open rate']);
  const exitRaw = labelValue(block, ['exit price', 'close price', 'price close', 'exit', 'closing price', 'close rate']);
  if (entryRaw) ex.entryPrice = field(parseNumber(entryRaw), HIGH, entryRaw);
  if (exitRaw) ex.exitPrice = field(parseNumber(exitRaw), HIGH, exitRaw);

  // Position size / volume.
  const sizeRaw = labelValue(block, ['size', 'volume', 'lots', 'lot', 'quantity', 'qty', 'units', 'contracts', 'amount']);
  if (sizeRaw && !looksLikeCashFlow(sizeRaw)) {
    const size = parseMagnitude(sizeRaw);
    if (size != null) ex.positionSize = field(size, MEDIUM, sizeRaw);
  }

  // Timestamps.
  const openRaw = labelValue(block, ['open time', 'open date', 'opened', 'entry time', 'entry date', 'date opened', 'time opened']);
  const closeRaw = labelValue(block, ['close time', 'close date', 'closed', 'exit time', 'exit date', 'date closed', 'time closed']);
  if (openRaw) ex.openedAt = field(parseDateTime(openRaw), HIGH, openRaw);
  if (closeRaw) ex.closedAt = field(parseDateTime(closeRaw), HIGH, closeRaw);

  // Broker reference (ticket / order / deal id, or a bare #12345).
  const refLabelled = labelToken(block, ['ticket', 'order', 'deal', 'trade\\s?id', 'position\\s?id', 'reference', 'ref', 'confirmation', 'transaction\\s?id']);
  const refHash = !refLabelled ? (String(block).match(/#\s?(\d{4,})/) || [])[1] : null;
  const ref = refLabelled || refHash;
  if (ref) ex.brokerRef = field(String(ref), refLabelled ? HIGH : MEDIUM, ref);

  return ex;
}

// Read gross / net / fees, skipping cash-flow lines. Generic "profit"/"p/l" is
// treated as gross when a separate fee is present (so net = gross − fees) and as
// net otherwise — matching how most statements list Profit alongside Commission.
function readMoney(block, ex) {
  const lines = String(block).split(/[\n\r]+/);
  const tradeLines = lines.filter(l => l.trim() && !looksLikeCashFlow(l));
  const scoped = tradeLines.join('\n') || block;

  const grossRaw = labelValue(scoped, ['gross profit', 'gross p/l', 'gross pnl', 'gross']);
  const netRaw = labelValue(scoped, ['net profit', 'net p/l', 'net pnl', 'net result', 'net']);
  const profitRaw = labelValue(scoped, ['profit', 'p/l', 'pnl', 'p&l', 'realized p/l', 'realised p/l', 'result', 'gain/loss', 'return']);

  const commission = parseNumber(labelValue(scoped, ['commission', 'comm', 'fees', 'fee', 'charges', 'brokerage']));
  const swap = parseNumber(labelValue(scoped, ['swap', 'rollover', 'financing', 'interest']));
  let fees = null;
  if (commission != null || swap != null) fees = Math.abs(commission || 0) + Math.abs(swap || 0);
  if (fees != null) ex.fees = field(fees, HIGH, labelValue(scoped, ['commission', 'swap', 'fees']) || String(fees));

  const gross = parseNumber(grossRaw);
  const net = parseNumber(netRaw);
  const generic = parseNumber(profitRaw);

  if (gross != null) ex.grossPnl = field(gross, HIGH, grossRaw);
  if (net != null) ex.netPnl = field(net, HIGH, netRaw);
  if (gross == null && net == null && generic != null) {
    if (fees != null) ex.grossPnl = field(generic, MEDIUM, profitRaw);
    else ex.netPnl = field(generic, MEDIUM, profitRaw);
  }
}

// ── MetaTrader adapter ─────────────────────────────────────────────────────────
// MT4/MT5 "History"/"Account Statement" rows are pipe/tab/space delimited:
//   Ticket   Open Time            Type  Size  Symbol   Open     ...  Close    Commission  Swap  Profit
//   12345678 2026.01.15 14:30:00  buy   1.00  eurusd   1.2500        1.2600   -7.00       0     100.00
const MT_ROW_RE = /^\s*(\d{6,})\s+(\d{4}\.\d{2}\.\d{2}[ T]\d{2}:\d{2}(?::\d{2})?)\s+(buy|sell)\s+([\d.]+)\s+([A-Za-z][A-Za-z0-9./]+)\s+([\d.]+)/i;

const metatrader = {
  id: 'metatrader',
  label: 'MetaTrader (MT4/MT5)',
  detect(text) {
    const lines = String(text).split(/[\n\r]+/);
    const rows = lines.filter(l => MT_ROW_RE.test(l)).length;
    if (rows === 0) return 0;
    return Math.min(0.95, 0.6 + rows * 0.1);
  },
  parse(text) {
    const out = [];
    for (const line of String(text).split(/[\n\r]+/)) {
      const m = line.match(MT_ROW_RE);
      if (!m || looksLikeCashFlow(line)) continue;
      const ex = emptyExtraction();
      ex.brokerRef = field(m[1], HIGH, m[1]);
      ex.openedAt = field(parseDateTime(m[2]), HIGH, m[2]);
      ex.direction = field(parseDirection(m[3]), HIGH, m[3]);
      ex.positionSize = field(parseMagnitude(m[4]), HIGH, m[4]);
      ex.instrument = field(parseInstrument(m[5]) || m[5].toUpperCase(), HIGH, m[5]);
      ex.entryPrice = field(parseNumber(m[6]), HIGH, m[6]);

      // The tail of the row carries close price, commission, swap and profit.
      // Numbers after the open price, in MT column order.
      const tail = line.slice(m.index + m[0].length);
      const nums = (tail.match(/-?\(?\d[\d,]*\.?\d*\)?/g) || []).map(parseNumber).filter(n => n != null);
      // Typical order: [closeTime is text], closePrice, sl, tp, commission, swap, profit.
      // We take the last number as profit and the close price as the first price-like value.
      if (nums.length) {
        const profit = nums[nums.length - 1];
        ex.grossPnl = field(profit, HIGH, String(profit));
        const closePrice = nums.find(n => Math.abs(n) > 0 && String(n).replace('-', '').length >= 3);
        if (closePrice != null && closePrice !== profit) ex.exitPrice = field(closePrice, MEDIUM, String(closePrice));
      }
      const closeTime = parseDateTime(tail);
      if (closeTime) ex.closedAt = field(closeTime, MEDIUM, closeTime);
      out.push(ex);
    }
    return out;
  },
};

/** Registry of known adapters, best-specific first. Add new brokers here. */
export const ADAPTERS = [metatrader, generic];

/**
 * Pick the highest-scoring adapter for a piece of text. Always returns one
 * (generic is the guaranteed fallback).
 * @param {string} text
 * @returns {{ adapter: typeof generic, score: number }}
 */
export function selectAdapter(text) {
  let best = generic, score = generic.detect(text);
  for (const a of ADAPTERS) {
    const s = a.detect(text);
    if (s > score) { best = a; score = s; }
  }
  return { adapter: best, score };
}

// ── Multi-trade splitting ──────────────────────────────────────────────────────

const TRADEISH_RE = /\b(buy|sell|long|short)\b/i;

/**
 * Break a free-text paste into one block per trade. When several lines each look
 * like their own trade (an instrument + a direction), each becomes a block;
 * otherwise the whole text is a single block. Cash-flow lines are dropped.
 * @param {string} text
 * @returns {string[]}
 */
export function splitTradeBlocks(text) {
  const lines = String(text).split(/[\n\r]+/);
  const tradeLines = lines.filter(l => {
    const t = l.trim();
    return t && !looksLikeCashFlow(t) && TRADEISH_RE.test(t) && parseInstrument(t);
  });
  if (tradeLines.length >= 2) return tradeLines;
  const joined = lines.filter(l => l.trim()).join('\n').trim();
  return joined ? [joined] : [];
}
