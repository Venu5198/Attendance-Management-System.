import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { reportsApi, violationsApi } from "../../api";
import type { AttendanceReportResponse, ComplianceHealthScore, PolicyViolation } from "../../types";
import { StatCard } from "../../components/common/StatCard";
import { StatusBadge } from "../../components/common/StatusBadge";
import {
  Users,
  UserCheck,
  UserX,
  Clock,
  ShieldCheck,
  AlertTriangle,
  Mail,
  ArrowUpRight,
  Activity,
  AlertCircle,
} from "lucide-react";

export const AdminDashboard: React.FC = () => {
  const [report, setReport] = useState<AttendanceReportResponse | null>(null);
  const [violations, setViolations] = useState<PolicyViolation[]>([]);
  const [healthScores, setHealthScores] = useState<ComplianceHealthScore[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        setError(null);
        const [reportData, violationsData, healthData] = await Promise.all([
          reportsApi.getReport({ period: "weekly" }),
          violationsApi.list(),
          violationsApi.getHealthScores(),
        ]);
        setReport(reportData);
        setViolations(violationsData);
        setHealthScores(healthData);
      } catch (err: any) {
        setError(err?.response?.data?.detail || "Failed to load dashboard metrics");
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
          <p className="mt-2 text-sm text-slate-500">Loading company metrics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-rose-800">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          <h3 className="font-semibold">Failed to load Dashboard</h3>
        </div>
        <p className="mt-2 text-sm">{error}</p>
      </div>
    );
  }

  const summary = report?.summary;
  const pendingViolations = violations.filter((v) => !v.notification_sent).length;
  const sentNotifications = violations.filter((v) => v.notification_sent).length;

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Company Overview & Compliance
        </h1>
        <p className="text-sm text-slate-500">
          Real-time metrics for attendance compliance, policy tracking, and employee hours.
        </p>
      </div>

      {/* Grid of Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Active Employees"
          value={summary?.total_active_employees ?? 0}
          icon={<Users className="h-5 w-5 text-blue-600" />}
          subtitle="Registered staff"
        />
        <StatCard
          title="Compliant Weeks"
          value={summary?.compliant_weeks_count ?? 0}
          variant="success"
          icon={<ShieldCheck className="h-5 w-5 text-emerald-600" />}
          subtitle="Passed (>= 3 days & 15h)"
        />
        <StatCard
          title="Non-Compliant Weeks"
          value={summary?.non_compliant_weeks_count ?? 0}
          variant="danger"
          icon={<AlertTriangle className="h-5 w-5 text-rose-600" />}
          subtitle="Policy breaches flagged"
        />
        <StatCard
          title="Average Hours / Staff"
          value={`${(summary?.average_hours_per_employee ?? 0).toFixed(1)}h`}
          variant="info"
          icon={<Clock className="h-5 w-5 text-indigo-600" />}
          subtitle="Across active window"
        />
        <StatCard
          title="Office Days Accumulated"
          value={summary?.total_office_days_accumulated ?? 0}
          icon={<UserCheck className="h-5 w-5 text-teal-600" />}
          subtitle="Physical office entries"
        />
        <StatCard
          title="Total Office Hours"
          value={`${(summary?.total_office_hours_accumulated ?? 0).toFixed(1)}h`}
          icon={<Clock className="h-5 w-5 text-violet-600" />}
          subtitle="Logged on-premise"
        />
        <StatCard
          title="Pending Violations"
          value={pendingViolations}
          variant={pendingViolations > 0 ? "warning" : "default"}
          icon={<UserX className="h-5 w-5 text-amber-600" />}
          subtitle="Awaiting notification"
        />
        <StatCard
          title="Emails Dispatched"
          value={sentNotifications}
          variant="info"
          icon={<Mail className="h-5 w-5 text-sky-600" />}
          subtitle="Delivered alerts"
        />
      </div>

      {/* Continuous Compliance Health Scores (Rolling 4-Week History) */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-600" />
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Continuous Compliance Health Score (Rolling 4-Week History)
              </h2>
              <p className="text-xs text-slate-500">
                Automated rolling health scores per employee to identify chronic under-hours patterns.
              </p>
            </div>
          </div>
          <Link
            to="/violations"
            className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            Policy Violations <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-6 bg-slate-50/50">
          {healthScores.slice(0, 8).map((score) => {
            const isCritical = score.health_rating === 'CRITICAL';
            const isAtRisk = score.health_rating === 'AT_RISK';
            const isExcellent = score.health_rating === 'EXCELLENT';
            return (
              <div
                key={score.employee_id}
                className={`rounded-xl border p-4 bg-white shadow-2xs transition flex flex-col justify-between ${
                  score.chronic_issue ? 'border-amber-300 ring-1 ring-amber-100' : 'border-slate-200'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-sm text-slate-900">{score.employee_name}</div>
                      <div className="text-xs text-slate-400">{score.employee_id} • {score.department}</div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        isExcellent
                          ? 'bg-emerald-100 text-emerald-800'
                          : isCritical
                          ? 'bg-rose-100 text-rose-800'
                          : isAtRisk
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {score.health_rating}
                    </span>
                  </div>

                  <div className="mt-4 flex items-baseline justify-between">
                    <span className="text-2xl font-black text-slate-900">{score.health_score}%</span>
                    <span className="text-xs font-medium text-slate-500">
                      {score.compliant_weeks}/{score.total_evaluated_weeks} weeks passed
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        isExcellent
                          ? 'bg-emerald-500'
                          : isCritical
                          ? 'bg-rose-500'
                          : isAtRisk
                          ? 'bg-amber-500'
                          : 'bg-blue-500'
                      }`}
                      style={{ width: `${score.health_score}%` }}
                    />
                  </div>
                </div>

                {score.chronic_issue && (
                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center gap-1.5 text-xs text-amber-700 font-medium">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span>Chronic Under-Hours Pattern</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Live Table Section */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Employee Attendance Breakdown
            </h2>
            <p className="text-xs text-slate-500">
              Evaluated based on minimum 3 days and 15 hours per calendar week.
            </p>
          </div>
          <Link
            to="/reports"
            className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            Detailed Reports <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-6 py-3">Employee</th>
                <th className="px-6 py-3">Department</th>
                <th className="px-6 py-3">Office Days</th>
                <th className="px-6 py-3">Total Hours</th>
                <th className="px-6 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report?.employees.map((emp) => (
                <tr key={emp.employee_id} className="hover:bg-slate-50/50">
                  <td className="px-6 py-4 font-medium text-slate-900">
                    <div>{emp.full_name}</div>
                    <div className="text-xs text-slate-400">{emp.email}</div>
                  </td>
                  <td className="px-6 py-4">{emp.department}</td>
                  <td className="px-6 py-4 font-semibold text-slate-800">
                    {emp.total_attended_days} days
                  </td>
                  <td className="px-6 py-4 font-semibold text-slate-800">
                    {emp.total_office_hours.toFixed(2)} hrs
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={emp.overall_compliance || "PENDING"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
