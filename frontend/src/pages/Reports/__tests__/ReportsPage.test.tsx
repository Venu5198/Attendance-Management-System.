import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ReportsPage } from '../ReportsPage';
import { reportsApi } from '../../../api';
import type { AttendanceReportResponse } from '../../../types';

// Mock AuthContext
vi.mock('../../../auth/AuthContext', () => ({
  useAuth: () => ({
    user: {
      user_id: 'admin1',
      username: 'admin',
      role: 'ADMIN',
      employee_id: null,
      tenant_id: 'default',
    },
  }),
}));

vi.mock('../../../api', () => ({
  reportsApi: {
    getReport: vi.fn(),
    emailReport: vi.fn(),
  },
  auditApi: {
    getLogs: vi.fn().mockResolvedValue([]),
  },
}));

const mockReportData: AttendanceReportResponse = {
  metadata: {
    period: 'weekly',
    start_date: '2026-10-19',
    end_date: '2026-10-25',
    company_timezone: 'Asia/Kolkata',
    generated_at: '2026-10-26T00:00:00Z',
    total_employees: 2,
    covered_policy_weeks_count: 1,
  },
  summary: {
    total_active_employees: 2,
    total_office_days_accumulated: 4,
    total_office_hours_accumulated: 18.0,
    average_hours_per_employee: 9.0,
    compliant_weeks_count: 1,
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
      total_office_hours: 18.0,
      total_duration_seconds: 64800,
      daily_records: [
        {
          work_date: '2026-10-20',
          entry_time: '2026-10-20T04:00:00Z',
          exit_time: '2026-10-20T10:00:00Z',
          duration_seconds: 21600,
          duration_hours: 6.0,
          status: 'COMPLETED',
        },
      ],
      weekly_compliance: [],
      overall_compliance: 'COMPLIANT',
    },
    {
      employee_id: 'EMP002',
      full_name: 'Bob Jones',
      email: 'bob@example.com',
      department: 'Sales',
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

describe('ReportsPage UX, Timezone & Anomaly Classification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(reportsApi.getReport).mockResolvedValue(mockReportData);
  });

  it('renders report header, generate button, and summary metrics', async () => {
    render(
      <MemoryRouter>
        <ReportsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Central Attendance Reports')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /Generate Report/i })).toBeInTheDocument();
    expect(screen.getByText('Evaluated Staff')).toBeInTheDocument();
    expect(screen.getByText('Compliant Weeks')).toBeInTheDocument();
    expect(screen.getByText('Non-Compliant Weeks')).toBeInTheDocument();
  });

  it('provides quick preset buttons: Today, This Week, This Month, Reset', async () => {
    render(
      <MemoryRouter>
        <ReportsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'This Week' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'This Month' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Reset/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'This Month' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Generate Report/i })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /Generate Report/i }));

    expect(reportsApi.getReport).toHaveBeenCalled();
  });

  it('flags zero-duration non-qualifying records with an alert badge', async () => {
    render(
      <MemoryRouter>
        <ReportsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText('Bob Jones')[0]).toBeInTheDocument();
    });

    // Bob has a 0.0h day (Oct 24)
    expect(screen.getAllByText(/0.0h Non-qualifying Day/i)[0]).toBeInTheDocument();
  });

  it('expands daily logs showing Asia/Kolkata timestamps and classification', async () => {
    render(
      <MemoryRouter>
        <ReportsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText('Alice Smith')[0]).toBeInTheDocument();
    });

    // Expand daily logs for Alice using data-testid
    const dailyLogsBtn = screen.getByTestId('daily-logs-btn-EMP001');
    fireEvent.click(dailyLogsBtn);

    await waitFor(() => {
      expect(screen.getByText(/Daily Breakdown for Alice Smith/i)).toBeInTheDocument();
      expect(screen.getByText(/Timezone: Asia\/Kolkata \(IST\)/i)).toBeInTheDocument();
      expect(screen.getAllByText('Attended (Qualifying)')[0]).toBeInTheDocument();
    });
  });

  it('displays table totals footer with total staff, days, and hours', async () => {
    render(
      <MemoryRouter>
        <ReportsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Total Staff: 2/i)).toBeInTheDocument();
      expect(screen.getByText(/4 days total/i)).toBeInTheDocument();
      expect(screen.getByText(/18.00 hrs total/i)).toBeInTheDocument();
    });
  });

  it('filters by compliance status', async () => {
    render(
      <MemoryRouter>
        <ReportsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText('Alice Smith')[0]).toBeInTheDocument();
      expect(screen.getAllByText('Bob Jones')[0]).toBeInTheDocument();
    });

    // Filter to Compliant Only
    const statusSelect = screen.getByDisplayValue('All Statuses');
    fireEvent.change(statusSelect, { target: { value: 'COMPLIANT' } });

    await waitFor(() => {
      expect(screen.getAllByText('Alice Smith')[0]).toBeInTheDocument();
      expect(screen.queryByText('Bob Jones')).not.toBeInTheDocument();
    });
  });

  it('validates custom date range and rejects start date later than end date', async () => {
    render(
      <MemoryRouter>
        <ReportsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Generate Report/i })).toBeInTheDocument();
    });

    const periodSelect = screen.getByDisplayValue('Weekly');
    fireEvent.change(periodSelect, { target: { value: 'custom' } });

    await waitFor(() => {
      expect(screen.getByLabelText(/Start Date/i)).toBeInTheDocument();
    });

    // Set invalid dates: start 2026-10-30 > end 2026-10-20
    const startDateInput = screen.getByLabelText(/Start Date/i);
    const endDateInput = screen.getByLabelText(/End Date/i);

    fireEvent.change(startDateInput, { target: { value: '2026-10-30' } });
    fireEvent.change(endDateInput, { target: { value: '2026-10-20' } });

    const form = startDateInput.closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(
        screen.getByText(/Start Date cannot be later than End Date/i)
      ).toBeInTheDocument();
    });
  });


  it('filters by department', async () => {
    render(
      <MemoryRouter>
        <ReportsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText('Alice Smith')[0]).toBeInTheDocument();
      expect(screen.getAllByText('Bob Jones')[0]).toBeInTheDocument();
    });

    // Departments: Engineering, Sales
    const deptSelect = screen.getByDisplayValue('All Departments');
    fireEvent.change(deptSelect, { target: { value: 'Engineering' } });

    await waitFor(() => {
      expect(screen.getAllByText('Alice Smith')[0]).toBeInTheDocument();
      expect(screen.queryByText('Bob Jones')).not.toBeInTheDocument();
    });
  });
});
