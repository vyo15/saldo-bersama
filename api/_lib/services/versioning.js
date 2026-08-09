import { nowIso } from "./core.js";

export const nextVersionTimestamp = (current, timestamp = nowIso()) => ({
  row_version: Number(current?.row_version || 0) + 1,
  updated_at: timestamp,
});

export const nextVersionStamp = (current, actorUserId, timestamp = nowIso()) => ({
  ...nextVersionTimestamp(current, timestamp),
  updated_by: actorUserId,
});
