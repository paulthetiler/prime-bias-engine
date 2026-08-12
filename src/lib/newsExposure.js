const FX_CURRENCIES = new Set(['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'NZD', 'CAD']);

const NEWS_EXPOSURE = {
  GOLDUSD: ['USD'],
  XAUUSD: ['USD'],
  SILVERUSD: ['USD'],
  XAGUSD: ['USD'],
  US30: ['USD'],
  DJ30: ['USD'],
  NAS100: ['USD'],
  NASDAQ: ['USD'],
  SPX500: ['USD'],
  SP500: ['USD'],
  DAX: ['EUR', 'USD'],
  DAX40: ['EUR', 'USD'],
  GER40: ['EUR', 'USD'],
  FTSE: ['GBP', 'USD'],
  FTSE100: ['GBP', 'USD'],
  UK100: ['GBP', 'USD'],
};

export function getNewsExposure(instrument) {
  const raw = String(instrument || '').toUpperCase().trim();
  const clean = raw.replace(/[^A-Z0-9]/g, '');

  if (NEWS_EXPOSURE[clean]) return NEWS_EXPOSURE[clean];

  const slashMatch = raw.match(/^([A-Z]{3})\s*\/\s*([A-Z]{3})$/);
  if (slashMatch) {
    const pair = [slashMatch[1], slashMatch[2]].filter(code => FX_CURRENCIES.has(code));
    if (pair.length) return [...new Set(pair)];
  }

  const compactMatch = clean.match(/^([A-Z]{3})([A-Z]{3})$/);
  if (compactMatch) {
    const pair = [compactMatch[1], compactMatch[2]].filter(code => FX_CURRENCIES.has(code));
    if (pair.length) return [...new Set(pair)];
  }

  return [];
}
