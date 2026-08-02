import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const filter = vi.fn();
const del = vi.fn();
const update = vi.fn();

vi.mock('@/api/base44Client', () => ({
  base44: {
    entities: {
      CompletedTrade: {
        filter: (...a) => filter(...a),
        delete: (...a) => del(...a),
        update: (...a) => update(...a),
      },
    },
  },
}));

// Avoid pulling recharts into the test.
vi.mock('@/components/history/PerformanceAnalytics', () => ({ default: () => null }));

const TradeHistory = (await import('./TradeHistory')).default;

const trade = {
  id: 'ct-1',
  instrument: 'EUR/USD',
  result: 'win',
  direction: 'BUY',
  grade: 'A',
  score: 80,
  status: 'completed',
  completed_at: '2026-01-01T10:00:00.000Z',
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TradeHistory />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  filter.mockReset().mockResolvedValue([trade]);
  del.mockReset().mockResolvedValue({ id: 'ct-1' });
  update.mockReset().mockResolvedValue({});
});

describe('TradeHistory — delete requires confirmation', () => {
  it('does not delete until the confirmation is accepted', async () => {
    const user = userEvent.setup();
    renderPage();

    // Open the trade detail.
    const row = await screen.findByRole('button', { name: /EUR\/USD/ });
    await user.click(row);

    // Click Delete in the detail — should open a confirmation, NOT delete yet.
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Delete this trade?')).toBeInTheDocument();
    expect(del).not.toHaveBeenCalled();

    // Confirm.
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(del).toHaveBeenCalledTimes(1));
    expect(del).toHaveBeenCalledWith('ct-1');
  });

  it('cancelling the confirmation makes no change', async () => {
    const user = userEvent.setup();
    renderPage();

    const row = await screen.findByRole('button', { name: /EUR\/USD/ });
    await user.click(row);
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Delete this trade?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByText('Delete this trade?')).not.toBeInTheDocument());
    expect(del).not.toHaveBeenCalled();
  });
});
