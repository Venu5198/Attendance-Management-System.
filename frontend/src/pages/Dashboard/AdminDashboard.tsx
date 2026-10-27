import React, { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { reportsApi, violationsApi } from '../../api';
import type { AttendanceReportResponse, ComplianceHealthScore, PolicyViolation } from '../../types';
import { StatCard } from '../../components/common/StatCard';
import { StatusBadge } from '../../components/common/StatusBadge';
import { LoadingSkeleton } from '../../components/common/LoadingSkeleton';
import { EmptyState } from '../../components/common/EmptyState';
import { classifyDailyRecord, getPolicyBreakdown } from '../../utils/reportUtils';
import {
  Users,
  UserCheck,
  Clock,
  ShieldCheck,
  AlertTriangle,
  ArrowUpRight,
  Activity,
  Search,
  RefreshCw,
  ExternalLink,
  Radio,
  FileSpreadsheet,
  AlertCircle,
  XCircle,
} from 'lucide-react';

export const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [report, setReport] = useState<AttendanceReportResponse | null>(null);
  const [violations, setViolations] = useState<PolicyViolation[]>([]);
  const [healthScores, setHealthScores] = useState<ComplianceHealthScore[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Exception triage filters
  const [employeeFilter, setEmployeeFilter] = useState<
    'ALL' | 'IN_OFFICE' | 'BELOW_THRESHOLD' | 'FAILED_BOTH' | 'ANOMALIES' | 'ZERO_ATTENDANCE'
  >('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [healthFilter, setHealthFilter] = useState<'ALL' | 'AT_RISK_ONLY'>('ALL');

  const fetchDashboardData = async (refreshOnly = false) => {
    try {
      if (refreshOnly) {
        setIsRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      const [reportData, violationsData, healthData] = await Promise.all([
        reportsApi.getReport({ period: 'weekly' }),
        violationsApi.list(),
        violationsApi.getHealthScores(),
      ]);
      setReport(reportData);
      setViolations(violationsData);
      setHealthScores(healthData);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.message || 'Failed to load dashboard metrics');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const summary = report?.summary;
  const pendingViolations = violations.filter((v) => !v.notification_sent).length;

  // Derive today's date in Asia/Kolkata
  const todayIST = useMemo(() => {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  }, []);

  // Classify each employee's live presence and anomalous history
  const employeeMetadata = useMemo(() => {
    const map = new Map<
      string,
      {
        inOfficeNow: boolean;
        hasCompletedToday: boolean;
        hasZeroDurationAnomaly: boolean;
        hasIncompleteAnomaly: boolean;
        todayEntry: string | null;
      }
    >();

    (report?.employees || []).forEach((emp) => {
      let inOfficeNow = false;
      let hasCompletedToday = false;
      let hasZeroDurationAnomaly = false;
      let hasIncompleteAnomaly = false;
      let todayEntry: string | null = null;

      (emp.daily_records || []).forEach((d) => {
        const classified = classifyDailyRecord(d);
        if (classified.state === 'ZERO_DURATION') {
          hasZeroDurationAnomaly = true;
        }
        if (classified.state === 'INCOMPLETE_STALE') {
          hasIncompleteAnomaly = true;
        }

        if (d.work_date === todayIST) {
          todayEntry = d.entry_time;
          if (d.status === 'IN_PROGRESS') {
            inOfficeNow = true;
          } else if (d.status === 'COMPLETED') {
            hasCompletedToday = true;
          }
        }
      });

      map.set(emp.employee_id, {
        inOfficeNow,
        hasCompletedToday,
        hasZeroDurationAnomaly,
        hasIncompleteAnomaly,
        todayEntry,
      });
    });

    return map;
  }, [report, todayIST]);

  // Metric counts
  const inOfficeEmployees = useMemo(() => {
    return (report?.employees || []).filter((e) => employeeMetadata.get(e.employee_id)?.inOfficeNow);
  }, [report, employeeMetadata]);

  const belowThresholdEmployees = useMemo(() => {
    return (report?.employees || []).filter((e) => e.total_attended_days < 3 || e.total_office_hours < 15.0);
  }, [report]);

  const failedBothEmployees = useMemo(() => {
    return (report?.employees || []).filter((e) => e.total_attended_days < 3 && e.total_office_hours < 15.0);
  }, [report]);

  const anomalousEmployees = useMemo(() => {
    return (report?.employees || []).filter((e) => {
      const meta = employeeMetadata.get(e.employee_id);
      return meta?.hasZeroDurationAnomaly || meta?.hasIncompleteAnomaly;
    });
  }, [report, employeeMetadata]);

  const zeroAttendanceEmployees = useMemo(() => {
    return (report?.employees || []).filter((e) => e.total_attended_days === 0);
  }, [report]);

  const compliantEmployeesCount = useMemo(() => {
    return (report?.employees || []).filter((e) => e.total_attended_days >= 3 && e.total_office_hours >= 15.0).length;
  }, [report]);

  // Filtered list for the triage table
  const filteredEmployees = useMemo(() => {
    let list = report?.employees || [];

    if (employeeFilter === 'IN_OFFICE') {
      list = inOfficeEmployees;
    } else if (employeeFilter === 'BELOW_THRESHOLD') {
      list = belowThresholdEmployees;
    } else if (employeeFilter === 'FAILED_BOTH') {
      list = failedBothEmployees;
    } else if (employeeFilter === 'ANOMALIES') {
      list = anomalousEmployees;
    } else if (employeeFilter === 'ZERO_ATTENDANCE') {
      list = zeroAttendanceEmployees;
    }

    if (!searchQuery.trim()) return list;

    const query = searchQuery.toLowerCase();
    return list.filter(
      (e) =>
        e.full_name.toLowerCase().includes(query) ||
        e.employee_id.toLowerCase().includes(query) ||
        e.department.toLowerCase().includes(query)
    );
  }, [
    report,
    employeeFilter,
    inOfficeEmployees,
    belowThresholdEmployees,
    failedBothEmployees,
    anomalousEmployees,
    zeroAttendanceEmployees,
    searchQuery,
  ]);

  // Filtered health scores
  const filteredHealthScores = useMemo(() => {
    if (healthFilter === 'AT_RISK_ONLY') {
      return healthScores.filter((s) => s.health_rating === 'CRITICAL' || s.health_rating === 'AT_RISK' || s.chronic_issue);
    }
    return healthScores;
  }, [healthScores, healthFilter]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="h-7 w-64 bg-slate-200 rounded animate-pulse" />
          <div className="h-4 w-96 bg-slate-100 rounded animate-pulse" />
        </div>
        <LoadingSkeleton variant="stat" count={5} />
        <LoadingSkeleton variant="card" count={2} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-rose-600" />
          <h3 className="font-bold">Failed to load Dashboard</h3>
        </div>
        <p className="mt-1 text-xs">{error}</p>
        <button
          onClick={() => fetchDashboardData()}
          className="mt-3 px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs transition"
        >
          Retry
        </button>
      </div>
    );
  }

  const complianceRate =
    summary && summary.total_active_employees > 0
      ? Math.round(
          (summary.compliant_weeks_count /
            Math.max(1, summary.compliant_weeks_count + summary.non_compliant_weeks_count)) *
            100
        )
      : 0;

  return (
    <div className="space-y-6">
      {/* Title & Quick Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Company Overview & Compliance
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
              <Radio className="w-3 h-3 text-emerald-500 animate-pulse" />
              <span>Live Monitor</span>
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Enterprise attendance monitoring, policy compliance audits, and exception triage.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchDashboardData(true)}
            disabled={isRefreshing}
            className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
            title="Refresh dashboard data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-indigo-600' : ''}`} />
          </button>
          <Link
            to="/reports"
            className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition flex items-center gap-1.5 active:scale-95"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>Central Reports</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* Primary Actionable Metrics Grid (6 Responsive Cards) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          title="Total Active Employees"
          value={summary?.total_active_employees ?? report?.employees.length ?? 0}
          icon={<Users className="h-5 w-5 text-indigo-600" />}
          subtitle="Registered staff"
          onClick={() => navigate('/employees')}
        />
        <StatCard
          title="Currently In Office"
          value={inOfficeEmployees.length}
          variant={inOfficeEmployees.length > 0 ? 'success' : 'default'}
          badge="LIVE"
          icon={<UserCheck className="h-5 w-5 text-emerald-600" />}
          subtitle="Active sessions today"
          onClick={() => setEmployeeFilter('IN_OFFICE')}
        />
        <StatCard
          title="Compliant Weeks"
          value={summary?.compliant_weeks_count ?? compliantEmployeesCount}
          variant="success"
          icon={<ShieldCheck className="h-5 w-5 text-emerald-600" />}
          subtitle="Passed (>= 3 days & 15h)"
          onClick={() => setEmployeeFilter('ALL')}
        />
        <StatCard
          title="Non-Compliant Weeks"
          value={summary?.non_compliant_weeks_count ?? 0}
          variant={summary?.non_compliant_weeks_count ? 'danger' : 'default'}
          icon={<AlertTriangle className="h-5 w-5 text-rose-600" />}
          subtitle="Policy breaches flagged"
          onClick={() => setEmployeeFilter('BELOW_THRESHOLD')}
        />
        <StatCard
          title="Data Anomalies"
          value={anomalousEmployees.length}
          variant={anomalousEmployees.length > 0 ? 'warning' : 'default'}
          icon={<AlertCircle className="h-5 w-5 text-amber-600" />}
          subtitle="0.0h / Stale sessions"
          onClick={() => setEmployeeFilter('ANOMALIES')}
        />
        <StatCard
          title="Pending Violations"
          value={pendingViolations}
          variant={pendingViolations > 0 ? 'danger' : 'default'}
          icon={<Clock className="h-5 w-5 text-amber-600" />}
          subtitle="Awaiting review"
          onClick={() => navigate('/violations')}
        />
      </div>

      {/* Weekly Compliance & Policy Target Summary Bar */}
      <div className="rounded-2xl border border-slate-200 bg-linear-to-r from-indigo-50/60 via-white to-slate-50/60 p-4 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-900">
                Weekly Policy Baseline
              </span>
              <span className="text-[11px] font-medium text-slate-500">
                • Policy Week: {report?.metadata.start_date || '—'} to {report?.metadata.end_date || '—'}
              </span>
            </div>
            <p className="text-[11px] text-slate-600">
              Authoritative Requirement: Minimum <strong>3 eligible office days</strong> and <strong>15.0 office hours</strong> per week in Asia/Kolkata timezone.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs font-semibold">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-slate-500">Compliance Rate:</span>
              <span className={`font-bold ${complianceRate >= 80 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {complianceRate}%
              </span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-slate-500">Total Hours Accumulated:</span>
              <span className="font-bold text-slate-900">
                {summary?.total_office_hours_accumulated.toFixed(1) || '0.0'} hrs
              </span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-slate-500">Avg Office Hours:</span>
              <span className="font-bold text-slate-900">
                {summary?.average_hours_per_employee.toFixed(1) || '0.0'} hrs
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Employee Attendance Breakdown & Exception Triage */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden space-y-4 p-5">
        <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-indigo-600" />
              <span>Employee Attendance Breakdown</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Weekly Attendance & Exception Triage — identify staff meeting policy vs pending requirements.
            </p>
          </div>

          {/* Search bar inside triage panel */}
          <div className="relative w-full lg:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search staff, ID, department..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8.5 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Triage Exception Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1.5 rounded-xl text-xs font-semibold">
          <button
            onClick={() => setEmployeeFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
              employeeFilter === 'ALL'
                ? 'bg-white text-indigo-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>All Staff</span>
            <span className="text-[10px] bg-slate-200 px-1.5 py-0.2 rounded-full font-mono">
              {report?.employees.length || 0}
            </span>
          </button>
          <button
            onClick={() => setEmployeeFilter('IN_OFFICE')}
            className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
              employeeFilter === 'IN_OFFICE'
                ? 'bg-white text-emerald-600 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>In Office</span>
            <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded-full font-mono">
              {inOfficeEmployees.length}
            </span>
          </button>
          <button
            onClick={() => setEmployeeFilter('BELOW_THRESHOLD')}
            className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
              employeeFilter === 'BELOW_THRESHOLD'
                ? 'bg-white text-rose-600 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>Below Threshold</span>
            <span className="text-[10px] bg-rose-100 text-rose-800 px-1.5 py-0.2 rounded-full font-mono">
              {belowThresholdEmployees.length}
            </span>
          </button>
          <button
            onClick={() => setEmployeeFilter('FAILED_BOTH')}
            className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
              employeeFilter === 'FAILED_BOTH'
                ? 'bg-white text-rose-700 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>Failed Both</span>
            <span className="text-[10px] bg-rose-200 text-rose-900 px-1.5 py-0.2 rounded-full font-mono">
              {failedBothEmployees.length}
            </span>
          </button>
          <button
            onClick={() => setEmployeeFilter('ANOMALIES')}
            className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
              employeeFilter === 'ANOMALIES'
                ? 'bg-white text-amber-600 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>Anomalies</span>
            <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded-full font-mono">
              {anomalousEmployees.length}
            </span>
          </button>
          <button
            onClick={() => setEmployeeFilter('ZERO_ATTENDANCE')}
            className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
              employeeFilter === 'ZERO_ATTENDANCE'
                ? 'bg-white text-slate-700 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>Zero Attendance</span>
            <span className="text-[10px] bg-slate-200 px-1.5 py-0.2 rounded-full font-mono">
              {zeroAttendanceEmployees.length}
            </span>
          </button>
        </div>

        {/* Desktop Table View (Hidden on mobile) */}
        <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200/80">
          <table className="w-full text-xs text-left text-slate-600">
            <thead className="text-[11px] uppercase bg-slate-50 text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 font-semibold">Employee</th>
                <th className="px-4 py-3 font-semibold">Department</th>
                <th className="px-4 py-3 font-semibold">Today's Presence</th>
                <th className="px-4 py-3 font-semibold">Days Attended</th>
                <th className="px-4 py-3 font-semibold">Total Hours</th>
                <th className="px-4 py-3 font-semibold">Compliance Status</th>
                <th className="px-4 py-3 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center">
                    <EmptyState
                      title="No employees match exception filter"
                      description="All evaluated staff meet or exceed the selected threshold criteria."
                    />
                    <button
                      onClick={() => {
                        setEmployeeFilter('ALL');
                        setSearchQuery('');
                      }}
                      className="mt-3 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-lg transition"
                    >
                      Clear Exception Filters
                    </button>
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((emp) => {
                  const meta = employeeMetadata.get(emp.employee_id);
                  const policy = getPolicyBreakdown(emp.total_attended_days, emp.total_office_hours, emp.overall_compliance);
                  const isUnder = !policy.bothMet;
                  const hasZero = emp.total_attended_days === 0;

                  return (
                    <tr
                      key={emp.employee_id}
                      className={`transition ${
                        meta?.inOfficeNow
                          ? 'bg-emerald-50/20'
                          : meta?.hasZeroDurationAnomaly
                          ? 'bg-amber-50/30'
                          : hasZero
                          ? 'bg-slate-50/60'
                          : isUnder
                          ? 'bg-rose-50/20'
                          : 'hover:bg-slate-50/60'
                      }`}
                    >
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-slate-900">{emp.full_name}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{emp.employee_id}</div>
                      </td>
                      <td className="px-4 py-3.5 font-medium text-slate-700">
                        {emp.department}
                      </td>
                      <td className="px-4 py-3.5">
                        {meta?.inOfficeNow ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            In Office Now
                          </span>
                        ) : meta?.hasCompletedToday ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600">
                            Clocked Out Today
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400">Not Clocked In Today</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-900">{emp.total_attended_days}</span>
                          <span className="text-slate-400 font-normal">/ 3 days</span>
                          {policy.meetsDays ? (
                            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1 rounded border border-emerald-200">MET</span>
                          ) : (
                            <span className="text-[10px] text-slate-500 font-medium">({policy.daysRemaining} needed)</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-900">{emp.total_office_hours.toFixed(1)}</span>
                          <span className="text-slate-400 font-normal">/ 15.0h</span>
                          {policy.meetsHours ? (
                            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1 rounded border border-emerald-200">MET</span>
                          ) : (
                            <span className="text-[10px] text-slate-500 font-medium">({policy.hoursRemaining.toFixed(1)}h needed)</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-col gap-1 items-start">
                          <StatusBadge status={emp.overall_compliance || (isUnder ? 'NON_COMPLIANT' : 'COMPLIANT')} />
                          {meta?.hasZeroDurationAnomaly && (
                            <span
                              className="text-[10px] font-semibold text-amber-800 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200 flex items-center gap-1"
                              title="UI Review Flag: Recorded session under 3 mins. Historical data preserved."
                            >
                              <AlertCircle className="w-3 h-3 text-amber-600" />
                              <span>0.0h Record Flagged</span>
                            </span>
                          )}
                          {meta?.hasIncompleteAnomaly && (
                            <span className="text-[10px] font-semibold text-rose-700 bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200 flex items-center gap-1">
                              <XCircle className="w-3 h-3 text-rose-600" />
                              <span>Incomplete Session</span>
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <Link
                          to={`/reports?period=weekly&employee_id=${emp.employee_id}`}
                          className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 text-[11px] font-semibold inline-flex items-center gap-1 transition"
                          title="View weekly breakdown in Central Reports"
                        >
                          <span>Report</span>
                          <ExternalLink className="w-3 h-3 text-slate-400" />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Responsive Cards View (Shown on <md) */}
        <div className="md:hidden space-y-3">
          {filteredEmployees.length === 0 ? (
            <div className="p-6 bg-slate-50 rounded-xl text-center">
              <EmptyState
                title="No employees match exception filter"
                description="All evaluated staff meet or exceed the selected threshold criteria."
              />
              <button
                onClick={() => {
                  setEmployeeFilter('ALL');
                  setSearchQuery('');
                }}
                className="mt-3 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-lg transition"
              >
                Clear Exception Filters
              </button>
            </div>
          ) : (
            filteredEmployees.map((emp) => {
              const meta = employeeMetadata.get(emp.employee_id);
              const policy = getPolicyBreakdown(emp.total_attended_days, emp.total_office_hours, emp.overall_compliance);
              const isUnder = !policy.bothMet;

              return (
                <div
                  key={emp.employee_id}
                  className="rounded-xl border border-slate-200 p-4 bg-white shadow-2xs space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-sm text-slate-900">{emp.full_name}</h3>
                      <p className="text-xs text-slate-500 font-mono">{emp.employee_id} • {emp.department}</p>
                    </div>
                    <StatusBadge status={emp.overall_compliance || (isUnder ? 'NON_COMPLIANT' : 'COMPLIANT')} />
                  </div>

                  {meta?.hasZeroDurationAnomaly && (
                    <div className="text-[11px] font-semibold text-amber-800 bg-amber-50 px-2 py-1 rounded-md border border-amber-200 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>Zero-duration record flagged for review</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-100">
                    <div>
                      <span className="text-slate-500 block text-[11px]">Days Attended</span>
                      <strong className="text-slate-900">{emp.total_attended_days} / 3 days</strong>
                      <span className="block text-[10px] text-slate-400 mt-0.5">
                        {policy.meetsDays ? 'Target Met' : `${policy.daysRemaining} more needed`}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[11px]">Total Office Hours</span>
                      <strong className="text-slate-900">{emp.total_office_hours.toFixed(1)} / 15.0 hrs</strong>
                      <span className="block text-[10px] text-slate-400 mt-0.5">
                        {policy.meetsHours ? 'Target Met' : `${policy.hoursRemaining.toFixed(1)}h needed`}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                    <div>
                      {meta?.inOfficeNow ? (
                        <span className="inline-flex items-center gap-1 font-bold text-emerald-700 text-[11px]">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          In Office Now
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">
                          {meta?.hasCompletedToday ? 'Clocked out today' : 'Not clocked in today'}
                        </span>
                      )}
                    </div>
                    <Link
                      to={`/reports?period=weekly&employee_id=${emp.employee_id}`}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                    >
                      <span>View Report</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Rolling 4-Week Health Scores Section */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-200 px-6 py-4 gap-3">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-indigo-600" />
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Continuous Compliance Health Score (Rolling 4-Week History)
              </h2>
              <p className="text-xs text-slate-500">
                Automated rolling health scores per employee to identify chronic under-hours patterns.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
              <button
                onClick={() => setHealthFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  healthFilter === 'ALL'
                    ? 'bg-white text-indigo-600 shadow-xs'
                    : 'text-slate-600'
                }`}
              >
                All Scores
              </button>
              <button
                onClick={() => setHealthFilter('AT_RISK_ONLY')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  healthFilter === 'AT_RISK_ONLY'
                    ? 'bg-white text-rose-600 shadow-xs font-bold'
                    : 'text-slate-600'
                }`}
              >
                At Risk / Critical
              </button>
            </div>
            <Link
              to="/violations"
              className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
            >
              <span>Policy Violations ({violations.length})</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-6 bg-slate-50/40">
          {filteredHealthScores.length === 0 ? (
            <div className="col-span-full py-8 text-center">
              <EmptyState
                title="No health scores match filter"
                description="No employee records currently meet the selected health criteria."
              />
            </div>
          ) : (
            filteredHealthScores.slice(0, 8).map((score) => {
              const isCritical = score.health_rating === 'CRITICAL';
              const isAtRisk = score.health_rating === 'AT_RISK';
              return (
                <div
                  key={score.employee_id}
                  className={`rounded-xl border p-4 bg-white shadow-2xs transition flex flex-col justify-between ${
                    score.chronic_issue
                      ? 'border-amber-300 ring-1 ring-amber-100'
                      : 'border-slate-200'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-900 truncate">
                        {score.employee_id}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                          isCritical
                            ? 'bg-rose-100 text-rose-800'
                            : isAtRisk
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {score.health_rating}
                      </span>
                    </div>

                    <div className="space-y-1.5 my-3">
                      <div className="flex justify-between text-[11px] text-slate-600">
                        <span>4-Week Compliance</span>
                        <span className="font-bold text-slate-900">
                          {score.compliant_weeks} / {score.total_evaluated_weeks} wks
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-1.5 rounded-full ${
                            score.health_score >= 75 ? 'bg-emerald-500' : 'bg-rose-500'
                          }`}
                          style={{ width: `${Math.min(Math.max(score.health_score, 0), 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                    <span>Score: {score.health_score.toFixed(0)}%</span>
                    {score.chronic_issue && (
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                        Chronic Issue
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
