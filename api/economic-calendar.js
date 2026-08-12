const FF_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';

let cache = { fetchedAt: 0, events: [] };
const CACHE_MS = 60 * 60 * 1000;

function normaliseImpact(value) {
  const v = String(value || '').toLowerCase();
  if (v.includes('high')) return 'High';
  if (v.includes('medium') || v.includes('med')) return 'Medium';
  if (v.includes('low')) return 'Low';
  return value || 'Unknown';
}

export default async function handler(req, res) {
  try {
    const now = Date.now();
    if (!cache.events.length || now - cache.fetchedAt > CACHE_MS) {
      const response = await fetch(FF_URL, {
        headers: {
          'user-agent': 'PrimeBias/1.0',
          accept: 'application/json',
        },
      });
      if (!response.ok) throw new Error(`Forex Factory feed returned ${response.status}`);
      const raw = await response.json();
      cache = {
        fetchedAt: now,
        events: (Array.isArray(raw) ? raw : []).map((event, index) => ({
          id: `${event.country || 'NA'}-${event.date || ''}-${event.title || index}`,
          title: event.title || 'Economic event',
          country: event.country || '',
          date: event.date || '',
          impact: normaliseImpact(event.impact),
          forecast: event.forecast ?? null,
          previous: event.previous ?? null,
        })),
      };
    }

    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=3600');
    return res.status(200).json({ source: 'Forex Factory', events: cache.events });
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ source: 'Forex Factory', events: [], error: error.message });
  }
}
