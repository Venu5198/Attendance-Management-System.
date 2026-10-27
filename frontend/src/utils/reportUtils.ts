import type { DailyAttendanceItem } from '../types';

/**
 * Format timestamp in Asia/Kolkata (IST) timezone.
 * Returns formatted time string: e.g., "09:30 AM IST" or "—" if null.
 */
export const formatISTTime = (isoString?: string | null): string => {
  if (!isoString) return '—';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    return (
      new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }).format(date) + ' IST'
    );
  } catch {
    return isoString;
  }
};

/**
 * Format date string (YYYY-MM-DD or ISO) in Asia/Kolkata (IST).
 * Returns: "Mon, Oct 26, 2026"
 */
export const formatISTDate = (dateString?: string | null): string => {
  if (!dateString) return '—';
  try {
    const parts = dateString.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const date = new Date(Date.UTC(year, month, day, 6, 0, 0));
      return new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(date);
    }
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  } catch {
    return dateString;
  }
};

export type ClassifiedDayState =
  | 'QUALIFYING'
  | 'ZERO_DURATION'
  | 'IN_PROGRESS'
  | 'INCOMPLETE_STALE'
  | 'NOT_ATTENDED';

export interface DayClassification {
  state: ClassifiedDayState;
  label: string;
  badgeColor: string;
  borderColor: string;
  isQualifying: boolean;
  isAnomaly: boolean;
}

/**
 * Classify a daily attendance item into clear qualifying, zero-duration,
 * in-progress, incomplete, or missing attendance states.
 */
export const classifyDailyRecord = (day: DailyAttendanceItem): DayClassification => {
  const todayIST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const isPastDay = day.work_date < todayIST;

  if (day.status === 'COMPLETED') {
    // Option B UI Warning Indicator:
    // Backend policy strictly evaluates compliance on 3 eligible days and 15.0 total hours.
    // Daily items with duration >= 0.05h (3 mins / 180s) display as Qualifying Attended.
    // Durations < 0.05h (e.g. sub-minute test pings) display an amber Zero Duration warning
    // for administrative review without modifying backend policy contracts.
    if (day.duration_hours >= 0.05 || day.duration_seconds >= 180) {
      return {
        state: 'QUALIFYING',
        label: 'Attended (Qualifying)',
        badgeColor: 'bg-emerald-50 text-emerald-800 border border-emerald-200',
        borderColor: 'border-emerald-300',
        isQualifying: true,
        isAnomaly: false,
      };
    }
    // Zero-duration completed record (UI Anomaly Warning)
    return {
      state: 'ZERO_DURATION',
      label: '0.0h Logged (Non-qualifying)',
      badgeColor: 'bg-amber-50 text-amber-800 border border-amber-200',
      borderColor: 'border-amber-300',
      isQualifying: false,
      isAnomaly: true,
    };
  }

  if (day.status === 'IN_PROGRESS') {
    if (isPastDay) {
      // Past day in-progress record is an unclosed anomaly
      return {
        state: 'INCOMPLETE_STALE',
        label: 'Incomplete / Stale Session',
        badgeColor: 'bg-rose-50 text-rose-800 border border-rose-200',
        borderColor: 'border-rose-300',
        isQualifying: false,
        isAnomaly: true,
      };
    }
    // Today's active session
    return {
      state: 'IN_PROGRESS',
      label: 'In Progress (Active Today)',
      badgeColor: 'bg-blue-50 text-blue-800 border border-blue-200',
      borderColor: 'border-blue-300',
      isQualifying: false,
      isAnomaly: false,
    };
  }

  return {
    state: 'NOT_ATTENDED',
    label: 'Not Attended',
    badgeColor: 'bg-slate-100 text-slate-600 border border-slate-200',
    borderColor: 'border-slate-200',
    isQualifying: false,
    isAnomaly: false,
  };
};

export interface PolicyBreakdown {
  meetsDays: boolean;
  meetsHours: boolean;
  bothMet: boolean;
  daysRemaining: number;
  hoursRemaining: number;
  complianceState: 'COMPLIANT' | 'NON_COMPLIANT' | 'DAYS_PENDING' | 'HOURS_PENDING' | 'BOTH_PENDING';
  statusBadgeText: string;
  badgeVariant: 'success' | 'danger' | 'warning' | 'default';
  description: string;
}

/**
 * Evaluates individual 3-day and 15-hour requirements separately,
 * clearly distinguishing confirmed non-compliance from in-progress pending states.
 */
export const getPolicyBreakdown = (
  attendedDays: number,
  officeHours: number,
  overallCompliance?: string | null
): PolicyBreakdown => {
  const meetsDays = attendedDays >= 3;
  const meetsHours = officeHours >= 15.0;
  const bothMet = meetsDays && meetsHours;
  const daysRemaining = Math.max(0, 3 - attendedDays);
  const hoursRemaining = Math.max(0, Number((15.0 - officeHours).toFixed(2)));

  if (bothMet || overallCompliance === 'COMPLIANT') {
    return {
      meetsDays,
      meetsHours,
      bothMet: true,
      daysRemaining: 0,
      hoursRemaining: 0,
      complianceState: 'COMPLIANT',
      statusBadgeText: 'Compliant (Met Both Targets)',
      badgeVariant: 'success',
      description: 'Satisfies both 3-day and 15-hour weekly requirements.',
    };
  }

  if (overallCompliance === 'NON_COMPLIANT') {
    return {
      meetsDays,
      meetsHours,
      bothMet: false,
      daysRemaining,
      hoursRemaining,
      complianceState: 'NON_COMPLIANT',
      statusBadgeText: 'Non-Compliant (Breach Confirmed)',
      badgeVariant: 'danger',
      description: `Period concluded below requirements (${attendedDays}/3 days, ${officeHours.toFixed(1)}/15.0h).`,
    };
  }

  if (!meetsDays && !meetsHours) {
    return {
      meetsDays: false,
      meetsHours: false,
      bothMet: false,
      daysRemaining,
      hoursRemaining,
      complianceState: 'BOTH_PENDING',
      statusBadgeText: 'Days & Hours Pending',
      badgeVariant: 'warning',
      description: `Needs ${daysRemaining} day(s) and ${hoursRemaining.toFixed(1)}h to achieve weekly compliance.`,
    };
  }

  if (!meetsHours) {
    return {
      meetsDays: true,
      meetsHours: false,
      bothMet: false,
      daysRemaining: 0,
      hoursRemaining,
      complianceState: 'HOURS_PENDING',
      statusBadgeText: 'Hours Pending',
      badgeVariant: 'warning',
      description: `Met 3 days target. Needs ${hoursRemaining.toFixed(1)}h more to reach 15.0h.`,
    };
  }

  return {
    meetsDays: false,
    meetsHours: true,
    bothMet: false,
    daysRemaining,
    hoursRemaining: 0,
    complianceState: 'DAYS_PENDING',
    statusBadgeText: 'Days Pending',
    badgeVariant: 'warning',
    description: `Met 15.0h target. Needs ${daysRemaining} more eligible office day(s).`,
  };
};

/**
 * Exports the filtered employee dataset to CSV matching user search and filter criteria.
 */
export const exportFilteredReportToCSV = (
  employees: Array<{
    employee_id: string;
    full_name: string;
    department: string;
    total_attended_days: number;
    total_office_hours: number;
    overall_compliance?: any;
    daily_records: DailyAttendanceItem[];
  }>,
  metadata: { period: string; start_date: string; end_date: string }
): void => {
  if (!employees || employees.length === 0) return;

  const headers = [
    'Employee ID',
    'Full Name',
    'Department',
    'Days Attended',
    'Target Days',
    'Days Status',
    'Total Hours',
    'Target Hours',
    'Hours Status',
    'Compliance Status',
    'Anomalies Flagged',
    'Period Type',
    'Period Start',
    'Period End',
  ];

  const rows = employees.map((emp) => {
    const policy = getPolicyBreakdown(emp.total_attended_days, emp.total_office_hours, emp.overall_compliance);
    const hasZeroDuration = emp.daily_records.some((d) => classifyDailyRecord(d).state === 'ZERO_DURATION');
    const hasStale = emp.daily_records.some((d) => classifyDailyRecord(d).state === 'INCOMPLETE_STALE');
    const anomalyNote = [
      hasZeroDuration ? 'Zero-duration session' : '',
      hasStale ? 'Incomplete session' : '',
    ]
      .filter(Boolean)
      .join('; ') || 'None';

    return [
      `"${emp.employee_id}"`,
      `"${emp.full_name}"`,
      `"${emp.department}"`,
      emp.total_attended_days,
      3,
      policy.meetsDays ? 'MET' : 'PENDING',
      emp.total_office_hours.toFixed(2),
      15.0,
      policy.meetsHours ? 'MET' : 'PENDING',
      `"${policy.complianceState}"`,
      `"${anomalyNote}"`,
      `"${metadata.period.toUpperCase()}"`,
      `"${metadata.start_date}"`,
      `"${metadata.end_date}"`,
    ];
  });

  const csvContent =
    'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute(
    'download',
    `attendance_report_${metadata.period}_${metadata.start_date}_to_${metadata.end_date}.csv`
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
