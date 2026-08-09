import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// autoSave reaches for Supabase; stub the network side so the render is pure.
vi.mock('@/lib/autoSave', () => ({
  saveBiasAnalysisWithRetry: vi.fn().mockResolvedValue({ ok: true }),
  buildBiasAnalysisPayload: vi.fn(() => ({})),
}));

const Input = (await import('./Input')).default;

function renderInput() {
  return render(
    <MemoryRouter>
      <Input />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe('Input (Bias Tool) — renders with an instrument selected', () => {
  // Regression: the recalc effect referenced a renamed variable and threw a
  // ReferenceError the moment an instrument was active, blanking the screen.
  it('shows the ATR Used and Minimum Safe Move tiles without crashing', () => {
    localStorage.setItem('primebias_instrument', 'GBP/JPY');

    renderInput();

    expect(screen.getByText('ATR Used')).toBeInTheDocument();
    expect(screen.getByText('Minimum Safe Move')).toBeInTheDocument();
    // GBP/JPY base ATR is 128 → forex → pips, formatted without decimals.
    expect(screen.getByText('128 pips')).toBeInTheDocument();
  });
});

describe('Input (Bias Tool) — instrument favourites (selector-only feature)', () => {
  const FAV_KEY = 'primebias_favourite_instruments';

  async function openSelector(user) {
    await user.click(screen.getByRole('combobox'));
    // The command list renders once the popover is open.
    return await screen.findByPlaceholderText('Search instruments...');
  }

  it('starring an instrument favourites it without selecting it or closing the dropdown', async () => {
    const user = userEvent.setup();
    renderInput();

    await openSelector(user);

    const starBtn = screen.getByRole('button', { name: 'Add GOLD/USD to favourites' });
    await user.click(starBtn);

    // Persisted as a favourite.
    expect(JSON.parse(localStorage.getItem(FAV_KEY) || '[]')).toContain('GOLD/USD');
    // NOT selected as the active instrument.
    expect(localStorage.getItem('primebias_instrument')).toBeNull();
    // Dropdown stayed open (search box still present) and the star flipped state.
    expect(screen.getByPlaceholderText('Search instruments...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove GOLD/USD from favourites' })).toBeInTheDocument();
  });

  it('favourites float to the top under a Favourites heading, above the divider', async () => {
    localStorage.setItem(FAV_KEY, JSON.stringify(['GOLD/USD']));
    const user = userEvent.setup();
    renderInput();

    await openSelector(user);

    // The Favourites group exists and contains the starred instrument.
    const favHeading = screen.getByText('Favourites');
    expect(favHeading).toBeInTheDocument();
    const favGroup = favHeading.closest('[cmdk-group]');
    expect(within(favGroup).getByText('GOLD/USD')).toBeInTheDocument();
  });

  it('keeps the favourite (and its top position) after the instrument is removed from the Bias Tool', async () => {
    // Star + actively analyse GOLD/USD.
    localStorage.setItem(FAV_KEY, JSON.stringify(['GOLD/USD']));
    localStorage.setItem('primebias_instrument', 'GOLD/USD');
    localStorage.setItem('primebias_active', JSON.stringify({ 'GOLD/USD': { instrument: 'GOLD/USD' } }));

    const user = userEvent.setup();
    renderInput();

    // Remove it from the Bias Tool via the confirm dialog.
    await user.click(screen.getByRole('button', { name: /Remove GOLD\/USD/ }));
    await user.click(await screen.findByRole('button', { name: 'Remove' }));

    // Favourite list is untouched by removal.
    expect(JSON.parse(localStorage.getItem(FAV_KEY) || '[]')).toContain('GOLD/USD');
    // Active instrument was cleared by the remove.
    expect(localStorage.getItem('primebias_instrument')).toBeNull();

    // Reopen the selector — still starred, still in the Favourites group.
    await openSelector(user);
    const favGroup = screen.getByText('Favourites').closest('[cmdk-group]');
    expect(within(favGroup).getByText('GOLD/USD')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove GOLD/USD from favourites' })).toBeInTheDocument();
  });

  it('unstarring returns the instrument to the normal list', async () => {
    localStorage.setItem(FAV_KEY, JSON.stringify(['GOLD/USD']));
    const user = userEvent.setup();
    renderInput();

    await openSelector(user);
    await user.click(screen.getByRole('button', { name: 'Remove GOLD/USD from favourites' }));

    expect(JSON.parse(localStorage.getItem(FAV_KEY) || '[]')).not.toContain('GOLD/USD');
    // No Favourites group left; the star is back to its "add" state.
    expect(screen.queryByText('Favourites')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add GOLD/USD to favourites' })).toBeInTheDocument();
  });
});
