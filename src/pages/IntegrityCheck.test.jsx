import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const me = vi.fn();
const listAccounts = vi.fn();
const listTxns = vi.fn();
const listTrades = vi.fn();

vi.mock('@/api/base44Client', () => ({
  base44: {
    auth: { me: (...a) => me(...a) },
    entities: {
      TradingAccount: { list: (...a) => listAccounts(...a) },
      AccountTransaction: { list: (...a) => listTxns(...a) },
      CompletedTrade: { list: (...a) => listTrades(...a) },
    },
  },
}));

const IntegrityCheck = (await import('./IntegrityCheck')).default;

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/admin/integrity']}>
        <IntegrityCheck />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  me.mockReset();
  listAccounts.mockReset().mockResolvedValue([{ id: 'acc-1', name: 'Main', currency: 'USD', starting_balance: 1000 }]);
  listTxns.mockReset().mockResolvedValue([]);
  listTrades.mockReset().mockResolvedValue([]);
});

describe('IntegrityCheck — admin access control', () => {
  it('an authorised admin can load the checker', async () => {
    me.mockResolvedValue({ email: 'admin@x.com', role: 'admin' });
    renderPage();
    expect(await screen.findByText(/Ledger integrity check/i)).toBeTruthy();
    // Protected data was fetched only for the admin.
    expect(listTrades).toHaveBeenCalled();
    expect(listAccounts).toHaveBeenCalled();
    expect(listTxns).toHaveBeenCalled();
  });

  it('a non-admin cannot load the data and sees the not-found behaviour', async () => {
    me.mockResolvedValue({ email: 'user@x.com' }); // no admin role
    // Even if trades existed, they must never be fetched or shown.
    listTrades.mockResolvedValue([{ id: 'ct-secret', instrument: 'EUR/USD', analysis_id: 'SEC-1', net_pnl: 5, status: 'completed' }]);
    renderPage();

    expect(await screen.findByText(/Page Not Found/i)).toBeTruthy();
    // No protected queries ran.
    expect(listTrades).not.toHaveBeenCalled();
    expect(listAccounts).not.toHaveBeenCalled();
    expect(listTxns).not.toHaveBeenCalled();
    // No report or identifiers leaked.
    expect(screen.queryByText(/Ledger integrity check/i)).toBeNull();
    expect(screen.queryByText(/ct-secret/)).toBeNull();
    expect(screen.queryByText(/ISSUES FOUND|no critical issues/i)).toBeNull();
  });

  it('while access is unresolved, protected queries do not run and no report shows', async () => {
    let resolveMe;
    me.mockReturnValue(new Promise((res) => { resolveMe = res; })); // never resolves during assertions
    renderPage();

    // Let microtasks flush; the auth query is still pending.
    await Promise.resolve();
    await Promise.resolve();

    expect(listTrades).not.toHaveBeenCalled();
    expect(listAccounts).not.toHaveBeenCalled();
    expect(listTxns).not.toHaveBeenCalled();
    expect(screen.queryByText(/Ledger integrity check/i)).toBeNull();
    expect(screen.queryByText(/Page Not Found/i)).toBeNull();

    resolveMe?.({ email: 'user@x.com' }); // cleanup
  });
});
