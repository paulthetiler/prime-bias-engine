import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AssetQuickSwitch from './AssetQuickSwitch';
import { saveInstrumentOrder, markReorderHintSeen } from '@/lib/instrumentOrder';

const analysis = (instrument, tradeAction = 'TRADE') => ({
  instrument,
  results: { tradeAction, mainDirection: 'BUY' },
});

const ANALYSES = [analysis('GBP/JPY'), analysis('XAU/USD'), analysis('US30')];

beforeEach(() => localStorage.clear());

function renderSwitch(props = {}) {
  return render(
    <AssetQuickSwitch
      analyses={ANALYSES}
      currentInstrument="GBP/JPY"
      onInstrumentChange={() => {}}
      {...props}
    />,
  );
}

describe('AssetQuickSwitch', () => {
  it('renders nothing when there are no analyses', () => {
    const { container } = render(
      <AssetQuickSwitch analyses={[]} currentInstrument="" onInstrumentChange={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a pill per instrument', () => {
    renderSwitch();
    expect(screen.getByText('GBP/JPY')).toBeInTheDocument();
    expect(screen.getByText('XAU/USD')).toBeInTheDocument();
    expect(screen.getByText('US30')).toBeInTheDocument();
  });

  it('renders pills in the saved order', () => {
    saveInstrumentOrder(['US30', 'XAU/USD', 'GBP/JPY']);
    renderSwitch();
    const labels = screen.getAllByRole('button').map((b) => b.textContent);
    expect(labels[0]).toContain('US30');
    expect(labels[1]).toContain('XAU/USD');
    expect(labels[2]).toContain('GBP/JPY');
  });

  it('selects an instrument on a plain tap', async () => {
    const onInstrumentChange = vi.fn();
    const user = userEvent.setup();
    renderSwitch({ onInstrumentChange });
    await user.click(screen.getByText('US30'));
    expect(onInstrumentChange).toHaveBeenCalledWith('US30');
  });

  it('shows the one-time discovery hint when there are 2+ favourites and it has not been used', () => {
    renderSwitch();
    expect(screen.getByText(/long press and drag to reorder favourites/i)).toBeInTheDocument();
  });

  it('never shows the hint once the reorder gesture has been used', () => {
    markReorderHintSeen();
    renderSwitch();
    expect(screen.queryByText(/long press and drag to reorder favourites/i)).not.toBeInTheDocument();
  });

  it('does not show the hint with only one favourite (nothing to reorder)', () => {
    render(
      <AssetQuickSwitch
        analyses={[analysis('US30')]}
        currentInstrument="US30"
        onInstrumentChange={() => {}}
      />,
    );
    expect(screen.queryByText(/long press and drag to reorder favourites/i)).not.toBeInTheDocument();
  });
});
