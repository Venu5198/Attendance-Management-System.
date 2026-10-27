import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { reportsApi } from '../../api';
import type { AttendanceReportResponse, EmployeeReportItem } from '../../types';
import { StatusBadge } from '../../components/common/StatusBadge';
import { AuditTrailPanel } from '../../components/Reports/AuditTrailPanel';
import { StatCard } from '../../components/common/StatCard';
import { LoadingSkeleton } from '../../components/common/LoadingSkeleton';
import { EmptyState } from '../../components/common/EmptyState';
import {
  formatISTTime,
  formatISTDate,
  classifyDailyRecord,
  getPolicyBreakdown,
  exportFilteredReportToCSV,
} from '../../utils/reportUtils';
import {
  FileSpreadsheet,
  Search,
  Filter,
  Download,
  CheckCircle2,
  XCircle,
  Mail,
  Send,
  AlertTriangle,
  Shield,
  BarChart3,
  Clock,
  ChevronDown,
  ChevronUp,
  X,
  Users,
  RotateCcw,
  Calendar,
  AlertCircle,
  ArrowUpDown,
} from 'lucide-react';

type SortField = 'name' | 'department' | 'days' | 'hours' | 'compliance';
type SortOrder = 'asc' | 'desc';

export const ReportsPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [searchParams, setSearchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState<'reports' | 'audit'>('reports');
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom'>(
    (searchParams.get('period') as any) || 'weekly'
  );
  const [targetDate, setTargetDate] = useState<string>(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
  );
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [employeeIdFilter, setEmployeeIdFilter] = useState<string>(searchParams.get('employee_id') || '');

  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<AttendanceReportResponse | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'COMPLIANT' | 'NON_COMPLIANT' | 'PENDING'>('ALL');
  const [anomalyFilter, setAnomalyFilter] = useState<'ALL' | 'ZERO_DURATION_ONLY' | 'ANOMALIES_ONLY'>('ALL');
  const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null);

  // Sorting state
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  // Email modal state
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('devopspractices26@gmail.com');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const todayIST = useMemo(() => {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  }, []);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const params: any = { period };
      if (period === 'custom') {
        if (startDate) params.start_date = startDate;
        if (endDate) params.end_date = endDate;
      } else {
        if (targetDate) params.target_date = targetDate;
      }

      if (isAdmin && employeeIdFilter.trim()) {
        params.employee_id = employeeIdFilter.trim();
      }

      const res = await reportsApi.getReport(params);
      setReport(res);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.response?.data?.message || err?.response?.data?.detail || 'Failed to generate report.',
      });
    } finally {
      setLoading(false);
    }
  }, [period, targetDate, startDate, endDate, isAdmin, employeeIdFilter]);

  // Initial load
  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (period === 'custom') {
      if (!startDate || !endDate) {
        setFeedback({
          type: 'error',
          text: 'Validation Error: Both Start Date and End Date are required for a custom date range.',
        });
        return;
      }
      if (startDate > endDate) {
        setFeedback({
          type: 'error',
          text: 'Validation Error: Start Date cannot be later than End Date.',
        });
        return;
      }
    }
    fetchReport();
  };

  const handlePresetSelect = (selectedPeriod: 'daily' | 'weekly' | 'monthly') => {
    setPeriod(selectedPeriod);
    setTargetDate(todayIST);
    setStartDate('');
    setEndDate('');
    setFeedback(null);
  };

  const handleResetFilters = () => {
    setPeriod('weekly');
    setTargetDate(todayIST);
    setStartDate('');
    setEndDate('');
    setEmployeeIdFilter('');
    setSearchTerm('');
    setDepartmentFilter('ALL');
    setStatusFilter('ALL');
    setAnomalyFilter('ALL');
    setSortField('name');
    setSortOrder('asc');
    setFeedback(null);
    setSearchParams({});
  };

  // Unique departments for filter dropdown
  const departments = useMemo(() => {
    const set = new Set<string>();
    (report?.employees || []).forEach((e) => {
      if (e.department) set.add(e.department);
    });
    return Array.from(set).sort();
  }, [report]);

  // Filtered employees list
  const filteredRecords = useMemo(() => {
    const list = (report?.employees || []).filter((r) => {
      const query = searchTerm.toLowerCase();
      const matchesSearch =
        r.full_name.toLowerCase().includes(query) ||
        r.employee_id.toLowerCase().includes(query) ||
        r.department.toLowerCase().includes(query);

      const matchesDept = departmentFilter === 'ALL' || r.department === departmentFilter;

      const policy = getPolicyBreakdown(r.total_attended_days, r.total_office_hours, r.overall_compliance);
      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'COMPLIANT' && policy.complianceState === 'COMPLIANT') ||
        (statusFilter === 'NON_COMPLIANT' && policy.complianceState === 'NON_COMPLIANT') ||
        (statusFilter === 'PENDING' && (policy.complianceState === 'DAYS_PENDING' || policy.complianceState === 'HOURS_PENDING' || policy.complianceState === 'BOTH_PENDING'));

      let matchesAnomaly = true;
      if (anomalyFilter === 'ZERO_DURATION_ONLY') {
        matchesAnomaly = r.daily_records.some((d) => classifyDailyRecord(d).state === 'ZERO_DURATION');
      } else if (anomalyFilter === 'ANOMALIES_ONLY') {
        matchesAnomaly = r.daily_records.some((d) => classifyDailyRecord(d).isAnomaly);
      }

      return matchesSearch && matchesDept && matchesStatus && matchesAnomaly;
    });

    // Sorting
    return list.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') {
        cmp = a.full_name.localeCompare(b.full_name);
      } else if (sortField === 'department') {
        cmp = a.department.localeCompare(b.department);
      } else if (sortField === 'days') {
        cmp = a.total_attended_days - b.total_attended_days;
      } else if (sortField === 'hours') {
        cmp = a.total_office_hours - b.total_office_hours;
      } else if (sortField === 'compliance') {
        const compA = a.overall_compliance || '';
        const compB = b.overall_compliance || '';
        cmp = compA.localeCompare(compB);
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });
  }, [report, searchTerm, departmentFilter, statusFilter, anomalyFilter, sortField, sortOrder]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const handleExportCSV = () => {
    if (!report || filteredRecords.length === 0) return;
    exportFilteredReportToCSV(filteredRecords, {
      period,
      start_date: report.metadata.start_date,
      end_date: report.metadata.end_date,
    });
  };

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientEmail) return;
    setSendingEmail(true);
    setFeedback(null);
    try {
      const params: any = {
        recipient_email: recipientEmail,
        period,
      };
      if (period === 'custom') {
        if (startDate) params.start_date = startDate;
        if (endDate) params.end_date = endDate;
      } else {
        if (targetDate) params.target_date = targetDate;
      }
      if (isAdmin && employeeIdFilter.trim()) {
        params.employee_id = employeeIdFilter.trim();
      }
      const res = await reportsApi.emailReport(params);
      setFeedback({ type: 'success', text: res.message });
      setShowEmailModal(false);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.response?.data?.detail || err?.response?.data?.message || 'Failed to email attendance report.',
      });
    } finally {
      setSendingEmail(false);
    }
  };

  // Totals calculated over filtered employees
  const totals = useMemo(() => {
    const totalStaff = filteredRecords.length;
    const totalDays = filteredRecords.reduce((acc, r) => acc + r.total_attended_days, 0);
    const totalHours = filteredRecords.reduce((acc, r) => acc + r.total_office_hours, 0);
    const avgHours = totalStaff > 0 ? totalHours / totalStaff : 0;
    return { totalStaff, totalDays, totalHours, avgHours };
  }, [filteredRecords]);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {isAdmin ? 'Central Attendance Reports' : 'My Attendance Report'}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {isAdmin
              ? 'Consolidated multi-employee reports, weekly policy compliance audit, and data exports.'
              : 'Review your historical attendance records and policy compliance status across custom periods.'}
          </p>
        </div>

        {/* Tab & Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {isAdmin && (
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200/80 dark:border-slate-700 text-xs font-semibold">
              <button
                onClick={() => setActiveTab('reports')}
                className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
                  activeTab === 'reports'
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>Reports</span>
              </button>
              <button
                onClick={() => setActiveTab('audit')}
                className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
                  activeTab === 'audit'
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Compliance Audit Trail</span>
              </button>
            </div>
          )}

          {activeTab === 'reports' && report && (
            <div className="flex items-center gap-2">
              {isAdmin && (
                <button
                  onClick={() => setShowEmailModal(true)}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition active:scale-95"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Email Report</span>
                </button>
              )}
              <button
                onClick={handleExportCSV}
                disabled={filteredRecords.length === 0}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition active:scale-95 disabled:opacity-50"
                title="Export filtered records to CSV"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV ({filteredRecords.length})</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Feedback Messages */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl text-xs font-medium flex items-center justify-between gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-xs opacity-60 hover:opacity-100">
            Dismiss
          </button>
        </div>
      )}

      {activeTab === 'audit' && isAdmin ? (
        <AuditTrailPanel />
      ) : (
        <>
          {/* Filter & Date Selection Bar */}
          <form
            onSubmit={handleGenerate}
            className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4"
          >
            {/* Quick Presets Row */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-slate-500 mr-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-indigo-500" />
                  <span>Quick Presets:</span>
                </span>
                <button
                  type="button"
                  onClick={() => handlePresetSelect('daily')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
                    period === 'daily'
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-300 dark:bg-indigo-950 dark:text-indigo-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
                  }`}
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => handlePresetSelect('weekly')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
                    period === 'weekly'
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-300 dark:bg-indigo-950 dark:text-indigo-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
                  }`}
                >
                  This Week
                </button>
                <button
                  type="button"
                  onClick={() => handlePresetSelect('monthly')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
                    period === 'monthly'
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-300 dark:bg-indigo-950 dark:text-indigo-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
                  }`}
                >
                  This Month
                </button>
              </div>

              <div className="flex items-center gap-2">
                {report && (
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                    Period: <strong>{report.metadata.start_date}</strong> to <strong>{report.metadata.end_date}</strong> (Asia/Kolkata)
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1 transition"
                  title="Reset all filters to defaults"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset</span>
                </button>
              </div>
            </div>

            {/* Inputs Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 items-end">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Period
                </label>
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value as any)}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium bg-white dark:bg-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                  <option value="custom">Custom Date Range</option>
                </select>
              </div>

              {period !== 'custom' ? (
                <div>
                  <label htmlFor="target-date-input" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Target Date
                  </label>
                  <input
                    id="target-date-input"
                    type="date"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-800"
                  />
                </div>
              ) : (
                <>
                  <div>
                    <label htmlFor="custom-start-date" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Start Date
                    </label>
                    <input
                      id="custom-start-date"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label htmlFor="custom-end-date" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      End Date
                    </label>
                    <input
                      id="custom-end-date"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-800"
                    />
                  </div>
                </>
              )}


              {isAdmin && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Employee ID (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. EMP001"
                    value={employeeIdFilter}
                    onChange={(e) => setEmployeeIdFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-800"
                  />
                </div>
              )}

              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-xs transition disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>{loading ? 'Generating...' : 'Generate Report'}</span>
                </button>
              </div>
            </div>
          </form>

          {/* Report Summary Cards */}
          {report && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Evaluated Staff"
                value={report.summary.total_active_employees}
                icon={<Users className="w-5 h-5 text-indigo-600" />}
                subtitle={`Coverage: ${report.metadata.start_date} to ${report.metadata.end_date}`}
              />
              <StatCard
                title="Compliant Weeks"
                value={report.summary.compliant_weeks_count}
                variant="success"
                icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />}
                subtitle="Policy met (>= 3 days & 15h)"
              />
              <StatCard
                title="Non-Compliant Weeks"
                value={report.summary.non_compliant_weeks_count}
                variant={report.summary.non_compliant_weeks_count > 0 ? 'danger' : 'default'}
                icon={<XCircle className="w-5 h-5 text-rose-600" />}
                subtitle="Below policy threshold"
              />
              <StatCard
                title="Avg Office Hours"
                value={`${report.summary.average_hours_per_employee.toFixed(1)} hrs`}
                icon={<Clock className="w-5 h-5 text-blue-600" />}
                subtitle={`Total: ${report.summary.total_office_hours_accumulated.toFixed(1)} accumulated`}
              />
            </div>
          )}

          {/* Search, Department, Status & Anomaly Filter Bar */}
          {report && report.employees.length > 0 && (
            <div className="flex flex-col md:flex-row justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter by employee name, ID, or department..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Department Filter */}
                {departments.length > 0 && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-slate-400 text-[11px] font-medium">Dept:</span>
                    <select
                      value={departmentFilter}
                      onChange={(e) => setDepartmentFilter(e.target.value)}
                      className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium px-2.5 py-1.5 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="ALL">All Departments</option>
                      {departments.map((dept) => (
                        <option key={dept} value={dept}>
                          {dept}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Status Filter */}
                <div className="flex items-center gap-1.5 text-xs">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium px-2.5 py-1.5 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="COMPLIANT">Compliant (Met)</option>
                    <option value="PENDING">Pending (Days/Hours)</option>
                    <option value="NON_COMPLIANT">Non-Compliant Only</option>
                  </select>
                </div>

                {/* Anomaly Filter */}
                <div className="flex items-center gap-1.5 text-xs">
                  <select
                    value={anomalyFilter}
                    onChange={(e) => setAnomalyFilter(e.target.value as any)}
                    className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium px-2.5 py-1.5 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="ALL">All Records</option>
                    <option value="ZERO_DURATION_ONLY">0.0h Non-Qualifying Only</option>
                    <option value="ANOMALIES_ONLY">All Anomalies (0h & Stale)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Main Report Table & Mobile Cards */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
            {loading ? (
              <div className="p-6">
                <LoadingSkeleton variant="table-row" count={5} />
              </div>
            ) : !report ? (
              <div className="p-8">
                <EmptyState
                  icon={BarChart3}
                  title="No report generated yet"
                  description="Select a reporting period and click 'Generate Report' to load data."
                />
              </div>
            ) : filteredRecords.length === 0 ? (
              <div className="p-8 text-center">
                <EmptyState
                  icon={Users}
                  title="No employees found"
                  description="No records match your search or status filter."
                />
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setDepartmentFilter('ALL');
                    setStatusFilter('ALL');
                    setAnomalyFilter('ALL');
                  }}
                  className="mt-3 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:hover:bg-indigo-900 dark:text-indigo-300 text-xs font-semibold rounded-lg transition"
                >
                  Clear Table Filters
                </button>
              </div>
            ) : (
              <>
                {/* Desktop View Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-xs text-left text-slate-600 dark:text-slate-300">
                    <thead className="text-[11px] uppercase bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="px-5 py-3 font-semibold">
                          <button
                            onClick={() => handleSort('name')}
                            className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-200"
                          >
                            <span>Employee</span>
                            <ArrowUpDown className="w-3 h-3 text-slate-400" />
                          </button>
                        </th>
                        <th className="px-5 py-3 font-semibold">
                          <button
                            onClick={() => handleSort('department')}
                            className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-200"
                          >
                            <span>Department</span>
                            <ArrowUpDown className="w-3 h-3 text-slate-400" />
                          </button>
                        </th>
                        <th className="px-5 py-3 font-semibold">
                          <button
                            onClick={() => handleSort('days')}
                            className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-200"
                          >
                            <span>Days Attended</span>
                            <ArrowUpDown className="w-3 h-3 text-slate-400" />
                          </button>
                        </th>
                        <th className="px-5 py-3 font-semibold">
                          <button
                            onClick={() => handleSort('hours')}
                            className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-200"
                          >
                            <span>Total Office Hours</span>
                            <ArrowUpDown className="w-3 h-3 text-slate-400" />
                          </button>
                        </th>
                        <th className="px-5 py-3 font-semibold">
                          <button
                            onClick={() => handleSort('compliance')}
                            className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-200"
                          >
                            <span>Policy Status</span>
                            <ArrowUpDown className="w-3 h-3 text-slate-400" />
                          </button>
                        </th>
                        <th className="px-5 py-3 font-semibold text-right">Daily Logs</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredRecords.map((r: EmployeeReportItem) => {
                        const isExpanded = expandedEmployee === r.employee_id;
                        const policy = getPolicyBreakdown(r.total_attended_days, r.total_office_hours, r.overall_compliance);
                        const hasZeroDuration = r.daily_records.some(
                          (d) => classifyDailyRecord(d).state === 'ZERO_DURATION'
                        );
                        const hasStale = r.daily_records.some(
                          (d) => classifyDailyRecord(d).state === 'INCOMPLETE_STALE'
                        );

                        return (
                          <React.Fragment key={r.employee_id}>
                            <tr className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition">
                              <td className="px-5 py-3.5">
                                <div className="font-bold text-slate-900 dark:text-slate-100">{r.full_name}</div>
                                <div className="text-[11px] text-slate-400 font-mono">{r.employee_id}</div>
                              </td>
                              <td className="px-5 py-3.5 text-slate-700 dark:text-slate-300 font-medium">
                                {r.department}
                              </td>
                              <td className="px-5 py-3.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-slate-900 dark:text-slate-100">{r.total_attended_days}</span>
                                  <span className="text-[11px] text-slate-400">/ 3 days</span>
                                  {policy.meetsDays ? (
                                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1 rounded border border-emerald-200">MET</span>
                                  ) : (
                                    <span className="text-[10px] text-slate-500 font-medium">({policy.daysRemaining} needed)</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-5 py-3.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-slate-900 dark:text-slate-100">{r.total_office_hours.toFixed(2)}</span>
                                  <span className="text-[11px] text-slate-400">/ 15.0h</span>
                                  {policy.meetsHours ? (
                                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1 rounded border border-emerald-200">MET</span>
                                  ) : (
                                    <span className="text-[10px] text-slate-500 font-medium">({policy.hoursRemaining.toFixed(1)}h needed)</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-5 py-3.5">
                                <div className="flex flex-col gap-1 items-start">
                                  <StatusBadge status={r.overall_compliance || 'PENDING'} />
                                  {hasZeroDuration && (
                                    <span
                                      className="text-[10px] font-semibold text-amber-800 bg-amber-50 dark:bg-amber-950 dark:text-amber-300 px-1.5 py-0.2 rounded border border-amber-200 dark:border-amber-800 flex items-center gap-1"
                                      title="Option B: 0.0h Non-qualifying Day (UI Anomaly Warning)"
                                    >
                                      <AlertCircle className="w-3 h-3 text-amber-600" />
                                      <span>0.0h Non-qualifying Day</span>
                                    </span>
                                  )}
                                  {hasStale && (
                                    <span className="text-[10px] font-semibold text-rose-700 bg-rose-50 dark:bg-rose-950 dark:text-rose-300 px-1.5 py-0.2 rounded border border-rose-200 dark:border-rose-800 flex items-center gap-1">
                                      <XCircle className="w-3 h-3 text-rose-600" />
                                      <span>Incomplete Session Flagged</span>
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-5 py-3.5 text-right">
                                <button
                                  type="button"
                                  data-testid={`daily-logs-btn-${r.employee_id}`}
                                  aria-label={`Toggle daily logs for ${r.full_name}`}
                                  onClick={() => setExpandedEmployee(isExpanded ? null : r.employee_id)}
                                  className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-semibold inline-flex items-center gap-1 transition"
                                >
                                  <span>{isExpanded ? 'Hide' : 'Daily Logs'}</span>
                                  {isExpanded ? (
                                    <ChevronUp className="w-3.5 h-3.5" />
                                  ) : (
                                    <ChevronDown className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </td>
                            </tr>

                            {/* Expanded Daily Breakdown Row */}
                            {isExpanded && (
                              <tr className="bg-slate-50/70 dark:bg-slate-950/40 border-t border-b border-slate-200 dark:border-slate-800">
                                <td colSpan={6} className="px-6 py-4">
                                  <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                      <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                                        Daily Breakdown for {r.full_name} ({r.daily_records.length} days covered)
                                      </h4>
                                      <span className="text-[11px] text-slate-500 font-mono">
                                        Timezone: Asia/Kolkata (IST)
                                      </span>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 pt-1">
                                      {r.daily_records.map((d) => {
                                        const classification = classifyDailyRecord(d);
                                        return (
                                          <div
                                            key={d.work_date}
                                            className={`p-3 rounded-xl border bg-white dark:bg-slate-900 text-xs space-y-1.5 shadow-2xs ${classification.borderColor}`}
                                          >
                                            <div className="flex justify-between items-start gap-1">
                                              <div>
                                                <span className="font-bold text-slate-900 dark:text-slate-100 block">
                                                  {formatISTDate(d.work_date)}
                                                </span>
                                                <span className="text-[10px] text-slate-400 font-mono">
                                                  {d.work_date}
                                                </span>
                                              </div>
                                              <span
                                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${classification.badgeColor}`}
                                              >
                                                {classification.state === 'ZERO_DURATION' && (
                                                  <AlertCircle className="w-3 h-3 text-amber-600" />
                                                )}
                                                {classification.label}
                                              </span>
                                            </div>

                                            <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 space-y-1 text-[11px] text-slate-600 dark:text-slate-400">
                                              <div className="flex justify-between">
                                                <span>Duration:</span>
                                                <strong className="text-slate-800 dark:text-slate-200">
                                                  {d.duration_hours.toFixed(2)}h ({d.duration_seconds}s)
                                                </strong>
                                              </div>
                                              <div className="flex justify-between">
                                                <span>Entry:</span>
                                                <span className="text-slate-700 dark:text-slate-300 font-mono">
                                                  {formatISTTime(d.entry_time)}
                                                </span>
                                              </div>
                                              <div className="flex justify-between">
                                                <span>Exit:</span>
                                                <span className="text-slate-700 dark:text-slate-300 font-mono">
                                                  {formatISTTime(d.exit_time)}
                                                </span>
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>

                    {/* Table Totals Footer */}
                    <tfoot className="bg-slate-50 dark:bg-slate-800/80 border-t-2 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-bold">
                      <tr>
                        <td className="px-5 py-3">
                          Total Staff: {totals.totalStaff}
                        </td>
                        <td className="px-5 py-3 text-slate-500 font-normal">Summary</td>
                        <td className="px-5 py-3">
                          {totals.totalDays} days total
                        </td>
                        <td className="px-5 py-3">
                          {totals.totalHours.toFixed(2)} hrs total
                        </td>
                        <td className="px-5 py-3" colSpan={2}>
                          Avg: {totals.avgHours.toFixed(1)} hrs / employee
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Mobile Responsive Cards View (Shown on <md) */}
                <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800 p-3 space-y-3">
                  {filteredRecords.map((r: EmployeeReportItem) => {
                    const isExpanded = expandedEmployee === r.employee_id;
                    const policy = getPolicyBreakdown(r.total_attended_days, r.total_office_hours, r.overall_compliance);
                    const hasZeroDuration = r.daily_records.some(
                      (d) => classifyDailyRecord(d).state === 'ZERO_DURATION'
                    );

                    return (
                      <div
                        key={r.employee_id}
                        className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 bg-white dark:bg-slate-900 shadow-2xs space-y-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">{r.full_name}</h3>
                            <p className="text-xs text-slate-500 font-mono">{r.employee_id} • {r.department}</p>
                          </div>
                          <StatusBadge status={r.overall_compliance || 'PENDING'} />
                        </div>

                        {hasZeroDuration && (
                          <div className="text-[10px] font-semibold text-amber-800 bg-amber-50 dark:bg-amber-950 dark:text-amber-300 px-2 py-1 rounded-md border border-amber-200 dark:border-amber-800 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3 text-amber-600" />
                            <span>Zero-duration (0.0h) record in period</span>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-100 dark:border-slate-800">
                          <div>
                            <span className="text-slate-500 block text-[11px]">Days Attended</span>
                            <strong className="text-slate-900 dark:text-slate-100">{r.total_attended_days} / 3 days</strong>
                            <span className="block text-[10px] text-slate-400 mt-0.5">
                              {policy.meetsDays ? 'Target Met' : `${policy.daysRemaining} needed`}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500 block text-[11px]">Total Office Hours</span>
                            <strong className="text-slate-900 dark:text-slate-100">{r.total_office_hours.toFixed(2)} / 15.0 hrs</strong>
                            <span className="block text-[10px] text-slate-400 mt-0.5">
                              {policy.meetsHours ? 'Target Met' : `${policy.hoursRemaining.toFixed(1)}h needed`}
                            </span>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                          <button
                            onClick={() => setExpandedEmployee(isExpanded ? null : r.employee_id)}
                            className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                          >
                            <span>{isExpanded ? 'Hide Daily Logs' : 'View Daily Logs'}</span>
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        </div>

                        {/* Mobile Expanded Daily Breakdown */}
                        {isExpanded && (
                          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                            <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                              Daily Logs (Asia/Kolkata):
                            </h5>
                            <div className="space-y-2">
                              {r.daily_records.map((d) => {
                                const classification = classifyDailyRecord(d);
                                return (
                                  <div
                                    key={d.work_date}
                                    className={`p-2.5 rounded-lg border text-xs space-y-1 bg-slate-50 dark:bg-slate-800/60 ${classification.borderColor}`}
                                  >
                                    <div className="flex justify-between items-center">
                                      <span className="font-bold text-slate-900 dark:text-slate-100">
                                        {formatISTDate(d.work_date)}
                                      </span>
                                      <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${classification.badgeColor}`}>
                                        {classification.label}
                                      </span>
                                    </div>
                                    <div className="flex justify-between text-[11px] text-slate-600 dark:text-slate-400">
                                      <span>Hours: {d.duration_hours.toFixed(2)}h</span>
                                      <span>In: {formatISTTime(d.entry_time)}</span>
                                      <span>Out: {formatISTTime(d.exit_time)}</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* Email Report Modal (Admin Only) */}
      {showEmailModal && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-100 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 rounded-xl">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Email Attendance Report</h3>
                  <p className="text-xs text-slate-500">Dispatch formatted HTML report to any inbox</p>
                </div>
              </div>
              <button
                onClick={() => setShowEmailModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSendEmail} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Destination Email Address
                </label>
                <input
                  type="email"
                  required
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="e.g. devops@company.com"
                  className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-800"
                />
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl text-xs text-slate-600 dark:text-slate-400 space-y-1 border border-slate-200/70 dark:border-slate-700">
                <div>
                  <strong>Period:</strong> {period.toUpperCase()}
                </div>
                <div>
                  <strong>Date Range:</strong> {report?.metadata.start_date} to {report?.metadata.end_date}
                </div>
                <div>
                  <strong>Evaluated Employees:</strong> {report?.summary.total_active_employees || 0}
                </div>
                {employeeIdFilter && (
                  <div>
                    <strong>Employee Filter:</strong> {employeeIdFilter}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEmailModal(false)}
                  className="px-3.5 py-1.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingEmail}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold disabled:opacity-50 flex items-center gap-1.5 shadow-xs transition active:scale-95"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{sendingEmail ? 'Sending...' : 'Send Report'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};