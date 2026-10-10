import React, { useEffect, useState } from 'react';
import { attendanceApi } from '../../api';
import type { RegularizationRequest } from '../../types';
import { Check, X, Clock, AlertCircle, FileText, CheckCircle2 } from 'lucide-react';

export const RegularizationReviewPanel: React.FC = () => {
  const [requests, setRequests] = useState<RegularizationRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'>('PENDING');
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      setSelectedIds([]);
      const filter = statusFilter === 'ALL' ? undefined : statusFilter;
      const data = await attendanceApi.getRegularizations(undefined, filter);
      setRequests(data);
    } catch {
      setMsg({ type: 'error', text: 'Failed to load regularization requests.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [statusFilter]);

  const handleAction = async (requestId: string, action: 'APPROVED' | 'REJECTED') => {
    try {
      setProcessingId(requestId);
      setMsg(null);
      await attendanceApi.reviewRegularization(requestId, action, `Reviewed by Admin as ${action}`);
      setMsg({
        type: 'success',
        text: `Request ${action === 'APPROVED' ? 'approved and attendance updated' : 'rejected'} successfully!`,
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
            <FileText className="w-5 h-5 text-blue-600" />
            <h2 className="text-xl font-bold text-slate-900">Attendance Regularization Approvals</h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Review manual time correction requests submitted by employees
          </p>
        </div>

        {/* Status Filter Buttons */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
          {(['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const).map((st) => (
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
      {selectedIds.length > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-blue-50/90 border border-blue-200 p-3.5 rounded-xl">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-bold text-blue-900">
              {selectedIds.length} request{selectedIds.length > 1 ? 's' : ''} selected
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
                <th className="px-5 py-3 font-semibold">Employee</th>
                <th className="px-5 py-3 font-semibold">Target Date</th>
                <th className="px-5 py-3 font-semibold">Corrected Window</th>
                <th className="px-5 py-3 font-semibold">Duration</th>
                <th className="px-5 py-3 font-semibold">Reason</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-slate-400">
                    Loading regularization requests...
                  </td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-slate-400">
                    No regularization requests found for status "{statusFilter}".
                  </td>
                </tr>
              ) : (
                requests.map((req) => (
                  <tr key={req.request_id} className="hover:bg-slate-50/60 transition">
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
                    <td className="px-5 py-3.5 font-semibold text-slate-900">{req.employee_id}</td>
                    <td className="px-5 py-3.5 font-medium text-slate-700">{req.work_date}</td>
                    <td className="px-5 py-3.5 text-xs text-slate-600">
                      {formatDateTime(req.entry_time)} – {formatDateTime(req.exit_time)}
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-slate-800">
                      {req.duration_hours.toFixed(1)} hrs
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-600 max-w-xs truncate" title={req.reason}>
                      {req.reason}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          req.status === 'APPROVED'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : req.status === 'REJECTED'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {req.status === 'PENDING' && <Clock className="w-3 h-3" />}
                        {req.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {req.status === 'PENDING' ? (
                        <div className="flex items-center justify-end gap-2">
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
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
