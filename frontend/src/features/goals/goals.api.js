import { apiClient } from "../../services/api/client.js";

export const createGoal = (payload, options) => apiClient.request("goals.create", payload, options);
export const updateGoal = (payload, options) => apiClient.request("goals.update", payload, options);
export const moveGoal = (payload, options) => apiClient.request("goals.move", payload, options);
export const reverseGoalMovement = (payload, options) => apiClient.request("goals.reverseMovement", payload, options);

export const previewGoalLifecycle = (payload, options) => apiClient.request("goals.previewLifecycle", payload, options);
export const archiveGoal = (payload, options) => apiClient.request("goals.archive", payload, options);
export const deleteUnusedGoal = (payload, options) => apiClient.request("goals.deleteUnused", payload, options);
export const restoreGoal = (payload, options) => apiClient.request("goals.restore", payload, options);
