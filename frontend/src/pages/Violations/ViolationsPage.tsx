import React, { useEffect, useState } from 'react';
import { violationsApi } from '../../api';
import type { PolicyViolation, NotificationLog } from '../../types';
import { StatusBadge } from '../../components/common/StatusBadge';
import {
  Play,
  Send,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Mail,
} from 'lucide-react';

export const ViolationsPage: React.FC = () => {
  const [violations, setViolations] = useState<PolicyViolation[]>([]);
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [activeTab, setActiveTab] = useState<'violations' | 'logs'>('violations');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const getWeekString = (offsetWeeks: number = 0) => {
    const d = new Date();
    d.setDate(d.getDate() - (offsetWeeks * 7));
    const year = d.getFullYear();
    const firstDayOfYear = new Date(year, 0, 1);
    const pastDaysOfYear = (d.getTime() - firstDayOfYear.getTime()) / 86400000;
    const weekNum = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
    return `${year}-W${weekNum < 10 ? '0' : ''}${weekNum}`;
  };

  const [selectedWeek, setSelectedWeek] = useState<string>(getWeekString(0));

  const fetchData = async () => {
    try {
      setLoading(true);
      const [vRes, lRes] = await Promise.all([
        violationsApi.list(selectedWeek || undefined),
        violationsApi.getLogs(undefined, selectedWeek || undefined),
      ]);
      setViolations(vRes);
      setLogs(lRes);
    } catch {
      // Handled
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedWeek]);

  const handleEvaluate = async () => {
    try {
      setActionLoading(true);
      setFeedback(null);
      await violationsApi.evaluate();
      setFeedback({
        type: 'success',
        text: `Policy evaluation triggered successfully for recent window.`,
      });
      await fetchData();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.response?.data?.detail || 'Failed to evaluate policy violations.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDispatch = async () => {
    try {
      setActionLoading(true);
      setFeedback(null);
      await violationsApi.dispatch(selectedWeek);
      setFeedback({
        type: 'success',
        text: `Email notifications dispatched for week ${selectedWeek}.`,
      });
      await fetchData();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.response?.data?.detail || 'Failed to dispatch email notifications.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Policy Violations & Notifications</h1>
          <p className="text-sm text-slate-500">
            Audit weekly compliance failures and trigger SMTP warning dispatches
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={handleEvaluate}
            disabled={actionLoading}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-medium flex items-center gap-2 shadow-sm transition active:scale-95 disabled:opacity-50"
          >
            <Play className="w-4 h-4" />
            Evaluate Violations
          </button>
          <button
            onClick={handleDispatch}
            disabled={actionLoading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium flex items-center gap-2 shadow-sm transition active:scale-95 disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            Dispatch Email Alerts
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl text-sm font-medium flex items-center gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {feedback.text}
        </div>
      )}

      {/* Week Selector Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Calendar className="w-5 h-5 text-slate-400" />
          <span className="text-sm font-semibold text-slate-700">Target Week:</span>
          <input
            type="text"
            value={selectedWeek}
            onChange={(e) => setSelectedWeek(e.target.value)}
            placeholder="YYYY-Www (e.g. 2026-W41)"
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-mono outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => setSelectedWeek(getWeekString(0))}
            className="text-xs text-blue-600 hover:underline"
          >
            Current Week
          </button>
          <button
            onClick={() => setSelectedWeek(getWeekString(1))}
            className="text-xs text-blue-600 hover:underline"
          >
            Previous Week
          </button>
        </div>

        {/* Tab Toggle */}
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('violations')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              activeTab === 'violations' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Violations ({violations.length})
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              activeTab === 'logs' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Notification Logs ({logs.length})
          </button>
        </div>
      </div>

      {activeTab === 'violations' ? (
        /* Violations Table */
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-slate-600">
              <thead className="text-xs uppercase bg-slate-50 text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 font-semibold">Employee ID</th>
                  <th className="px-6 py-3 font-semibold">Week</th>
                  <th className="px-6 py-3 font-semibold">Days Attended</th>
                  <th className="px-6 py-3 font-semibold">Office Hours</th>
                  <th className="px-6 py-3 font-semibold">Reason</th>
                  <th className="px-6 py-3 font-semibold">Status</th>
                  <th className="px-6 py-3 font-semibold">Email Dispatched</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-400">Loading violations...</td>
                  </tr>
                ) : violations.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-400">
                      No policy violations recorded for week {selectedWeek}.
                    </td>
                  </tr>
                ) : (
                  violations.map((v) => (
                    <tr key={v.violation_id} className="hover:bg-slate-50/60 transition">
                      <td className="px-6 py-4 font-mono font-medium text-slate-900">
                        {v.employee_id}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-500">
                        {v.week_label}
                      </td>
                      <td className="px-6 py-4 font-semibold text-slate-800">
                        {v.office_days} / 3 days
                      </td>
                      <td className="px-6 py-4 font-semibold text-slate-800">
                        {v.total_office_hours.toFixed(1)} / 15.0 hrs
                      </td>
                      <td className="px-6 py-4 text-xs text-rose-600 font-medium">
                        {v.violation_reasons?.join(', ') || 'Policy threshold not met'}
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={v.compliance_status} />
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={v.notification_sent ? 'SENT' : 'PENDING'} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Notification Logs Table */
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-slate-600">
              <thead className="text-xs uppercase bg-slate-50 text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 font-semibold">Recipient</th>
                  <th className="px-6 py-3 font-semibold">Policy Week</th>
                  <th className="px-6 py-3 font-semibold">Type</th>
                  <th className="px-6 py-3 font-semibold">Status</th>
                  <th className="px-6 py-3 font-semibold">Timestamp</th>
                  <th className="px-6 py-3 font-semibold">Error Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-slate-400">
                      No notification logs recorded yet.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.log_id} className="hover:bg-slate-50/60 transition">
                      <td className="px-6 py-4 font-medium text-slate-900 flex items-center gap-2">
                        <Mail className="w-4 h-4 text-slate-400" />
                        {log.recipient}
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-700 font-mono">{log.policy_week}</td>
                      <td className="px-6 py-4 text-xs uppercase font-mono">{log.notification_type}</td>
                      <td className="px-6 py-4">
                        <StatusBadge status={log.delivery_status} />
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-500">
                        {new Date(log.attempted_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-xs text-rose-500 font-mono">
                        {log.error_details || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
