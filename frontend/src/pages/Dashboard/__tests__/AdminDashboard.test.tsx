import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminDashboard } from '../AdminDashboard';
import { reportsApi, violationsApi } from '../../../api';
import type { AttendanceReportResponse, ComplianceHealthScore, PolicyViolation } from '../../../types';

vi.mock('../../../api', () => ({
  reportsApi: {
    getReport: vi.fn(),
  },
  violationsApi: {
    list: vi.fn(),
    getHealthScores: vi.fn(),
  },
}));

const mockReportData: AttendanceReportResponse = {
  metadata: {
    period: 'weekly',
    start_date: '2026-10-19',
    end_date: '2026-10-25',
    company_timezone: 'Asia/Kolkata',
    generated_at: '2026-10-26T00:00:00Z',
    total_employees: 3,
    covered_policy_weeks_count: 1,
  },
  summary: {
    total_active_employees: 3,
    total_office_days_accumulated: 6,
    total_office_hours_accumulated: 30.5,
    average_hours_per_employee: 10.17,
    compliant_weeks_count: 2,
    non_compliant_weeks_count: 1,
    pending_weeks_count: 0,
  },
  employees: [
    {
      employee_id: 'EMP001',
      full_name: 'Alice Smith',
      email: 'alice@example.com',
      department: 'Engineering',
      is_active: true,
      total_attended_days: 3,
      total_office_hours: 18.5,
      total_duration_seconds: 66600,
      daily_records: [
        {
          work_date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()),
          entry_time: '2026-10-26T04:00:00Z',
          exit_time: null,
          duration_seconds: 0,
          duration_hours: 0.0,
          status: 'IN_PROGRESS',
        },
      ],
      weekly_compliance: [],
      overall_compliance: 'COMPLIANT',
    },
    {
      employee_id: 'EMP002',
      full_name: 'Bob Jones',
      email: 'bob@example.com',
      department: 'Marketing',
      is_active: true,
      total_attended_days: 1,
      total_office_hours: 4.0,
      total_duration_seconds: 14400,
      daily_records: [],
      weekly_compliance: [],
      overall_compliance: 'NON_COMPLIANT',
    },
    {
      employee_id: 'EMP003',
      full_name: 'Charlie Brown',
      email: 'charlie@example.com',
      department: 'Finance',
      is_active: true,
      total_attended_days: 1,
      total_office_hours: 0.0,
      total_duration_seconds: 7,
      daily_records: [
        {
          work_date: '2026-10-24',
          entry_time: '2026-10-24T05:00:00Z',
          exit_time: '2026-10-24T05:00:07Z',
          duration_seconds: 7,
          duration_hours: 0.0,
          status: 'COMPLETED',
        },
      ],
      weekly_compliance: [],
      overall_compliance: 'NON_COMPLIANT',
    },
  ],
};

const mockViolations: PolicyViolation[] = [
  {
    violation_id: 'VIO-1',
    employee_id: 'EMP002',
    week_start: '2026-10-19',
    week_end: '2026-10-25',
    week_label: '2026-W43',
    office_days: 1,
    total_office_hours: 4.0,
    required_days: 3,
    required_hours: 15.0,
    compliance_status: 'NON_COMPLIANT',
    violation_reasons: ['Insufficient office days', 'Insufficient hours'],
    evaluated_at: '2026-10-26T00:00:00Z',
    notification_sent: false,
  },
];

const mockHealthScores: ComplianceHealthScore[] = [
  {
    employee_id: 'EMP001',
    employee_name: 'Alice Smith',
    department: 'Engineering',
    health_score: 100,
    health_rating: 'EXCELLENT',
    compliant_weeks: 4,
    total_evaluated_weeks: 4,
    chronic_issue: false,
    weekly_history: [],
  },
  {
    employee_id: 'EMP002',
    employee_name: 'Bob Jones',
    department: 'Marketing',
    health_score: 25,
    health_rating: 'CRITICAL',
    compliant_weeks: 1,
    total_evaluated_weeks: 4,
    chronic_issue: true,
    weekly_history: [],
  },
];

describe('AdminDashboard UX & Exception Triage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(reportsApi.getReport).mockResolvedValue(mockReportData);
    vi.mocked(violationsApi.list).mockResolvedValue(mockViolations);
    vi.mocked(violationsApi.getHealthScores).mockResolvedValue(mockHealthScores);
  });

  it('renders dashboard heading, stat cards, and continuous compliance scores', async () => {
    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Company Overview & Compliance')).toBeInTheDocument();
    });

    expect(screen.getByText('Total Active Employees')).toBeInTheDocument();
    expect(screen.getByText('Currently In Office')).toBeInTheDocument();
    expect(screen.getByText('Compliant Weeks')).toBeInTheDocument();
    expect(screen.getByText('Non-Compliant Weeks')).toBeInTheDocument();
    expect(screen.getByText('Pending Violations')).toBeInTheDocument();
    expect(
      screen.getByText('Continuous Compliance Health Score (Rolling 4-Week History)')
    ).toBeInTheDocument();
  });

  it('filters employees by In Office Now', async () => {
    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText('Alice Smith')[0]).toBeInTheDocument();
    });

    const inOfficeTab = screen.getByText('In Office').closest('button')!;
    fireEvent.click(inOfficeTab);

    // Alice is in office, Bob is not
    expect(screen.getAllByText('Alice Smith')[0]).toBeInTheDocument();
    expect(screen.queryByText('Bob Jones')).not.toBeInTheDocument();
  });

  it('filters employees by Below Threshold', async () => {
    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText('Alice Smith')[0]).toBeInTheDocument();
    });

    const belowThresholdTab = screen.getByRole('button', { name: /Below Threshold/i });
    fireEvent.click(belowThresholdTab);

    // Bob Jones and Charlie Brown are below threshold, Alice is compliant
    expect(screen.getAllByText('Bob Jones')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Charlie Brown')[0]).toBeInTheDocument();
    expect(screen.queryByText('Alice Smith')).not.toBeInTheDocument();
  });

  it('filters employees by Anomalies', async () => {
    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText('Charlie Brown')[0]).toBeInTheDocument();
    });

    const anomaliesTab = screen.getByRole('button', { name: /^Anomalies/i });
    fireEvent.click(anomaliesTab);

    // Charlie Brown has 0.0h zero duration anomaly
    expect(screen.getAllByText('Charlie Brown')[0]).toBeInTheDocument();
    expect(screen.queryByText('Alice Smith')).not.toBeInTheDocument();
  });

  it('supports instant search filtering by employee name or ID', async () => {
    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText('Alice Smith')[0]).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search staff, ID, department.../i);
    fireEvent.change(searchInput, { target: { value: 'Marketing' } });

    expect(screen.getAllByText('Bob Jones')[0]).toBeInTheDocument();
    expect(screen.queryByText('Alice Smith')).not.toBeInTheDocument();
  });

  it('filters employees by Failed Both targets', async () => {
    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText('Alice Smith')[0]).toBeInTheDocument();
    });

    const failedBothTab = screen.getByRole('button', { name: /Failed Both/i });
    fireEvent.click(failedBothTab);

    // Bob Jones (1 day, 4.0h) and Charlie Brown (1 day, 0.0h) fail both
    expect(screen.getAllByText('Bob Jones')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Charlie Brown')[0]).toBeInTheDocument();
    expect(screen.queryByText('Alice Smith')).not.toBeInTheDocument();
  });

  it('renders empty state and allows clearing exception filters', async () => {
    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText('Alice Smith')[0]).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search staff, ID, department.../i);
    fireEvent.change(searchInput, { target: { value: 'NonexistentEmployeeName' } });

    expect(screen.getAllByText('No employees match exception filter')[0]).toBeInTheDocument();

    const clearBtn = screen.getAllByRole('button', { name: /Clear Exception Filters/i })[0];
    fireEvent.click(clearBtn);

    // Filters reset, Alice is visible again

    expect(screen.getAllByText('Alice Smith')[0]).toBeInTheDocument();
  });

  it('displays error alert and retry button when data fetch fails', async () => {
    vi.mocked(reportsApi.getReport).mockRejectedValueOnce({
      response: { data: { detail: 'Database connection failed' } },
    });

    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Failed to load Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Database connection failed')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
    });
  });
});
