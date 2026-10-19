export type Role = "ADMIN" | "EMPLOYEE";

export type AttendanceStatus = "COMPLETED" | "IN_PROGRESS" | "NOT_ATTENDED";

export type ComplianceStatus = "COMPLIANT" | "NON_COMPLIANT" | "PENDING";

export interface User {
  user_id: string;
  id?: string;
  username: string;
  email: string;
  role: Role;
  employee_id: string | null;
  tenant_id?: string;
  is_active: boolean;
  created_at?: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token?: string | null;
  token_type: string;
  expires_in_seconds: number;
  user_id: string;
  username: string;
  role: Role;
  employee_id: string | null;
  tenant_id?: string;
}


export interface Employee {
  employee_id: string;
  full_name: string;
  email: string;
  department: string;
  role: Role;
  hire_date?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EmployeeCreate {
  employee_id: string;
  full_name: string;
  email: string;
  department: string;
  role?: Role;
  hire_date?: string | null;
  is_active?: boolean;
}

export interface AttendanceRecord {
  attendance_id: string;
  employee_id: string;
  work_date: string;
  entry_time: string | null;
  exit_time: string | null;
  duration_seconds: number;
  duration_hours: number;
  attendance_status: AttendanceStatus;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface RegularizationRequest {
  request_id: string;
  employee_id: string;
  work_date: string;
  entry_time: string;
  exit_time: string;
  duration_seconds: number;
  duration_hours: number;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  submitted_at: string;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  admin_notes?: string | null;
}

export interface RegularizationCreate {
  work_date: string;
  entry_time: string;
  exit_time: string;
  reason: string;
  employee_id?: string;
}

export interface WeeklyComplianceResult {
  employee_id: string;
  week_start: string;
  week_end: string;
  week_label: string;
  office_days: number;
  total_office_hours: number;
  total_duration_seconds: number;
  required_days: number;
  required_hours: number;
  approved_leave_days?: number;
  holidays_count?: number;
  pre_hire_workdays?: number;
  is_week_completed: boolean;
  compliance_status: ComplianceStatus;
  violation_reasons: string[];
}

export interface PolicyViolation {
  violation_id: string;
  employee_id: string;
  employee_name?: string;
  employee_email?: string;
  week_start: string;
  week_end: string;
  week_label: string;
  office_days: number;
  total_office_hours: number;
  required_days: number;
  required_hours: number;
  approved_leave_days?: number;
  holidays_count?: number;
  pre_hire_workdays?: number;
  compliance_status: ComplianceStatus;
  violation_reasons: string[];
  evaluated_at: string;
  notification_sent: boolean;
}

export interface Holiday {
  holiday_id: string;
  holiday_date: string;
  name: string;
  description?: string | null;
  created_at: string;
  created_by?: string | null;
}

export interface HolidayCreate {
  holiday_date: string;
  name: string;
  description?: string | null;
}

export interface NotificationLog {
  log_id: string;
  employee_id: string;
  recipient: string;
  policy_week: string;
  notification_type: string;
  delivery_status: "SENT" | "FAILED" | "SKIPPED";
  attempted_at: string;
  retry_count: number;
  error_details?: string | null;
}

export interface DailyAttendanceItem {
  work_date: string;
  entry_time: string | null;
  exit_time: string | null;
  duration_seconds: number;
  duration_hours: number;
  status: AttendanceStatus;
}

export interface EmployeeReportItem {
  employee_id: string;
  full_name: string;
  email: string;
  department: string;
  is_active: boolean;
  total_attended_days: number;
  total_office_hours: number;
  total_duration_seconds: number;
  daily_records: DailyAttendanceItem[];
  weekly_compliance: WeeklyComplianceResult[];
  overall_compliance: ComplianceStatus | null;
}

export interface ReportMetadata {
  period: "daily" | "weekly" | "monthly" | "yearly" | "custom";
  start_date: string;
  end_date: string;
  company_timezone: string;
  generated_at: string;
  total_employees: number;
  covered_policy_weeks_count: number;
}

export interface CompanyReportSummary {
  total_active_employees: number;
  total_office_days_accumulated: number;
  total_office_hours_accumulated: number;
  average_hours_per_employee: number;
  compliant_weeks_count: number;
  non_compliant_weeks_count: number;
  pending_weeks_count: number;
}

export interface AttendanceReportResponse {
  metadata: ReportMetadata;
  summary: CompanyReportSummary;
  employees: EmployeeReportItem[];
}

export type LeaveType = "VACATION" | "SICK" | "CASUAL" | "REMOTE_EXCEPTION";
export type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface LeaveRequest {
  leave_id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  leave_type: LeaveType;
  status: LeaveStatus;
  reason: string;
  submitted_at: string;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  admin_notes?: string | null;
}

export interface LeaveRequestCreate {
  start_date: string;
  end_date: string;
  leave_type?: LeaveType;
  reason: string;
  employee_id?: string;
}

export interface BulkReviewResponse {
  total_requested: number;
  success_count: number;
  failed_count: number;
  updated_ids: string[];
  errors: string[];
}

export interface WeeklyScoreRecord {
  week_start: string;
  week_end: string;
  week_label: string;
  office_days: number;
  total_office_hours: number;
  required_days: number;
  required_hours: number;
  status: ComplianceStatus;
  violation_reasons: string[];
}

export interface ComplianceHealthScore {
  employee_id: string;
  employee_name: string;
  department: string;
  health_score: number;
  health_rating: "EXCELLENT" | "GOOD" | "AT_RISK" | "CRITICAL";
  compliant_weeks: number;
  total_evaluated_weeks: number;
  chronic_issue: boolean;
  weekly_history: WeeklyScoreRecord[];
}

export interface AssistantQueryResponse {
  query: string;
  intent: string;
  headline: string;
  answer: string;
  action_url: string | null;
  data: unknown;
  suggestions: string[];
}



