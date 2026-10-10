import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from '../StatusBadge';

describe('StatusBadge Component', () => {
  it('renders COMPLIANT status with emerald styling and formatted text', () => {
    render(<StatusBadge status="COMPLIANT" />);
    const badge = screen.getByText('COMPLIANT');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('text-emerald-700');
  });

  it('renders NON_COMPLIANT status formatted as NON COMPLIANT with rose styling', () => {
    render(<StatusBadge status="NON_COMPLIANT" />);
    const badge = screen.getByText('NON COMPLIANT');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('text-rose-700');
  });

  it('renders IN_PROGRESS status with amber styling', () => {
    render(<StatusBadge status="IN_PROGRESS" />);
    const badge = screen.getByText('IN PROGRESS');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('text-amber-700');
  });

  it('renders PENDING status with blue styling', () => {
    render(<StatusBadge status="PENDING" />);
    const badge = screen.getByText('PENDING');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('text-blue-700');
  });

  it('falls back to default neutral styling for unknown status', () => {
    render(<StatusBadge status="UNKNOWN_STATE" />);
    const badge = screen.getByText('UNKNOWN STATE');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('text-slate-600');
  });
});
