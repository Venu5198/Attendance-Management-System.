import React, { useState, useEffect, useRef } from 'react';
import { tasksApi, type TaskStatusResponse } from '../../api';
import { UploadCloud, FileSpreadsheet, X, CheckCircle2, AlertCircle, Loader2, StopCircle, RefreshCw, Layers } from 'lucide-react';

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

export const BulkImportModal: React.FC<BulkImportModalProps> = ({
  isOpen,
  onClose,
  onImportComplete,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<TaskStatusResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDeduplicated, setIsDeduplicated] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pollTimerRef = useRef<any>(null);

  // Poll task status if taskId exists and task is not in final state
  useEffect(() => {
    if (!taskId) return;

    const checkStatus = async () => {
      try {
        const res = await tasksApi.getTaskStatus(taskId);
        setTaskStatus(res);

        if (res.status === 'SUCCESS') {
          clearInterval(pollTimerRef.current);
          onImportComplete();
        } else if (res.status === 'FAILURE' || res.status === 'REVOKED') {
          clearInterval(pollTimerRef.current);
        }
      } catch (err: any) {
        console.error('Error polling Celery task:', err);
      }
    };

    // Immediate check + interval
    checkStatus();
    pollTimerRef.current = setInterval(checkStatus, 1500);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [taskId]);

  if (!isOpen) return null;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv')) {
        setSelectedFile(file);
        setErrorMsg(null);
      } else {
        setErrorMsg('Please upload a valid Excel (.xlsx, .xls) or CSV file.');
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setErrorMsg(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    try {
      setUploading(true);
      setErrorMsg(null);
      setIsDeduplicated(false);

      const res = await tasksApi.bulkImportAsync(selectedFile);
      setTaskId(res.task_id);
    } catch (err: any) {
      if (err.response?.status === 409) {
        setIsDeduplicated(true);
        setErrorMsg(err.response?.data?.detail || 'Duplicate upload detected. Request deduplicated by Redis.');
      } else {
        setErrorMsg(err.response?.data?.detail || 'Failed to dispatch import task to RabbitMQ.');
      }
    } finally {
      setUploading(false);
    }
  };

  const handleCancelTask = async () => {
    if (!taskId) return;
    try {
      await tasksApi.cancelTask(taskId);
      setTaskStatus((prev) => prev ? { ...prev, status: 'REVOKED', message: 'Task cancelled by admin.' } : null);
    } catch (err) {
      console.error('Failed to cancel task:', err);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setTaskId(null);
    setTaskStatus(null);
    setErrorMsg(null);
    setIsDeduplicated(false);
  };

  // Calculate progress percent
  const percent = taskStatus?.status === 'SUCCESS' ? 100 : (taskStatus?.progress?.percent ?? 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600/10 flex items-center justify-center text-blue-600">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Async Bulk Employee Import</h2>
              <p className="text-xs text-slate-500">RabbitMQ Message Broker & Celery Worker Ingestion</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {errorMsg && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">{isDeduplicated ? 'Redis Deduplication Triggered' : 'Upload Error'}</p>
                <p>{errorMsg}</p>
              </div>
            </div>
          )}

          {!taskId ? (
            <>
              {/* Dropzone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition flex flex-col items-center justify-center gap-3 ${
                  isDragging
                    ? 'border-blue-500 bg-blue-50/50'
                    : 'border-slate-200 hover:border-slate-300 bg-slate-50/40 hover:bg-slate-50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {selectedFile ? selectedFile.name : 'Click to select or drag & drop Excel/CSV file'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Supports .xlsx, .xls, .csv format (max 50,000 rows)
                  </p>
                </div>
                {selectedFile && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-100 text-emerald-800">
                    {(selectedFile.size / 1024).toFixed(1)} KB selected
                  </span>
                )}
              </div>

              {/* Architecture Info Callout */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/60 flex items-center gap-3 text-xs text-slate-600">
                <Layers className="w-4 h-4 text-blue-600 shrink-0" />
                <span>
                  Requests are fingerprint-deduplicated in <strong>Redis</strong> and queued via <strong>RabbitMQ</strong>. Immediate HTTP 202 response.
                </span>
              </div>
            </>
          ) : (
            /* Celery Task Progress State */
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-slate-500">Task ID: {taskId.slice(0, 16)}...</span>
                  <span
                    className={`px-2 py-0.5 rounded-full font-semibold uppercase text-[10px] tracking-wider ${
                      taskStatus?.status === 'SUCCESS'
                        ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                        : taskStatus?.status === 'FAILURE' || taskStatus?.status === 'REVOKED'
                        ? 'bg-rose-100 text-rose-700 border border-rose-300'
                        : taskStatus?.status === 'PROGRESS'
                        ? 'bg-blue-100 text-blue-700 border border-blue-300 animate-pulse'
                        : 'bg-amber-100 text-amber-700 border border-amber-300'
                    }`}
                  >
                    {taskStatus?.status || 'QUEUED'}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-medium text-slate-700">
                    <span>{taskStatus?.message || 'Queued in RabbitMQ...'}</span>
                    <span>{percent}%</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                    <div
                      className={`h-2.5 rounded-full transition-all duration-500 ${
                        taskStatus?.status === 'SUCCESS'
                          ? 'bg-emerald-500'
                          : taskStatus?.status === 'FAILURE'
                          ? 'bg-rose-500'
                          : 'bg-blue-600'
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>

                {/* Task Details / Counts */}
                {taskStatus?.progress && (
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/60 text-center text-xs">
                    <div className="p-2 bg-white rounded-lg border border-slate-100">
                      <p className="text-slate-400 text-[10px]">Processed</p>
                      <p className="font-bold text-slate-800">{taskStatus.progress.processed ?? taskStatus.progress.current ?? 0}</p>
                    </div>
                    <div className="p-2 bg-white rounded-lg border border-slate-100">
                      <p className="text-emerald-500 text-[10px]">Success</p>
                      <p className="font-bold text-emerald-700">{taskStatus.progress.success ?? 0}</p>
                    </div>
                    <div className="p-2 bg-white rounded-lg border border-slate-100">
                      <p className="text-rose-500 text-[10px]">Failed</p>
                      <p className="font-bold text-rose-700">{taskStatus.progress.failed ?? 0}</p>
                    </div>
                  </div>
                )}

                {taskStatus?.status === 'SUCCESS' && taskStatus.result && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      Bulk Ingestion Complete: {taskStatus.result.success_count ?? taskStatus.result.total ?? 'All'} employees added to database.
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          {!taskId ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-xl hover:bg-slate-200/50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUpload}
                disabled={!selectedFile || uploading}
                className="px-5 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-xl shadow-xs transition flex items-center gap-2"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Dispatching to Celery...
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-3.5 h-3.5" />
                    Start Async Import
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              {taskStatus?.status !== 'SUCCESS' && taskStatus?.status !== 'FAILURE' && taskStatus?.status !== 'REVOKED' ? (
                <button
                  type="button"
                  onClick={handleCancelTask}
                  className="px-4 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-xl transition flex items-center gap-1.5"
                >
                  <StopCircle className="w-3.5 h-3.5" />
                  Revoke Task
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 rounded-xl transition flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Import Another File
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  handleReset();
                  onClose();
                }}
                className="px-5 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-xl transition"
              >
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
