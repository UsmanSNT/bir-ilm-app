import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
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
export const env = { DB: {
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
