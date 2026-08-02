const REQUEST_TIMEOUT_MS = 12_000;
const TRANSACTION_STEP_TIMEOUT_MS = 10_000;

const appError = (code, message, status = 500, details = null) => Object.assign(new Error(message), { code, status, details });

const normalizeBaseUrl = (value) => {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  if (!raw) throw appError("DATABASE_NOT_CONFIGURED", "TURSO_DATABASE_URL belum diatur.", 503);
  if (raw.startsWith("turso://")) return `https://${raw.slice("turso://".length)}`;
  if (raw.startsWith("libsql://")) return `https://${raw.slice("libsql://".length)}`;
  if (raw.startsWith("https://")) return raw;
  throw appError("DATABASE_URL_INVALID", "TURSO_DATABASE_URL harus memakai turso://, libsql://, atau https://.", 503);
};

const pipelineEndpoint = (value) => {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  if (!raw) throw appError("DATABASE_URL_INVALID", "Base URL pipeline Turso tidak valid.", 503);
  let parsed;
  try { parsed = new URL(raw); } catch { throw appError("DATABASE_URL_INVALID", "Base URL pipeline Turso tidak valid.", 503); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw appError("DATABASE_URL_INVALID", "Base URL pipeline Turso tidak aman.", 503);
  }
  parsed.hash = "";
  parsed.search = "";
  const pathname = parsed.pathname.replace(/\/+$/, "");
  parsed.pathname = pathname.endsWith("/v2/pipeline") ? pathname : `${pathname}/v2/pipeline`;
  return parsed.toString();
};

const encodeArg = (value) => {
  if (value === null || value === undefined) return { type: "null" };
  if (typeof value === "boolean") return { type: "integer", value: value ? "1" : "0" };
  if (typeof value === "bigint") return { type: "integer", value: String(value) };
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw appError("DATABASE_ARGUMENT_INVALID", "Argumen database bukan angka valid.", 500);
    if (Number.isSafeInteger(value)) return { type: "integer", value: String(value) };
    return { type: "float", value: String(value) };
  }
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return { type: "blob", base64: Buffer.from(value).toString("base64") };
  return { type: "text", value: String(value) };
};

const decodeValue = (value) => {
  if (!value || value.type === "null") return null;
  if (value.type === "integer") {
    const parsed = Number(value.value);
    return Number.isSafeInteger(parsed) ? parsed : String(value.value);
  }
  if (value.type === "float") return Number(value.value);
  if (value.type === "blob") return Buffer.from(value.base64 || "", "base64");
  return String(value.value ?? "");
};

const decodeResult = (result) => {
  const columns = (result?.cols || []).map((column) => column.name);
  return {
    rows: (result?.rows || []).map((row) => Object.fromEntries(columns.map((column, index) => [column, decodeValue(row[index])]))),
    rowsAffected: Number(result?.affected_row_count || 0),
    lastInsertRowid: result?.last_insert_rowid === null || result?.last_insert_rowid === undefined ? null : decodeValue({ type: "integer", value: result.last_insert_rowid }),
    rowsRead: Number(result?.rows_read || 0),
    rowsWritten: Number(result?.rows_written || 0),
    queryDurationMs: Number(result?.query_duration_ms || 0),
  };
};

const statementRequest = (sql, args = []) => ({
  type: "execute",
  stmt: { sql: String(sql), args: args.map(encodeArg) },
});

const parsePipeline = (payload) => {
  const results = payload?.results || [];
  return results.map((item) => {
    if (item?.type !== "ok") {
      const message = String(item?.error?.message || item?.error || "Query database gagal.").slice(0, 500);
      throw appError("DATABASE_QUERY_FAILED", "Operasi database ditolak.", 503, { reason: message });
    }
    if (item.response?.type !== "execute") return null;
    return decodeResult(item.response.result);
  });
};

export class TursoHttpClient {
  constructor({ url = process.env.TURSO_DATABASE_URL, authToken = process.env.TURSO_AUTH_TOKEN, fetchImpl = globalThis.fetch } = {}) {
    this.baseUrl = normalizeBaseUrl(url);
    this.authToken = String(authToken || "").trim();
    this.fetchImpl = fetchImpl;
    if (!this.authToken) throw appError("DATABASE_NOT_CONFIGURED", "TURSO_AUTH_TOKEN belum diatur.", 503);
    if (typeof this.fetchImpl !== "function") throw appError("DATABASE_FETCH_UNAVAILABLE", "Runtime tidak menyediakan fetch.", 500);
  }

  async pipeline(requests, { baton = null, baseUrl = null, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const endpoint = pipelineEndpoint(baseUrl || this.baseUrl);
      const response = await this.fetchImpl(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.authToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...(baton ? { baton } : {}), requests }),
        signal: controller.signal,
      });
      const text = await response.text();
      let payload = null;
      try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }
      if (!response.ok) throw appError("DATABASE_UNAVAILABLE", "Database Turso tidak dapat dihubungi.", 503, { status: response.status });
      const decoded = parsePipeline(payload);
      return { results: decoded, baton: payload.baton || null, baseUrl: payload.base_url || baseUrl || this.baseUrl };
    } catch (error) {
      if (error?.name === "AbortError") throw appError("DATABASE_TIMEOUT", "Database melewati batas waktu.", 503);
      if (error?.code) throw error;
      throw appError("DATABASE_UNAVAILABLE", "Database Turso tidak dapat dihubungi.", 503);
    } finally {
      clearTimeout(timeout);
    }
  }

  async execute(sql, args = []) {
    const response = await this.pipeline([
      statementRequest("PRAGMA foreign_keys = ON"),
      statementRequest(sql, args),
      { type: "close" },
    ]);
    return response.results[1];
  }

  async all(sql, args = []) { return (await this.execute(sql, args)).rows; }
  async one(sql, args = []) { return (await this.execute(sql, args)).rows[0] || null; }
  async batch(statements = []) {
    const response = await this.pipeline([
      statementRequest("PRAGMA foreign_keys = ON"),
      ...statements.map((item) => statementRequest(item.sql, item.args || [])),
      { type: "close" },
    ]);
    return response.results.slice(1, 1 + statements.length);
  }

  async runTransaction(callback, { begin = "BEGIN IMMEDIATE" } = {}) {
    if (!["BEGIN", "BEGIN IMMEDIATE"].includes(begin)) throw appError("DATABASE_TRANSACTION_MODE_INVALID", "Mode transaksi database tidak valid.", 500);
    let connection = null;
    let closed = false;
    let queue = Promise.resolve();
    let transactionFailure = null;
    const enqueue = (operation) => {
      const task = queue.then(async () => {
        if (transactionFailure) throw transactionFailure;
        try {
          return await operation();
        } catch (error) {
          transactionFailure = error;
          throw error;
        }
      });
      queue = task.then(() => undefined, () => undefined);
      return task;
    };
    try {
      connection = await this.pipeline([
        statementRequest("PRAGMA foreign_keys = ON"),
        statementRequest(begin),
      ], { timeoutMs: 8_000 });
      const tx = {
        execute: (sql, args = []) => enqueue(async () => {
          const next = await this.pipeline([statementRequest(sql, args)], {
            baton: connection.baton,
            baseUrl: connection.baseUrl,
            timeoutMs: TRANSACTION_STEP_TIMEOUT_MS,
          });
          connection = next;
          return next.results[0];
        }),
      };
      tx.all = async (sql, args = []) => (await tx.execute(sql, args)).rows;
      tx.one = async (sql, args = []) => (await tx.execute(sql, args)).rows[0] || null;
      tx.batch = (statements = []) => enqueue(async () => {
        const next = await this.pipeline(
          statements.map((item) => statementRequest(item.sql, item.args || [])),
          { baton: connection.baton, baseUrl: connection.baseUrl, timeoutMs: TRANSACTION_STEP_TIMEOUT_MS },
        );
        connection = next;
        return next.results;
      });
      const value = await callback(tx);
      await queue;
      if (transactionFailure) throw transactionFailure;
      await this.pipeline([statementRequest("COMMIT"), { type: "close" }], {
        baton: connection.baton,
        baseUrl: connection.baseUrl,
        timeoutMs: TRANSACTION_STEP_TIMEOUT_MS,
      });
      closed = true;
      return value;
    } catch (error) {
      await queue;
      if (connection?.baton && !closed) {
        try {
          await this.pipeline([statementRequest("ROLLBACK"), { type: "close" }], {
            baton: connection.baton,
            baseUrl: connection.baseUrl,
            timeoutMs: TRANSACTION_STEP_TIMEOUT_MS,
          });
        } catch {}
      }
      throw error;
    }
  }

  async transaction(callback) { return this.runTransaction(callback, { begin: "BEGIN IMMEDIATE" }); }
  async readTransaction(callback) { return this.runTransaction(callback, { begin: "BEGIN" }); }

  async health() {
    try {
      const row = await this.one("SELECT 1 AS ok");
      return Number(row?.ok || 0) === 1;
    } catch { return false; }
  }
}

let singleton = null;
export const getDatabase = () => {
  if (!singleton) singleton = new TursoHttpClient();
  return singleton;
};

export const setDatabaseForTests = (database) => { singleton = database; };
export { appError as databaseError };
