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
};
