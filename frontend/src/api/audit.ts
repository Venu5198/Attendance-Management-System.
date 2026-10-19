import { apiClient } from './client';

export interface AuditLog {
  id: string;
  action: string;
  actor: string;
  target?: string;
  tenant_id: string;
  details?: Record<string, any>;
  ip_address?: string;
  timestamp: string;
}

export const auditApi = {
  getLogs: async (action?: string, limit: number = 50): Promise<AuditLog[]> => {
    const response = await apiClient.get<AuditLog[]>('/audit/logs', {
      params: { action, limit },
    });
    return response.data;
  },
};
