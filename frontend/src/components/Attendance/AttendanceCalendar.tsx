import React, { useEffect, useMemo, useState } from 'react';
import type { AttendanceRecord, Holiday } from '../../types';
import { attendanceApi } from '../../api';
import { holidaysApi } from '../../api/holidays';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  CheckCircle,
  AlertCircle,
  Clock,
  Sparkles,
  X,
} from 'lucide-react';

interface AttendanceCalendarProps {
  records: AttendanceRecord[];
  employeeName?: string;
  employeeId: string;
  onRefresh?: () => void;
}

interface CalendarDayData {
  status: 'Attended' | 'In Progress' | 'Missed' | 'Future' | 'Weekend';
  entryTime?: string | null;
  exitTime?: string | null;
  stayHours: number;
}

interface GridCell {
  isPadding: boolean;
  dayNumber: number | string;
  dateString: string;
  isWeekend: boolean;
  isFuture: boolean;
}

// 1. Data Transformation Layer: O(1) hash map lookup
export function createCalendarMappingLayer(records: AttendanceRecord[]): Record<string, CalendarDayData> {
  const map: Record<string, CalendarDayData> = {};

  records.forEach((rec) => {
    const key = rec.work_date;
    let status: CalendarDayData['status'] = 'Attended';
    if (rec.attendance_status === 'IN_PROGRESS') {
      status = 'In Progress';
    } else if (rec.attendance_status === 'NOT_ATTENDED') {
      status = 'Missed';
    }

    map[key] = {
      status,
      entryTime: rec.entry_time,
      exitTime: rec.exit_time,
      stayHours: rec.duration_hours || 0,
    };
  });

  return map;
}

// 2. Native date calculation without external libraries
export function generateMonthGrid(year: number, monthIndex: number): GridCell[] {
  const firstDayOfWeek = new Date(year, monthIndex, 1).getDay(); // 0 = Sun, 1 = Mon ...
  const totalDays = new Date(year, monthIndex + 1, 0).getDate();
  const todayStr = new Date().toISOString().slice(0, 10);

  const cells: GridCell[] = [];

  // Prefix padding cells for previous month
  for (let i = 0; i < firstDayOfWeek; i++) {
    cells.push({
      isPadding: true,
      dayNumber: '',
      dateString: `pad-${i}`,
      isWeekend: false,
      isFuture: false,
    });
  }

  // Active month days
  for (let day = 1; day <= totalDays; day++) {
    const mStr = String(monthIndex + 1).padStart(2, '0');
    const dStr = String(day).padStart(2, '0');
    const dateString = `${year}-${mStr}-${dStr}`;
    const dayOfWeek = new Date(year, monthIndex, day).getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isFuture = dateString > todayStr;

    cells.push({
      isPadding: false,
      dayNumber: day,
      dateString,
      isWeekend,
      isFuture,
    });
  }

  return cells;
}

export const AttendanceCalendar: React.FC<AttendanceCalendarProps> = ({
  records,
  employeeName,
  employeeId,
  onRefresh,
}) => {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Regularization modal state
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [entryTimeInput, setEntryTimeInput] = useState('09:30');
  const [exitTimeInput, setExitTimeInput] = useState('17:30');
  const [reasonInput, setReasonInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [modalMsg, setModalMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const year = currentDate.getFullYear();
  const monthIndex = currentDate.getMonth();

  const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  useEffect(() => {
    let isMounted = true;
    holidaysApi.getHolidays().then((data) => {
      if (isMounted) setHolidays(data);
    }).catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  const holidaysMap = useMemo(() => {
    const map = new Map<string, Holiday>();
    holidays.forEach((h) => map.set(h.holiday_date, h));
    return map;
  }, [holidays]);

  // 1. Build optimized lookup map
  const attendanceLookup = useMemo(() => {
    return createCalendarMappingLayer(records);
  }, [records]);

  // 2. Build grid cells
  const gridCells = useMemo(() => {
    return generateMonthGrid(year, monthIndex);
  }, [year, monthIndex]);

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, monthIndex - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, monthIndex + 1, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const handleCellClick = (dateString: string, isPadding: boolean, isFuture: boolean) => {
    if (isPadding || isFuture) return;

    // Guardrail: Max 14-day policy window
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dateString);
    target.setHours(0, 0, 0, 0);
    const diffDays = Math.round((today.getTime() - target.getTime()) / (1000 * 3600 * 24));
    if (diffDays > 14) {
      alert('Attendance regularization must be submitted within 14 days of the work date.');
      return;
    }

    setSelectedDate(dateString);
    setReasonInput('');
    setModalMsg(null);
    setModalOpen(true);
  };

  const handleRegularizeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDate) return;

    try {
      setSubmitting(true);
      setModalMsg(null);

      const entryIso = `${selectedDate}T${entryTimeInput}:00Z`;
      const exitIso = `${selectedDate}T${exitTimeInput}:00Z`;

      await attendanceApi.submitRegularization({
        work_date: selectedDate,
        entry_time: entryIso,
        exit_time: exitIso,
        reason: reasonInput || 'Manual attendance correction requested',
        employee_id: employeeId,
      });

      setModalMsg({
        type: 'success',
        text: 'Regularization request submitted for manager review!',
      });
      if (onRefresh) onRefresh();
      setTimeout(() => {
        setModalOpen(false);
      }, 1400);
    } catch (err: unknown) {
      const respData = (err as { response?: { data?: { message?: string; detail?: string } } })?.response?.data;
      const errorMsg =
        respData?.message ||
        respData?.detail ||
        (err as Error)?.message ||
        'Failed to submit regularization request';
      setModalMsg({ type: 'error', text: errorMsg });
    } finally {
      setSubmitting(false);
    }
  };

  const formatTime = (iso?: string | null) => {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
      {/* Header controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-blue-600" />
            <h2 className="text-xl font-bold text-slate-900">{monthName}</h2>
          </div>
          {employeeName && (
            <p className="text-xs text-slate-500 mt-0.5">Monthly Attendance Grid for {employeeName}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleToday}
            className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
          >
            Today
          </button>
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded-md transition"
              aria-label="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleNextMonth}
              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded-md transition"
              aria-label="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-slate-600">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
          <span>Attended Office</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-amber-500"></span>
          <span>In Progress</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-purple-500"></span>
          <span>Company Holiday (Target Scaled)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-rose-400"></span>
          <span>Missed Scan (Click to Regularize)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-slate-200"></span>
          <span>Weekend / Non-Workday</span>
        </div>
      </div>

      {/* Calendar Grid */}
      <div>
        {/* Days of week header */}
        <div className="grid grid-cols-7 gap-2 mb-2 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div key={day} className="py-1">
              {day}
            </div>
          ))}
        </div>

        {/* Date cells matrix */}
        <div className="grid grid-cols-7 gap-2">
          {gridCells.map((cell) => {
            if (cell.isPadding) {
              return (
                <div
                  key={cell.dateString}
                  className="min-h-[96px] bg-slate-50/50 rounded-xl border border-dashed border-slate-200/60"
                />
              );
            }

            const record = attendanceLookup[cell.dateString];
            const holiday = holidaysMap.get(cell.dateString);
            const isHoliday = !!holiday;
            const isAttended = record && record.status === 'Attended';
            const isInProgress = record && record.status === 'In Progress';
            const isMissed = !record && !cell.isWeekend && !cell.isFuture && !isHoliday;

            // Determine style state
            let cardClass = 'bg-white border-slate-200 text-slate-700 hover:border-slate-300';
            if (isAttended) {
              cardClass = 'bg-emerald-50/70 border-emerald-300 text-emerald-900 hover:border-emerald-400';
            } else if (isInProgress) {
              cardClass = 'bg-amber-50/80 border-amber-300 text-amber-900 hover:border-amber-400';
            } else if (isHoliday) {
              cardClass = 'bg-purple-50/80 border-purple-300 text-purple-900';
            } else if (isMissed) {
              cardClass = 'bg-rose-50/60 border-rose-300 text-rose-900 hover:border-rose-400 cursor-pointer group';
            } else if (cell.isWeekend) {
              cardClass = 'bg-slate-50 border-slate-100 text-slate-400';
            } else if (cell.isFuture) {
              cardClass = 'bg-slate-50/40 border-slate-100 text-slate-400';
            }

            return (
              <div
                key={cell.dateString}
                onClick={() => handleCellClick(cell.dateString, cell.isPadding, cell.isFuture)}
                className={`min-h-[96px] p-2.5 rounded-xl border transition-all flex flex-col justify-between select-none ${cardClass}`}
              >
                <div className="flex justify-between items-start">
                  <span className="text-sm font-bold">{cell.dayNumber}</span>
                  {isAttended && <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />}
                  {isInProgress && <Clock className="w-3.5 h-3.5 text-amber-600 animate-pulse" />}
                  {isHoliday && !isAttended && !isInProgress && <Sparkles className="w-3.5 h-3.5 text-purple-600" />}
                  {isMissed && <AlertCircle className="w-3.5 h-3.5 text-rose-500" />}
                </div>

                <div className="mt-1 text-xxs font-medium">
                  {isAttended && (
                    <div>
                      <p className="font-semibold text-emerald-700">{record.stayHours.toFixed(1)} hrs</p>
                      <p className="text-[10px] text-slate-500 truncate">
                        {formatTime(record.entryTime)} - {formatTime(record.exitTime)}
                      </p>
                      {isHoliday && <p className="text-[9px] text-purple-700 font-bold">Holiday Overtime</p>}
                    </div>
                  )}

                  {isInProgress && (
                    <div>
                      <p className="font-semibold text-amber-700">In Office</p>
                      <p className="text-[10px] text-slate-500 truncate">{formatTime(record.entryTime)}</p>
                    </div>
                  )}

                  {isHoliday && !isAttended && !isInProgress && (
                    <div>
                      <span className="inline-block px-1.5 py-0.5 text-[9px] font-bold bg-purple-200 text-purple-900 rounded">
                        Holiday
                      </span>
                      <p className="text-[10px] text-purple-800 font-semibold truncate mt-0.5" title={holiday?.name}>
                        {holiday?.name}
                      </p>
                    </div>
                  )}

                  {isMissed && (
                    <div>
                      <p className="font-semibold text-rose-700">Missed</p>
                      <p className="text-[9px] text-rose-500 group-hover:underline">Click to Regularize</p>
                    </div>
                  )}

                  {cell.isWeekend && !isHoliday && <p className="text-[10px] text-slate-400">Weekend</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Regularization Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Regularize Attendance</h3>
                <p className="text-xs text-slate-500">Submit manual scan correction for {selectedDate}</p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {modalMsg && (
              <div
                className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                  modalMsg.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}
              >
                {modalMsg.text}
              </div>
            )}

            <form onSubmit={handleRegularizeSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Entry Time (UTC)</label>
                  <input
                    type="time"
                    required
                    value={entryTimeInput}
                    onChange={(e) => setEntryTimeInput(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Exit Time (UTC)</label>
                  <input
                    type="time"
                    required
                    value={exitTimeInput}
                    onChange={(e) => setExitTimeInput(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Reason for Adjustment</label>
                <textarea
                  required
                  rows={3}
                  value={reasonInput}
                  onChange={(e) => setReasonInput(e.target.value)}
                  placeholder="e.g. Forgot RFID card scan, client meeting out-of-office"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition disabled:opacity-50"
                >
                  {submitting ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
