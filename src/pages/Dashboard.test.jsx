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

describe('Dashboard — clear all requires confirmation', () => {
  it('does not clear until confirmed, and cancelling makes no change', async () => {
    const user = userEvent.setup();
    renderDashboard();

    // The seeded analysis is visible.
    expect(await screen.findByText('EUR/USD')).toBeInTheDocument();

    // Click the clear (trash) button → confirmation appears, nothing cleared yet.
    await user.click(screen.getByRole('button', { name: 'Clear all analyses' }));
    expect(await screen.findByText('Clear all analyses?')).toBeInTheDocument();
    expect(localStorage.getItem('primebias_active')).not.toBeNull();

    // Cancel → storage intact.
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
    // The confirm action button inside the dialog.
    await user.click(screen.getByRole('button', { name: 'Clear all' }));

    await waitFor(() => expect(localStorage.getItem('primebias_active')).toBeNull());
  });
});
