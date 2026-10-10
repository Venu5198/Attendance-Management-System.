import { apiClient } from "./client";
import type { LeaveRequest, LeaveRequestCreate, LeaveStatus } from "../types";

export const leavesApi = {
  requestLeave: async (data: LeaveRequestCreate): Promise<LeaveRequest> => {
    const response = await apiClient.post<LeaveRequest>("/leaves/request", data);
    return response.data;
  },

  getLeaves: async (employeeId?: string, status?: LeaveStatus): Promise<LeaveRequest[]> => {
    const response = await apiClient.get<LeaveRequest[]>("/leaves", {
      params: { employee_id: employeeId, status },
    });
    return response.data;
  },

  reviewLeave: async (
    leaveId: string,
    action: "APPROVED" | "REJECTED",
    adminNotes?: string
  ): Promise<LeaveRequest> => {
    const response = await apiClient.patch<LeaveRequest>(`/leaves/${leaveId}`, {
      action,
      admin_notes: adminNotes,
    });
    return response.data;
  },
};
