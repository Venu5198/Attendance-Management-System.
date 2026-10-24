import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { leavesApi } from '../../api';
import { holidaysApi } from '../../api/holidays';
import type { Holiday, LeaveRequest, LeaveStatus, LeaveType } from '../../types';
import { RegularizationReviewPanel } from '../../components/Attendance/RegularizationReviewPanel';
import {
  CalendarDays,
  Plus,
  Check,
  X,
  Clock,
  CheckCircle2,
  AlertCircle,
  Briefcase,
  Sparkles,
  Trash2,
  Sliders,
} from 'lucide-react';

export const LeavesPage: React.FC = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<'leaves' | 'holidays' | 'adjustments'>(
    initialTab === 'adjustments' ? 'adjustments' : initialTab === 'holidays' ? 'holidays' : 'leaves'
  );

  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [statusFilter, setStatusFilter] = useState<LeaveStatus | 'ALL'>('ALL');
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Holiday Modal State
  const [holidayModalOpen, setHolidayModalOpen] = useState(false);
  const [holidayDate, setHolidayDate] = useState('');
  const [holidayName, setHolidayName] = useState('');
  const [holidayDesc, setHolidayDesc] = useState('');
  const [holidaySubmitting, setHolidaySubmitting] = useState(false);

  // Leave Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [leaveType, setLeaveType] = useState<LeaveType>('VACATION');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [selectedLeaveIds, setSelectedLeaveIds] = useState<string[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);

  const isAdmin = user?.role === 'ADMIN';
  const empId = user?.employee_id || 'EMP001';

  const handleTabChange = (tab: 'leaves' | 'holidays' | 'adjustments') => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  const fetchLeaves = async () => {
    try {
      setLoading(true);
      setSelectedLeaveIds([]);
      const filter = statusFilter === 'ALL' ? undefined : statusFilter;
      const data = await leavesApi.getLeaves(isAdmin ? undefined : empId, filter);
      setLeaves(data);
    } catch {
      setMsg({ type: 'error', text: 'Failed to load leaves.' });
    } finally {
      setLoading(false);
    }
  };

  const fetchHolidays = async () => {
    try {
      const data = await holidaysApi.getHolidays();
      setHolidays(data);
    } catch {
      setMsg({ type: 'error', text: 'Failed to load company holidays.' });
    }
  };

  useEffect(() => {
    if (activeTab === 'leaves') {
      fetchLeaves();
    } else if (activeTab === 'holidays') {
      fetchHolidays();
    }
  }, [statusFilter, user, activeTab]);

  const handleCreateHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setHolidaySubmitting(true);
      setMsg(null);
      await holidaysApi.createHoliday({
        holiday_date: holidayDate,
        name: holidayName,
        description: holidayDesc || undefined,
      });

      setMsg({ type: 'success', text: `Holiday '${holidayName}' configured successfully!` });
      setHolidayModalOpen(false);
      setHolidayDate('');
      setHolidayName('');
      setHolidayDesc('');
      await fetchHolidays();
    } catch (err: unknown) {
      const respData = (err as { response?: { data?: { message?: string; detail?: string } } })?.response?.data;
      const errorMsg =
        respData?.message ||
        respData?.detail ||
        (err as Error)?.message ||
        'Failed to configure company holiday.';
      setMsg({ type: 'error', text: errorMsg });
    } finally {
      setHolidaySubmitting(false);
    }
  };

  const handleDeleteHoliday = async (holidayId: string, name: string) => {
    if (!window.confirm(`Delete company holiday "${name}"?`)) return;
    try {
      setMsg(null);
      await holidaysApi.deleteHoliday(holidayId);
      setMsg({ type: 'success', text: `Holiday '${name}' deleted successfully.` });
      await fetchHolidays();
    } catch (err: unknown) {
      const respData = (err as { response?: { data?: { message?: string; detail?: string } } })?.response?.data;
      const errorMsg =
        respData?.message ||
        respData?.detail ||
        (err as Error)?.message ||
        'Failed to delete company holiday.';
      setMsg({ type: 'error', text: errorMsg });
    }
  };

  const toggleSelectAll = () => {
    const pendingIds = leaves.filter((l) => l.status === 'PENDING').map((l) => l.leave_id);
    if (selectedLeaveIds.length === pendingIds.length && pendingIds.length > 0) {
      setSelectedLeaveIds([]);
    } else {
      setSelectedLeaveIds(pendingIds);
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedLeaveIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSubmitLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setMsg(null);
      await leavesApi.requestLeave({
        start_date: startDate,
        end_date: endDate,
        leave_type: leaveType,
        reason,
        employee_id: empId,
      });

      setMsg({ type: 'success', text: 'Leave request submitted successfully!' });
      setModalOpen(false);
      setStartDate('');
      setEndDate('');
      setReason('');
      await fetchLeaves();
    } catch (err: unknown) {
      const respData = (err as { response?: { data?: { message?: string; detail?: string } } })?.response?.data;
      const errorMsg =
        respData?.message ||
        respData?.detail ||
        (err as Error)?.message ||
        'Failed to submit leave request.';
      setMsg({ type: 'error', text: errorMsg });
    } finally {
      setSubmitting(false);
    }
  };

  const handleReview = async (leaveId: string, action: 'APPROVED' | 'REJECTED') => {
    try {
      setProcessingId(leaveId);
      setMsg(null);
      await leavesApi.reviewLeave(leaveId, action, `Admin marked as ${action}`);
      setMsg({
        type: 'success',
        text: `Leave request ${action === 'APPROVED' ? 'approved' : 'rejected'} successfully!`,
      });
      await fetchLeaves();
    } catch (err: unknown) {
      const respData = (err as { response?: { data?: { message?: string; detail?: string } } })?.response?.data;
      const errorMsg =
        respData?.message ||
        respData?.detail ||
        (err as Error)?.message ||
        `Failed to ${action.toLowerCase()} request.`;
      setMsg({ type: 'error', text: errorMsg });
    } finally {
      setProcessingId(null);
    }
  };

  const handleBulkReview = async (action: 'APPROVED' | 'REJECTED') => {
    if (selectedLeaveIds.length === 0) return;
    try {
      setBulkLoading(true);
      setMsg(null);
      const res = await leavesApi.bulkReviewLeaves({
        leave_ids: selectedLeaveIds,
        action,
        admin_notes: `Bulk ${action.toLowerCase()} by administrator`,
      });

      setMsg({
        type: 'success',
        text: `Bulk review completed: ${res.success_count} approved/rejected successfully${
          res.failed_count > 0 ? `, ${res.failed_count} failed` : ''
        }.`,
      });
      setSelectedLeaveIds([]);
      await fetchLeaves();
    } catch (err: unknown) {
      const respData = (err as { response?: { data?: { message?: string; detail?: string } } })?.response?.data;
      const errorMsg =
        respData?.message ||
        respData?.detail ||
        (err as Error)?.message ||
        'Bulk review operation failed.';
      setMsg({ type: 'error', text: errorMsg });
    } finally {
      setBulkLoading(false);
    }
  };

  const getStatusBadge = (status: LeaveStatus) => {
    switch (status) {
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3" />
            Approved
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <AlertCircle className="w-3 h-3" />
            Rejected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3 h-3" />
            Pending
          </span>
        );
    }
  };

  const getTypeBadge = (type: LeaveType) => {
    switch (type) {
      case 'SICK':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'VACATION':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'REMOTE_EXCEPTION':
        return 'bg-teal-50 text-teal-700 border-teal-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Leaves & Policy Exemptions</h1>
          <p className="text-sm text-slate-500">
            Manage time-off, holidays, and attendance ledger balance adjustments
          </p>
        </div>

        {activeTab === 'leaves' ? (
          <button
            onClick={() => setModalOpen(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-sm flex items-center gap-2 transition"
          >
            <Plus className="w-4 h-4" />
            Request Leave
          </button>
        ) : activeTab === 'holidays' && isAdmin ? (
          <button
            onClick={() => setHolidayModalOpen(true)}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-xl shadow-sm flex items-center gap-2 transition"
          >
            <Plus className="w-4 h-4" />
            Add Company Holiday
          </button>
        ) : null}
      </div>

      {/* Tab Switcher */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => handleTabChange('leaves')}
          className={`px-4 py-2 text-sm font-bold rounded-xl transition flex items-center gap-2 ${
            activeTab === 'leaves'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <CalendarDays className="w-4 h-4" />
          Leave Applications
        </button>
        <button
          onClick={() => handleTabChange('holidays')}
          className={`px-4 py-2 text-sm font-bold rounded-xl transition flex items-center gap-2 ${
            activeTab === 'holidays'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          Company Holidays Calendar
        </button>
        <button
          onClick={() => handleTabChange('adjustments')}
          className={`px-4 py-2 text-sm font-bold rounded-xl transition flex items-center gap-2 ${
            activeTab === 'adjustments'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Sliders className="w-4 h-4" />
          Adjustments & Corrections
        </button>
      </div>

      {msg && (
        <div
          className={`p-4 rounded-xl text-sm font-semibold flex items-center gap-2 ${
            msg.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {msg.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {msg.text}
        </div>
      )}

      {/* Main Container */}
      {activeTab === 'leaves' ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          {/* Filter bar */}
          <div className="flex justify-between items-center border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-blue-600" />
              <h2 className="text-base font-bold text-slate-800">
                {isAdmin ? 'All Employee Leave Requests' : 'My Leave Applications'}
              </h2>
            </div>

            <div className="flex items-center gap-2">
              {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition ${
                    statusFilter === st
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {/* Bulk Action Banner for Admin */}
          {isAdmin && selectedLeaveIds.length > 0 && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-blue-50/90 border border-blue-200 p-3.5 rounded-xl">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-bold text-blue-900">
                  {selectedLeaveIds.length} leave application{selectedLeaveIds.length > 1 ? 's' : ''} selected
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleBulkReview('APPROVED')}
                  disabled={bulkLoading}
                  className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  Batch Approve ({selectedLeaveIds.length})
                </button>
                <button
                  onClick={() => handleBulkReview('REJECTED')}
                  disabled={bulkLoading}
                  className="px-3 py-1.5 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
                >
                  <X className="w-3.5 h-3.5" />
                  Batch Reject ({selectedLeaveIds.length})
                </button>
                <button
                  onClick={() => setSelectedLeaveIds([])}
                  className="px-2 py-1.5 text-xs text-slate-500 hover:text-slate-800"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* Leaves Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-slate-600">
                <thead className="text-xs uppercase bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    {isAdmin && (
                      <th className="px-4 py-3 w-10">
                        <input
                          type="checkbox"
                          aria-label="Select all pending leaves"
                          checked={
                            leaves.filter((l) => l.status === 'PENDING').length > 0 &&
                            selectedLeaveIds.length === leaves.filter((l) => l.status === 'PENDING').length
                          }
                          onChange={toggleSelectAll}
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                        />
                      </th>
                    )}
                    {isAdmin && <th className="px-5 py-3 font-semibold">Employee</th>}
                    <th className="px-5 py-3 font-semibold">Duration</th>
                    <th className="px-5 py-3 font-semibold">Category</th>
                    <th className="px-5 py-3 font-semibold">Reason</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    {isAdmin && <th className="px-5 py-3 font-semibold text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={isAdmin ? 7 : 5} className="text-center py-8 text-slate-400">
                        Loading leave requests...
                      </td>
                    </tr>
                  ) : leaves.length === 0 ? (
                    <tr>
                      <td colSpan={isAdmin ? 7 : 5} className="text-center py-8 text-slate-400">
                        No leave requests found.
                      </td>
                    </tr>
                  ) : (
                    leaves.map((leave) => (
                      <tr key={leave.leave_id} className="hover:bg-slate-50/60 transition">
                        {isAdmin && (
                          <td className="px-4 py-3.5">
                            {leave.status === 'PENDING' ? (
                              <input
                                type="checkbox"
                                checked={selectedLeaveIds.includes(leave.leave_id)}
                                onChange={() => toggleSelectOne(leave.leave_id)}
                                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                              />
                            ) : null}
                          </td>
                        )}
                        {isAdmin && (
                          <td className="px-5 py-3.5 font-semibold text-slate-900">
                            {leave.employee_id}
                          </td>
                        )}
                        <td className="px-5 py-3.5 font-medium text-slate-800">
                          {leave.start_date} <span className="text-slate-400">to</span> {leave.end_date}
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-md text-xs font-semibold border ${getTypeBadge(
                              leave.leave_type
                            )}`}
                          >
                            {leave.leave_type.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-xs text-slate-600 max-w-xs truncate" title={leave.reason}>
                          {leave.reason}
                        </td>
                        <td className="px-5 py-3.5">{getStatusBadge(leave.status)}</td>
                        {isAdmin && (
                          <td className="px-5 py-3.5 text-right">
                            {leave.status === 'PENDING' ? (
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => handleReview(leave.leave_id, 'APPROVED')}
                                  disabled={processingId === leave.leave_id}
                                  className="px-2.5 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition flex items-center gap-1 shadow-2xs disabled:opacity-50"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleReview(leave.leave_id, 'REJECTED')}
                                  disabled={processingId === leave.leave_id}
                                  className="px-2.5 py-1 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition flex items-center gap-1 shadow-2xs disabled:opacity-50"
                                >
                                  <X className="w-3.5 h-3.5" />
                                  Reject
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400 italic">Resolved</span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : activeTab === 'holidays' ? (
        /* Company Holidays Tab */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-600" />
              <div>
                <h2 className="text-base font-bold text-slate-800">Company & National Holidays</h2>
                <p className="text-xs text-slate-500">
                  Business day holidays automatically deduct 1 day / 5 hours from weekly requirements.
                </p>
              </div>
            </div>
            <div className="bg-purple-50 text-purple-800 text-xs font-semibold px-3 py-1.5 rounded-xl border border-purple-200">
              {holidays.length} Holiday{holidays.length !== 1 ? 's' : ''} Configured
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider border-b border-slate-100">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Holiday Name</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Added By</th>
                  {isAdmin && <th className="px-4 py-3 text-right">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {holidays.length === 0 ? (
                  <tr>
                    <td colSpan={isAdmin ? 5 : 4} className="text-center py-8 text-slate-400">
                      No company holidays currently scheduled.
                    </td>
                  </tr>
                ) : (
                  holidays.map((h) => (
                    <tr key={h.holiday_id} className="hover:bg-slate-50/60 transition">
                      <td className="px-4 py-3 font-semibold text-purple-900">
                        {h.holiday_date}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                        {h.name}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {h.description || '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-400 font-mono text-[11px]">
                        {h.created_by || 'Admin'}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleDeleteHoliday(h.holiday_id, h.name)}
                            className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition"
                            title="Delete Holiday"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Adjustments & Regularization Tab */
        <div className="space-y-4">
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
            <h3 className="text-sm font-bold text-slate-800">Leave & Attendance Adjustments</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Leave requests across the company, and the leave types, grants and corrections behind every balance. Balances come from an append-only ledger: every grant and adjustment is a ledger entry with a reason in the audit trail.
            </p>
          </div>
          <RegularizationReviewPanel />
        </div>
      )}

      {/* Leave Request Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-bold text-slate-900">Request Leave or Exemption</h3>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {msg && msg.type === 'error' && (
              <div className="p-3 rounded-xl text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{msg.text}</span>
              </div>
            )}

            <form onSubmit={handleSubmitLeave} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">End Date</label>
                  <input
                    type="date"
                    required
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Leave Type</label>
                <select
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value as LeaveType)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="VACATION">Vacation / Paid Time Off</option>
                  <option value="SICK">Medical / Sick Leave</option>
                  <option value="CASUAL">Casual Leave</option>
                  <option value="REMOTE_EXCEPTION">Valid Remote-Work Exception</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Reason</label>
                <textarea
                  required
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Annual family vacation, medical doctor appointment"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold shadow-sm transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  {submitting ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Holiday Modal (Admin) */}
      {holidayModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-600" />
                <h3 className="text-lg font-bold text-slate-900">Configure Company Holiday</h3>
              </div>
              <button
                onClick={() => setHolidayModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateHoliday} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Holiday Date</label>
                <input
                  type="date"
                  required
                  value={holidayDate}
                  onChange={(e) => setHolidayDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Holiday Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. New Year's Day, Diwali, Thanksgiving"
                  value={holidayName}
                  onChange={(e) => setHolidayName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="Brief note or celebration info"
                  value={holidayDesc}
                  onChange={(e) => setHolidayDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setHolidayModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={holidaySubmitting}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-semibold shadow-sm transition disabled:opacity-50"
                >
                  {holidaySubmitting ? 'Saving...' : 'Save Holiday'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
