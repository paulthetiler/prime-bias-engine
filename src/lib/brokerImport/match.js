// Matching an imported trade against the journal entry it is meant to complete,
// and guarding against importing the same broker trade twice.
//
// Matching is advisory, not a gate: we compute a confidence and a list of
// specific mismatches so the review screen can WARN ("this looks like a
// different trade") without blocking a user who knows better. Duplicate
// detection, by contrast, is a hard stop — the same broker reference must not be
// imported onto two journal entries.

import { normalizeInstrument } from './parse';

/** How close two prices must be (relative) to count as "the same entry". */
const PRICE_TOLERANCE = 0.0015; // 0.15%
/** How close two timestamps must be to count as the same trade. */
const TIME_TOLERANCE_MS = 36 * 60 * 60 * 1000; // 36h — brokers and journals drift

/**
 * Compare an extraction's values against a journal `completed_trade` row.
 * @param {Record<string, { value: any }>} fields  normalised extraction fields
 * @param {any} trade  the selected journal trade
 * @returns {{ score: number, level: 'strong'|'partial'|'weak',
 *             mismatches: { field: string, message: string }[],
 *             checked: string[] }}
 */
export function matchTrade(fields, trade) {
  if (!trade) return { score: 0, level: 'weak', mismatches: [], checked: [] };
  const mismatches = [];
  const checked = [];
  let points = 0;
  let possible = 0;

  // Instrument (weight 3).
  const exInst = fields.instrument?.value;
  if (exInst && trade.instrument) {
    possible += 3; checked.push('instrument');
    if (normalizeInstrument(exInst) === normalizeInstrument(trade.instrument)) points += 3;
    else mismatches.push({ field: 'instrument', message: `Screenshot shows ${exInst}, entry is ${trade.instrument}` });
  }

  // Direction (weight 2).
  const exDir = fields.direction?.value;
  if (exDir && trade.direction) {
    possible += 2; checked.push('direction');
    if (String(exDir).toUpperCase() === String(trade.direction).toUpperCase()) points += 2;
    else mismatches.push({ field: 'direction', message: `Screenshot shows ${exDir}, entry is ${trade.direction}` });
  }

  // Entry price (weight 2).
  const exEntry = num(fields.entryPrice?.value);
  const trEntry = num(trade.entry_price);
  if (exEntry != null && trEntry != null && trEntry !== 0) {
    possible += 2; checked.push('entry');
    if (Math.abs(exEntry - trEntry) / Math.abs(trEntry) <= PRICE_TOLERANCE) points += 2;
    else mismatches.push({ field: 'entryPrice', message: `Entry ${exEntry} differs from entry ${trEntry}` });
  }

  // Date/time (weight 2) — compare the import's open/close to the entry's dates.
  const exTime = firstTime([fields.openedAt?.value, fields.closedAt?.value]);
  const trTime = firstTime([trade.created_at, trade.completed_at, trade.created_date]);
  if (exTime != null && trTime != null) {
    possible += 2; checked.push('time');
    if (Math.abs(exTime - trTime) <= TIME_TOLERANCE_MS) points += 2;
    else mismatches.push({ field: 'time', message: 'Trade date is far from this journal entry' });
  }

  const score = possible === 0 ? 0 : points / possible;
  const level = possible === 0 ? 'weak' : score >= 0.8 ? 'strong' : score >= 0.5 ? 'partial' : 'weak';
  return { score, level, mismatches, checked };
}

/**
 * Find an existing trade that already carries this broker reference — i.e. the
 * import would be a duplicate. Comparison is case-insensitive and ignores the
 * trade currently being edited.
 * @param {string|null|undefined} brokerRef
 * @param {any[]} existingTrades
 * @param {string|null} [ignoreId]  the trade being completed (not a clash)
 * @returns {any|null} the clashing trade, or null
 */
export function findDuplicateByRef(brokerRef, existingTrades = [], ignoreId = null) {
  if (!brokerRef) return null;
  const key = String(brokerRef).trim().toLowerCase();
  if (!key) return null;
  return existingTrades.find(t =>
    t && t.id !== ignoreId && t.broker_ref != null &&
    String(t.broker_ref).trim().toLowerCase() === key
  ) || null;
}

function num(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function firstTime(candidates) {
  for (const c of candidates) {
    if (!c) continue;
    const t = new Date(c).getTime();
    if (Number.isFinite(t)) return t;
  }
  return null;
}
