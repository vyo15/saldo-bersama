import { apiClient } from "../../services/api/client.js";

export const createGoal = (payload, options) => apiClient.request("goals.create", payload, options);
export const updateGoal = (payload, options) => apiClient.request("goals.update", payload, options);
export const moveGoal = (payload, options) => apiClient.request("goals.move", payload, options);
export const reverseGoalMovement = (payload, options) => apiClient.request("goals.reverseMovement", payload, options);
