import { apiClient } from './client';

export interface Tenant {
  tenant_id: string;
  name: string;
  plan: string;
  max_employees: number;
  is_active: boolean;
  contact_email?: string;
  created_at?: string;
  total_employees: number;
}

export interface TenantCreateRequest {
  tenant_id: string;
  name: string;
  plan?: string;
  max_employees?: number;
  contact_email?: string;
}

export const tenantsApi = {
  list: async (): Promise<Tenant[]> => {
    const response = await apiClient.get<Tenant[]>('/tenants');
    return response.data;
  },

  create: async (data: TenantCreateRequest): Promise<Tenant> => {
    const response = await apiClient.post<Tenant>('/tenants', data);
    return response.data;
  },

  update: async (tenantId: string, data: Partial<TenantCreateRequest & { is_active: boolean }>) => {
    const response = await apiClient.patch(`/tenants/${tenantId}`, data);
    return response.data;
  },
};
