import React from 'react';
import { TrendingUp, CheckCircle2, Clock, AlertCircle } from 'lucide-react';

export interface WeeklyPolicyProgressProps {
  daysAttended: number;
  hoursAttended: number;
  requiredDays?: number;
  requiredHours?: number;
  isSessionActive?: boolean;
}

export type ComplianceState =
  | 'FULLY_COMPLIANT'
  | 'HOURS_PENDING'
  | 'DAYS_PENDING'
  | 'BOTH_PENDING';

export function getComplianceState(
  daysAttended: number,
  hoursAttended: number,
  requiredDays: number = 3,
  requiredHours: number = 15
): {
  state: ComplianceState;
  remainingDays: number;
  remainingHours: number;
  label: string;
  description: string;
} {
  const safeDays = Math.max(0, daysAttended);
  const safeHours = Math.max(0, hoursAttended);
  const remainingDays = Math.max(0, requiredDays - safeDays);
  const remainingHours = Math.max(0, Number((requiredHours - safeHours).toFixed(1)));

  if (safeDays >= requiredDays && safeHours >= requiredHours) {
    return {
      state: 'FULLY_COMPLIANT',
      remainingDays: 0,
      remainingHours: 0,
      label: 'Fully Compliant',
      description: 'Both weekly requirements achieved (>= 3 days & 15h)',
    };
  }

  if (safeDays >= requiredDays && safeHours < requiredHours) {
    return {
      state: 'HOURS_PENDING',
      remainingDays: 0,
      remainingHours,
      label: 'Hours Pending',
      description: `Days requirement met • ${remainingHours.toFixed(1)}h remaining`,
    };
  }

  if (safeDays < requiredDays && safeHours >= requiredHours) {
    return {
      state: 'DAYS_PENDING',
      remainingDays,
      remainingHours: 0,
      label: 'Days Pending',
      description: `Hours requirement met • ${remainingDays} eligible day${remainingDays > 1 ? 's' : ''} remaining`,
    };
  }

  return {
    state: 'BOTH_PENDING',
    remainingDays,
    remainingHours,
    label: 'Days & Hours Pending',
    description: `${remainingDays} eligible day${remainingDays > 1 ? 's' : ''} and ${remainingHours.toFixed(1)}h remaining`,
  };
}

export const WeeklyPolicyProgress: React.FC<WeeklyPolicyProgressProps> = ({
  daysAttended,
  hoursAttended,
  requiredDays = 3,
  requiredHours = 15,
  isSessionActive = false,
}) => {
  const safeDays = Math.max(0, daysAttended);
  const safeHours = Math.max(0, hoursAttended);
  const { remainingDays, remainingHours, label, description } = getComplianceState(
    safeDays,
    safeHours,
    requiredDays,
    requiredHours
  );

  const daysPercent = Math.min(Math.round((safeDays / requiredDays) * 100), 100);
  const hoursPercent = Math.min(Math.round((safeHours / requiredHours) * 100), 100);

  const daysMet = safeDays >= requiredDays;
  const hoursMet = safeHours >= requiredHours;

  return (
    <section
      aria-labelledby="weekly-policy-progress-heading"
      className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5"
    >
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 border-b border-slate-100 pb-4">
        <div>
          <h2
            id="weekly-policy-progress-heading"
            className="text-sm font-bold text-slate-900 flex items-center gap-2"
          >
            <TrendingUp className="w-4 h-4 text-indigo-600" aria-hidden="true" />
            <span>Weekly Attendance Policy Progress</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Target requirements: At least {requiredDays} eligible office days and {requiredHours} office hours per week.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isSessionActive && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" aria-hidden="true" />
              Active Session (Finalizes on Check-Out)
            </span>
          )}
          <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700">
            Current Week Window
          </span>
        </div>
      </div>

      {/* Policy Progress Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Days Progress Bar */}
        <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-3">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-slate-700 flex items-center gap-1.5">
              {daysMet ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-hidden="true" />
              ) : (
                <Clock className="w-4 h-4 text-indigo-600" aria-hidden="true" />
              )}
              Eligible Office Days
            </span>
            <span className="font-bold text-slate-900">
              {safeDays} of {requiredDays} eligible days
            </span>
          </div>

          {/* Accessible Progress Bar */}
          <div
            role="progressbar"
            aria-valuenow={safeDays}
            aria-valuemin={0}
            aria-valuemax={requiredDays}
            aria-label="Eligible office days progress"
            aria-valuetext={`${safeDays} of ${requiredDays} eligible days completed, ${remainingDays} remaining`}
            className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden"
          >
            <div
              className={`h-2.5 rounded-full transition-all duration-500 ${
                daysMet ? 'bg-emerald-500' : 'bg-indigo-600'
              }`}
              style={{ width: `${daysPercent}%` }}
            />
          </div>

          <div className="flex justify-between items-center text-[11px]">
            <span className={`font-semibold ${daysMet ? 'text-emerald-700' : 'text-slate-600'}`}>
              {daysMet
                ? '✓ Completed: Target met'
                : `${remainingDays} eligible day${remainingDays > 1 ? 's' : ''} remaining`}
            </span>
            <span className="text-slate-400 font-medium">{daysPercent}% completed</span>
          </div>
        </div>

        {/* Hours Progress Bar */}
        <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-3">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-slate-700 flex items-center gap-1.5">
              {hoursMet ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-hidden="true" />
              ) : (
                <Clock className="w-4 h-4 text-indigo-600" aria-hidden="true" />
              )}
              Accumulated Office Hours
            </span>
            <span className="font-bold text-slate-900">
              {safeHours.toFixed(1)} of {requiredHours}.0 hours
            </span>
          </div>

          {/* Accessible Progress Bar */}
          <div
            role="progressbar"
            aria-valuenow={safeHours}
            aria-valuemin={0}
            aria-valuemax={requiredHours}
            aria-label="Weekly office hours progress"
            aria-valuetext={`${safeHours.toFixed(1)} of ${requiredHours}.0 hours accumulated, ${remainingHours.toFixed(1)} hours remaining`}
            className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden"
          >
            <div
              className={`h-2.5 rounded-full transition-all duration-500 ${
                hoursMet ? 'bg-emerald-500' : 'bg-indigo-600'
              }`}
              style={{ width: `${hoursPercent}%` }}
            />
          </div>

          <div className="flex justify-between items-center text-[11px]">
            <span className={`font-semibold ${hoursMet ? 'text-emerald-700' : 'text-slate-600'}`}>
              {hoursMet
                ? '✓ Completed: Target met'
                : `${remainingHours.toFixed(1)} hours remaining`}
            </span>
            <span className="text-slate-400 font-medium">{hoursPercent}% completed</span>
          </div>
        </div>
      </div>

      {/* Compliance State Explanation Footer */}
      <div
        className={`px-4 py-3 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition ${
          daysMet && hoursMet
            ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
            : 'bg-amber-50/70 border-amber-200 text-amber-900'
        }`}
      >
        <div className="flex items-center gap-2">
          {daysMet && hoursMet ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" aria-hidden="true" />
          ) : (
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" aria-hidden="true" />
          )}
          <span className="font-bold">{label}:</span>
          <span className="font-medium text-slate-700">{description}</span>
        </div>
        <span className="text-[11px] font-semibold text-slate-500">
          Evaluated against 3-day / 15-hour policy
        </span>
      </div>
    </section>
  );
};
