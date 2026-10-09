import React, { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { attendanceApi, reportsApi } from '../../api';
import type { AttendanceRecord, AttendanceReportResponse } from '../../types';
import { StatCard } from '../../components/common/StatCard';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Clock, Calendar, CheckCircle2, AlertTriangle, ArrowRightCircle } from 'lucide-react';

export const EmployeeDashboard: React.FC = () => {
  const { user } = useAuth();
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [weeklyReport, setWeeklyReport] = useState<AttendanceReportResponse | null>(null);
  const [, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [todayRes, weekRes] = await Promise.all([
        attendanceApi.getToday(user?.employee_id || undefined),
        reportsApi.getReport({ period: 'weekly', employee_id: user?.employee_id || undefined }),
      ]);
      setTodayRecord(todayRes);
      setWeeklyReport(weekRes);
    } catch {
      // Handled gracefully
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const handleCheckIn = async () => {
    try {
      setActionLoading(true);
      setMsg(null);
      await attendanceApi.checkIn(user?.employee_id || undefined);
      setMsg({ type: 'success', text: 'Checked in successfully!' });
      await fetchData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err?.response?.data?.detail || 'Failed to check in' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckOut = async () => {
    try {
      setActionLoading(true);
      setMsg(null);
      await attendanceApi.checkOut(user?.employee_id || undefined);
      setMsg({ type: 'success', text: 'Checked out successfully!' });
      await fetchData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err?.response?.data?.detail || 'Failed to check out' });
    } finally {
      setActionLoading(false);
    }
  };

  const myCompliance = weeklyReport?.employees.find((e) => e.employee_id === user?.employee_id);
  const daysAttended = myCompliance?.total_attended_days ?? (todayRecord ? 1 : 0);
  const hoursAttended = myCompliance?.total_office_hours ?? (todayRecord?.duration_hours || 0);
  const isCompliant = myCompliance ? myCompliance.overall_compliance === 'COMPLIANT' : (daysAttended >= 3 && hoursAttended >= 15);

  const formatTime = (iso?: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-6 text-white shadow-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Welcome back, {user?.username}!</h1>
          <p className="text-blue-100 text-sm mt-1">
            Employee ID: <span className="font-semibold">{user?.employee_id || 'N/A'}</span> • Role: {user?.role}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleCheckIn}
            disabled={actionLoading || !!todayRecord?.entry_time}
            className={`px-5 py-2.5 rounded-xl font-medium text-sm flex items-center gap-2 shadow-sm transition ${
              todayRecord?.entry_time
                ? 'bg-emerald-500/30 text-emerald-100 cursor-not-allowed border border-emerald-400/40'
                : 'bg-white text-blue-700 hover:bg-blue-50 active:scale-95'
            }`}
          >
            <Clock className="w-4 h-4" />
            {todayRecord?.entry_time ? 'Checked In' : 'Check In'}
          </button>

          <button
            onClick={handleCheckOut}
            disabled={actionLoading || !todayRecord?.entry_time || !!todayRecord?.exit_time}
            className={`px-5 py-2.5 rounded-xl font-medium text-sm flex items-center gap-2 shadow-sm transition ${
              todayRecord?.exit_time || !todayRecord?.entry_time
                ? 'bg-slate-500/20 text-slate-300 cursor-not-allowed border border-white/20'
                : 'bg-amber-400 text-slate-900 hover:bg-amber-300 active:scale-95'
            }`}
          >
            <ArrowRightCircle className="w-4 h-4" />
            {todayRecord?.exit_time ? 'Checked Out' : 'Check Out'}
          </button>
        </div>
      </div>

      {msg && (
        <div
          className={`p-4 rounded-xl text-sm font-medium flex items-center gap-2 ${
            msg.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {msg.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {msg.text}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Today's Check-in"
          value={formatTime(todayRecord?.entry_time)}
          icon={<Clock className="w-5 h-5 text-blue-600" />}
          subtitle={todayRecord?.entry_time ? 'Office entrance logged' : 'Not recorded yet'}
        />
        <StatCard
          title="Today's Check-out"
          value={formatTime(todayRecord?.exit_time)}
          icon={<ArrowRightCircle className="w-5 h-5 text-indigo-600" />}
          subtitle={todayRecord?.exit_time ? 'Day concluded' : 'Active shift'}
        />
        <StatCard
          title="Weekly Days"
          value={`${daysAttended} / 3 days`}
          icon={<Calendar className="w-5 h-5 text-emerald-600" />}
          subtitle="Policy target: >= 3 days"
        />
        <StatCard
          title="Weekly Hours"
          value={`${hoursAttended.toFixed(1)} / 15.0 hrs`}
          icon={<CheckCircle2 className="w-5 h-5 text-violet-600" />}
          subtitle="Policy target: >= 15.0 hrs"
        />
      </div>

      {/* Policy Compliance Status */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900">Current Week Policy Compliance</h2>
          <StatusBadge status={isCompliant ? 'COMPLIANT' : 'NON_COMPLIANT'} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-slate-600">Office Attendance Days</span>
              <span className="text-sm font-bold text-slate-800">{daysAttended} of 3 required</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2.5">
              <div
                className={`h-2.5 rounded-full transition-all ${
                  daysAttended >= 3 ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
                style={{ width: `${Math.min((daysAttended / 3) * 100, 100)}%` }}
              />
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {daysAttended >= 3 ? 'Requirement fulfilled' : `${3 - daysAttended} more day(s) required this calendar week`}
            </p>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-slate-600">Office Working Hours</span>
              <span className="text-sm font-bold text-slate-800">{hoursAttended.toFixed(1)} of 15.0 required</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2.5">
              <div
                className={`h-2.5 rounded-full transition-all ${
                  hoursAttended >= 15 ? 'bg-emerald-500' : 'bg-blue-500'
                }`}
                style={{ width: `${Math.min((hoursAttended / 15) * 100, 100)}%` }}
              />
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {hoursAttended >= 15 ? 'Requirement fulfilled' : `${(15 - hoursAttended).toFixed(1)} hours remaining to comply`}
            </p>
          </div>
        </div>
      </div>

      {/* Today's Detail Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900 mb-4">Today's Attendance Summary</h2>
        {todayRecord ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div className="p-3 bg-slate-50 rounded-lg">
              <span className="text-slate-500 block text-xs">Date</span>
              <span className="font-semibold text-slate-800">{todayRecord.work_date}</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg">
              <span className="text-slate-500 block text-xs">Check In</span>
              <span className="font-semibold text-slate-800">{formatTime(todayRecord.entry_time)}</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg">
              <span className="text-slate-500 block text-xs">Check Out</span>
              <span className="font-semibold text-slate-800">{formatTime(todayRecord.exit_time)}</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg">
              <span className="text-slate-500 block text-xs">Total Hours</span>
              <span className="font-semibold text-slate-800">{todayRecord.duration_hours.toFixed(2)} hrs</span>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-slate-500">
            <p>No check-in record for today yet.</p>
            <p className="text-xs text-slate-400 mt-1">Click the "Check In" button above when you enter the office.</p>
          </div>
        )}
      </div>
    </div>
  );
};
