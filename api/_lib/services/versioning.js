import { nowIso } from "./core.js";

export const nextVersionTimestamp = (current, timestamp = nowIso()) => ({
  row_version: Number(current?.row_version || 0) + 1,
  updated_at: timestamp,
});

export const nextVersionStamp = (current, actorUserId, timestamp = nowIso()) => ({
  ...nextVersionTimestamp(current, timestamp),
  updated_by: actorUserId,
});

export const newVersionStamp = (actorUserId, timestamp = nowIso()) => ({
  row_version: 1,
  created_by: actorUserId,
  created_at: timestamp,
  updated_by: actorUserId,
  updated_at: timestamp,
});
