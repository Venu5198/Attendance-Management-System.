import { apiClient } from "./client";
import type { AttendanceRecord } from "../types";

export const attendanceApi = {
  checkIn: async (employeeId?: string): Promise<{ message: string; attendance: AttendanceRecord }> => {
    const response = await apiClient.post<{ message: string; attendance: AttendanceRecord }>(
      "/attendance/check-in",
      employeeId ? { employee_id: employeeId } : {}
    );
    return response.data;
  },

  checkOut: async (employeeId?: string): Promise<{ message: string; attendance: AttendanceRecord }> => {
    const response = await apiClient.post<{ message: string; attendance: AttendanceRecord }>(
      "/attendance/check-out",
      employeeId ? { employee_id: employeeId } : {}
    );
    return response.data;
  },

  getToday: async (employeeId?: string): Promise<AttendanceRecord> => {
    const response = await apiClient.get<AttendanceRecord>("/attendance/today", {
      params: employeeId ? { employee_id: employeeId } : {},
    });
    return response.data;
  },

  getHistory: async (
    employeeId: string,
    startDate?: string,
    endDate?: string
  ): Promise<AttendanceRecord[]> => {
    const response = await apiClient.get<AttendanceRecord[]>(`/attendance/history/${employeeId}`, {
      params: { start_date: startDate, end_date: endDate },
    });
    return response.data;
  },

  submitRegularization: async (
    data: import("../types").RegularizationCreate
  ): Promise<import("../types").RegularizationRequest> => {
    const response = await apiClient.post<import("../types").RegularizationRequest>(
      "/attendance/regularize",
      data
    );
    return response.data;
  },

  getRegularizations: async (
    employeeId?: string,
    status?: string
  ): Promise<import("../types").RegularizationRequest[]> => {
    const response = await apiClient.get<import("../types").RegularizationRequest[]>(
      "/attendance/regularize",
      {
        params: { employee_id: employeeId, status },
      }
    );
    return response.data;
  },

  reviewRegularization: async (
    requestId: string,
    action: "APPROVED" | "REJECTED",
    adminNotes?: string
  ): Promise<import("../types").RegularizationRequest> => {
    const response = await apiClient.patch<import("../types").RegularizationRequest>(
      `/attendance/regularize/${requestId}`,
      {
        action,
        admin_notes: adminNotes,
      }
    );
    return response.data;
  },

  bulkReviewRegularizations: async (data: {
    request_ids: string[];
    action: "APPROVED" | "REJECTED";
    admin_notes?: string;
  }): Promise<{ total_requested: number; success_count: number; failed_count: number; updated_ids: string[]; errors: string[] }> => {
    const response = await apiClient.post("/attendance/regularize/bulk-review", data);
    return response.data;
  },
};

