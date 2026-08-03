import { readdir, readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

const migrationDirectory = new URL("../../database/migrations/", import.meta.url);

const migrationSql = async () => {
  const files = (await readdir(migrationDirectory)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
  const sources = await Promise.all(files.map((name) => readFile(new URL(name, migrationDirectory), "utf8")));
  return sources.join("\n").replaceAll("-- migrate:split", "");
};

const isReadStatement = (sql) => /^\s*(?:SELECT|PRAGMA|WITH)\b/i.test(sql);

export const createSqliteTestDatabase = async () => {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys=ON");
  raw.exec(await migrationSql());

  let transactionDepth = 0;
  const adapter = {
    all: async (sql, args = []) => raw.prepare(sql).all(...args),
    one: async (sql, args = []) => raw.prepare(sql).get(...args) || null,
    execute: async (sql, args = []) => {
      const result = raw.prepare(sql).run(...args);
      return {
        rowsAffected: Number(result.changes || 0),
        lastInsertRowid: result.lastInsertRowid
      };
    },
    batch: async (statements) => statements.map(({ sql, args = [] }) => {
      const statement = raw.prepare(sql);
      if (isReadStatement(sql)) return { rows: statement.all(...args), rowsAffected: 0 };
      const result = statement.run(...args);
      return { rows: [], rowsAffected: Number(result.changes || 0), lastInsertRowid: result.lastInsertRowid };
    }),
    transaction: async (callback) => {
      const savepoint = `test_tx_${transactionDepth}`;
      const outer = transactionDepth === 0;
      if (outer) raw.exec("BEGIN IMMEDIATE");
      else raw.exec(`SAVEPOINT ${savepoint}`);
      transactionDepth += 1;
      try {
        const result = await callback(adapter);
        transactionDepth -= 1;
        if (outer) raw.exec("COMMIT");
        else raw.exec(`RELEASE SAVEPOINT ${savepoint}`);
        return result;
      } catch (error) {
        transactionDepth -= 1;
        if (outer) raw.exec("ROLLBACK");
        else {
          raw.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
          raw.exec(`RELEASE SAVEPOINT ${savepoint}`);
        }
        throw error;
      }
    },
    readTransaction: async (callback) => adapter.transaction(callback),
    close: () => raw.close()
  };

  return adapter;
};
