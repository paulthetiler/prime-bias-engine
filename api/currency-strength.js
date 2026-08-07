import { buildStrengthSnapshot, STRENGTH_SYMBOLS } from '../src/lib/currencyStrength.js';

const TWELVE_DATA_URL = 'https://api.twelvedata.com/time_series';
const INTERVAL = '15min';
const OUTPUT_SIZE = 100;
const WINDOW_BARS = { '1h': 4, '4h': 16, '24h': 96 };
const CACHE_MS = 15 * 60 * 1000;

let cache = null;

function json(res, status, body) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  return res.json(body);
}

function symbolPayload(payload, symbol) {
  // Twelve Data returns a keyed object for multi-symbol requests. Keep a small
  // fallback for a single-symbol-shaped response so this fails gracefully if
  // their response wrapper changes.
  return payload?.[symbol] ?? (payload?.meta?.symbol === symbol ? payload : null);
}

function closeAt(values, index) {
  const value = Number(values?.[index]?.close);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function buildPairPrices(payload, barsAgo) {
  const pairPrices = {};
  const missing = [];

  for (const symbol of STRENGTH_SYMBOLS) {
    const series = symbolPayload(payload, symbol);
    const values = series?.values;
    const to = closeAt(values, 0);
    const from = closeAt(values, barsAgo);

    if (to == null || from == null) {
      missing.push(symbol);
      continue;
    }

    pairPrices[symbol] = { from, to };
  }

  return { pairPrices, missing };
}

async function fetchTwelveData(apiKey) {
  const url = new URL(TWELVE_DATA_URL);
  url.searchParams.set('symbol', STRENGTH_SYMBOLS.join(','));
  url.searchParams.set('interval', INTERVAL);
  url.searchParams.set('outputsize', String(OUTPUT_SIZE));
  url.searchParams.set('order', 'desc');
  url.searchParams.set('timezone', 'UTC');

  const response = await fetch(url, {
    headers: { Authorization: `apikey ${apiKey}` },
  });

  const payload = await response.json();
  if (!response.ok || payload?.status === 'error') {
    const message = payload?.message || `Twelve Data request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status || 502;
    throw error;
  }

  return payload;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { error: 'Method not allowed' });
  }

  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) {
    return json(res, 500, { error: 'TWELVE_DATA_API_KEY is not configured' });
  }

  if (cache && Date.now() - cache.fetchedAt < CACHE_MS) {
    return json(res, 200, { ...cache.body, cached: true });
  }

  try {
    const payload = await fetchTwelveData(apiKey);
    const windows = {};
    const warnings = [];

    for (const [window, barsAgo] of Object.entries(WINDOW_BARS)) {
      const { pairPrices, missing } = buildPairPrices(payload, barsAgo);
      const snapshot = buildStrengthSnapshot(pairPrices);

      windows[window] = snapshot;
      if (missing.length) warnings.push(`${window}: missing ${missing.join(', ')}`);
    }

    const body = {
      source: 'Twelve Data',
      interval: INTERVAL,
      symbols: STRENGTH_SYMBOLS,
      fetchedAt: new Date().toISOString(),
      windows,
      warnings,
      // Explicit architectural contract: this endpoint is a scanner/selection
      // aid only and has no authority over Prime Bias trade decisions.
      informationalOnly: true,
      cached: false,
    };

    cache = { fetchedAt: Date.now(), body };
    return json(res, 200, body);
  } catch (error) {
    return json(res, error?.status || 502, {
      error: error?.message || 'Unable to fetch currency-strength data',
    });
  }
}
