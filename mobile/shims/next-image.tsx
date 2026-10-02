/**
 * `next/image` o'rnini bosuvchi.
 *
 * Native qobiqda Next'ning rasm optimizatsiya serveri yo'q — rasmlar ilova
 * ichiga tayyor holda joylanadi. Shu sababli oddiy `<img>` yetarli, lekin
 * `next/image` ning tashqi ko'rinishi (props) saqlanadi, shuning uchun UI
 * kodini o'zgartirish shart emas.
 */

/*
 * Bu faylning butun vazifasi — `next/image` ni `<img>` bilan almashtirish,
 * shuning uchun "next/image ishlating" qoidasi bu yerda o'rinsiz. `alt` esa
 * tipda MAJBURIY va `rest` orqali o'tadi; linter buni ko'ra olmaydi.
 */
/* eslint-disable @next/next/no-img-element, jsx-a11y/alt-text */
import type { CSSProperties, ImgHTMLAttributes } from "react";

type StaticImage = { src: string; width?: number; height?: number };

type NextImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "loading"> & {
  src: string | StaticImage;
  alt: string;
  width?: number | string;
  height?: number | string;
  /** Konteynerni to'ldirish rejimi. */
  fill?: boolean;
  /** Darhol yuklansin (birinchi ekrandagi rasmlar uchun). */
  priority?: boolean;
  loading?: "eager" | "lazy";
  // Quyidagilar faqat Next'ning optimizatsiyasiga tegishli. Ular qabul
  // qilinadi (aks holda TypeScript xato beradi), lekin `<img>` ga uzatilmaydi.
  quality?: number;
  placeholder?: string;
  blurDataURL?: string;
  unoptimized?: boolean;
  loader?: unknown;
  sizes?: string;
};

/** `<img>` tushunmaydigan, faqat Next'ga tegishli proplar. */
const NEXT_ONLY_PROPS = [
  "quality",
  "placeholder",
  "blurDataURL",
  "unoptimized",
  "loader",
] as const;

const fillStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

export default function Image({ src, fill, priority, loading, style, ...rest }: NextImageProps) {
  const resolved = typeof src === "string" ? src : src.src;

  const imgProps: Record<string, unknown> = { ...rest };
  for (const prop of NEXT_ONLY_PROPS) delete imgProps[prop];

  return (
    <img
      src={resolved}
      loading={loading ?? (priority ? "eager" : "lazy")}
      decoding="async"
      style={fill ? { ...fillStyle, ...style } : style}
      {...imgProps}
    />
  );
}
