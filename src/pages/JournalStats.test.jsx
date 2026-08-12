import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
const { CURRENT_ENGINE_VERSION } = await import('@/lib/engineConfig');

const account = { id: 'acc-1', name: 'Main', currency: 'USD', starting_balance: 10000, archived_at: null };
// Trades default to the CURRENT engine — that is what a freshly completed trade
// carries and what the Performance page counts. Legacy/obsolete records are
// opt-in via an explicit engine_version override.
const trade = (over = {}) => ({
  id: 'ct', instrument: 'EUR/USD', result: 'win', direction: 'BUY', grade: 'A', score: 80,
  status: 'completed', completed_at: '2026-01-10T10:00:00.000Z', account_id: 'acc-1',
  engine_version: CURRENT_ENGINE_VERSION, ...over,
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

// The page is now three tiers behind a tab bar (Summary / Deep dive / Account).
// Inactive tabs are unmounted, so each test opens the tier it inspects.
const openTab = async (user, name) => user.click(await screen.findByRole('button', { name }));

beforeEach(() => {
  acctList.mockReset().mockResolvedValue([account]);
  txnList.mockReset().mockResolvedValue([]);
  monthlyList.mockReset().mockResolvedValue([]);
  filter.mockReset();
});

describe('JournalStats — real financial model', () => {
  it('shows Net P/L from net_pnl and a real risk-based Avg R, never the bogus planned R:R', async () => {
    const user = userEvent.setup();
    filter.mockResolvedValue([
      trade({ net_pnl: 200, amount_risked: 100 }),
      trade({ net_pnl: 100, amount_risked: 100, id: 'ct2' }),
    ]);
    renderPage();

    // Net P/L renders the summed net result (+USD 300) on the glance summary.
    expect((await screen.findAllByText(/\+?USD\s*300\b/)).length).toBeGreaterThan(0);
    // The old bogus "planned" R:R (173.9) never appears anywhere.
    expect(screen.queryByText(/planned/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/173\.9/)).not.toBeInTheDocument();

    // Avg R is the real risk-based stat, and it lives in the Deep dive tier now.
    await openTab(user, 'Deep dive');
    expect(await screen.findByText('Avg R')).toBeInTheDocument();
  });

  it('renders muted em-dashes, not fake values or per-card unlock hints, when no money data exists', async () => {
    // A historic win with no monetary result recorded.
    filter.mockResolvedValue([trade({ net_pnl: null, pnl: null })]);
    renderPage();

    // Win rate still computes (directional outcome preserved).
    expect(await screen.findByText('Win Rate')).toBeInTheDocument();
    expect(screen.getAllByText('100%').length).toBeGreaterThan(0);
    // The verbose per-card "add trade results to unlock this stat" filler is gone.
    expect(screen.queryByText(/Add trade results to unlock this stat\./)).toBeNull();
    // Net P/L with no money shows a muted em-dash rather than a fabricated figure.
    const netTile = screen.getByText('Net P/L').closest('.rounded-2xl');
    expect(within(netTile).getByText('—')).toBeInTheDocument();
  });

  it('shows a single whole-tier empty message when the analysis scope has no trades', async () => {
    const user = userEvent.setup();
    // One trade, but on an obsolete engine — it is excluded from the analysis
    // scope, so the trade-quality tiers have nothing to show.
    filter.mockResolvedValue([trade({ engine_version: 'exp-v2', net_pnl: 100 })]);
    renderPage();

    expect((await screen.findAllByText(/Log a few trades to unlock these stats\./)).length).toBeGreaterThan(0);
    await openTab(user, 'Deep dive');
    expect(screen.getByText(/Log a few trades to unlock these stats\./)).toBeInTheDocument();
  });
});

// ── Phase 7: sections, filters and safety behaviours ────────────────────────────
describe('JournalStats — Phase 7 breakdowns & safety', () => {
  it('never shows an engine-version dropdown or a mixed-engine warning', async () => {
    const user = userEvent.setup();
    // A current trade alongside an obsolete-engine one: no version UI at all.
    filter.mockResolvedValue([
      trade({ id: 'a', engine_version: CURRENT_ENGINE_VERSION, net_pnl: 100 }),
      trade({ id: 'b', engine_version: 'exp-v2', net_pnl: 50 }),
    ]);
    renderPage();
    // The Engine-performance section lives in Deep dive (its stats are current-only).
    await openTab(user, 'Deep dive');
    expect(await screen.findByText('Engine performance')).toBeInTheDocument();
    // No engine-version picker, no "All versions" option, no mixed-engine banner.
    expect(screen.queryByRole('combobox', { name: 'Engine' })).toBeNull();
    expect(screen.queryByText(/all versions/i)).toBeNull();
    expect(screen.queryByText(/combines .* engine versions/i)).toBeNull();
    // No per-version "Engine version" breakdown card on the normal page.
    expect(screen.queryByText('Engine version')).toBeNull();
  });

  it('excludes obsolete-engine trades from performance stats without deleting them', async () => {
    const user = userEvent.setup();
    // Current trade (+100) plus an obsolete-engine trade (+999). Only the current
    // trade's money reaches the summary; the obsolete one must not be mixed in.
    filter.mockResolvedValue([
      trade({ id: 'cur', engine_version: CURRENT_ENGINE_VERSION, net_pnl: 100 }),
      trade({ id: 'obs', engine_version: 'exp-v2', net_pnl: 999 }),
    ]);
    renderPage();
    const overviewNet = (await screen.findByText('Net P/L')).closest('.rounded-2xl');
    // Summary Net P/L reflects the current engine only (+100), never +1099 / +999.
    expect(within(overviewNet).getByText(/USD\s*100\b/)).toBeInTheDocument();
    expect(within(overviewNet).queryByText(/1,?099/)).toBeNull();
    expect(within(overviewNet).queryByText(/999/)).toBeNull();
    // But the record is not deleted: the account ledger still counts its real
    // money, so Trading net P&L (account-scoped, all engines) is +1099.
    await openTab(user, 'Account');
    expect((await screen.findByText('Trading net P&L')).closest('div')).toHaveTextContent(/USD\s*1,?099\b/);
  });

  it('excludes legacy pre-snapshot trades from performance stats and shows no version label', async () => {
    const user = userEvent.setup();
    // A current trade plus a legacy (no engine_version) trade.
    filter.mockResolvedValue([
      trade({ id: 'cur', net_pnl: 100 }),
      trade({ id: 'leg', engine_version: undefined, net_pnl: 40 }),
    ]);
    renderPage();
    const overviewNet = (await screen.findByText('Net P/L')).closest('.rounded-2xl');
    // Legacy money (40) is excluded from the engine stats (summary = 100).
    expect(within(overviewNet).getByText(/USD\s*100\b/)).toBeInTheDocument();
    // The legacy label never surfaces on the normal user page.
    expect(screen.queryByText('Legacy — pre-snapshot')).toBeNull();
    // Not deleted: account ledger trading total still includes it (140).
    await openTab(user, 'Account');
    expect((await screen.findByText('Trading net P&L')).closest('div')).toHaveTextContent(/USD\s*140\b/);
  });

  it('shows a balanced reconciliation panel for a clean account', async () => {
    const user = userEvent.setup();
    filter.mockResolvedValue([trade({ net_pnl: 100 })]); // 10000 + 100 = 10100
    renderPage();
    await openTab(user, 'Account');
    expect(await screen.findByText(/balanced/i)).toBeInTheDocument();
    expect(screen.getByText('Account & cashflow')).toBeInTheDocument();
  });

  it('guards monetary totals and explains why under mixed currencies', async () => {
    const user = userEvent.setup();
    acctList.mockResolvedValue([
      { id: 'acc-1', name: 'USD', currency: 'USD', starting_balance: 1000, archived_at: null },
      { id: 'acc-2', name: 'GBP', currency: 'GBP', starting_balance: 1000, archived_at: null },
    ]);
    filter.mockResolvedValue([trade({ net_pnl: 100 }), trade({ id: 'g', account_id: 'acc-2', net_pnl: 50 })]);
    renderPage();
    // The mixed-currency banner is always visible, above the tabs.
    expect(await screen.findByText(/different currencies/i)).toBeInTheDocument();
    await openTab(user, 'Account');
    expect(await screen.findByText(/Money totals are unavailable/i)).toBeInTheDocument();
  });

  it('flags cross-asset pip totals as informational and offers an instrument filter', async () => {
    const user = userEvent.setup();
    filter.mockResolvedValue([
      trade({ id: 'e', instrument: 'EUR/USD', net_pnl: 100, points_pips: 20 }),
      trade({ id: 'x', instrument: 'GOLD', net_pnl: 50, points_pips: 10 }),
    ]);
    renderPage();
    // The instrument filter is a top-level control, present on every tab.
    expect((await screen.findAllByText('Instrument')).length).toBeGreaterThan(0);
    // The cross-asset pip note lives with the behaviour breakdowns in Deep dive.
    await openTab(user, 'Deep dive');
    expect(await screen.findByText(/informational only/i)).toBeInTheDocument();
  });
});

// ── Phase 7 review: explicit filter scope + invalid-filter reset ────────────────
describe('JournalStats — scope labels & filter-reset (review)', () => {
  const recent = new Date().toISOString();

  it('labels Summary as trade-analysis scope and Account & cashflow as account-ledger scope', async () => {
    const user = userEvent.setup();
    filter.mockResolvedValue([trade({ net_pnl: 100 })]);
    renderPage();
    expect(await screen.findByText(/Trade analysis:/i)).toBeInTheDocument();
    await openTab(user, 'Account');
    expect(await screen.findByText(/Account ledger:/i)).toBeInTheDocument();
  });

  it('Summary trade metrics use the analysis scope (instrument filter reduces Net P/L)', async () => {
    const user = userEvent.setup();
    filter.mockResolvedValue([
      trade({ id: 'e', instrument: 'EUR/USD', net_pnl: 100 }),
      trade({ id: 'g', instrument: 'GOLD', net_pnl: 50 }),
    ]);
    renderPage();
    // The summary "Net P/L" tile is analysis-scoped; the account ledger's
    // "Trading net P&L" is account-scoped (all instruments) and stays 150.
    const overviewNet = async () =>
      (await screen.findByText('Net P/L')).closest('.rounded-2xl');
    // All instruments → summary Net P/L 150.
    expect(within(await overviewNet()).getByText(/USD\s*150\b/)).toBeInTheDocument();
    // Filter to GOLD → summary Net P/L becomes 50 (analysis-scoped).
    await user.selectOptions(screen.getByRole('combobox', { name: 'Instrument' }), 'GOLD');
    expect(within(await overviewNet()).getByText(/USD\s*50\b/)).toBeInTheDocument();
    expect(within(await overviewNet()).queryByText(/USD\s*150\b/)).toBeNull();
    // The account ledger is NOT instrument-filtered, so its trading total stays 150.
    await openTab(user, 'Account');
    expect((await screen.findByText('Trading net P&L')).closest('div')).toHaveTextContent(/USD\s*150\b/);
  });

  it('resets an instrument filter that disappears after a period change (no hidden filter)', async () => {
    const user = userEvent.setup();
    filter.mockResolvedValue([
      trade({ id: 'e', instrument: 'EUR/USD', net_pnl: 100, completed_at: recent }),
      trade({ id: 'g', instrument: 'GOLD', net_pnl: 50, completed_at: '2020-01-01T00:00:00.000Z' }),
    ]);
    renderPage();
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Instrument' }), 'GOLD');
    expect((await screen.findAllByText(/USD\s*50\b/)).length).toBeGreaterThan(0);
    // Switch to 7 days: GOLD (2020) drops out, so its filter must reset to All.
    await user.click(screen.getByText('7 Days'));
    // EUR/USD (100) now shows — not the stale GOLD-only 50.
    expect((await screen.findAllByText(/USD\s*100\b/)).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/USD\s*50\b/).length).toBe(0);
    // The instrument selector is gone (one instrument), so no invisible filter remains.
    expect(screen.queryByRole('combobox', { name: 'Instrument' })).toBeNull();
  });

  it('renders the cash-balance chart inside Account & cashflow, not the analysis area', async () => {
    const user = userEvent.setup();
    filter.mockResolvedValue([trade({ net_pnl: 100 })]);
    renderPage();
    await openTab(user, 'Account');
    const cashflowHeading = await screen.findByText('Account & cashflow');
    const cashChart = screen.getByText('Account Balance'); // EquityCurve heading
    // The cash chart appears AFTER the Account & cashflow section title.
    expect(cashflowHeading.compareDocumentPosition(cashChart) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // ROI now lives only in the account ledger.
    expect(screen.getByText('ROI (period)')).toBeInTheDocument();
  });
});
