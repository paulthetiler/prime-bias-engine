import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AssetDetailModal from './AssetDetailModal';

const baseResults = {
  mainDirection: 'BUY', tradeAction: 'BUY',
  deepTrend: 'BULL', deepStrength: 'STRONG',
  ddBias: 'BUY', ddStrength: 'STRONG',
  nowBias: 'BUY', nowStrength: 'STRONG',
  winningScore: 95, warnings: [], gradeLabel: 'Extended',
  extraCheckConfirmation: 'NOT_CHECKED',
};

const analysisWith = (results) => ({
  instrument: 'EUR/USD',
  results,
  targetInfo: { target: 12 },
});

const noop = () => {};

describe('AssetDetailModal — Extended caution pill', () => {
  it('shows the amber caution pill for an Extended / grade-F result', () => {
    render(
      <AssetDetailModal
        analysis={analysisWith({ ...baseResults, status: 'Extended', grade: 'F' })}
        onClose={noop}
        onEdit={noop}
        settings={{}}
      />,
    );
    const caution = screen.getByText(/caution/i);
    expect(caution.className).toMatch(/amber/);
    expect(caution.className).not.toMatch(/red|destructive/);
    expect(caution.getAttribute('title')).toMatch(/valid setup/i);
    // The directional Action tile is unaffected.
    expect(screen.getAllByText('BUY').length).toBeGreaterThan(0);
  });

  it('does not show the pill for a normal (non-extended) result', () => {
    render(
      <AssetDetailModal
        analysis={analysisWith({ ...baseResults, status: 'Ready', grade: 'B', gradeLabel: 'Good' })}
        onClose={noop}
        onEdit={noop}
        settings={{}}
      />,
    );
    expect(screen.queryByText(/caution/i)).not.toBeInTheDocument();
  });
});
