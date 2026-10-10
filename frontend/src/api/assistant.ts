import { apiClient } from "./client";
import type { AssistantQueryResponse } from "../types";

export const assistantApi = {
  query: async (query: string): Promise<AssistantQueryResponse> => {
    const response = await apiClient.post<AssistantQueryResponse>("/assistant/query", {
      query,
    });
    return response.data;
  },
};
