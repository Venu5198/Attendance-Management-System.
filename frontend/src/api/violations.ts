import { apiClient } from "./client";
import type { NotificationLog, PolicyViolation } from "../types";

export const violationsApi = {
  list: async (weekLabel?: string, employeeId?: string): Promise<PolicyViolation[]> => {
    const response = await apiClient.get<PolicyViolation[]>("/violations", {
      params: { week_label: weekLabel, employee_id: employeeId },
    });
    return response.data;
  },

  evaluate: async (referenceDate?: string): Promise<any[]> => {
    const response = await apiClient.post<any[]>("/violations/evaluate", {
      reference_date: referenceDate,
    });
    return response.data;
  },

  dispatch: async (weekLabel: string, forceResend: boolean = false): Promise<any> => {
    const response = await apiClient.post("/violations/dispatch-notifications", {
      week_label: weekLabel,
      force_resend: forceResend,
    });
    return response.data;
  },

  getLogs: async (employeeId?: string, policyWeek?: string): Promise<NotificationLog[]> => {
    const response = await apiClient.get<NotificationLog[]>("/violations/notification-logs", {
      params: { employee_id: employeeId, policy_week: policyWeek },
    });
    return response.data;
  },
};
