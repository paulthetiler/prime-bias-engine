import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const filter = vi.fn();
const acctList = vi.fn();
const txnList = vi.fn();
const monthlyList = vi.fn();

vi.mock('@/api/base44Client', () => ({
  base44: {
    entities: {
      CompletedTrade: { filter: (...a) => filter(...a) },
      TradingAccount: { list: (...a) => acctList(...a), create: vi.fn() },
      AccountTransaction: { list: (...a) => txnList(...a) },
      MonthlyJournal: { list: (...a) => monthlyList(...a) },
    },
  },
}));

const JournalStats = (await import('./JournalStats')).default;

const account = { id: 'acc-1', name: 'Main', currency: 'USD', starting_balance: 10000, archived_at: null };
const trade = (over = {}) => ({
  id: 'ct', instrument: 'EUR/USD', result: 'win', direction: 'BUY', grade: 'A', score: 80,
  status: 'completed', completed_at: '2026-01-10T10:00:00.000Z', account_id: 'acc-1', ...over,
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <JournalStats />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  acctList.mockReset().mockResolvedValue([account]);
  txnList.mockReset().mockResolvedValue([]);
  monthlyList.mockReset().mockResolvedValue([]);
  filter.mockReset();
});

describe('JournalStats — real financial model', () => {
  it('shows Net P/L from net_pnl and never the bogus planned Avg R:R', async () => {
    filter.mockResolvedValue([trade({ net_pnl: 200 }), trade({ net_pnl: 100, id: 'ct2' })]);
    renderPage();

    // The R stat is the real risk-based one, not the old bogus "planned" R:R.
    expect(await screen.findByText('Avg R')).toBeInTheDocument();
    expect(screen.queryByText(/planned/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/173\.9/)).not.toBeInTheDocument();
    // Net P/L renders the summed net result (+USD 300).
    expect(screen.getAllByText(/\+?USD\s*300\b/).length).toBeGreaterThan(0);
  });

  it('shows empty-state hints instead of fake values when no money/risk data exists', async () => {
    // A historic win with no monetary result recorded.
    filter.mockResolvedValue([trade({ net_pnl: null, pnl: null })]);
    renderPage();

    expect((await screen.findAllByText(/Add trade results to unlock this stat\./)).length).toBeGreaterThan(0);
    expect(screen.getByText(/Not enough risk data/)).toBeInTheDocument();
    // Win rate still computes (directional outcome preserved).
    expect(screen.getAllByText('100%').length).toBeGreaterThan(0);
  });
});
