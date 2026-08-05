import { describe, it, expect, beforeEach } from 'vitest';
import {
  getInstrumentOrder,
  saveInstrumentOrder,
  orderAnalyses,
  hasSeenReorderHint,
  markReorderHintSeen,
} from './instrumentOrder';

const a = (instrument) => ({ instrument });

beforeEach(() => localStorage.clear());

describe('instrumentOrder — persistence', () => {
  it('returns an empty array when nothing is saved', () => {
    expect(getInstrumentOrder()).toEqual([]);
  });

  it('round-trips a saved order', () => {
    saveInstrumentOrder(['GBP/JPY', 'XAU/USD', 'US30']);
    expect(getInstrumentOrder()).toEqual(['GBP/JPY', 'XAU/USD', 'US30']);
  });

  it('sanitises non-string / malformed saved values', () => {
    localStorage.setItem('primebias_instrument_order', JSON.stringify(['GBP/JPY', 42, null, 'US30']));
    expect(getInstrumentOrder()).toEqual(['GBP/JPY', 'US30']);
  });

  it('never throws on corrupt JSON', () => {
    localStorage.setItem('primebias_instrument_order', '{not json');
    expect(getInstrumentOrder()).toEqual([]);
  });

  it('dispatches an event so listeners can react to a new order', () => {
    let fired = false;
    const onOrder = () => { fired = true; };
    window.addEventListener('instrumentOrderUpdated', onOrder);
    saveInstrumentOrder(['US30']);
    window.removeEventListener('instrumentOrderUpdated', onOrder);
    expect(fired).toBe(true);
  });
});

describe('orderAnalyses', () => {
  it('orders analyses by the saved order', () => {
    const order = ['US30', 'GBP/JPY', 'XAU/USD'];
    const analyses = [a('GBP/JPY'), a('XAU/USD'), a('US30')];
    expect(orderAnalyses(analyses, order).map((x) => x.instrument)).toEqual([
      'US30', 'GBP/JPY', 'XAU/USD',
    ]);
  });

  it('appends instruments not yet in the saved order, preserving their incoming order', () => {
    const order = ['US30'];
    const analyses = [a('GBP/JPY'), a('US30'), a('XAU/USD')];
    // US30 first (it's saved), then the two newcomers in the order they arrived.
    expect(orderAnalyses(analyses, order).map((x) => x.instrument)).toEqual([
      'US30', 'GBP/JPY', 'XAU/USD',
    ]);
  });

  it('ignores saved instruments that no longer have an analysis', () => {
    const order = ['NAS100', 'US30', 'GONE'];
    const analyses = [a('US30'), a('NAS100')];
    expect(orderAnalyses(analyses, order).map((x) => x.instrument)).toEqual(['NAS100', 'US30']);
  });

  it('reads the saved order from storage when none is passed', () => {
    saveInstrumentOrder(['XAU/USD', 'US30']);
    const analyses = [a('US30'), a('XAU/USD')];
    expect(orderAnalyses(analyses).map((x) => x.instrument)).toEqual(['XAU/USD', 'US30']);
  });

  it('is a no-op ordering when there is no saved order', () => {
    const analyses = [a('US30'), a('GBP/JPY')];
    expect(orderAnalyses(analyses, []).map((x) => x.instrument)).toEqual(['US30', 'GBP/JPY']);
  });
});

describe('reorder hint flag', () => {
  it('is unseen by default and sticks once marked', () => {
    expect(hasSeenReorderHint()).toBe(false);
    markReorderHintSeen();
    expect(hasSeenReorderHint()).toBe(true);
  });
});
