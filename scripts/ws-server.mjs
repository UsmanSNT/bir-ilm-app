/**
 * Jonli suhbat WebSocket serveri.
 *
 * Asosiy ilovadan alohida ishlaydi (port 8788).
 * Ishga tushirish: node scripts/ws-server.mjs
 */
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { statSync } from "node:fs";

const rootUrl = new URL("../", import.meta.url);
const bindingUrl = new URL("./local-d1.mjs", import.meta.url).href;

function isFile(url) {
  try { return statSync(fileURLToPath(url)).isFile(); } catch { return false; }
}

function resolveTs(url) {
  if (isFile(url)) return url;
  for (const ext of [".ts", ".tsx", ".mjs", ".js", "/index.ts", "/index.tsx"]) {
    const candidate = url + ext;
    if (isFile(candidate)) return candidate;
  }
  return url;
}

// cloudflare:workers shimi + @/ aliaslar + .ts kengaytma hal qilish
registerHooks({ resolve(specifier, context, next) {
  if (specifier === "cloudflare:workers") return { url: bindingUrl, shortCircuit: true };

  // @/ yo'l aliaslarini hal qilish
  if (specifier.startsWith("@/")) {
    return { url: resolveTs(new URL(specifier.slice(2), rootUrl).href), shortCircuit: true };
  }

  // .ts fayllar ichidagi nisbiy import'lar (./foo, ../bar)
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.endsWith(".ts")) {
    const base = new URL(specifier, context.parentURL).href;
    const resolved = resolveTs(base);
    if (resolved !== base) return { url: resolved, shortCircuit: true };
  }

  return next(specifier, context);
} });

process.chdir(fileURLToPath(rootUrl));

// ws kutubxonasi tekshiruvi
const require = createRequire(import.meta.url);
try { require.resolve("ws"); } catch {
  console.error("[ws] `ws` kutubxonasi topilmadi. O'rnating: pnpm add ws");
  process.exit(1);
}

// DB ulanishi
const { sqlite, env } = await import("./local-d1.mjs");
const { drizzle } = await import("drizzle-orm/d1");
const schema = await import("../db/schema.ts");
const db = drizzle(env.DB, { schema });

// WebSocket serverni ishga tushirish
const { startWsServer } = await import("../server/ws/index.ts");
const port = Number(process.env.WS_PORT ?? 8788);
startWsServer(db, port);

console.log(`[ws] Jonli suhbat serveri ishga tushdi: ws://0.0.0.0:${port}`);

// Graceful shutdown
process.on("SIGINT", () => { sqlite.close(); process.exit(0); });
process.on("SIGTERM", () => { sqlite.close(); process.exit(0); });
