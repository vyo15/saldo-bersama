export const readBatchRows = async (db, statements) => {
  if (typeof db.batch === "function") {
    return (await db.batch(statements)).map((result) => result.rows || []);
  }
  return Promise.all(statements.map((statement) => db.all(statement.sql, statement.args || [])));
};
