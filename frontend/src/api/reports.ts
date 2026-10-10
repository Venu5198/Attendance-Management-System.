import { apiClient } from "./client";
import type { AttendanceReportResponse } from "../types";

export interface ReportQueryParams {
  period: "daily" | "weekly" | "monthly" | "yearly" | "custom";
  target_date?: string;
  start_date?: string;
  end_date?: string;
  employee_id?: string;
}

export interface EmailReportParams extends ReportQueryParams {
  recipient_email: string;
}

export const reportsApi = {
  getReport: async (params: ReportQueryParams): Promise<AttendanceReportResponse> => {
    const response = await apiClient.get<AttendanceReportResponse>("/attendance/report", {
      params,
    });
    return response.data;
  },

  emailReport: async (params: EmailReportParams): Promise<{ message: string; recipient: string }> => {
    const response = await apiClient.post<{ message: string; recipient: string }>(
      "/attendance/report/email",
      params
    );
    return response.data;
  },
};