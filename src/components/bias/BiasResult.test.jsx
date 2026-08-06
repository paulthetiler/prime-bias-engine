import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import BiasResult from './BiasResult';

// Minimal result shapes — the card is a pure presentational component.
const base = {
  mainDirection: 'BUY', tradeAction: 'BUY',
  deepTrend: 'BULL', deepStrength: 'STRONG',
  ddBias: 'BUY', ddStrength: 'STRONG',
  nowBias: 'BUY', nowStrength: 'STRONG',
  winningScore: 95, warnings: [], targetNote: 'GOOD BUY',
  extraCheckConfirmation: 'NOT_CHECKED',
};

const extendedResult = { ...base, status: 'Extended', grade: 'F', gradeLabel: 'Extended' };
const readyResult = { ...base, status: 'Ready', grade: 'B', gradeLabel: 'Good', tradeAction: 'TRADE', winningScore: 55 };

describe('BiasResult — Extended caution pill', () => {
  it('shows an amber CAUTION pill next to the EXTENDED status (not a danger state)', () => {
    render(<BiasResult results={extendedResult} settings={{}} />);
    // "Extended" shows as both the status badge and the grade sub-label.
    expect(screen.getAllByText('Extended').length).toBeGreaterThan(0);
    const caution = screen.getByText(/caution/i);
    expect(caution).toBeInTheDocument();
    // Amber, never red.
    expect(caution.className).toMatch(/amber/);
    expect(caution.className).not.toMatch(/red|destructive/);
    // The Action must remain the directional BUY — the pill never blocks it.
    expect(screen.getAllByText('BUY').length).toBeGreaterThan(0);
    // Explanatory tooltip is present and reassures it is a valid setup.
    expect(caution.getAttribute('title')).toMatch(/valid setup/i);
  });

  it('does NOT show the caution pill for a normal (non-extended) result', () => {
    render(<BiasResult results={readyResult} settings={{}} />);
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.queryByText(/caution/i)).not.toBeInTheDocument();
  });
});
