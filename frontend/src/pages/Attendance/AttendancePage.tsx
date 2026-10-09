import React, { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { attendanceApi } from '../../api';
import type { AttendanceRecord } from '../../types';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Clock, ArrowRightCircle, Calendar, Filter, CheckCircle2, AlertTriangle } from 'lucide-react';

export const AttendancePage: React.FC = () => {
  const { user } = useAuth();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const empId = user?.employee_id || 'EMP001';

  const fetchData = async () => {
    try {
      setLoading(true);
      const [todayRes, historyRes] = await Promise.all([
        attendanceApi.getToday(empId),
        attendanceApi.getHistory(empId, startDate || undefined, endDate || undefined),
      ]);
      setTodayRecord(todayRes);
      setRecords(historyRes);
    } catch {
      // Graceful fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const handleFilter = (e: React.FormEvent) => {
    e.preventDefault();
    fetchData();
  };

  const handleCheckIn = async () => {
    try {
      setActionLoading(true);
      setMsg(null);
      await attendanceApi.checkIn(empId);
      setMsg({ type: 'success', text: 'Office check-in recorded!' });
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
      await attendanceApi.checkOut(empId);
      setMsg({ type: 'success', text: 'Office check-out recorded!' });
      await fetchData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err?.response?.data?.detail || 'Failed to check out' });
    } finally {
      setActionLoading(false);
    }
  };

  const formatDateTime = (iso?: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Attendance Console</h1>
          <p className="text-sm text-slate-500">Record daily check-ins and inspect attendance logs</p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleCheckIn}
            disabled={actionLoading || !!todayRecord?.entry_time}
            className={`px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 shadow-sm transition ${
              todayRecord?.entry_time
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            <Clock className="w-4 h-4" />
            {todayRecord?.entry_time ? 'Checked In' : 'Check In'}
          </button>
          <button
            onClick={handleCheckOut}
            disabled={actionLoading || !todayRecord?.entry_time || !!todayRecord?.exit_time}
            className={`px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 shadow-sm transition ${
              todayRecord?.exit_time || !todayRecord?.entry_time
                ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                : 'bg-amber-500 hover:bg-amber-600 text-white'
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

      {/* Date Filter Bar */}
      <form onSubmit={handleFilter} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 text-sm text-slate-700 font-medium">
          <Calendar className="w-4 h-4 text-slate-400" />
          Filter Dates:
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-slate-400 text-sm">to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium rounded-lg flex items-center gap-1.5 transition"
        >
          <Filter className="w-3.5 h-3.5" />
          Apply Filter
        </button>
        {(startDate || endDate) && (
          <button
            type="button"
            onClick={() => {
              setStartDate('');
              setEndDate('');
              attendanceApi.getHistory(empId).then((data) => setRecords(data));
            }}
            className="text-xs text-blue-600 hover:underline"
          >
            Clear Filter
          </button>
        )}
      </form>

      {/* Attendance History Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-slate-600">
            <thead className="text-xs uppercase bg-slate-50 text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 font-semibold">Date</th>
                <th className="px-6 py-3 font-semibold">Check In</th>
                <th className="px-6 py-3 font-semibold">Check Out</th>
                <th className="px-6 py-3 font-semibold">Office Hours</th>
                <th className="px-6 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-slate-400">Loading attendance logs...</td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-slate-400">No attendance records found for this period.</td>
                </tr>
              ) : (
                records.map((rec) => (
                  <tr key={rec.attendance_id} className="hover:bg-slate-50/60 transition">
                    <td className="px-6 py-4 font-medium text-slate-900">{rec.work_date}</td>
                    <td className="px-6 py-4">{formatDateTime(rec.entry_time)}</td>
                    <td className="px-6 py-4">{formatDateTime(rec.exit_time)}</td>
                    <td className="px-6 py-4 font-semibold text-slate-800">
                      {rec.duration_hours > 0 ? `${rec.duration_hours.toFixed(2)} hrs` : 'In Progress'}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={rec.attendance_status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
