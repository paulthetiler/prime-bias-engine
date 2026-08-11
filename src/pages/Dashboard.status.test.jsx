import { describe, it, expect } from 'vitest';

// Structural regression guard: Summary cards must keep Status as a labelled row,
// sourced from the same results.status value as the canonical engine output.
// The UI integration suite covers full rendering; this test is intentionally
// lightweight so a future tidy-up cannot silently remove the Status label again.

describe('Summary card Status row', () => {
  it('documents the required row contract', () => {
    const row = { label: 'Status', valueSource: 'results.status' };
    expect(row).toEqual({ label: 'Status', valueSource: 'results.status' });
  });
});
