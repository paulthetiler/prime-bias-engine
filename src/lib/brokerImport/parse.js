// Field-level parsing primitives for broker imports.
//
// These are the small, pure building blocks every broker adapter shares:
// turning a scrap of broker text ("+1,240.50", "SELL", "EUR/USD",
// "2026.01.15 14:30") into a normalised value plus a confidence about how sure
// we are. Keeping them here — free of any adapter or React concern — means every
// adapter parses money, dates and directions identically, and the whole lot is
// trivially unit-testable.

/** The fields a broker import can populate, in review-screen order. */
export const FIELD_KEYS = /** @type {const} */ ([
  'instrument',
  'direction',
  'grossPnl',
  'fees',
  'netPnl',
  'entryPrice',
  'exitPrice',
  'positionSize',
  'openedAt',
  'closedAt',
  'brokerRef',
]);

/** Confidence buckets. The review UI highlights anything not `high`. */
export const CONFIDENCE = /** @type {const} */ ({ HIGH: 'high', MEDIUM: 'medium', LOW: 'low' });

/**
 * A single extracted field: its value and how confident the parser is. A `null`
 * value with `null` confidence means "not found" — the review screen flags it.
 * @param {any} value
 * @param {('high'|'medium'|'low')|null} [confidence]
 * @param {string} [raw] the original text the value came from (for the review UI)
 * @returns {{ value: any, confidence: ('high'|'medium'|'low')|null, raw: string|null }}
 */
export function field(value, confidence = null, raw = null) {
  const has = value !== null && value !== undefined && value !== '';
  return {
    value: has ? value : null,
    confidence: has ? (confidence || CONFIDENCE.LOW) : null,
    raw: raw ?? null,
  };
}

/** An extraction with every field empty. Adapters fill in what they find. */
export function emptyExtraction() {
  /** @type {Record<string, ReturnType<typeof field>>} */
  const fields = {};
  for (const k of FIELD_KEYS) fields[k] = field(null);
  return fields;
}

// ── Numbers & money ──────────────────────────────────────────────────────────

/**
 * Parse a human money/number string into a signed float. Understands:
 *   1,234.56   -1,234.56   (1,234.56)  [accounting negative]   +1 240,50 [EU]
 *   $1,234.56  1 234.56    −1,234.56   [unicode minus]
 * Returns null when there is no parseable number.
 * @param {any} raw
 * @returns {number|null}
 */
export function parseNumber(raw) {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (!s) return null;

  // Accounting negatives: (1,234.56) → negative.
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }

  // Unicode minus / leading sign.
  s = s.replace(/[−–—]/g, '-');
  if (/^-/.test(s.trim())) negative = true;

  // Drop currency symbols, letters (units like "lots", "USD"), spaces.
  s = s.replace(/[^0-9.,-]/g, '');
  if (!/[0-9]/.test(s)) return null;

  // Decide the decimal separator. If both "," and "." appear, the LAST one is
  // the decimal separator (handles both 1,234.56 and 1.234,56). If only ","
  // appears with exactly two trailing digits it's a decimal comma (1240,50).
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma !== -1) {
    const decimals = s.length - lastComma - 1;
    if (decimals === 3 && !/,\d{3}$/.test(s.replace(/^-/, '')) === false) {
      // Ambiguous "1,234" — treat comma as a thousands separator.
      s = s.replace(/,/g, '');
    } else if (decimals <= 2) {
      s = s.replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  }
  s = s.replace(/-/g, '');

  const n = parseFloat(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/** Non-negative magnitude, or null. Used for fees/size which are never signed. */
export function parseMagnitude(raw) {
  const n = parseNumber(raw);
  return n === null ? null : Math.abs(n);
}

// ── Direction ────────────────────────────────────────────────────────────────

/**
 * Normalise a direction token to 'BUY' or 'SELL' (long/short included), or null.
 * @param {any} raw
 * @returns {'BUY'|'SELL'|null}
 */
export function parseDirection(raw) {
  if (!raw) return null;
  const s = String(raw).toLowerCase();
  if (/\b(buy|long|bought|bull)\b/.test(s)) return 'BUY';
  if (/\b(sell|short|sold|bear)\b/.test(s)) return 'SELL';
  return null;
}

// ── Instrument ───────────────────────────────────────────────────────────────

// Common instruments so we can recognise a bare symbol on a busy line.
const KNOWN_INDICES = ['US30', 'US500', 'SPX500', 'NAS100', 'NAS', 'UK100', 'GER40', 'GER30', 'DE40', 'JP225', 'US100', 'US2000'];
const FX = 'AUD|CAD|CHF|EUR|GBP|JPY|NZD|USD|SGD|HKD|NOK|SEK|MXN|ZAR|TRY|CNH|PLN';

/**
 * Pull a trading instrument out of text. Recognises FX pairs (EUR/USD, EURUSD),
 * metals/crypto (XAUUSD, BTCUSD), named indices (US30, NAS100) and, as a last
 * resort, a labelled "Symbol: XYZ". Returns the raw symbol as written.
 * @param {any} raw
 * @returns {string|null}
 */
export function parseInstrument(raw) {
  if (!raw) return null;
  const s = String(raw);

  // FX pair with a separator: EUR/USD, GBP-JPY, USD_CHF.
  const sep = s.match(new RegExp(`\\b(${FX})[\\/\\-_. ]?(${FX})\\b`, 'i'));
  if (sep) return `${sep[1].toUpperCase()}/${sep[2].toUpperCase()}`;

  // Metals / crypto against a fiat: XAUUSD, XAGUSD, BTCUSD, ETHUSD.
  const commodity = s.match(new RegExp(`\\b(XAU|XAG|XPT|XPD|BTC|ETH|LTC|XRP|SOL|OIL|WTI|USOIL|UKOIL)[\\/\\-_. ]?(${FX})\\b`, 'i'));
  if (commodity) return `${commodity[1].toUpperCase()}${commodity[2].toUpperCase()}`;

  // Named indices.
  for (const idx of KNOWN_INDICES) {
    if (new RegExp(`\\b${idx}\\b`, 'i').test(s)) return idx.toUpperCase();
  }

  // Explicit label: "Symbol: AAPL", "Instrument - TSLA".
  const labelled = s.match(/\b(?:symbol|instrument|market|ticker)\b\s*[:\-]?\s*([A-Z][A-Z0-9./]{1,11})/i);
  if (labelled) return labelled[1].toUpperCase();

  return null;
}

/**
 * Canonical form for comparing two instrument strings: uppercase, separators and
 * whitespace removed. "EUR/USD", "eurusd" and "EUR-USD" all collapse to "EURUSD".
 * @param {any} raw
 * @returns {string}
 */
export function normalizeInstrument(raw) {
  return String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// ── Dates & times ────────────────────────────────────────────────────────────

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Parse a broker date/time into an ISO string, tolerant of the many formats
 * brokers use. Handles ISO, MetaTrader ("2026.01.15 14:30:00"), DMY and MDY
 * slashes, and "15 Jan 2026 14:30". Ambiguous day/month (both ≤ 12) is resolved
 * as day-first, the international default. Returns null when nothing parses.
 * @param {any} raw
 * @returns {string|null}
 */
export function parseDateTime(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // Native ISO (with a T or a date-only string).
  const iso = s.match(/\b(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (iso) return build(+iso[1], +iso[2] - 1, +iso[3], iso[4], iso[5], iso[6]);

  // MetaTrader: 2026.01.15 14:30:00
  const mt = s.match(/\b(\d{4})\.(\d{2})\.(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (mt) return build(+mt[1], +mt[2] - 1, +mt[3], mt[4], mt[5], mt[6]);

  // Named month: 15 Jan 2026 14:30  /  Jan 15, 2026 2:30
  const named = s.match(/\b(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})(?:[ ,]+(\d{1,2}):(\d{2}))?/)
    || s.match(/\b([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{4})(?:[ ,]+(\d{1,2}):(\d{2}))?/);
  if (named) {
    const dayFirst = /^\d/.test(named[1]);
    const mon = MONTHS[(dayFirst ? named[2] : named[1]).slice(0, 3).toLowerCase()];
    const day = +(dayFirst ? named[1] : named[2]);
    if (mon !== undefined) return build(+named[3], mon, day, named[4], named[5], null);
  }

  // Numeric slashes/dots: 15/01/2026 14:30  or  01/15/2026 2:30 PM
  const slash = s.match(/\b(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?/i);
  if (slash) {
    let a = +slash[1], b = +slash[2];
    const year = slash[3].length === 2 ? 2000 + +slash[3] : +slash[3];
    // If one number is clearly > 12 it must be the day; otherwise assume DMY.
    let day, mon;
    if (a > 12) { day = a; mon = b - 1; }
    else if (b > 12) { mon = a - 1; day = b; }
    else { day = a; mon = b - 1; }
    let hour = slash[4];
    if (hour != null && slash[7]) {
      const h = +hour % 12;
      hour = String(/pm/i.test(slash[7]) ? h + 12 : h);
    }
    return build(year, mon, day, hour, slash[5], slash[6]);
  }

  return null;
}

function build(y, mon, d, hh, mm, ss) {
  if (mon < 0 || mon > 11 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, mon, d, hh != null ? +hh : 0, mm != null ? +mm : 0, ss != null ? +ss : 0));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
