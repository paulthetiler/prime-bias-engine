import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
