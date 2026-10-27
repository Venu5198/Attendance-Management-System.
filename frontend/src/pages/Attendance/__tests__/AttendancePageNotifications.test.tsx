import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AttendancePage } from '../AttendancePage';
import { ToastProvider } from '../../../context/ToastContext';
import { attendanceApi } from '../../../api';

vi.mock('../../../api', () => ({
  attendanceApi: {
    getToday: vi.fn(),
    getHistory: vi.fn(),
    checkIn: vi.fn(),
    checkOut: vi.fn(),
    regularize: vi.fn(),
  },
}));

vi.mock('../../../auth/AuthContext', () => ({
  useAuth: () => ({
    user: {
      employee_id: 'EMP001',
      username: 'emp001',
      role: 'EMPLOYEE',
      tenant_id: 'default',
    },
    token: 'fake-token',
    tenantId: 'default',
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    setTenantId: vi.fn(),
  }),
  AuthProvider: ({ children }: any) => children,
}));

describe('AttendancePage Notification Deduplication', () => {
  const renderComponent = () => {
    return render(
      <ToastProvider>
        <AttendancePage />
      </ToastProvider>
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (attendanceApi.getToday as any).mockResolvedValue({
      attendance_id: 'att-1',
      employee_id: 'EMP001',
      work_date: '2026-10-25',
      duration_hours: 0,
      duration_minutes: 0,
      duration_seconds: 0,
      attendance_status: 'NOT_ATTENDED',
      total_sessions: 0,
      completed_sessions: 0,
      active_session: null,
      sessions: [],
    });
    (attendanceApi.getHistory as any).mockResolvedValue([]);
  });

  it('renders exactly ONE success notification (toast) on check-in and NO duplicate inline banners', async () => {
    (attendanceApi.checkIn as any).mockResolvedValue({
      message: 'Office check-in recorded successfully!',
    });

    renderComponent();

    // Switch to Today's Actions tab
    const todayTab = await screen.findByRole('button', { name: /Today's Actions/i });
    fireEvent.click(todayTab);

    // Click Check In or Start Next Session
    const checkInBtn = await screen.findByRole('button', { name: /Start Next Session|Check In/i });
    fireEvent.click(checkInBtn);

    // Verify toast notification appears
    await waitFor(() => {
      const notifications = screen.getAllByText('Office check-in recorded successfully!');
      // EXACTLY 1 visible notification in the entire DOM
      expect(notifications).toHaveLength(1);
    });

    // Verify it is inside the Toast container (role="region" aria-label="Notifications" or role="status")
    const toastRegion = screen.getByRole('region', { name: 'Notifications' });
    expect(toastRegion).toHaveTextContent('Office check-in recorded successfully!');

    // Verify there is NO static inline dismissal button like "Dismiss" on an in-page banner
    expect(screen.queryByText('Dismiss')).not.toBeInTheDocument();
  });

  it('renders exactly ONE success notification on check-out without duplicate banner', async () => {
    (attendanceApi.getToday as any).mockResolvedValue({
      attendance_id: 'att-active',
      employee_id: 'EMP001',
      work_date: '2026-10-25',
      duration_hours: 0,
      duration_minutes: 0,
      duration_seconds: 0,
      attendance_status: 'IN_PROGRESS',
      total_sessions: 1,
      completed_sessions: 0,
      active_session: {
        attendance_id: 'att-active',
        employee_id: 'EMP001',
        work_date: '2026-10-25',
        entry_time: '2026-10-25T08:00:00Z',
        attendance_status: 'IN_PROGRESS',
      },
      sessions: [],
    });

    (attendanceApi.checkOut as any).mockResolvedValue({
      message: 'Office check-out recorded successfully!',
    });

    renderComponent();

    const todayTab = await screen.findByRole('button', { name: /Today's Actions/i });
    fireEvent.click(todayTab);

    const checkOutBtn = await screen.findByRole('button', { name: /Check Out/i });
    await waitFor(() => {
      expect(checkOutBtn).not.toBeDisabled();
    });
    fireEvent.click(checkOutBtn);

    await waitFor(() => {
      const notifications = screen.getAllByText('Office check-out recorded successfully!');
      expect(notifications).toHaveLength(1);
    });

    const toastRegion = screen.getByRole('region', { name: 'Notifications' });
    expect(toastRegion).toHaveTextContent('Office check-out recorded successfully!');
    expect(screen.queryByText('Dismiss')).not.toBeInTheDocument();
  });
});
