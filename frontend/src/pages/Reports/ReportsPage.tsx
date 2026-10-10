import React, { useState } from 'react';
import { reportsApi } from '../../api';
import type { AttendanceReportResponse } from '../../types';
import { StatusBadge } from '../../components/common/StatusBadge';
import { FileSpreadsheet, Search, Filter, Download, CheckCircle2, XCircle, Mail, Send, AlertTriangle } from 'lucide-react';

export const ReportsPage: React.FC = () => {
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom'>('weekly');
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<AttendanceReportResponse | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'COMPLIANT' | 'NON_COMPLIANT'>('ALL');

  // Email modal states
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('devopspractices26@gmail.com');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFeedback(null);
    try {
      const params: any = { period };
      if (period === 'custom') {
        if (startDate) params.start_date = startDate;
        if (endDate) params.end_date = endDate;
      } else {
        if (date) params.target_date = date;
      }
      const res = await reportsApi.getReport(params);
      setReport(res);
    } catch {
      // Handled
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (!report || report.employees.length === 0) return;
    const headers = ['Employee ID', 'Full Name', 'Total Days', 'Total Hours', 'Compliance Status'];
    const rows = report.employees.map((r) => [
      r.employee_id,
      r.full_name,
      r.total_attended_days,
      r.total_office_hours.toFixed(2),
      r.overall_compliance || 'PENDING',
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `attendance_report_${period}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
        if (date) params.target_date = date;
      }
      const res = await reportsApi.emailReport(params);
      setFeedback({ type: 'success', text: res.message });
      setShowEmailModal(false);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.response?.data?.detail || 'Failed to email attendance report.',
      });
    } finally {
      setSendingEmail(false);
    }
  };

  const filteredRecords = (report?.employees || []).filter((r) => {
    const matchesSearch =
      r.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.employee_id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'COMPLIANT' && r.overall_compliance === 'COMPLIANT') ||
      (statusFilter === 'NON_COMPLIANT' && r.overall_compliance === 'NON_COMPLIANT');
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Central Attendance Reports</h1>
          <p className="text-sm text-slate-500">
            Generate and audit company-wide compliance across custom periods
          </p>
        </div>

        {report && (
          <div className="flex gap-2.5">
            <button
              onClick={() => setShowEmailModal(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium flex items-center gap-2 shadow-sm transition active:scale-95"
            >
              <Mail className="w-4 h-4" />
              Email Report
            </button>
            <button
              onClick={handleExportCSV}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium flex items-center gap-2 shadow-sm transition"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        )}
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

      {/* Control Bar */}
      <form onSubmit={handleGenerate} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Report Period</label>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as any)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>

          {period !== 'custom' ? (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Reference Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </>
          )}

          <div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-sm shadow-sm transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <FileSpreadsheet className="w-4 h-4" />
              {loading ? 'Generating...' : 'Generate Report'}
            </button>
          </div>
        </div>
      </form>

      {/* Report Summary Cards */}
      {report && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <span className="text-xs text-slate-500">Evaluated Employees</span>
              <p className="text-2xl font-bold text-slate-900 mt-1">{report.summary.total_active_employees}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <span className="text-xs text-emerald-600 font-medium">Compliant Weeks</span>
              <p className="text-2xl font-bold text-emerald-700 mt-1 flex items-center gap-1.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                {report.summary.compliant_weeks_count}
              </p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <span className="text-xs text-rose-600 font-medium">Non-Compliant Weeks</span>
              <p className="text-2xl font-bold text-rose-700 mt-1 flex items-center gap-1.5">
                <XCircle className="w-5 h-5 text-rose-500" />
                {report.summary.non_compliant_weeks_count}
              </p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <span className="text-xs text-blue-600 font-medium">Avg Office Hours</span>
              <p className="text-2xl font-bold text-blue-700 mt-1">{report.summary.average_hours_per_employee.toFixed(1)} hrs</p>
            </div>
          </div>

          {/* Search & Filter within results */}
          <div className="flex flex-col sm:flex-row justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search report by name or employee ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="bg-white border border-slate-300 text-xs px-2.5 py-1.5 rounded-lg outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="COMPLIANT">Compliant Only</option>
                <option value="NON_COMPLIANT">Non-Compliant Only</option>
              </select>
            </div>
          </div>

          {/* Report Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-slate-600">
                <thead className="text-xs uppercase bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3 font-semibold">Employee</th>
                    <th className="px-6 py-3 font-semibold">Department</th>
                    <th className="px-6 py-3 font-semibold">Days Attended</th>
                    <th className="px-6 py-3 font-semibold">Office Hours</th>
                    <th className="px-6 py-3 font-semibold">Policy Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRecords.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-8 text-slate-400">
                        No employees found matching filter.
                      </td>
                    </tr>
                  ) : (
                    filteredRecords.map((r) => (
                      <tr key={r.employee_id} className="hover:bg-slate-50/60 transition">
                        <td className="px-6 py-4">
                          <div className="font-semibold text-slate-900">{r.full_name}</div>
                          <div className="text-xs text-slate-400 font-mono">{r.employee_id}</div>
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-600 font-medium">{r.department}</td>
                        <td className="px-6 py-4 font-semibold text-slate-800">
                          {r.total_attended_days} <span className="text-xs font-normal text-slate-500">days</span>
                        </td>
                        <td className="px-6 py-4 font-semibold text-slate-800">
                          {r.total_office_hours.toFixed(2)} <span className="text-xs font-normal text-slate-500">hrs</span>
                        </td>
                        <td className="px-6 py-4">
                          <StatusBadge status={r.overall_compliance || 'PENDING'} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Email Report Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Email Attendance Report</h3>
                <p className="text-xs text-slate-500">Send formatted HTML report summary to any email inbox</p>
              </div>
            </div>

            <form onSubmit={handleSendEmail} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Destination Email ID</label>
                <input
                  type="email"
                  required
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="e.g. your-email@gmail.com"
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="p-3 bg-slate-50 rounded-lg text-xs text-slate-600 space-y-1">
                <div><strong>Period:</strong> {period.toUpperCase()}</div>
                <div><strong>Target Date:</strong> {period === 'custom' ? `${startDate} to ${endDate}` : date}</div>
                <div><strong>Employees Included:</strong> {report?.summary.total_active_employees || 0}</div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEmailModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingEmail}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  {sendingEmail ? 'Sending...' : 'Send to Email'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};