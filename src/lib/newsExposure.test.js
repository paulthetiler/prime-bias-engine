import { describe, expect, it } from 'vitest';
import { getNewsExposure } from './newsExposure';

describe('getNewsExposure', () => {
  it('uses both currencies for FX pairs', () => {
    expect(getNewsExposure('GBP/USD')).toEqual(['GBP', 'USD']);
    expect(getNewsExposure('GBP/JPY')).toEqual(['GBP', 'JPY']);
  });

  it('maps metals to USD news', () => {
    expect(getNewsExposure('GOLD/USD')).toEqual(['USD']);
    expect(getNewsExposure('XAU/USD')).toEqual(['USD']);
  });

  it('maps Bitcoin to USD news', () => {
    expect(getNewsExposure('BITCOIN')).toEqual(['USD']);
    expect(getNewsExposure('BTC')).toEqual(['USD']);
    expect(getNewsExposure('BTC/USD')).toEqual(['USD']);
    expect(getNewsExposure('BTCUSD')).toEqual(['USD']);
  });

  it('maps indices to their configured exposures', () => {
    expect(getNewsExposure('DAX')).toEqual(['EUR', 'USD']);
    expect(getNewsExposure('NAS100')).toEqual(['USD']);
  });

  it('returns no exposure for unknown instruments', () => {
    expect(getNewsExposure('UNKNOWN')).toEqual([]);
  });
});
