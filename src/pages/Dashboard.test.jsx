import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/api/base44Client', () => ({ base44: { entities: {} } }));

const Dashboard = (await import('./Dashboard')).default;

const activeSeed = {
  'EUR/USD': {
    instrument: 'EUR/USD',
    analysisId: 'EUR/USD-2026-01-01-100000-abcd12',
    inputs: { day: { close: 1, macd: 1, rsi: 1, boli: 1 } },
    extraCheck: { h1: null, m15: null },
    timestamp: '2026-01-01T10:00:00.000Z',
  },
};

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('primebias_active', JSON.stringify(activeSeed));
});

const card = (instrument) => ({
  instrument,
  analysisId: `${instrument}-2026-01-01-100000-abcd12`,
  inputs: { day: { close: 1, macd: 1, rsi: 1, boli: 1 } },
  extraCheck: { h1: null, m15: null },
  timestamp: '2026-01-01T10:00:00.000Z',
});

describe('Dashboard — Summary follows the favourite-instrument order', () => {
  it('renders cards in the saved pill order, not insertion order', async () => {
    localStorage.setItem('primebias_active', JSON.stringify({
      'EUR/USD': card('EUR/USD'),
      'US30': card('US30'),
      'XAU/USD': card('XAU/USD'),
    }));
    localStorage.setItem('primebias_instrument_order', JSON.stringify(['US30', 'XAU/USD', 'EUR/USD']));

    renderDashboard();
    await screen.findByText('US30');

    const names = ['EUR/USD', 'US30', 'XAU/USD'].map((name) => ({ name, el: screen.getByText(name) }));
    names.sort((a, b) =>
      a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    );
    expect(names.map((n) => n.name)).toEqual(['US30', 'XAU/USD', 'EUR/USD']);
  });
});

describe('Dashboard — Status is a labelled Summary row', () => {
  it('shows STATUS beside the canonical engine status on each card', async () => {
    renderDashboard();
    await screen.findByText('EUR/USD');

    expect(screen.getByText('Status')).toBeInTheDocument();
    // The seeded day-only case resolves to the canonical status value rendered
    // by the card; this guards against reverting to an unlabelled badge.
    expect(screen.getByText(/^(No|NO|YES|Wait|Extended|Scalp)$/)).toBeInTheDocument();
  });
});

describe('Dashboard — Extended caution pill on the summary card', () => {
  const strongBuy = {
    month: { close: 1, macd: 1, rsi: 1, boli: 1 },
    week:  { close: 1, macd: 1, rsi: 1, boli: 1 },
    day:   { close: 1, macd: 1, rsi: 1, boli: 1 },
    h4:    { close: 1, macd: 1, rsi: 1, boli: 1 },
    h1:    { close: 1, macd: 1, rsi: 1, boli: 1 },
    m15:   { close: 1, macd: 1, rsi: 1, boli: 1 },
    m5:    { close: 1, macd: 1, rsi: 1, boli: 1 },
  };

  it('shows the amber CAUTION pill for an Extended/F card, but not for a normal one', async () => {
    localStorage.setItem('primebias_active', JSON.stringify({
      'GBP/JPY': { ...card('GBP/JPY'), inputs: strongBuy },
      'EUR/USD': card('EUR/USD'),
    }));

    renderDashboard();
    await screen.findByText('GBP/JPY');

    const pills = screen.getAllByText(/caution/i);
    expect(pills).toHaveLength(1);
    expect(pills[0].className).toMatch(/amber/);
    expect(pills[0].className).not.toMatch(/red|destructive/);
  });
});

describe('Dashboard — clear all requires confirmation', () => {
  it('does not clear until confirmed, and cancelling makes no change', async () => {
    const user = userEvent.setup();
    renderDashboard();

    expect(await screen.findByText('EUR/USD')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear all analyses' }));
    expect(await screen.findByText('Clear all analyses?')).toBeInTheDocument();
    expect(localStorage.getItem('primebias_active')).not.toBeNull();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByText('Clear all analyses?')).not.toBeInTheDocument());
    expect(JSON.parse(localStorage.getItem('primebias_active'))).toEqual(activeSeed);
  });

  it('clears the analyses when confirmed', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByText('EUR/USD');

    await user.click(screen.getByRole('button', { name: 'Clear all analyses' }));
    await screen.findByText('Clear all analyses?');
    await user.click(screen.getByRole('button', { name: 'Clear all' }));

    await waitFor(() => expect(localStorage.getItem('primebias_active')).toBeNull());
  });
});
