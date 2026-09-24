import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

const bindingUrl = new URL("./local-d1.mjs", import.meta.url).href;
registerHooks({ resolve(specifier, context, next) {
  if (specifier === "cloudflare:workers") return { url: bindingUrl, shortCircuit: true };
  return next(specifier, context);
} });
process.chdir(fileURLToPath(new URL("../", import.meta.url)));
const { startProdServer } = await import("../node_modules/vinext/dist/server/prod-server.js");
await startProdServer({
  port: Number(process.env.PREVIEW_PORT ?? 8787),
  host: process.env.PREVIEW_HOST ?? "127.0.0.1",
});
