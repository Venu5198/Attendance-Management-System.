import React, { useEffect, useMemo, useState } from 'react';
import type { AttendanceRecord, Holiday, LeaveRequest } from '../../types';
import { attendanceApi } from '../../api';
import { holidaysApi } from '../../api/holidays';
import { leavesApi } from '../../api/leaves';
import { useToast } from '../../context/ToastContext';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  CheckCircle,
  AlertCircle,
  Clock,
  Sparkles,
  X,
  FileCheck,
  Coffee,
  HelpCircle,
  PlusCircle,
} from 'lucide-react';

export interface AttendanceCalendarProps {
  records: AttendanceRecord[];
  employeeName?: string;
  employeeId: string;
  onRefresh?: () => void;
}

export type DayClassification =
  | 'Attended'
  | 'In Progress'
  | 'Zero Duration'
  | 'Confirmed Missed'
  | 'Holiday'
  | 'Approved Leave'
  | 'Weekend'
  | 'No Record'
  | 'Upcoming';

export interface CalendarDayData {
  status: 'Attended' | 'In Progress' | 'Missed';
  entryTime?: string | null;
  exitTime?: string | null;
  stayHours: number;
  sessions: AttendanceRecord[];
}

export interface GridCell {
  isPadding: boolean;
  dayNumber: number | string;
  dateString: string;
  isWeekend: boolean;
  isFuture: boolean;
}

// 1. Data Transformation Layer: O(1) hash map lookup with multi-session duration aggregation
export function createCalendarMappingLayer(records: AttendanceRecord[]): Record<string, CalendarDayData> {
  const map: Record<string, CalendarDayData> = {};

  records.forEach((rec) => {
    const key = rec.work_date;
    const isProg = rec.attendance_status === 'IN_PROGRESS';
    const isMissed = rec.attendance_status === 'NOT_ATTENDED';

    if (map[key]) {
      const prev = map[key];
      const mergedStatus =
        prev.status === 'In Progress' || isProg
          ? 'In Progress'
          : prev.status === 'Attended' || (!isMissed && rec.attendance_status === 'COMPLETED')
          ? 'Attended'
          : isMissed
          ? 'Missed'
          : prev.status;

      const earliestEntry =
        prev.entryTime && rec.entry_time
          ? new Date(prev.entryTime) < new Date(rec.entry_time)
            ? prev.entryTime
            : rec.entry_time
          : prev.entryTime || rec.entry_time;

      const latestExit =
        prev.exitTime && rec.exit_time
          ? new Date(prev.exitTime) > new Date(rec.exit_time)
            ? prev.exitTime
            : rec.exit_time
          : prev.exitTime || rec.exit_time;

      map[key] = {
        status: mergedStatus,
        entryTime: earliestEntry,
        exitTime: latestExit,
        stayHours: Math.round(((prev.stayHours || 0) + (rec.duration_hours || 0)) * 100) / 100,
        sessions: [...prev.sessions, rec],
      };
    } else {
      map[key] = {
        status: isProg ? 'In Progress' : isMissed ? 'Missed' : 'Attended',
        entryTime: rec.entry_time,
        exitTime: rec.exit_time,
        stayHours: rec.duration_hours || 0,
        sessions: [rec],
      };
    }
  });

  return map;
}

// 2. Build approved leaves map
export function buildLeavesMap(leaves: LeaveRequest[]): Map<string, LeaveRequest> {
  const map = new Map<string, LeaveRequest>();
  leaves.forEach((l) => {
    if (l.status !== 'APPROVED') return;
    try {
      const start = new Date(l.start_date);
      const end = new Date(l.end_date);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dStr = d.toISOString().slice(0, 10);
        map.set(dStr, l);
      }
    } catch {
      // Fallback for single day
      map.set(l.start_date, l);
    }
  });
  return map;
}

// 3. Day State Classifier - deterministic and non-speculative
export function classifyDay(
  cell: GridCell,
  record?: CalendarDayData,
  holiday?: Holiday,
  leave?: LeaveRequest
): {
  classification: DayClassification;
  label: string;
  badgeClass: string;
  cardClass: string;
} {
  if (record && record.status === 'In Progress') {
    return {
      classification: 'In Progress',
      label: 'Session In Progress',
      badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
      cardClass: 'bg-amber-50/70 border-amber-300 text-amber-950 hover:border-amber-400',
    };
  }

  if (record && record.status === 'Attended') {
    // Option B UI Warning Indicator:
    // Backend policy strictly evaluates compliance on 3 eligible days and 15.0 total hours.
    // Durations rounding to 0.0h (including 0s, 7s = 0.0019h, or stayHours < 0.05h)
    // are flagged visually in amber Zero Duration state as a UI anomaly warning for administrative
    // review, ensuring 0.0h sessions are not misrepresented as green compliant office stays.
    const isQualifying = (record.stayHours || 0) >= 0.05;
    if (isQualifying) {
      return {
        classification: 'Attended',
        label: `${record.stayHours.toFixed(1)}h Attended (${record.sessions.length} sess)`,
        badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
        cardClass: 'bg-emerald-50/60 border-emerald-300 text-emerald-950 hover:border-emerald-400',
      };
    }
    // Zero-duration record (0.0h): logged in DB but flagged as non-qualifying UI warning.
    return {
      classification: 'Zero Duration',
      label: `0.0h Logged (${record.sessions.length} sess - Non-qualifying)`,
      badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
      cardClass: 'bg-amber-50/60 border-amber-300 text-amber-950 hover:border-amber-400',
    };
  }

  if (holiday) {
    return {
      classification: 'Holiday',
      label: `Holiday: ${holiday.name}`,
      badgeClass: 'bg-purple-100 text-purple-800 border-purple-300',
      cardClass: 'bg-purple-50/70 border-purple-300 text-purple-950 hover:border-purple-400',
    };
  }

  if (leave) {
    return {
      classification: 'Approved Leave',
      label: `Approved Leave (${leave.leave_type})`,
      badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-300',
      cardClass: 'bg-indigo-50/70 border-indigo-300 text-indigo-950 hover:border-indigo-400',
    };
  }

  if (record && record.status === 'Missed') {
    return {
      classification: 'Confirmed Missed',
      label: 'Confirmed Missed Scan',
      badgeClass: 'bg-rose-100 text-rose-800 border-rose-300',
      cardClass: 'bg-rose-50/70 border-rose-300 text-rose-950 hover:border-rose-400',
    };
  }

  if (cell.isWeekend) {
    return {
      classification: 'Weekend',
      label: 'Weekend / Non-Workday',
      badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
      cardClass: 'bg-slate-50 border-slate-200 text-slate-500',
    };
  }

  if (cell.isFuture) {
    return {
      classification: 'Upcoming',
      label: 'Upcoming Workday',
      badgeClass: 'bg-slate-100 text-slate-400 border-slate-200',
      cardClass: 'bg-white/60 border-slate-200/80 text-slate-400',
    };
  }

  // Neutral state for unlogged weekdays - NOT marked missed
  return {
    classification: 'No Record',
    label: 'No Attendance Record',
    badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
    cardClass: 'bg-white border-slate-200 text-slate-700 hover:border-slate-300',
  };
}

// 4. Native date calculation without external libraries
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
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [regularizeMode, setRegularizeMode] = useState(false);
  const toast = useToast();

  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);

  // Regularization form inputs
  const [entryTimeInput, setEntryTimeInput] = useState('09:30');
  const [exitTimeInput, setExitTimeInput] = useState('17:30');
  const [reasonInput, setReasonInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [modalMsg, setModalMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const year = currentDate.getFullYear();
  const monthIndex = currentDate.getMonth();
  const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  // Fetch holidays and approved leaves on mount
  useEffect(() => {
    let isMounted = true;
    Promise.all([
      holidaysApi.getHolidays().catch(() => []),
      leavesApi.getLeaves(employeeId).catch(() => []),
    ]).then(([hols, lvs]) => {
      if (isMounted) {
        setHolidays(hols);
        setLeaves(lvs);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [employeeId]);

  const holidaysMap = useMemo(() => {
    const map = new Map<string, Holiday>();
    holidays.forEach((h) => map.set(h.holiday_date, h));
    return map;
  }, [holidays]);

  const leavesMap = useMemo(() => {
    return buildLeavesMap(leaves);
  }, [leaves]);

  const attendanceLookup = useMemo(() => {
    return createCalendarMappingLayer(records);
  }, [records]);

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

  const isEligibleForRegularization = (dateString: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dateString);
    target.setHours(0, 0, 0, 0);
    const diffDays = Math.round((today.getTime() - target.getTime()) / (1000 * 3600 * 24));
    return diffDays >= 0 && diffDays <= 14;
  };

  const handleCellClick = (dateString: string, isPadding: boolean) => {
    if (isPadding) return;
    setSelectedDate(dateString);
    setRegularizeMode(false);
    setModalMsg(null);
    setDetailModalOpen(true);
  };

  const handleOpenRegularization = () => {
    if (!selectedDate) return;
    if (!isEligibleForRegularization(selectedDate)) {
      toast.warning('Attendance regularization must be submitted within 14 days of the work date.');
      return;
    }
    setRegularizeMode(true);
    setReasonInput('');
    setModalMsg(null);
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
      toast.success('Regularization submitted for manager approval');
      if (onRefresh) onRefresh();
      setTimeout(() => {
        setDetailModalOpen(false);
        setRegularizeMode(false);
      }, 1200);
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
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Selected date context
  const selectedRecord = selectedDate ? attendanceLookup[selectedDate] : undefined;
  const selectedHoliday = selectedDate ? holidaysMap.get(selectedDate) : undefined;
  const selectedLeave = selectedDate ? leavesMap.get(selectedDate) : undefined;
  const selectedCell = selectedDate ? gridCells.find((c) => c.dateString === selectedDate) : undefined;
  const selectedClassification = selectedCell
    ? classifyDay(selectedCell, selectedRecord, selectedHoliday, selectedLeave)
    : null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
      {/* Header controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-indigo-600" aria-hidden="true" />
            <h2 className="text-xl font-bold text-slate-900">{monthName}</h2>
          </div>
          {employeeName && (
            <p className="text-xs text-slate-500 mt-0.5">Attendance Calendar for {employeeName}</p>
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

      {/* Non-color-alone Explicit Legend */}
      <div
        className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/80 text-xs"
        aria-label="Calendar Status Legend"
      >
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 flex-shrink-0" aria-hidden="true" />
          <span className="font-semibold text-slate-700">Attended Office</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse flex-shrink-0" aria-hidden="true" />
          <span className="font-semibold text-slate-700">In Progress</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 flex-shrink-0" aria-hidden="true" />
          <span className="font-semibold text-slate-700">Zero Duration</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-purple-500 flex-shrink-0" aria-hidden="true" />
          <span className="font-semibold text-slate-700">Company Holiday</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 flex-shrink-0" aria-hidden="true" />
          <span className="font-semibold text-slate-700">Approved Leave</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 flex-shrink-0" aria-hidden="true" />
          <span className="font-semibold text-slate-700">Confirmed Missed</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-slate-300 flex-shrink-0" aria-hidden="true" />
          <span className="font-semibold text-slate-500">No Record / Weekend</span>
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
                  className="min-h-[100px] bg-slate-50/50 rounded-xl border border-dashed border-slate-200/50"
                  aria-hidden="true"
                />
              );
            }

            const record = attendanceLookup[cell.dateString];
            const holiday = holidaysMap.get(cell.dateString);
            const leave = leavesMap.get(cell.dateString);
            const { classification, label, cardClass } = classifyDay(cell, record, holiday, leave);

            const isInteractive = true;
            const ariaLabelText = `${cell.dateString}, ${label}. Click to view day details and actions.`;

            return (
              <div
                key={cell.dateString}
                role="button"
                tabIndex={isInteractive ? 0 : -1}
                aria-label={ariaLabelText}
                onClick={() => handleCellClick(cell.dateString, cell.isPadding)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleCellClick(cell.dateString, cell.isPadding);
                  }
                }}
                className={`min-h-[100px] p-2.5 rounded-xl border transition-all flex flex-col justify-between cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 select-none ${cardClass}`}
              >
                <div className="flex justify-between items-start">
                  <span className="text-sm font-bold">{cell.dayNumber}</span>
                  {classification === 'Attended' && (
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" aria-hidden="true" />
                  )}
                  {classification === 'Zero Duration' && (
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" aria-hidden="true" />
                  )}
                  {classification === 'In Progress' && (
                    <Clock className="w-3.5 h-3.5 text-amber-600 animate-pulse flex-shrink-0" aria-hidden="true" />
                  )}
                  {classification === 'Holiday' && (
                    <Sparkles className="w-3.5 h-3.5 text-purple-600 flex-shrink-0" aria-hidden="true" />
                  )}
                  {classification === 'Approved Leave' && (
                    <FileCheck className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" aria-hidden="true" />
                  )}
                  {classification === 'Confirmed Missed' && (
                    <AlertCircle className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" aria-hidden="true" />
                  )}
                  {classification === 'Weekend' && (
                    <Coffee className="w-3 h-3 text-slate-400 flex-shrink-0" aria-hidden="true" />
                  )}
                  {classification === 'No Record' && (
                    <HelpCircle className="w-3 h-3 text-slate-300 flex-shrink-0" aria-hidden="true" />
                  )}
                </div>

                <div className="mt-1 text-[11px] font-medium leading-tight">
                  {classification === 'Attended' && record && (
                    <div>
                      <p className="font-bold text-emerald-800">{record.stayHours.toFixed(1)}h</p>
                      <p className="text-[10px] text-slate-500 truncate mt-0.5">
                        {record.sessions.length > 1
                          ? `${record.sessions.length} sessions`
                          : `${formatTime(record.entryTime)}`}
                      </p>
                    </div>
                  )}

                  {classification === 'Zero Duration' && record && (
                    <div>
                      <p className="font-bold text-amber-800">0.0h Logged</p>
                      <p className="text-[10px] text-amber-700 truncate mt-0.5">
                        {record.sessions.length > 1
                          ? `${record.sessions.length} sess (0.0h)`
                          : 'Non-qualifying'}
                      </p>
                    </div>
                  )}

                  {classification === 'In Progress' && (
                    <div>
                      <p className="font-bold text-amber-800">In Office</p>
                      <p className="text-[10px] text-amber-700 truncate mt-0.5">
                        In: {formatTime(record?.entryTime)}
                      </p>
                    </div>
                  )}

                  {classification === 'Holiday' && holiday && (
                    <div>
                      <span className="inline-block px-1.5 py-0.2 text-[9px] font-bold bg-purple-200/80 text-purple-900 rounded">
                        Holiday
                      </span>
                      <p className="text-[10px] text-purple-800 font-semibold truncate mt-0.5" title={holiday.name}>
                        {holiday.name}
                      </p>
                    </div>
                  )}

                  {classification === 'Approved Leave' && leave && (
                    <div>
                      <span className="inline-block px-1.5 py-0.2 text-[9px] font-bold bg-indigo-200/80 text-indigo-900 rounded">
                        Leave
                      </span>
                      <p className="text-[10px] text-indigo-800 font-medium truncate mt-0.5">
                        {leave.leave_type}
                      </p>
                    </div>
                  )}

                  {classification === 'Confirmed Missed' && (
                    <div>
                      <span className="inline-block px-1.5 py-0.2 text-[9px] font-bold bg-rose-200 text-rose-900 rounded">
                        Missed
                      </span>
                      <p className="text-[9px] text-rose-600 mt-0.5">Details</p>
                    </div>
                  )}

                  {classification === 'Weekend' && (
                    <p className="text-[10px] text-slate-400">Weekend</p>
                  )}

                  {classification === 'No Record' && (
                    <p className="text-[10px] text-slate-400">No record</p>
                  )}

                  {classification === 'Upcoming' && (
                    <p className="text-[10px] text-slate-300">Upcoming</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Date Detail & Permitted Actions Modal */}
      {detailModalOpen && selectedDate && selectedClassification && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-6 space-y-5 animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-slate-900">Workday Details</h3>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${selectedClassification.badgeClass}`}>
                    {selectedClassification.classification}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {new Date(`${selectedDate}T00:00:00`).toLocaleDateString(undefined, {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>
              <button
                onClick={() => setDetailModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                aria-label="Close dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mode 1: Regularization Submission Form */}
            {regularizeMode ? (
              <form onSubmit={handleRegularizeSubmit} className="space-y-4">
                <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-xs text-indigo-900">
                  <p className="font-semibold">Submit Regularization Request</p>
                  <p className="mt-0.5 text-indigo-700">
                    Submit manual scan adjustment for <strong>{selectedDate}</strong>. Requests require manager review.
                  </p>
                </div>

                {modalMsg && (
                  <div
                    className={`p-3 rounded-xl text-xs font-semibold ${
                      modalMsg.type === 'success'
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-rose-50 text-rose-800 border border-rose-200'
                    }`}
                  >
                    {modalMsg.text}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Entry Time (UTC)</label>
                    <input
                      type="time"
                      required
                      value={entryTimeInput}
                      onChange={(e) => setEntryTimeInput(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Exit Time (UTC)</label>
                    <input
                      type="time"
                      required
                      value={exitTimeInput}
                      onChange={(e) => setExitTimeInput(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500"
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
                    placeholder="e.g. Card scanner malfunction, offsite client assignment"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setRegularizeMode(false)}
                    className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
                  >
                    Back to Day Details
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs transition disabled:opacity-50"
                  >
                    {submitting ? 'Submitting...' : 'Submit Request'}
                  </button>
                </div>
              </form>
            ) : (
              /* Mode 2: Day Details & Session Breakdown */
              <div className="space-y-4">
                {/* Meta details if Holiday or Leave */}
                {selectedHoliday && (
                  <div className="p-3 bg-purple-50 rounded-xl border border-purple-200 text-xs">
                    <p className="font-bold text-purple-900">Company Holiday: {selectedHoliday.name}</p>
                    <p className="text-purple-700 mt-0.5">
                      {selectedHoliday.description || 'Official Holiday'}. Office targets are scaled accordingly.
                    </p>
                  </div>
                )}

                {selectedLeave && (
                  <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-200 text-xs">
                    <p className="font-bold text-indigo-900">Approved Policy Exemption ({selectedLeave.leave_type})</p>
                    <p className="text-indigo-700 mt-0.5">Reason: {selectedLeave.reason || 'None specified'}</p>
                  </div>
                )}

                {/* Sessions Section */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-900">Logged Sessions for Date</span>
                    {selectedRecord && (
                      <span className={`font-semibold ${selectedRecord.stayHours > 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                        Total: {selectedRecord.stayHours.toFixed(2)} hrs {selectedRecord.stayHours === 0 ? '(Non-qualifying)' : ''}
                      </span>
                    )}
                  </div>

                  {!selectedRecord || selectedRecord.sessions.length === 0 ? (
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 text-center text-xs text-slate-500">
                      No attendance sessions recorded on this date.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {selectedRecord.sessions.map((sess, idx) => {
                        const isCurr = sess.attendance_status === 'IN_PROGRESS';
                        return (
                          <div
                            key={sess.attendance_id || idx}
                            className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-3 ${
                              isCurr ? 'bg-amber-50/50 border-amber-300' : 'bg-slate-50/80 border-slate-200'
                            }`}
                          >
                            <div>
                              <p className="font-bold text-slate-900">
                                Session {idx + 1}{' '}
                                {isCurr && (
                                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                                    Active
                                  </span>
                                )}
                              </p>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                In: {formatTime(sess.entry_time)} • Out: {sess.exit_time ? formatTime(sess.exit_time) : 'In Progress'}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-bold font-mono text-slate-900">
                                {isCurr ? 'In Progress' : `${sess.duration_hours.toFixed(2)}h`}
                              </p>
                              <span className="text-[10px] text-slate-400 capitalize">
                                {sess.attendance_status.toLowerCase().replace('_', ' ')}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Footer Permitted Actions */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  {isEligibleForRegularization(selectedDate) ? (
                    <button
                      onClick={handleOpenRegularization}
                      className="px-3.5 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg flex items-center gap-1.5 transition"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      <span>Regularize Scan</span>
                    </button>
                  ) : (
                    <span className="text-[11px] text-slate-400">
                      {selectedCell?.isFuture
                        ? 'Future date — no actions permitted'
                        : 'Regularization window expired (> 14 days)'}
                    </span>
                  )}

                  <button
                    onClick={() => setDetailModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
