export const readBatchRows = async (db, statements) => {
  if (typeof db.batch === "function") {
    return (await db.batch(statements)).map((result) => result.rows || []);
  }
  return Promise.all(statements.map((statement) => db.all(statement.sql, statement.args || [])));
};

export const readBatchRowsChunked = async (db, statements, { chunkSize = 6 } = {}) => {
  const normalized = Array.isArray(statements) ? statements : [];
  if (!normalized.length) return [];
  const size = Math.max(1, Math.floor(Number(chunkSize) || 6));
  const rows = [];
  for (let index = 0; index < normalized.length; index += size) {
    rows.push(...await readBatchRows(db, normalized.slice(index, index + size)));
  }
  return rows;
};
