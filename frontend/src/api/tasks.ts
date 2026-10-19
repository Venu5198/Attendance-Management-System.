import { apiClient } from './client';

export interface TaskProgress {
  current?: number;
  total?: number;
  percent?: number;
  status?: string;
  processed?: number;
  success?: number;
  failed?: number;
  [key: string]: any;
}

export interface TaskStatusResponse {
  task_id: string;
  status: 'PENDING' | 'PROGRESS' | 'STARTED' | 'SUCCESS' | 'FAILURE' | 'REVOKED';
  message: string;
  progress?: TaskProgress;
  result?: any;
  error?: string;
}

export const tasksApi = {
  getTaskStatus: async (taskId: string): Promise<TaskStatusResponse> => {
    const response = await apiClient.get<TaskStatusResponse>(`/tasks/${taskId}`);
    return response.data;
  },

  cancelTask: async (taskId: string): Promise<{ task_id: string; status: string; message: string }> => {
    const response = await apiClient.delete<{ task_id: string; status: string; message: string }>(
      `/tasks/${taskId}`
    );
    return response.data;
  },

  bulkImportAsync: async (file: File, idempotencyKey?: string): Promise<{ message: string; task_id: string; fingerprint?: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    const headers: Record<string, string> = {
      'Content-Type': 'multipart/form-data',
    };
    if (idempotencyKey) {
      headers['X-Idempotency-Key'] = idempotencyKey;
    }
    const response = await apiClient.post<{ message: string; task_id: string; fingerprint?: string }>(
      '/employees/bulk-import-async',
      formData,
      { headers }
    );
    return response.data;
  },
};
