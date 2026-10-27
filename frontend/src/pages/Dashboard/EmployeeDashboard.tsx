import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { attendanceApi, reportsApi } from '../../api';
import { useToast } from '../../context/ToastContext';
import type { TodayAttendanceRecord, AttendanceReportResponse, AttendanceRecord } from '../../types';
import { StatCard } from '../../components/common/StatCard';
import { StatusBadge } from '../../components/common/StatusBadge';
import { LoadingSkeleton } from '../../components/common/LoadingSkeleton';
import { EmptyState } from '../../components/common/EmptyState';
import { WeeklyPolicyProgress, getComplianceState } from '../../components/Dashboard/WeeklyPolicyProgress';
import {
  Clock,
  Calendar,
  CheckCircle2,
  ArrowRightCircle,
  Layers,
  ArrowUpRight,
} from 'lucide-react';

export const EmployeeDashboard: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();
  const [todayRecord, setTodayRecord] = useState<TodayAttendanceRecord | null>(null);
  const [weeklyReport, setWeeklyReport] = useState<AttendanceReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  const empId = user?.employee_id || 'EMP001';

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [todayRes, weekRes] = await Promise.all([
        attendanceApi.getToday(empId),
        reportsApi.getReport({ period: 'weekly', employee_id: empId }),
      ]);
      setTodayRecord(todayRes);
      setWeeklyReport(weekRes);
    } catch {
      // Handled gracefully
    } finally {
      setLoading(false);
    }
  }, [empId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Live timer for active session
  useEffect(() => {
    const active = todayRecord?.active_session || (todayRecord?.attendance_status === 'IN_PROGRESS' ? todayRecord : null);
    if (!active || !active.entry_time) {
      setElapsedSeconds(0);
      return;
    }

    const startMs = new Date(active.entry_time).getTime();
    const update = () => {
      const diffSec = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
      setElapsedSeconds(diffSec);
    };

    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [todayRecord]);

  const formatElapsed = (sec: number) => {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    return `${hrs}h ${mins}m`;
  };

  const handleCheckIn = async () => {
    try {
      setActionLoading(true);
      await attendanceApi.checkIn(empId);
      toast.success('Checked in successfully!');
      await fetchData();
    } catch (err: any) {
      const errorMsg = err?.response?.data?.message || err?.response?.data?.detail || 'Failed to check in';
      toast.error(errorMsg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckOut = async () => {
    try {
      setActionLoading(true);
      await attendanceApi.checkOut({ employee_id: empId });
      toast.success('Checked out successfully!');
      await fetchData();
    } catch (err: any) {
      const errorMsg = err?.response?.data?.message || err?.response?.data?.detail || 'Failed to check out';
      toast.error(errorMsg);
    } finally {
      setActionLoading(false);
    }
  };

  const formatTime = (iso?: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const myCompliance = weeklyReport?.employees.find((e) => e.employee_id === empId);
  const daysAttended = myCompliance?.total_attended_days ?? (todayRecord && todayRecord.duration_hours > 0 ? 1 : 0);
  const hoursAttended = myCompliance?.total_office_hours ?? (todayRecord?.duration_hours || 0);

  const complianceInfo = useMemo(() => {
    return getComplianceState(daysAttended, hoursAttended, 3, 15);
  }, [daysAttended, hoursAttended]);

  const isSessionActive = todayRecord?.attendance_status === 'IN_PROGRESS';
  const todaySessions: AttendanceRecord[] = useMemo(() => {
    if (todayRecord?.sessions && todayRecord.sessions.length > 0) {
      return todayRecord.sessions;
    }
    if (todayRecord && todayRecord.attendance_id) {
      return [todayRecord];
    }
    return [];
  }, [todayRecord]);

  const sessionCount = todayRecord?.total_sessions ?? todaySessions.length;

  return (
    <div className="space-y-6">
      {/* Top Welcome & Quick Actions Hero */}
      <div
        className={`rounded-2xl border p-6 shadow-xs flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 transition ${
          isSessionActive
            ? 'border-amber-300 bg-gradient-to-r from-amber-50/50 via-white to-white'
            : 'border-slate-200/90 bg-white'
        }`}
      >
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Welcome back, {user?.username}!
            </h1>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 uppercase">
              {user?.role}
            </span>
            {isSessionActive && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" aria-hidden="true" />
                Active Session In Progress
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span>
              Employee ID: <strong className="text-slate-700">{empId}</strong>
            </span>
            <span>•</span>
            <span>
              Workday: <strong className="text-slate-700">{todayRecord?.work_date || 'Today'}</strong>
            </span>
            <span>•</span>
            {isSessionActive ? (
              <span className="text-amber-800 font-medium">
                Live Elapsed: <strong className="font-mono font-bold">{formatElapsed(elapsedSeconds)}</strong>
              </span>
            ) : (
              <span className="text-slate-600">
                {complianceInfo.state === 'FULLY_COMPLIANT'
                  ? 'Weekly policy goal achieved ✓'
                  : `Remaining target: ${complianceInfo.remainingDays > 0 ? `${complianceInfo.remainingDays} eligible day${complianceInfo.remainingDays > 1 ? 's' : ''}` : ''}${complianceInfo.remainingDays > 0 && complianceInfo.remainingHours > 0 ? ' & ' : ''}${complianceInfo.remainingHours > 0 ? `${complianceInfo.remainingHours}h` : ''}`}
              </span>
            )}
          </div>
        </div>

        {/* Quick Check-in/out Action Area */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full lg:w-auto">
          <button
            onClick={handleCheckIn}
            disabled={actionLoading || isSessionActive}
            aria-label={sessionCount > 0 ? 'Start Next Attendance Session' : 'Check In to Office'}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition ${
              isSessionActive
                ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white active:scale-95'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>{sessionCount > 0 ? 'Start Next Session' : 'Check In'}</span>
          </button>

          <button
            onClick={handleCheckOut}
            disabled={actionLoading || !isSessionActive}
            aria-label="Check Out of Office"
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition ${
              !isSessionActive
                ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                : 'bg-amber-500 hover:bg-amber-600 text-white ring-2 ring-amber-400 ring-offset-1 active:scale-95'
            }`}
          >
            <ArrowRightCircle className="w-4 h-4" />
            <span>Check Out</span>
          </button>
        </div>
      </div>



      {/* 5 Summary Metric Cards (Section 5 Requirement) */}
      {loading ? (
        <LoadingSkeleton variant="stat" count={5} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard
            title="Today's Hours"
            value={`${(todayRecord?.duration_hours || 0).toFixed(2)}h`}
            icon={<Clock className="w-5 h-5 text-indigo-600" />}
            subtitle={isSessionActive ? `+${formatElapsed(elapsedSeconds)} live (finalizes on check-out)` : 'Completed hours today'}
          />
          <StatCard
            title="Today's Sessions"
            value={`${sessionCount} ${sessionCount === 1 ? 'session' : 'sessions'}`}
            icon={<Layers className="w-5 h-5 text-blue-600" />}
            subtitle={isSessionActive ? '1 session currently active' : 'Multi-session enabled'}
          />
          <StatCard
            title="Weekly Hours"
            value={`${hoursAttended.toFixed(1)} / 15.0h`}
            variant={hoursAttended >= 15 ? 'success' : 'default'}
            icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />}
            subtitle={isSessionActive ? 'Active session finalizes on check-out' : (complianceInfo.remainingHours > 0 ? `${complianceInfo.remainingHours}h remaining` : 'Target met (>=15h)')}
          />
          <StatCard
            title="Weekly Days"
            value={`${daysAttended} / 3 days`}
            variant={daysAttended >= 3 ? 'success' : 'default'}
            icon={<Calendar className="w-5 h-5 text-violet-600" />}
            subtitle={complianceInfo.remainingDays > 0 ? `${complianceInfo.remainingDays} day(s) remaining` : 'Target met (>=3d)'}
          />
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Weekly Compliance
              </p>
              <div className="mt-2">
                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold border ${
                    complianceInfo.state === 'FULLY_COMPLIANT'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : complianceInfo.state === 'HOURS_PENDING'
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : complianceInfo.state === 'DAYS_PENDING'
                      ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                      : 'bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  {complianceInfo.label}
                </span>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-slate-500 line-clamp-2">
              {complianceInfo.description}
            </p>
          </div>
        </div>
      )}

      {/* Weekly Policy Progress Indicators */}
      <WeeklyPolicyProgress
        daysAttended={daysAttended}
        hoursAttended={hoursAttended}
        requiredDays={3}
        requiredHours={15}
        isSessionActive={isSessionActive}
      />

      {/* Today's Session Breakdown Mini-List */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-600" />
              <span>Today's Sessions Summary</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Detailed list of entrance and exit records for today
            </p>
          </div>
          <Link
            to="/attendance"
            className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 transition"
          >
            <span>Full Attendance Console</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {todaySessions.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="No sessions logged today"
            description="Clock in to record your office attendance session."
          />
        ) : (
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200/80 overflow-hidden">
            {todaySessions.map((sess, idx) => {
              const isCurr = sess.attendance_status === 'IN_PROGRESS';
              return (
                <div
                  key={sess.attendance_id || idx}
                  className={`p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition ${
                    isCurr ? 'bg-amber-50/40' : 'hover:bg-slate-50/60'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-7 w-7 rounded-lg bg-indigo-50 text-indigo-700 font-bold flex items-center justify-center text-xs">
                      #{idx + 1}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">
                        Session {idx + 1}{' '}
                        {isCurr && (
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.2 rounded ml-1.5">
                            Live
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        In: {formatTime(sess.entry_time)} • Out: {formatTime(sess.exit_time)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="font-bold text-slate-900">
                        {isCurr
                          ? `${formatElapsed(elapsedSeconds)} (live)`
                          : `${sess.duration_hours.toFixed(2)} hrs (${(sess.duration_minutes || sess.duration_hours * 60).toFixed(0)} min)`}
                      </p>
                      <p className="text-[10px] text-slate-400">Duration</p>
                    </div>
                    <StatusBadge status={sess.attendance_status} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
