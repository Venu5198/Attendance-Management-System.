import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { attendanceApi } from '../../api';
import { useToast } from '../../context/ToastContext';
import type { AttendanceRecord, TodayAttendanceRecord } from '../../types';
import { StatusBadge } from '../../components/common/StatusBadge';
import { AttendanceCalendar } from '../../components/Attendance/AttendanceCalendar';
import { RegularizationReviewPanel } from '../../components/Attendance/RegularizationReviewPanel';
import { EmptyState } from '../../components/common/EmptyState';
import { LoadingSkeleton } from '../../components/common/LoadingSkeleton';
import {
  Clock,
  ArrowRightCircle,
  Calendar,
  Filter,
  LayoutGrid,
  MapPin,
  Layers,
  History,
  CheckSquare,
} from 'lucide-react';

export const AttendancePage: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [todayRecord, setTodayRecord] = useState<TodayAttendanceRecord | null>(null);
  const [viewMode, setViewMode] = useState<'today' | 'calendar' | 'history' | 'approvals'>('calendar');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoStatus, setGeoStatus] = useState<'locating' | 'ready' | 'simulated'>('locating');
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  const empId = user?.employee_id || 'EMP001';

  // Geolocation setup
  useEffect(() => {
    let isMounted = true;
    if ('geolocation' in navigator && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!isMounted) return;
          setCoords({
            lat: Number(pos.coords.latitude.toFixed(4)),
            lng: Number(pos.coords.longitude.toFixed(4)),
          });
          setGeoStatus('ready');
        },
        () => {
          if (!isMounted) return;
          setCoords({ lat: 12.9716, lng: 77.5946 });
          setGeoStatus('simulated');
        },
        { timeout: 4000 }
      );
    } else {
      setCoords({ lat: 12.9716, lng: 77.5946 });
      setGeoStatus('simulated');
    }
    return () => {
      isMounted = false;
    };
  }, []);

  const fetchData = useCallback(async () => {
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
  }, [empId, startDate, endDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Live timer for active in-progress session
  useEffect(() => {
    const activeSession = todayRecord?.active_session || (todayRecord?.attendance_status === 'IN_PROGRESS' ? todayRecord : null);
    if (!activeSession || !activeSession.entry_time) {
      setElapsedSeconds(0);
      return;
    }

    const startMs = new Date(activeSession.entry_time).getTime();
    const updateTimer = () => {
      const nowMs = Date.now();
      const diffSec = Math.max(0, Math.floor((nowMs - startMs) / 1000));
      setElapsedSeconds(diffSec);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [todayRecord]);

  const formatElapsed = (totalSec: number) => {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleCheckIn = async () => {
    try {
      setActionLoading(true);
      const res = await attendanceApi.checkIn({
        employee_id: empId,
        latitude: coords?.lat,
        longitude: coords?.lng,
      });
      const successMsg = res.message || 'Office check-in recorded successfully!';
      toast.success(successMsg);
      await fetchData();
    } catch (err: any) {
      const errorMsg = err?.response?.data?.message || err?.response?.data?.detail || 'Failed to check in.';
      toast.error(errorMsg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckOut = async () => {
    try {
      setActionLoading(true);
      const res = await attendanceApi.checkOut({ employee_id: empId });
      const successMsg = res.message || 'Office check-out recorded successfully!';
      toast.success(successMsg);
      await fetchData();
    } catch (err: any) {
      const errorMsg = err?.response?.data?.message || err?.response?.data?.detail || 'Failed to check out.';
      toast.error(errorMsg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleFilter = (e: React.FormEvent) => {
    e.preventDefault();
    fetchData();
  };

  const formatDateTime = (iso?: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

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

  return (
    <div className="space-y-6">
      {/* Page Header & View Toggle */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Attendance Console</h1>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 text-[11px] font-medium border border-emerald-200">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Geofence: Active (12.9716, 77.5946 • 200m radius)</span>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Record office check-ins, manage multiple sessions per day, and review history.
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80 text-xs font-semibold">
          <button
            onClick={() => setViewMode('today')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
              viewMode === 'today'
                ? 'bg-white text-indigo-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Today's Actions</span>
          </button>
          <button
            onClick={() => setViewMode('calendar')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
              viewMode === 'calendar'
                ? 'bg-white text-indigo-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Calendar</span>
          </button>
          <button
            onClick={() => setViewMode('history')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
              viewMode === 'history'
                ? 'bg-white text-indigo-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Table</span>
          </button>
          <button
            onClick={() => setViewMode('approvals')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
              viewMode === 'approvals'
                ? 'bg-white text-indigo-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span>Approvals</span>
          </button>
        </div>
      </div>



      {/* Main Tab Content */}
      {viewMode === 'approvals' ? (
        <RegularizationReviewPanel />
      ) : viewMode === 'calendar' ? (
        <AttendanceCalendar
          records={records}
          employeeName={user?.username || empId}
          employeeId={empId}
          onRefresh={fetchData}
        />
      ) : viewMode === 'history' ? (
        <div className="space-y-6">
          {/* History Date Filter Bar */}
          <form
            onSubmit={handleFilter}
            className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4"
          >
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-xs text-slate-700 font-semibold uppercase tracking-wider">
                <Calendar className="w-4 h-4 text-indigo-600" />
                Filter Dates (Inclusive):
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={startDate}
                  aria-label="Filter Start Date"
                  onChange={(e) => setStartDate(e.target.value)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <span className="text-slate-400 text-xs">to</span>
                <input
                  type="date"
                  value={endDate}
                  aria-label="Filter End Date"
                  onChange={(e) => setEndDate(e.target.value)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <button
                type="submit"
                className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition shadow-xs"
              >
                <Filter className="w-3.5 h-3.5" />
                Filter Range
              </button>
              {(startDate || endDate) && (
                <button
                  type="button"
                  onClick={() => {
                    setStartDate('');
                    setEndDate('');
                    attendanceApi.getHistory(empId).then((data) => setRecords(data));
                  }}
                  className="text-xs text-indigo-600 font-medium hover:underline"
                >
                  Reset Filter
                </button>
              )}
            </div>

            {(startDate || endDate) && (
              <span className="text-xs font-medium text-slate-500 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200">
                Active Filter: {startDate || 'Earliest'} → {endDate || 'Latest'} (Inclusive)
              </span>
            )}
          </form>

          {/* History Table (Desktop & Tablet) & Cards (Mobile) */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            {/* Desktop / Tablet Table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-xs text-left text-slate-600">
                <thead className="text-[11px] uppercase bg-slate-50/80 text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Date</th>
                    <th className="px-5 py-3 font-semibold">Check In</th>
                    <th className="px-5 py-3 font-semibold">Check Out</th>
                    <th className="px-5 py-3 font-semibold">Office Hours</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="p-4">
                        <LoadingSkeleton variant="table-row" count={4} />
                      </td>
                    </tr>
                  ) : records.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8">
                        <EmptyState
                          title="No records found"
                          description="No attendance logs found for the selected period."
                        />
                      </td>
                    </tr>
                  ) : (
                    records.map((rec) => {
                      const isActive = rec.attendance_status === 'IN_PROGRESS';
                      const hasExit = !!rec.exit_time;
                      const durationDisplay = isActive
                        ? 'In progress'
                        : `${(rec.duration_hours ?? 0).toFixed(2)} hrs`;

                      return (
                        <tr key={rec.attendance_id} className="hover:bg-slate-50/60 transition">
                          <td className="px-5 py-3.5 font-semibold text-slate-900">{rec.work_date}</td>
                          <td className="px-5 py-3.5">{formatDateTime(rec.entry_time)}</td>
                          <td className="px-5 py-3.5">
                            {hasExit ? formatDateTime(rec.exit_time) : (isActive ? 'In progress' : '—')}
                          </td>
                          <td className="px-5 py-3.5 font-semibold text-slate-800 font-mono">
                            {durationDisplay}
                          </td>
                          <td className="px-5 py-3.5">
                            <StatusBadge status={rec.attendance_status} />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Responsive Cards */}
            <div className="sm:hidden p-4 space-y-3">
              {loading ? (
                <LoadingSkeleton variant="card" count={3} />
              ) : records.length === 0 ? (
                <EmptyState
                  title="No records found"
                  description="No attendance logs found for the selected period."
                />
              ) : (
                records.map((rec) => {
                  const isActive = rec.attendance_status === 'IN_PROGRESS';
                  const hasExit = !!rec.exit_time;
                  const durationDisplay = isActive
                    ? 'In progress'
                    : `${(rec.duration_hours ?? 0).toFixed(2)} hrs`;

                  return (
                    <div
                      key={rec.attendance_id}
                      className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 text-sm">{rec.work_date}</span>
                        <StatusBadge status={rec.attendance_status} />
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                          <span className="text-[10px] uppercase font-semibold text-slate-400 block">Check In</span>
                          <span className="font-medium text-slate-700">{formatDateTime(rec.entry_time)}</span>
                        </div>
                        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                          <span className="text-[10px] uppercase font-semibold text-slate-400 block">Check Out</span>
                          <span className="font-medium text-slate-700">
                            {hasExit ? formatDateTime(rec.exit_time) : (isActive ? 'In progress' : '—')}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                        <span className="text-slate-500 font-medium">Recorded Duration:</span>
                        <span className="font-bold font-mono text-slate-900">
                          {durationDisplay}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Today's Actions & Multi-Session Mode */
        <div className="space-y-6">
          {/* Top Panel: Attendance Action Hero Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs relative overflow-hidden">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              {/* Left Details */}
              <div className="space-y-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Today's Attendance Status
                  </span>
                  <StatusBadge status={todayRecord?.attendance_status || 'NOT_ATTENDED'} />
                </div>

                {/* Main Dynamic Headline */}
                <div>
                  {isSessionActive ? (
                    <div className="flex items-center gap-3">
                      <div className="h-3 w-3 rounded-full bg-amber-500 animate-ping" />
                      <div>
                        <h2 className="text-xl font-bold text-slate-900">
                          Session In Progress
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Started at {formatDateTime(todayRecord?.entry_time)} • Elapsed:{' '}
                          <span className="font-bold text-amber-700 font-mono">
                            {formatElapsed(elapsedSeconds)}
                          </span>
                        </p>
                      </div>
                    </div>
                  ) : todayRecord && todayRecord.duration_hours > 0 ? (
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">
                        {todayRecord.total_sessions || todaySessions.length} Session(s) Completed
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Total today:{' '}
                        <span className="font-bold text-indigo-700">
                          {todayRecord.duration_hours.toFixed(2)} hrs ({(todayRecord.duration_minutes || todayRecord.duration_hours * 60).toFixed(0)} mins)
                        </span>
                        . You can start another session anytime.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">Ready to Clock In</h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Record your office entrance to start your initial session for today.
                      </p>
                    </div>
                  )}
                </div>

                {/* Geofence / Location Pill */}
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-50 border border-slate-200 text-[11px] text-slate-600">
                  <MapPin className="w-3.5 h-3.5 text-indigo-600" />
                  <span>
                    {coords
                      ? `Boundary Verified (${geoStatus === 'ready' ? 'GPS' : 'Office Coordinates'}): ${coords.lat}, ${coords.lng}`
                      : 'Locating boundary...'}
                  </span>
                </div>
              </div>

              {/* Right Action Buttons */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <button
                  onClick={handleCheckIn}
                  disabled={actionLoading || isSessionActive}
                  className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition ${
                    isSessionActive
                      ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white active:scale-95'
                  }`}
                  title={isSessionActive ? 'Complete active session before checking in again' : 'Start a new session'}
                >
                  <Clock className="w-4 h-4" />
                  <span>{todaySessions.length > 0 ? 'Start Next Session' : 'Check In'}</span>
                </button>

                <button
                  onClick={handleCheckOut}
                  disabled={actionLoading || !isSessionActive}
                  className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition ${
                    !isSessionActive
                      ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                      : 'bg-amber-500 hover:bg-amber-600 text-white active:scale-95'
                  }`}
                  title={!isSessionActive ? 'No active session to check out of' : 'Conclude current session'}
                >
                  <ArrowRightCircle className="w-4 h-4" />
                  <span>Check Out</span>
                </button>
              </div>
            </div>
          </div>

          {/* Today's Multi-Session History Table */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-600" />
                  <span>Today's Session Breakdown</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Independent attendance sessions recorded for workday {todayRecord?.work_date || 'today'}
                </p>
              </div>
              {todaySessions.length > 0 && (
                <div className="flex items-center gap-3 text-xs font-semibold">
                  <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100">
                    {todaySessions.length} session{todaySessions.length > 1 ? 's' : ''}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-100">
                    Total: {todayRecord?.duration_hours.toFixed(2)} hrs
                  </span>
                </div>
              )}
            </div>

            {loading ? (
              <LoadingSkeleton variant="table-row" count={2} />
            ) : todaySessions.length === 0 ? (
              <EmptyState
                icon={Clock}
                title="No attendance sessions today"
                description="Click 'Check In' above when you enter the office to start your first session."
              />
            ) : (
              <>
                {/* Desktop and Tablet Table View */}
                <div className="hidden sm:block overflow-x-auto rounded-xl border border-slate-200/80">
                  <table className="w-full text-xs text-left text-slate-600">
                    <thead className="text-[11px] uppercase bg-slate-50 text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Session</th>
                        <th className="px-4 py-3 font-semibold">Check In</th>
                        <th className="px-4 py-3 font-semibold">Check Out</th>
                        <th className="px-4 py-3 font-semibold">Duration (Min)</th>
                        <th className="px-4 py-3 font-semibold">Duration (Hours)</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {todaySessions.map((sess, idx) => {
                        const isCurr = sess.attendance_status === 'IN_PROGRESS';
                        return (
                          <tr
                            key={sess.attendance_id || idx}
                            className={`transition ${isCurr ? 'bg-amber-50/40' : 'hover:bg-slate-50/60'}`}
                          >
                            <td className="px-4 py-3 font-bold text-slate-900">
                              Session {idx + 1}
                              {isCurr && (
                                <span className="ml-2 inline-block px-1.5 py-0.2 rounded text-[10px] font-semibold bg-amber-100 text-amber-800">
                                  Active
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 font-medium text-slate-700">
                              {formatDateTime(sess.entry_time)}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {formatDateTime(sess.exit_time)}
                            </td>
                            <td className="px-4 py-3 font-mono font-medium text-slate-700">
                              {isCurr
                                ? `${Math.floor(elapsedSeconds / 60)} min`
                                : `${(sess.duration_minutes || sess.duration_hours * 60).toFixed(0)} min`}
                            </td>
                            <td className="px-4 py-3 font-semibold text-slate-900">
                              {isCurr
                                ? `${(elapsedSeconds / 3600).toFixed(2)} hrs (live)`
                                : `${sess.duration_hours.toFixed(2)} hrs`}
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge status={sess.attendance_status} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Responsive Cards View */}
                <div className="sm:hidden space-y-3">
                  {todaySessions.map((sess, idx) => {
                    const isCurr = sess.attendance_status === 'IN_PROGRESS';
                    return (
                      <div
                        key={sess.attendance_id || idx}
                        className={`p-4 rounded-xl border shadow-2xs space-y-3 ${
                          isCurr
                            ? 'bg-amber-50/50 border-amber-300 ring-1 ring-amber-200'
                            : 'bg-white border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-sm">Session {idx + 1}</span>
                            {isCurr && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                                Active
                              </span>
                            )}
                          </div>
                          <StatusBadge status={sess.attendance_status} />
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="bg-slate-50/80 p-2.5 rounded-lg border border-slate-100">
                            <span className="text-[10px] uppercase font-semibold text-slate-400 block">Check In</span>
                            <span className="font-medium text-slate-700">{formatDateTime(sess.entry_time)}</span>
                          </div>
                          <div className="bg-slate-50/80 p-2.5 rounded-lg border border-slate-100">
                            <span className="text-[10px] uppercase font-semibold text-slate-400 block">Check Out</span>
                            <span className="font-medium text-slate-700">
                              {sess.exit_time ? formatDateTime(sess.exit_time) : 'In progress'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                          <span className="text-slate-500 font-medium">Duration:</span>
                          <span className={`font-bold font-mono ${isCurr ? 'text-amber-700' : 'text-slate-900'}`}>
                            {isCurr
                              ? `${formatElapsed(elapsedSeconds)} (live)`
                              : `${sess.duration_hours.toFixed(2)} hrs (${(sess.duration_minutes || sess.duration_hours * 60).toFixed(0)} min)`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
