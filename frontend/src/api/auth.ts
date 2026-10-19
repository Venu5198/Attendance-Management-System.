import { apiClient } from "./client";
import type { LoginResponse, User } from "../types";

export const authApi = {
  login: async (credentials: { username: string; password: string; tenant_id?: string }): Promise<LoginResponse> => {
    const response = await apiClient.post<LoginResponse>("/auth/login", credentials);
    return response.data;
  },

  getMe: async (): Promise<User> => {
    const response = await apiClient.get<User>("/auth/me");
    return response.data;
  },

  refreshToken: async (refreshToken: string): Promise<LoginResponse> => {
    const response = await apiClient.post<LoginResponse>("/auth/refresh-token", {
      refresh_token: refreshToken,
    });
    return response.data;
  },

  register: async (userData: {
    username: string;
    email: string;
    password: string;
    role: "ADMIN" | "EMPLOYEE";
    employee_id?: string;
  }): Promise<User> => {
    const response = await apiClient.post<User>("/auth/register", userData);
    return response.data;
  },
};
