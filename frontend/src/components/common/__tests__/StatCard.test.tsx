import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatCard } from '../StatCard';

describe('StatCard Component', () => {
  it('renders title, value, and icon correctly', () => {
    render(
      <StatCard
        title="Total Employees"
        value={42}
        icon={<span data-testid="test-icon">icon</span>}
      />
    );

    expect(screen.getByText('Total Employees')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByTestId('test-icon')).toBeInTheDocument();
  });

  it('renders subtitle when provided', () => {
    render(
      <StatCard
        title="Compliance Rate"
        value="92%"
        subtitle="+4% compared to last week"
        icon={<span>📊</span>}
        variant="success"
      />
    );

    expect(screen.getByText('+4% compared to last week')).toBeInTheDocument();
  });

  it('applies variant styling when specified', () => {
    const { container } = render(
      <StatCard
        title="Violations"
        value={3}
        icon={<span>⚠️</span>}
        variant="danger"
      />
    );

    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('border-rose-200');
    expect(card.className).toContain('text-rose-950');
  });
});
