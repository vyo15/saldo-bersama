import { apiClient } from "./api/client.js";

export const markNotificationsRead = async (items) => {
  const result = await apiClient.request("notifications.markRead", { items }, {});
  apiClient.invalidate("notifications.center");
  return result;
};
