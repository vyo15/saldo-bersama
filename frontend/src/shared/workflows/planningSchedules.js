import { apiClient } from "../../services/api/client.js";

/**
 * Application-level boundary for creating a recurring schedule from another
 * planning feature (for example, a Kebutuhan inside Alokasi Dana).
 * Recurring feature internals stay encapsulated behind the canonical API action.
 */
export const createPlanningPaymentSchedule = (payload, options) => apiClient.request("recurring.createRule", payload, options);
