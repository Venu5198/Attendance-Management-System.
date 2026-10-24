import React, { useEffect, useState } from 'react';
import { attendanceApi } from '../../api';
import type { RegularizationRequest } from '../../types';
import { useAuth } from '../../auth/AuthContext';
import { Check, X, AlertCircle, CheckCircle2, Plus, Sliders } from 'lucide-react';

export const RegularizationReviewPanel: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [requests, setRequests] = useState<RegularizationRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'>('ALL');
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);

  // New Adjustment Modal State
  const [showModal, setShowModal] = useState(false);
  const [targetDate, setTargetDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [entryTime, setEntryTime] = useState('09:00');
  const [exitTime, setExitTime] = useState('17:00');
  const [reason, setReason] = useState('');
  const [empIdInput, setEmpIdInput] = useState(user?.employee_id || '');
  const [submitting, setSubmitting] = useState(false);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      setSelectedIds([]);
      const filter = statusFilter === 'ALL' ? undefined : statusFilter;
      const data = await attendanceApi.getRegularizations(isAdmin ? undefined : user?.employee_id || undefined, filter);
      setRequests(data);
    } catch {
      setMsg({ type: 'error', text: 'Failed to load adjustments.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [statusFilter, user]);

  const handleAction = async (requestId: string, action: 'APPROVED' | 'REJECTED') => {
    try {
      setProcessingId(requestId);
      setMsg(null);
      await attendanceApi.reviewRegularization(requestId, action, `Reviewed by Admin as ${action}`);
      setMsg({
        type: 'success',
        text: `Adjustment ${action === 'APPROVED' ? 'approved and attendance updated' : 'rejected'} successfully!`,
      });
      await fetchRequests();
    } catch (err: unknown) {
      const errorMsg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        `Failed to ${action.toLowerCase()} request.`;
      setMsg({ type: 'error', text: errorMsg });
    } finally {
      setProcessingId(null);
    }
  };

  const handleBulkAction = async (action: 'APPROVED' | 'REJECTED') => {
    if (selectedIds.length === 0) return;
    try {
      setBulkLoading(true);
      setMsg(null);
      const res = await attendanceApi.bulkReviewRegularizations({
        request_ids: selectedIds,
        action,
        admin_notes: `Batch ${action.toLowerCase()} by HR Administrator`,
      });
      setMsg({
        type: 'success',
        text: `Batch completed: ${res.success_count} approved/rejected successfully${
          res.failed_count > 0 ? `, ${res.failed_count} failed` : ''
        }.`,
      });
      setSelectedIds([]);
      await fetchRequests();
    } catch (err: unknown) {
      const errorMsg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Batch operation failed.';
      setMsg({ type: 'error', text: errorMsg });
    } finally {
      setBulkLoading(false);
    }
  };

  const handleCreateAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetDate || !entryTime || !exitTime || !reason.trim()) return;

    try {
      setSubmitting(true);
      setMsg(null);
      const entryISO = new Date(`${targetDate}T${entryTime}:00Z`).toISOString();
      const exitISO = new Date(`${targetDate}T${exitTime}:00Z`).toISOString();

      await attendanceApi.submitRegularization({
        work_date: targetDate,
        entry_time: entryISO,
        exit_time: exitISO,
        reason: reason.trim(),
        employee_id: isAdmin && empIdInput.trim() ? empIdInput.trim() : undefined,
      });

      setMsg({ type: 'success', text: 'Adjustment request submitted successfully!' });
      setShowModal(false);
      setReason('');
      await fetchRequests();
    } catch (err: any) {
      setMsg({
        type: 'error',
        text: err?.response?.data?.detail || 'Failed to submit adjustment request.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleSelectAll = () => {
    const pendingIds = requests.filter((r) => r.status === 'PENDING').map((r) => r.request_id);
    if (selectedIds.length === pendingIds.length && pendingIds.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(pendingIds);
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const formatDateTime = (iso?: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-indigo-600" />
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">ADJUSTMENTS</h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Manual time and balance correction entries in the attendance ledger
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Status Filter Buttons */}
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

          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-1.5 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            New adjustment
          </button>
        </div>
      </div>

      {msg && (
        <div
          className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
            msg.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {msg.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {msg.text}
        </div>
      )}

      {/* Bulk Action Banner */}
      {isAdmin && selectedIds.length > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-blue-50/90 border border-blue-200 p-3.5 rounded-xl">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-bold text-blue-900">
              {selectedIds.length} adjustment{selectedIds.length > 1 ? 's' : ''} selected
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleBulkAction('APPROVED')}
              disabled={bulkLoading}
              className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              Batch Approve ({selectedIds.length})
            </button>
            <button
              onClick={() => handleBulkAction('REJECTED')}
              disabled={bulkLoading}
              className="px-3 py-1.5 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
            >
              <X className="w-3.5 h-3.5" />
              Batch Reject ({selectedIds.length})
            </button>
            <button
              onClick={() => setSelectedIds([])}
              className="px-2 py-1.5 text-xs text-slate-500 hover:text-slate-800"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Requests Table */}
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-slate-600">
            <thead className="text-xs uppercase bg-slate-50 text-slate-500 border-b border-slate-200">
              <tr>
                {isAdmin && (
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      aria-label="Select all pending"
                      checked={
                        requests.filter((r) => r.status === 'PENDING').length > 0 &&
                        selectedIds.length === requests.filter((r) => r.status === 'PENDING').length
                      }
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                    />
                  </th>
                )}
                <th className="px-5 py-3 font-semibold">Employee</th>
                <th className="px-5 py-3 font-semibold">Date</th>
                <th className="px-5 py-3 font-semibold">Corrected Times</th>
                <th className="px-5 py-3 font-semibold">Duration</th>
                <th className="px-5 py-3 font-semibold">Reason</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                {isAdmin && <th className="px-5 py-3 font-semibold text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={isAdmin ? 8 : 7} className="text-center py-8 text-slate-400">
                    Loading adjustments...
                  </td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 8 : 7} className="text-center py-12">
                    <Sliders className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-slate-700">No adjustments yet.</p>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                      Every correction or grant is a ledger entry with a reason in the audit trail.
                    </p>
                    <button
                      onClick={() => setShowModal(true)}
                      className="mt-3 px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 text-xs font-semibold rounded-lg transition"
                    >
                      + Create First Adjustment
                    </button>
                  </td>
                </tr>
              ) : (
                requests.map((req) => (
                  <tr key={req.request_id} className="hover:bg-slate-50/60 transition">
                    {isAdmin && (
                      <td className="px-4 py-3.5">
                        {req.status === 'PENDING' ? (
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(req.request_id)}
                            onChange={() => toggleSelectOne(req.request_id)}
                            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                          />
                        ) : null}
                      </td>
                    )}
                    <td className="px-5 py-3.5 font-semibold text-slate-900 font-mono text-xs">
                      {req.employee_id}
                    </td>
                    <td className="px-5 py-3.5 font-medium text-slate-800 text-xs">
                      {req.work_date}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-600">
                      {formatDateTime(req.entry_time)} – {formatDateTime(req.exit_time)}
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-slate-800 text-xs">
                      {req.duration_hours.toFixed(2)}h
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-600 max-w-xs truncate" title={req.reason}>
                      {req.reason}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                          req.status === 'APPROVED'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : req.status === 'REJECTED'
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}
                      >
                        {req.status}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="px-5 py-3.5 text-right">
                        {req.status === 'PENDING' ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleAction(req.request_id, 'APPROVED')}
                              disabled={processingId === req.request_id}
                              className="px-2.5 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition flex items-center gap-1 shadow-2xs disabled:opacity-50"
                            >
                              <Check className="w-3.5 h-3.5" />
                              Approve
                            </button>
                            <button
                              onClick={() => handleAction(req.request_id, 'REJECTED')}
                              disabled={processingId === req.request_id}
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

      {/* New Adjustment Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-bold text-slate-900">New Adjustment Request</h3>
              </div>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAdjustment} className="space-y-4 text-xs">
              {isAdmin && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Employee ID</label>
                  <input
                    type="text"
                    value={empIdInput}
                    onChange={(e) => setEmpIdInput(e.target.value)}
                    placeholder="e.g. EMP001"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Work Date</label>
                <input
                  type="date"
                  required
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Entry Time</label>
                  <input
                    type="time"
                    required
                    value={entryTime}
                    onChange={(e) => setEntryTime(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Exit Time</label>
                  <input
                    type="time"
                    required
                    value={exitTime}
                    onChange={(e) => setExitTime(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Adjustment Reason</label>
                <textarea
                  required
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Missed checkout due to biometric machine glitch, client visit"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold disabled:opacity-50"
                >
                  {submitting ? 'Submitting...' : 'Submit Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};