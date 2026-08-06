import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ExtendedCautionPill, { isExtendedCaution } from './ExtendedCautionPill';

describe('isExtendedCaution — one shared rule for every surface', () => {
  it('is true for the Extended status', () => {
    expect(isExtendedCaution({ status: 'Extended', grade: 'C' })).toBe(true);
  });
  it('is true for effective grade F', () => {
    expect(isExtendedCaution({ status: 'Ready', grade: 'F' })).toBe(true);
  });
  it('is false for a normal graded result', () => {
    expect(isExtendedCaution({ status: 'Ready', grade: 'B' })).toBe(false);
    expect(isExtendedCaution({ status: 'Scalp', grade: 'C' })).toBe(false);
  });
  it('is false for a missing result', () => {
    expect(isExtendedCaution(null)).toBe(false);
    expect(isExtendedCaution(undefined)).toBe(false);
  });
});

describe('ExtendedCautionPill', () => {
  it('renders an amber (never red) caution with the reassuring tooltip', () => {
    render(<ExtendedCautionPill />);
    const pill = screen.getByText(/caution/i);
    expect(pill.className).toMatch(/amber/);
    expect(pill.className).not.toMatch(/red|destructive/);
    expect(pill.getAttribute('title')).toBe(
      'Market is extended — valid setup, but be careful with entry and risk.',
    );
  });

  it('lets callers override the size for tighter layouts', () => {
    render(<ExtendedCautionPill className="text-[10px] px-2.5 py-1" />);
    const pill = screen.getByText(/caution/i);
    expect(pill.className).toMatch(/text-\[10px\]/);
  });
});
