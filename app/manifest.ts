import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bir Ilm",
    short_name: "Bir Ilm",
    description: "Har hafta bitta kitob o'qish, suhbatlashish va reyting yuritish ilovasi.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f7f1e4",
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
