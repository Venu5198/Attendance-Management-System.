import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToastProvider } from '../../../context/ToastContext';
import {
  AttendanceCalendar,
  classifyDay,
  createCalendarMappingLayer,
  buildLeavesMap,
} from '../AttendanceCalendar';
import type { AttendanceRecord, Holiday, LeaveRequest } from '../../../types';

describe('classifyDay logic', () => {
  const dummyCell = {
    isPadding: false,
    dayNumber: 15,
    dateString: '2026-10-15',
    isWeekend: false,
    isFuture: false,
  };

  it('classifies an active session as In Progress', () => {
    const record = {
      status: 'In Progress' as const,
      entryTime: '2026-10-15T09:00:00Z',
      stayHours: 0,
      sessions: [] as AttendanceRecord[],
    };
    const res = classifyDay(dummyCell, record);
    expect(res.classification).toBe('In Progress');
    expect(res.label).toContain('In Progress');
  });

  it('classifies an attended day with stay hours and session count', () => {
    const record = {
      status: 'Attended' as const,
      entryTime: '2026-10-15T09:00:00Z',
      exitTime: '2026-10-15T17:30:00Z',
      stayHours: 8.5,
      sessions: [{} as AttendanceRecord, {} as AttendanceRecord],
    };
    const res = classifyDay(dummyCell, record);
    expect(res.classification).toBe('Attended');
    expect(res.label).toBe('8.5h Attended (2 sess)');
  });

  it('classifies a completed record with zero stay hours as Zero Duration (not policy-compliant green Attended)', () => {
    const record = {
      status: 'Attended' as const,
      entryTime: '2026-10-24T09:00:00Z',
      exitTime: '2026-10-24T09:00:00Z',
      stayHours: 0,
      sessions: [{} as AttendanceRecord],
    };
    const res = classifyDay(dummyCell, record);
    expect(res.classification).toBe('Zero Duration');
    expect(res.label).toBe('0.0h Logged (1 sess - Non-qualifying)');
    expect(res.badgeClass).toContain('bg-amber-100');
  });

  it('reproduces exact October 24 regression: 7-second session (0.0019h / 0.0h) classifies as Zero Duration amber', () => {
    const oct24Record: AttendanceRecord = {
      attendance_id: '9447e6dc-2820-4be7-863c-7ea50bca3cbf',
      employee_id: 'EMP001',
      work_date: '2026-10-24',
      entry_time: '2026-10-24T15:09:16.094Z',
      exit_time: '2026-10-24T15:09:23.582Z',
      duration_seconds: 7,
      duration_minutes: 0.12,
      duration_hours: 0.0,
      attendance_status: 'COMPLETED',
      created_at: '2026-10-24T15:09:16.094Z',
      updated_at: '2026-10-24T15:09:23.582Z',
    };

    const mapping = createCalendarMappingLayer([oct24Record]);
    expect(mapping['2026-10-24']).toBeDefined();
    expect(mapping['2026-10-24'].stayHours).toBe(0);

    const oct24Cell = {
      isPadding: false,
      dayNumber: 24,
      dateString: '2026-10-24',
      isWeekend: false,
      isFuture: false,
    };

    const classification = classifyDay(oct24Cell, mapping['2026-10-24']);
    expect(classification.classification).toBe('Zero Duration');
    expect(classification.cardClass).toContain('border-amber-300');
    expect(classification.label).toContain('0.0h Logged');
    expect(classification.cardClass).not.toContain('border-emerald-300');
  });

  it('classifies a company holiday distinctly', () => {
    const holiday: Holiday = {
      holiday_id: 'hol_1',
      holiday_date: '2026-10-15',
      name: 'Diwali',
      description: 'Festival of Lights',
      created_at: '2026-01-01',
    };
    const res = classifyDay(dummyCell, undefined, holiday);
    expect(res.classification).toBe('Holiday');
    expect(res.label).toContain('Diwali');
  });

  it('classifies an approved leave / policy exemption distinctly', () => {
    const leave: LeaveRequest = {
      leave_id: 'lv_1',
      employee_id: 'EMP001',
      start_date: '2026-10-15',
      end_date: '2026-10-15',
      leave_type: 'SICK',
      status: 'APPROVED',
      reason: 'Fever',
      submitted_at: '2026-10-14',
    };
    const res = classifyDay(dummyCell, undefined, undefined, leave);
    expect(res.classification).toBe('Approved Leave');
    expect(res.label).toContain('Approved Leave (SICK)');
  });

  it('classifies an explicit NOT_ATTENDED record as Confirmed Missed', () => {
    const record = {
      status: 'Missed' as const,
      stayHours: 0,
      sessions: [] as AttendanceRecord[],
    };
    const res = classifyDay(dummyCell, record);
    expect(res.classification).toBe('Confirmed Missed');
    expect(res.label).toBe('Confirmed Missed Scan');
  });

  it('classifies weekends as Weekend / Non-Workday', () => {
    const weekendCell = { ...dummyCell, isWeekend: true };
    const res = classifyDay(weekendCell);
    expect(res.classification).toBe('Weekend');
    expect(res.label).toBe('Weekend / Non-Workday');
  });

  it('classifies unrecorded past weekdays as No Record (NEVER assumed missed)', () => {
    const res = classifyDay(dummyCell, undefined, undefined, undefined);
    expect(res.classification).toBe('No Record');
    expect(res.label).toBe('No Attendance Record');
  });

  it('classifies future dates as Upcoming', () => {
    const futureCell = { ...dummyCell, isFuture: true };
    const res = classifyDay(futureCell);
    expect(res.classification).toBe('Upcoming');
  });
});

describe('createCalendarMappingLayer', () => {
  it('aggregates multiple sessions on the same work date correctly', () => {
    const records: AttendanceRecord[] = [
      {
        attendance_id: 'att_1',
        employee_id: 'EMP001',
        work_date: '2026-10-10',
        entry_time: '2026-10-10T08:30:00Z',
        exit_time: '2026-10-10T12:30:00Z',
        duration_hours: 4.0,
        duration_minutes: 240,
        duration_seconds: 14400,
        attendance_status: 'COMPLETED',
        created_at: '',
        updated_at: '',
      },
      {
        attendance_id: 'att_2',
        employee_id: 'EMP001',
        work_date: '2026-10-10',
        entry_time: '2026-10-10T14:00:00Z',
        exit_time: '2026-10-10T18:00:00Z',
        duration_hours: 4.0,
        duration_minutes: 240,
        duration_seconds: 14400,
        attendance_status: 'COMPLETED',
        created_at: '',
        updated_at: '',
      },
    ];

    const map = createCalendarMappingLayer(records);
    expect(map['2026-10-10']).toBeDefined();
    expect(map['2026-10-10'].stayHours).toBe(8.0);
    expect(map['2026-10-10'].status).toBe('Attended');
    expect(map['2026-10-10'].sessions).toHaveLength(2);
    expect(map['2026-10-10'].entryTime).toBe('2026-10-10T08:30:00Z');
    expect(map['2026-10-10'].exitTime).toBe('2026-10-10T18:00:00Z');
  });

  it('marks day as In Progress if any session on that date is IN_PROGRESS', () => {
    const records: AttendanceRecord[] = [
      {
        attendance_id: 'att_1',
        employee_id: 'EMP001',
        work_date: '2026-10-12',
        entry_time: '2026-10-12T09:00:00Z',
        exit_time: '2026-10-12T11:00:00Z',
        duration_hours: 2.0,
        duration_minutes: 120,
        duration_seconds: 7200,
        attendance_status: 'COMPLETED',
        created_at: '',
        updated_at: '',
      },
      {
        attendance_id: 'att_2',
        employee_id: 'EMP001',
        work_date: '2026-10-12',
        entry_time: '2026-10-12T12:00:00Z',
        exit_time: null,
        duration_hours: 0,
        duration_minutes: 0,
        duration_seconds: 0,
        attendance_status: 'IN_PROGRESS',
        created_at: '',
        updated_at: '',
      },
    ];

    const map = createCalendarMappingLayer(records);
    expect(map['2026-10-12'].status).toBe('In Progress');
    expect(map['2026-10-12'].sessions).toHaveLength(2);
  });
});

describe('buildLeavesMap', () => {
  it('indexes approved leaves across multiple days', () => {
    const leaves: LeaveRequest[] = [
      {
        leave_id: 'lv_1',
        employee_id: 'EMP001',
        start_date: '2026-10-05',
        end_date: '2026-10-07',
        leave_type: 'VACATION',
        status: 'APPROVED',
        reason: 'Holiday',
        submitted_at: '2026-10-01',
      },
      {
        leave_id: 'lv_2',
        employee_id: 'EMP001',
        start_date: '2026-10-09',
        end_date: '2026-10-09',
        leave_type: 'CASUAL',
        status: 'REJECTED',
        reason: 'Personal',
        submitted_at: '2026-10-08',
      },
    ];

    const map = buildLeavesMap(leaves);
    expect(map.has('2026-10-05')).toBe(true);
    expect(map.has('2026-10-06')).toBe(true);
    expect(map.has('2026-10-07')).toBe(true);
    expect(map.has('2026-10-09')).toBe(false); // Rejected leave is not mapped as approved
  });
});

describe('AttendanceCalendar Component', () => {
  it('renders month grid, header, and explicit legend', () => {
    render(
      <ToastProvider>
        <AttendanceCalendar
          records={[]}
          employeeId="EMP001"
          employeeName="John Doe"
        />
      </ToastProvider>
    );

    expect(screen.getByText(/Attendance Calendar for John Doe/i)).toBeInTheDocument();
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByLabelText('Previous Month')).toBeInTheDocument();
    expect(screen.getByLabelText('Next Month')).toBeInTheDocument();

    // Check legend items
    expect(screen.getByText('Attended Office')).toBeInTheDocument();
    expect(screen.getByText('Company Holiday')).toBeInTheDocument();
    expect(screen.getByText('Approved Leave')).toBeInTheDocument();
    expect(screen.getByText('Confirmed Missed')).toBeInTheDocument();
  });

  it('opens day details modal on date click and shows session breakdown', () => {
    const records: AttendanceRecord[] = [
      {
        attendance_id: 'att_101',
        employee_id: 'EMP001',
        work_date: '2026-10-10',
        entry_time: '2026-10-10T09:00:00Z',
        exit_time: '2026-10-10T17:00:00Z',
        duration_hours: 8.0,
        duration_minutes: 480,
        duration_seconds: 28800,
        attendance_status: 'COMPLETED',
        created_at: '',
        updated_at: '',
      },
    ];

    render(
      <ToastProvider>
        <AttendanceCalendar
          records={records}
          employeeId="EMP001"
          employeeName="John Doe"
        />
      </ToastProvider>
    );

    const interactiveCell = screen.getByLabelText(/2026-10-10/i);
    fireEvent.click(interactiveCell);

    expect(screen.getByText('Workday Details')).toBeInTheDocument();
    expect(screen.getByText('Logged Sessions for Date')).toBeInTheDocument();
    expect(screen.getByText(/Session 1/i)).toBeInTheDocument();
    expect(screen.getByText(/8.00h/i)).toBeInTheDocument();
  });
});
