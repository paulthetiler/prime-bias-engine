// Broker-import public API.
//
// This is the only module the journal flow imports. It orchestrates the pieces:
//   paste text ─┐
//               ├─▶ selectAdapter ─▶ adapter.parse ─▶ [extractions]
//   screenshot ─┘        (OCR)                          │
//                                                        ▼
//                              reconcile money + flag uncertain/missing fields
//                                                        │
//                                                        ▼
//                                          { adapter, trades[], warnings[] }
//
// A "trade" here is the reviewable unit the UI renders: the extracted fields
// (each with a confidence), the reconciled money result, and which fields are
// missing or low-confidence so the review screen can highlight them.

import { FIELD_KEYS } from './parse';
import { selectAdapter, looksLikeCashFlow } from './adapters';
import { reconcileMoney } from './money';
import { extractTextFromImage } from './ocr';

export { matchTrade, findDuplicateByRef } from './match';
export { extractTextFromImage, setOcrEngine } from './ocr';
export { reconcileMoney, classifyResult } from './money';
export { FIELD_KEYS } from './parse';
export { ADAPTERS } from './adapters';

// Fields the review screen actively wants; a null here is "missing" and flagged.
const WANTED = ['instrument', 'direction', 'netPnl', 'grossPnl', 'entryPrice', 'closedAt'];

/**
 * Parse pasted broker text into reviewable trades.
 * @param {string} text
 * @returns {{ adapter: string, adapterLabel: string, source: string,
 *             text: string, trades: ImportedTrade[], warnings: string[] }}
 */
export function parseBrokerText(text, source = 'broker_text') {
  const raw = String(text || '').trim();
  if (!raw) {
    return { adapter: 'generic', adapterLabel: '', source, text: raw, trades: [], warnings: ['Nothing to read yet.'] };
  }

  const { adapter } = selectAdapter(raw);
  const extractions = adapter.parse(raw).filter(hasAnyData);
  const warnings = [];

  if (extractions.length === 0) {
    if (looksLikeCashFlow(raw) && !/\b(buy|sell|long|short)\b/i.test(raw)) {
      warnings.push('This looks like a deposit/withdrawal or balance line, not a trade.');
    } else {
      warnings.push("Couldn't recognise a trade in that text — check the format or enter it manually.");
    }
  }

  const trades = extractions.map(toImportedTrade);
  return { adapter: adapter.id, adapterLabel: adapter.label, source, text: raw, trades, warnings };
}

/**
 * Parse a screenshot: OCR to text, then the same pipeline as a paste.
 * @param {Blob} file
 * @param {(pct: number) => void} [onProgress]
 */
export async function extractFromImage(file, onProgress) {
  const text = await extractTextFromImage(file, onProgress);
  return parseBrokerText(text, 'screenshot');
}

/**
 * @typedef {Object} ImportedTrade
 * @property {Record<string, { value: any, confidence: string|null, raw: string|null }>} fields
 * @property {{ grossPnl: number|null, fees: number|null, netPnl: number|null, result: string|null }} money
 * @property {string[]} uncertain  field keys with less-than-high confidence
 * @property {string[]} missing    wanted field keys that came back empty
 */

/** Build the reviewable unit from a raw extraction. */
function toImportedTrade(fields) {
  const money = reconcileMoney({
    grossPnl: fields.grossPnl?.value,
    netPnl: fields.netPnl?.value,
    fees: fields.fees?.value,
  });

  const uncertain = FIELD_KEYS.filter(k => {
    const c = fields[k]?.confidence;
    return fields[k]?.value != null && c && c !== 'high';
  });
  const missing = WANTED.filter(k => {
    if (k === 'netPnl' || k === 'grossPnl') return money.netPnl == null && money.grossPnl == null;
    return fields[k]?.value == null;
  });
  // De-dupe the money "missing" (netPnl/grossPnl collapse to one concept).
  const missingClean = [...new Set(missing.map(k => (k === 'grossPnl' ? 'netPnl' : k)))];

  return { fields, money, uncertain, missing: missingClean };
}

/** True when an extraction found at least one usable field. */
function hasAnyData(fields) {
  return FIELD_KEYS.some(k => fields[k]?.value != null);
}

/**
 * Turn reviewed (possibly user-edited) values into a `completed_trade` update
 * payload. Only writes the financial result + execution facts + provenance; it
 * never overwrites the journal entry's own instrument/direction (those come from
 * the bias analysis). `net = gross − fees` is re-derived so the stored trio is
 * always internally consistent, and `pnl` is kept in sync for legacy readers.
 *
 * @param {{ grossPnl?: any, fees?: any, netPnl?: any, entryPrice?: any,
 *           exitPrice?: any, positionSize?: any, openedAt?: any, closedAt?: any,
 *           brokerRef?: any, source?: string, screenshotUrl?: string|null }} v
 * @returns {Record<string, any>}
 */
export function buildResultUpdate(v = {}) {
  const money = reconcileMoney({ grossPnl: v.grossPnl, netPnl: v.netPnl, fees: v.fees });
  const out = {
    gross_pnl: money.grossPnl,
    fees: money.fees,
    net_pnl: money.netPnl,
    pnl: money.netPnl,
    result: money.result ?? undefined,
    entry_price: numOrNull(v.entryPrice),
    exit_price: numOrNull(v.exitPrice),
    position_size: numOrNull(v.positionSize),
    opened_at: v.openedAt || null,
    closed_at: v.closedAt || null,
    broker_ref: v.brokerRef ? String(v.brokerRef) : null,
    import_source: v.source || 'manual',
  };
  if (v.screenshotUrl) out.screenshot_url = v.screenshotUrl;
  // Strip undefined so we never clobber a column we didn't mean to touch.
  Object.keys(out).forEach(k => out[k] === undefined && delete out[k]);
  return out;
}

function numOrNull(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
