import { financialNotificationEntity, financialNotificationFact, financialNotificationTitle, notificationRequiresAction } from "../../shared/workflows/financialNotifications.js";

/** Search only user-facing presentation, never technical IDs or hidden metadata. */
export const filterNotificationItems = (items, { filter = "action", query = "", unreadOnly = false, isRead = () => false } = {}) => {
  const terms = String(query || "").toLocaleLowerCase("id-ID").trim().split(/\s+/u).filter(Boolean);
  return (Array.isArray(items) ? items : []).filter((item) => {
    if (Boolean(notificationRequiresAction(item)) !== (filter === "action")) return false;
    if (unreadOnly && isRead(item)) return false;
    if (!terms.length) return true;
    const haystack = [financialNotificationTitle(item), financialNotificationEntity(item), financialNotificationFact(item)]
      .filter(Boolean).join(" ").toLocaleLowerCase("id-ID");
    return terms.every((term) => haystack.includes(term));
  });
};
