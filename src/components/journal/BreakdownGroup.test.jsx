import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BreakdownGroup from './BreakdownGroup';

const rows = [
  { key: 'ins', label: 'Tiny', totalTrades: 2, directionalCount: 2, completeCount: 2, wins: 2, losses: 0, breakevens: 0, winRate: 1, moneyWinRate: 1, netPnl: 999, avgR: 9, expectancy: 500, profitFactor: Infinity, sampleStatus: 'insufficient' },
  { key: 'use', label: 'Solid', totalTrades: 40, directionalCount: 40, completeCount: 40, wins: 22, losses: 18, breakevens: 0, winRate: 0.55, moneyWinRate: 0.55, netPnl: 100, avgR: 0.4, expectancy: 5, profitFactor: 1.3, sampleStatus: 'usable' },
];

describe('BreakdownGroup', () => {
  it('default sort does not promote the tiny sample above the usable one', () => {
    render(<BreakdownGroup title="Grade" rows={rows} currency="USD" />);
    const rowButtons = screen.getAllByRole('button');
    expect(rowButtons[0]).toHaveTextContent('Solid'); // usable first
    expect(rowButtons[1]).toHaveTextContent('Tiny');   // insufficient last
  });

  it('flags a low-sample row and shows the sample badge', () => {
    render(<BreakdownGroup title="Grade" rows={rows} currency="USD" />);
    expect(screen.getByText('low sample')).toBeInTheDocument(); // insufficient row
    expect(screen.getByText('usable')).toBeInTheDocument();
  });

  it('expands a row to show the full metric set incl. money win rate', async () => {
    const user = userEvent.setup();
    render(<BreakdownGroup title="Grade" rows={rows} currency="USD" />);
    await user.click(screen.getByRole('button', { name: /Solid/ }));
    // These labels live in the expanded metric grid (the "Expectancy" sort option
    // is separate, so match the exact cell labels).
    expect(screen.getByText('Money WR')).toBeInTheDocument();
    expect(screen.getByText('Outcome WR')).toBeInTheDocument();
    expect(screen.getByText('W/L/BE')).toBeInTheDocument();
    expect(screen.getByText('Profit factor')).toBeInTheDocument();
  });

  it('hides money values when monetaryEnabled is false (mixed currency)', async () => {
    const user = userEvent.setup();
    render(<BreakdownGroup title="Grade" rows={rows} currency={null} monetaryEnabled={false} />);
    await user.click(screen.getByRole('button', { name: /Solid/ }));
    // Net P&L + Expectancy cells render an em-dash rather than a fake 0.
    const netCells = screen.getAllByText('—');
    expect(netCells.length).toBeGreaterThan(0);
  });

  it('re-sorts by net P&L when the sort control changes', async () => {
    const user = userEvent.setup();
    render(<BreakdownGroup title="Grade" rows={rows} currency="USD" />);
    await user.selectOptions(screen.getByRole('combobox', { name: /Sort Grade/ }), 'netPnl');
    const rowButtons = screen.getAllByRole('button');
    expect(rowButtons[0]).toHaveTextContent('Tiny'); // 999 net > 100 net
  });

  it('renders an empty state when there are no rows', () => {
    render(<BreakdownGroup title="Grade" rows={[]} currency="USD" />);
    expect(screen.getByText(/No data in this scope/i)).toBeInTheDocument();
  });
});
