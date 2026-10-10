import React, { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { leavesApi } from '../../api';
import type { LeaveRequest, LeaveStatus, LeaveType } from '../../types';
import {
  CalendarDays,
  Plus,
  Check,
  X,
  Clock,
  CheckCircle2,
  AlertCircle,
  Briefcase,
} from 'lucide-react';

export const LeavesPage: React.FC = () => {
  const { user } = useAuth();
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState<LeaveStatus | 'ALL'>('ALL');
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal State
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

  const fetchLeaves = async () => {
    try {
      setLoading(true);
      setSelectedLeaveIds([]);
      const filter = statusFilter === 'ALL' ? undefined : statusFilter;
      // If employee, backend filters by their token unless admin
      const data = await leavesApi.getLeaves(isAdmin ? undefined : empId, filter);
      setLeaves(data);
    } catch {
      setMsg({ type: 'error', text: 'Failed to load leaves.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaves();
  }, [statusFilter, user]);

  const handleBulkReview = async (action: 'APPROVED' | 'REJECTED') => {
    if (selectedLeaveIds.length === 0) return;
    try {
      setBulkLoading(true);
      setMsg(null);
      const res = await leavesApi.bulkReviewLeaves({
        leave_ids: selectedLeaveIds,
        action,
        admin_notes: `Batch ${action.toLowerCase()} by HR Administrator`,
      });
      setMsg({
        type: 'success',
        text: `Batch action completed: ${res.success_count} leave(s) updated${
          res.failed_count > 0 ? `, ${res.failed_count} failed` : ''
        }.`,
      });
      setSelectedLeaveIds([]);
      await fetchLeaves();
    } catch (err: unknown) {
      const errorMsg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Batch action failed.';
      setMsg({ type: 'error', text: errorMsg });
    } finally {
      setBulkLoading(false);
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
      const errorMsg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        `Failed to ${action.toLowerCase()} leave.`;
      setMsg({ type: 'error', text: errorMsg });
    } finally {
      setProcessingId(null);
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
            <X className="w-3 h-3" />
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
            Submit time-off requests to exempt dates from the 3-day / 15-hour in-office policy
          </p>
        </div>

        <button
          onClick={() => setModalOpen(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-sm flex items-center gap-2 transition"
        >
          <Plus className="w-4 h-4" />
          Request Leave
        </button>
      </div>

      {msg && (
        <div
          className={`p-4 rounded-xl text-sm font-medium flex items-center gap-2 ${
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
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        {/* Filter bar */}
        <div className="flex justify-between items-center border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-bold text-slate-800">
              {isAdmin ? 'All Employee Leave Requests' : 'My Leave Applications'}
            </h2>
          </div>

          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
            {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg transition ${
                  statusFilter === st
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
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
                  {submitting ? 'Submitting...' : 'Submit Application'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
