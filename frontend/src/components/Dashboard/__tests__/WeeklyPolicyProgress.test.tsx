import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  WeeklyPolicyProgress,
  getComplianceState,
} from '../WeeklyPolicyProgress';

describe('getComplianceState logic', () => {
  it('correctly calculates BOTH_PENDING for 0 hours and 0 days', () => {
    const res = getComplianceState(0, 0, 3, 15);
    expect(res.state).toBe('BOTH_PENDING');
    expect(res.remainingDays).toBe(3);
    expect(res.remainingHours).toBe(15);
    expect(res.label).toBe('Days & Hours Pending');
  });

  it('correctly calculates BOTH_PENDING for partial progress', () => {
    const res = getComplianceState(1, 6.5, 3, 15);
    expect(res.state).toBe('BOTH_PENDING');
    expect(res.remainingDays).toBe(2);
    expect(res.remainingHours).toBe(8.5);
  });

  it('correctly calculates DAYS_PENDING when hours target is met but days target is unmet', () => {
    const res = getComplianceState(2, 16.0, 3, 15);
    expect(res.state).toBe('DAYS_PENDING');
    expect(res.remainingDays).toBe(1);
    expect(res.remainingHours).toBe(0);
    expect(res.label).toBe('Days Pending');
  });

  it('correctly calculates HOURS_PENDING when days target is met but hours target is unmet', () => {
    const res = getComplianceState(3, 12.2, 3, 15);
    expect(res.state).toBe('HOURS_PENDING');
    expect(res.remainingDays).toBe(0);
    expect(res.remainingHours).toBe(2.8);
    expect(res.label).toBe('Hours Pending');
  });

  it('correctly calculates FULLY_COMPLIANT when both targets are met or exceeded', () => {
    const res = getComplianceState(4, 18.5, 3, 15);
    expect(res.state).toBe('FULLY_COMPLIANT');
    expect(res.remainingDays).toBe(0);
    expect(res.remainingHours).toBe(0);
    expect(res.label).toBe('Fully Compliant');
  });

  it('never returns negative remaining days or hours even if exceeded or negative input passed', () => {
    const res = getComplianceState(-2, -5, 3, 15);
    expect(res.remainingDays).toBe(3);
    expect(res.remainingHours).toBe(15);

    const exceeded = getComplianceState(7, 45, 3, 15);
    expect(exceeded.remainingDays).toBe(0);
    expect(exceeded.remainingHours).toBe(0);
  });
});

describe('WeeklyPolicyProgress Component', () => {
  it('renders progress bars with proper accessibility attributes', () => {
    render(<WeeklyPolicyProgress daysAttended={2} hoursAttended={10} requiredDays={3} requiredHours={15} />);

    expect(screen.getByRole('heading', { name: /Weekly Attendance Policy Progress/i })).toBeInTheDocument();

    const progressbars = screen.getAllByRole('progressbar');
    expect(progressbars).toHaveLength(2);

    // Days progressbar
    const daysBar = progressbars[0];
    expect(daysBar).toHaveAttribute('aria-valuenow', '2');
    expect(daysBar).toHaveAttribute('aria-valuemax', '3');
    expect(daysBar).toHaveAttribute('aria-label', 'Eligible office days progress');

    // Hours progressbar
    const hoursBar = progressbars[1];
    expect(hoursBar).toHaveAttribute('aria-valuenow', '10');
    expect(hoursBar).toHaveAttribute('aria-valuemax', '15');
    expect(hoursBar).toHaveAttribute('aria-label', 'Weekly office hours progress');

    // Labels & remaining text
    expect(screen.getByText('2 of 3 eligible days')).toBeInTheDocument();
    expect(screen.getByText('10.0 of 15.0 hours')).toBeInTheDocument();
    expect(screen.getByText('1 eligible day remaining')).toBeInTheDocument();
    expect(screen.getByText('5.0 hours remaining')).toBeInTheDocument();
  });

  it('displays active session indicator when isSessionActive is true', () => {
    render(
      <WeeklyPolicyProgress
        daysAttended={1}
        hoursAttended={4}
        isSessionActive={true}
      />
    );

    expect(screen.getByText(/Active Session/i)).toBeInTheDocument();
  });

  it('renders completed states when requirements are met', () => {
    render(
      <WeeklyPolicyProgress
        daysAttended={3}
        hoursAttended={16.5}
        requiredDays={3}
        requiredHours={15}
      />
    );

    expect(screen.getAllByText('✓ Completed: Target met')).toHaveLength(2);
    expect(screen.getByText(/Fully Compliant:/i)).toBeInTheDocument();
  });
});
