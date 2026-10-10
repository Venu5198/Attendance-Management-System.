import { apiClient } from "./client";
import type { Holiday, HolidayCreate } from "../types";

export const holidaysApi = {
  createHoliday: async (data: HolidayCreate): Promise<Holiday> => {
    const response = await apiClient.post<Holiday>("/holidays", data);
    return response.data;
  },

  getHolidays: async (startDate?: string, endDate?: string): Promise<Holiday[]> => {
    const response = await apiClient.get<Holiday[]>("/holidays", {
      params: { start_date: startDate, end_date: endDate },
    });
    return response.data;
  },

  deleteHoliday: async (holidayId: string): Promise<void> => {
    await apiClient.delete(`/holidays/${holidayId}`);
  },
};
