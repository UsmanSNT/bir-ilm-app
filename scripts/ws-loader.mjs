// `@/` yo'llarini loyiha ildiziga yo'naltiradi (tsconfig paths), WS serveri Node'da ishlashi uchun.
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("@/")) {
      let target = new URL(specifier.slice(2), new URL(root)).href;
      if (!/\.[a-z]+$/i.test(target)) target += ".ts";
      return next(target, context);
    }
    return next(specifier, context);
  },
});
