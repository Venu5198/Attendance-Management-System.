import { apiClient } from "./client";
import type { Employee, EmployeeCreate } from "../types";

export const employeesApi = {
  list: async (activeOnly: boolean = false): Promise<{ total: number; employees: Employee[] }> => {
    const response = await apiClient.get<{ total: number; employees: Employee[] }>("/employees", {
      params: { active_only: activeOnly },
    });
    return response.data;
  },

  getById: async (id: string): Promise<Employee> => {
    const response = await apiClient.get<Employee>(`/employees/${id}`);
    return response.data;
  },

  create: async (data: EmployeeCreate): Promise<Employee> => {
    const response = await apiClient.post<Employee>("/employees", data);
    return response.data;
  },

  update: async (id: string, data: Partial<EmployeeCreate>): Promise<Employee> => {
    const response = await apiClient.put<Employee>(`/employees/${id}`, data);
    return response.data;
  },

  deactivate: async (id: string): Promise<Employee> => {
    const response = await apiClient.delete<Employee>(`/employees/${id}`);
    return response.data;
  },
};
