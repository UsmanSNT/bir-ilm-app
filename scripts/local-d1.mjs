import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Node-only preview adapter for machines where the native Workers runtime cannot run.
const root = new URL("../", import.meta.url);
mkdirSync(new URL(".sites-runtime/", root), { recursive: true });
export const sqlite = new DatabaseSync(fileURLToPath(new URL(".sites-runtime/node-preview.sqlite", root)));
sqlite.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
sqlite.exec("CREATE TABLE IF NOT EXISTS _preview_migrations (name TEXT PRIMARY KEY)");
for (const name of readdirSync(new URL("drizzle/", root)).filter(n => n.endsWith(".sql")).sort()) {
  if (sqlite.prepare("SELECT name FROM _preview_migrations WHERE name=?").get(name)) continue;
  sqlite.exec("BEGIN");
  try {
    sqlite.exec(readFileSync(new URL(`drizzle/${name}`, root), "utf8"));
    sqlite.prepare("INSERT INTO _preview_migrations (name) VALUES (?)").run(name);
    sqlite.exec("COMMIT");
  } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
}

class Statement {
  constructor(sql, args = []) { this.sql = sql; this.args = args; }
  bind(...args) { return new Statement(this.sql, args); }
  async all() { return { success: true, results: sqlite.prepare(this.sql).all(...this.args) }; }
  async first(column) { const row = sqlite.prepare(this.sql).get(...this.args); return column ? row?.[column] ?? null : row ?? null; }
  async run() {
    const result = sqlite.prepare(this.sql).run(...this.args);
    return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
  }
}
// Minimal R2 shim for the Node preview: objects live in .sites-runtime/r2/.
const r2Dir = new URL(".sites-runtime/r2/", root);
mkdirSync(r2Dir, { recursive: true });
const r2Path = key => { if (!/^[A-Za-z0-9._-]+$/.test(key)) throw Error("bad key"); return fileURLToPath(new URL(key, r2Dir)); };
const r2Meta = key => { try { return JSON.parse(readFileSync(r2Path(key) + ".meta", "utf8")); } catch { return {}; } };
const BUCKET = {
  async put(key, data, options = {}) { writeFileSync(r2Path(key), Buffer.from(data instanceof ArrayBuffer ? new Uint8Array(data) : data)); writeFileSync(r2Path(key) + ".meta", JSON.stringify(options.httpMetadata ?? {})); return { key }; },
  async head(key) { const path = r2Path(key); return existsSync(path) ? { key, size: statSync(path).size, httpMetadata: r2Meta(key) } : null; },
  async get(key, options = {}) {
    const path = r2Path(key);
    if (!existsSync(path)) return null;
    const all = readFileSync(path);
    const offset = options.range?.offset ?? 0;
    const length = options.range?.length ?? all.length - offset;
    const chunk = all.subarray(offset, offset + length);
    return { key, size: all.length, httpMetadata: r2Meta(key), range: { offset, length }, body: new Blob([chunk]).stream() };
  },
  async delete(key) { rmSync(r2Path(key), { force: true }); rmSync(r2Path(key) + ".meta", { force: true }); },
};

// Preview uchun ixtiyoriy sirlar jarayon muhitidan olinadi (Workers'da ular env bindings orqali keladi).
const secrets = Object.fromEntries(["GEMINI_API_KEY", "GEMINI_MODEL", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "TELEGRAM_BOT_TOKEN", "TELEGRAM_BOT_USERNAME", "RESEND_API_KEY", "MAIL_FROM"].filter(k => process.env[k]).map(k => [k, process.env[k]]));
export const env = { ...secrets, BUCKET, DB: {
  prepare(sql) { return new Statement(sql); },
  async batch(statements) {
    sqlite.exec("BEGIN");
    try {
      // Execute synchronously inside the transaction before allowing another request.
      const results = statements.map(s => {
        const result = sqlite.prepare(s.sql).run(...s.args);
        return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
      });
      sqlite.exec("COMMIT");
      return results;
    } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
  },
} };
