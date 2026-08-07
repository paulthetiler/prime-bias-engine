import { createClient } from '@supabase/supabase-js';
import { buildStrengthSnapshot, STRENGTH_SYMBOLS } from '../src/lib/currencyStrength.js';

const TWELVE_DATA_URL = 'https://api.twelvedata.com/time_series';
const INTERVAL = '15min';
const OUTPUT_SIZE = 120;
const WINDOW_BARS = { '1h': 4, '4h': 16, '24h': 96 };
const CACHE_MS = 15 * 60 * 1000;
const CACHE_SECONDS = Math.floor(CACHE_MS / 1000);
const REFRESH_LEASE_SECONDS = 120;
const WAIT_FOR_SHARED_REFRESH_MS = 8000;
const WAIT_STEP_MS = 400;

let memoryCache = null;
let inFlight = null;

function json(res, status, body) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=900');
  return res.json(body);
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function isFresh(fetchedAt) {
  const time = fetchedAt ? new Date(fetchedAt).getTime() : NaN;
  return Number.isFinite(time) && Date.now() - time < CACHE_MS;
}

async function readSharedCache(supabase) {
  const { data, error } = await supabase
    .from('currency_strength_cache')
    .select('payload,fetched_at,refresh_started_at')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function claimSharedRefresh(supabase) {
  const { data, error } = await supabase.rpc('claim_currency_strength_refresh', {
    p_max_age_seconds: CACHE_SECONDS,
    p_lease_seconds: REFRESH_LEASE_SECONDS,
  });
  if (error) throw error;
  return data === true;
}

async function releaseSharedRefresh(supabase) {
  const { error } = await supabase
    .from('currency_strength_cache')
    .update({ refresh_started_at: null, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) console.error('Unable to release currency-strength refresh lease:', error.message);
}

async function persistSharedSnapshot(supabase, body) {
  const fetchedAt = body.fetchedAt || new Date().toISOString();
  const { error: cacheError } = await supabase
    .from('currency_strength_cache')
    .update({
      payload: body,
      fetched_at: fetchedAt,
      refresh_started_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1);
  if (cacheError) throw cacheError;

  // History is deliberately append-only. It gives us genuine rank movement later
  // instead of permanently comparing unlike lookback windows (Today vs 4H).
  const { error: historyError } = await supabase
    .from('currency_strength_history')
    .insert({ fetched_at: fetchedAt, payload: body });
  if (historyError) console.error('Unable to store currency-strength history:', historyError.message);
}

async function waitForSharedSnapshot(supabase) {
  const deadline = Date.now() + WAIT_FOR_SHARED_REFRESH_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, WAIT_STEP_MS));
    const shared = await readSharedCache(supabase);
    if (shared?.payload && isFresh(shared.fetched_at)) return shared;
  }
  return readSharedCache(supabase);
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

  // Fastest path inside a warm Vercel instance.
  if (memoryCache && Date.now() - memoryCache.fetchedAt < CACHE_MS) {
    return json(res, 200, { ...memoryCache.body, cached: true, cache: 'memory' });
  }

  const supabase = getSupabaseAdmin();

  // Until the SQL/service-role env is installed, retain the existing behaviour so
  // deployment is non-breaking. Once configured, Supabase becomes the authority.
  if (!supabase) {
    if (!inFlight) {
      inFlight = buildBody(apiKey)
        .then((body) => {
          memoryCache = { fetchedAt: Date.now(), body };
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

  let shared;
  try {
    shared = await readSharedCache(supabase);
    if (shared?.payload && isFresh(shared.fetched_at)) {
      memoryCache = { fetchedAt: new Date(shared.fetched_at).getTime(), body: shared.payload };
      return json(res, 200, { ...shared.payload, cached: true, cache: 'supabase' });
    }
  } catch (error) {
    console.error('Unable to read shared currency-strength cache:', error.message);
    return json(res, 500, { error: 'Currency strength cache is not configured correctly in Supabase' });
  }

  let claimed = false;
  try {
    claimed = await claimSharedRefresh(supabase);
  } catch (error) {
    console.error('Unable to claim currency-strength refresh:', error.message);
    return json(res, 500, { error: 'Currency strength refresh lock is not configured correctly in Supabase' });
  }

  // Another user/instance already owns the refresh. Wait briefly for their result
  // and serve it instead of spending another Twelve Data request.
  if (!claimed) {
    try {
      const refreshed = await waitForSharedSnapshot(supabase);
      if (refreshed?.payload) {
        memoryCache = { fetchedAt: new Date(refreshed.fetched_at).getTime(), body: refreshed.payload };
        return json(res, 200, {
          ...refreshed.payload,
          cached: true,
          stale: !isFresh(refreshed.fetched_at),
          cache: 'supabase',
        });
      }
      return json(res, 503, { error: 'Currency strength is refreshing. Try again in a few seconds.' });
    } catch (error) {
      return json(res, 500, { error: 'Unable to read refreshed currency-strength data' });
    }
  }

  try {
    const body = await buildBody(apiKey);
    await persistSharedSnapshot(supabase, body);
    memoryCache = { fetchedAt: Date.now(), body };
    return json(res, 200, { ...body, cache: 'supabase' });
  } catch (error) {
    await releaseSharedRefresh(supabase);

    // If Twelve Data has a temporary problem, prefer the last known shared reading
    // over blanking the page. Make the staleness explicit to the UI/API consumer.
    if (shared?.payload) {
      return json(res, 200, {
        ...shared.payload,
        cached: true,
        stale: true,
        cache: 'supabase',
        warning: error?.message || 'Unable to refresh currency-strength data',
      });
    }
    return json(res, error?.status || 502, { error: error?.message || 'Unable to fetch currency-strength data' });
  }
}
