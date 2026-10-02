/**
 * Capacitor qobig'i uchun build.
 *
 * Web build'ga (`vite.config.ts`) umuman tegmaydi: u Cloudflare Worker uchun
 * server + API quradi, bu esa telefon ichiga joylanadigan statik fayllarni.
 * Ikkalasi ham AYNAN bir xil UI kodini (`app/page.tsx`) ishlatadi.
 *
 * Ishga tushirish: `npm run build:mobile`
 */
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const projectRoot = fileURLToPath(new URL("./", import.meta.url));
const nextImageShim = fileURLToPath(new URL("./mobile/shims/next-image.tsx", import.meta.url));

/**
 * Backend manzili. Native ilova o'z serveriga ega emas, shuning uchun bu
 * MAJBURIY: qaysi serverga murojaat qilishni build paytida bilishi kerak.
 */
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export default defineConfig(({ mode }) => {
  if (mode === "production" && !apiBaseUrl) {
    throw new Error(
      "NEXT_PUBLIC_API_BASE_URL sozlanmagan. Mobil ilova qaysi serverga " +
        "murojaat qilishini bilishi kerak, masalan:\n" +
        "  NEXT_PUBLIC_API_BASE_URL=https://bir-ilm.uz npm run build:mobile",
    );
  }

  return {
    root: "mobile",
    // Capacitor fayllarni ildizdan xizmat qiladi, shuning uchun absolyut
    // yo'llar (`/assets/...`) to'g'ri ishlaydi.
    base: "/",
    // `public/` dagi rasmlar va ikonkalar ilova ichiga ko'chiriladi.
    publicDir: fileURLToPath(new URL("./public", import.meta.url)),

    plugins: [react()],

    resolve: {
      alias: [
        // Native qobiqda rasm optimizatsiya serveri yo'q.
        { find: /^next\/image$/, replacement: nextImageShim },
        // Loyihadagi `@/...` aliasi.
        { find: /^@\//, replacement: projectRoot },
      ],
    },

    css: {
      // PostCSS (Tailwind 4) sozlamasi loyiha ildizida, build ildizi esa
      // `mobile/` — shuning uchun yo'lni aniq ko'rsatamiz.
      postcss: projectRoot,
    },

    define: {
      // Brauzerda `process` yo'q; UI kodi o'qiydigan qiymatlarni o'rnatamiz.
      "process.env.NEXT_PUBLIC_API_BASE_URL": JSON.stringify(apiBaseUrl),
      "process.env.NODE_ENV": JSON.stringify(mode),
    },

    build: {
      // `mobile/dist` — Capacitor'ning `webDir` i.
      outDir: "dist",
      emptyOutDir: true,
      sourcemap: mode !== "production",
    },
  };
});
