import { buildStrengthSnapshot, STRENGTH_SYMBOLS } from '../src/lib/currencyStrength.js';

const TWELVE_DATA_URL = 'https://api.twelvedata.com/time_series';
const INTERVAL = '15min';
const OUTPUT_SIZE = 120;
const WINDOW_BARS = { '1h': 4, '4h': 16, '24h': 96 };
const CACHE_MS = 15 * 60 * 1000;

let cache = null;
let inFlight = null;

function json(res, status, body) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=900');
  return res.json(body);
}

function symbolPayload(payload, symbol) {
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
    const values = symbolPayload(payload, symbol)?.values;
    const to = closeAt(values, 0);
    const from = closeAt(values, barsAgo);
    if (to == null || from == null) { missing.push(symbol); continue; }
    pairPrices[symbol] = { from, to };
  }
  return { pairPrices, missing };
}

function dateKey(datetime) {
  const match = String(datetime || '').match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

function buildTodayPairPrices(payload) {
  const pairPrices = {};
  const missing = [];
  for (const symbol of STRENGTH_SYMBOLS) {
    const values = Array.isArray(symbolPayload(payload, symbol)?.values)
      ? symbolPayload(payload, symbol).values : [];
    const current = values[0];
    const currentDay = dateKey(current?.datetime);
    const todayBars = currentDay ? values.filter((bar) => dateKey(bar?.datetime) === currentDay) : [];
    const firstToday = todayBars.at(-1);
    const to = Number(current?.close);
    const from = Number(firstToday?.open);
    if (!Number.isFinite(to) || !Number.isFinite(from) || to <= 0 || from <= 0) {
      missing.push(symbol); continue;
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

  const response = await fetch(url, { headers: { Authorization: `apikey ${apiKey}` } });
  const payload = await response.json();
  if (!response.ok || payload?.status === 'error') {
    const error = new Error(payload?.message || `Twelve Data request failed (${response.status})`);
    error.status = response.status || 502;
    throw error;
  }
  return payload;
}

async function buildBody(apiKey) {
  const payload = await fetchTwelveData(apiKey);
  const windows = {};
  const warnings = [];

  for (const [window, barsAgo] of Object.entries(WINDOW_BARS)) {
    const { pairPrices, missing } = buildPairPrices(payload, barsAgo);
    windows[window] = buildStrengthSnapshot(pairPrices);
    if (missing.length) warnings.push(`${window}: missing ${missing.join(', ')}`);
  }

  const today = buildTodayPairPrices(payload);
  windows.today = buildStrengthSnapshot(today.pairPrices);
  if (today.missing.length) warnings.push(`today: missing ${today.missing.join(', ')}`);

  return {
    source: 'Twelve Data',
    methodology: '8-currency relative basket derived from 7 USD crosses using log returns',
    interval: INTERVAL,
    symbols: STRENGTH_SYMBOLS,
    fetchedAt: new Date().toISOString(),
    windows,
    warnings,
    informationalOnly: true,
    cached: false,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { error: 'Method not allowed' });
  }

  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) return json(res, 500, { error: 'TWELVE_DATA_API_KEY is not configured' });

  if (cache && Date.now() - cache.fetchedAt < CACHE_MS) {
    return json(res, 200, { ...cache.body, cached: true });
  }

  if (!inFlight) {
    inFlight = buildBody(apiKey)
      .then((body) => {
        cache = { fetchedAt: Date.now(), body };
        return body;
      })
      .finally(() => { inFlight = null; });
  }

  try {
    const body = await inFlight;
    return json(res, 200, body);
  } catch (error) {
    return json(res, error?.status || 502, { error: error?.message || 'Unable to fetch currency-strength data' });
  }
}
