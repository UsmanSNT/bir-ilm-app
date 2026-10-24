import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bir Ilm",
    short_name: "Bir Ilm",
    description: "Har hafta bitta kitob o'qish, suhbatlashish va reyting yuritish ilovasi.",
    // `id` — ilovaning barqaror nomi: start_url o'zgarsa ham o'rnatilgan nusxa shu bo'lib qoladi.
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    prefer_related_applications: false,
    // Android ochilish ekrani shu rangda: ochilish animatsiyasining foni (public/assets/bir-ilm-splash.mp4) bilan bir xil.
    background_color: "#f4fafe",
    theme_color: "#172351",
    icons: [
      { src: "/assets/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/assets/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/assets/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    lang: "uz",
    orientation: "portrait-primary",
    categories: ["education", "books"],
  };
}
