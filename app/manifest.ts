import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bir Ilm",
    short_name: "Bir Ilm",
    description: "Har hafta bitta kitob o'qish, suhbatlashish va reyting yuritish ilovasi.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f6faf8",
    theme_color: "#0f4f45",
    icons: [
      {
        src: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
      {
        src: "/assets/bir-ilm-logo.jpg",
        sizes: "512x512",
        type: "image/jpeg",
        purpose: "any",
      },
      {
        src: "/assets/bir-ilm-logo.jpg",
        sizes: "512x512",
        type: "image/jpeg",
        purpose: "maskable",
      },
    ],
  };
}
