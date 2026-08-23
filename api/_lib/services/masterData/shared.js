// Shared only by account/category lifecycle presentation. Keep this module small
// so master-data domain rules do not drift into a generic utility bucket.
export const numericCounts = (row = {}) => Object.fromEntries(
  Object.entries(row).map(([key, value]) => [key, Number(value || 0)]),
);
