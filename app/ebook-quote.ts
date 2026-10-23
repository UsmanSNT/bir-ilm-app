/**
 * Kitobdan belgilangan iqtibos: matn, nusxalash, rasm va ulashish. Rasm kun hikmati kartasi bilan bir xil
 * Naqsh uslubida (lojuvard koshin fon, qog'oz karta), brauzerning o'zida chiziladi.
 */
import { detectPlatform, resolveBaseUrl } from "@/lib/api/config";
import { loadImage, roundedRect, star, wrapLines } from "./wisdom-share";

export type Quote = { text: string; author: string; bookTitle: string; accent: string };

const W = 1080;
const H = 1350;
/** Karta sig'adigan eng ko'p belgi; uzunroq matn «…» bilan qisqartiriladi. */
export const QUOTE_MAX_CHARS = 700;

export const quoteAttribution = (quote: Quote) => `— ${quote.author}, «${quote.bookTitle}»`;

export function quoteText(quote: Quote): string {
  return `«${quote.text}»\n${quoteAttribution(quote)}`;
}

function siteLink(): string {
  return detectPlatform() === "web" ? window.location.origin : resolveBaseUrl();
}

/** Iqtiboslarning rasmi (PNG). */
export async function renderQuoteImage(quote: Quote): Promise<Blob> {
  await Promise.all([
    document.fonts.load('italic 600 60px "Fraunces Variable"'),
    document.fonts.load('600 40px "Fraunces Variable"'),
    document.fonts.load('800 30px "Manrope Variable"'),
  ]).catch(() => undefined);
  const [tile, logo] = await Promise.all([loadImage("/assets/girih-koshin.webp"), loadImage("/assets/bir-ilm-logo.jpg")]);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Rasm chizib bo'lmadi.");

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#131f4c");
  bg.addColorStop(0.55, "#1e2f6e");
  bg.addColorStop(1, "#22397f");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  if (tile) {
    const pattern = ctx.createPattern(tile, "repeat");
    if (pattern) {
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  // Qog'oz karta, tillarang chegara va belgi rangi.
  const cardX = 90;
  const cardY = 150;
  const cardW = W - 180;
  const cardH = H - 300;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 18;
  roundedRect(ctx, cardX, cardY, cardW, cardH, 36);
  ctx.fillStyle = "#fffbf3";
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "#c08a2e";
  ctx.lineWidth = 3;
  roundedRect(ctx, cardX + 22, cardY + 22, cardW - 44, cardH - 44, 26);
  ctx.stroke();
  ctx.fillStyle = quote.accent;
  roundedRect(ctx, cardX + 60, cardY + 110, 14, 260, 7);
  ctx.fill();

  // Matn: sig'guncha kattalikda.
  const text = quote.text.length > QUOTE_MAX_CHARS ? `${quote.text.slice(0, QUOTE_MAX_CHARS).trimEnd()}…` : quote.text;
  const maxWidth = cardW - 240;
  let size = 58;
  let lines: string[] = [];
  for (; size >= 30; size -= 2) {
    ctx.font = `italic 600 ${size}px "Fraunces Variable", Georgia, serif`;
    lines = wrapLines(ctx, `«${text}»`, maxWidth);
    if (lines.length * size * 1.45 <= cardH - 420) break;
  }
  ctx.fillStyle = "#1b1a2e";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const lineHeight = size * 1.45;
  lines.forEach((line, i) => ctx.fillText(line, cardX + 110, cardY + 110 + i * lineHeight));

  // Muallif va kitob.
  const attrY = cardY + 110 + lines.length * lineHeight + 40;
  ctx.font = `600 36px "Fraunces Variable", Georgia, serif`;
  ctx.fillStyle = "#1e2f6e";
  wrapLines(ctx, quoteAttribution(quote), maxWidth).slice(0, 3).forEach((line, i) => ctx.fillText(line, cardX + 110, attrY + i * 50));

  // Pastki belgi: Bir Ilm.
  star(ctx, W / 2 - 150, H - 110, 16, "#c08a2e");
  if (logo) ctx.drawImage(logo, W / 2 - 110, H - 140, 60, 60);
  ctx.fillStyle = "#e5d9c2";
  ctx.font = `800 30px "Manrope Variable", system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.fillText("Bir Ilm · birilm.uz", W / 2 - 30, H - 118);

  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Rasm yaratilmadi."))), "image/png"));
}

/** Matnni nusxalash. `value` — nusxalanadigan matn (masalan, faqat belgilangan qism). */
export async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    // Brauzer ruxsat bermasa — eski usul.
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

/**
 * Yuborish: telefonda tizim ulashish oynasi (rasm bilan, bo'lmasa matn bilan); kompyuterda Telegram.
 * Foydalanuvchi bekor qilsa — "cancelled".
 */
export async function sendQuote(quote: Quote): Promise<"shared" | "telegram" | "cancelled"> {
  const link = siteLink();
  const touch = window.matchMedia("(pointer: coarse)").matches;
  if (touch && typeof navigator.share === "function") {
    try {
      const file = new File([await renderQuoteImage(quote)], "bir-ilm-iqtibos.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: `${quoteAttribution(quote)} · ${link.replace(/^https?:\/\//, "")}` });
      } else {
        await navigator.share({ text: `${quoteText(quote)}\n\n${link}` });
      }
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    }
  }
  const telegram = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(quoteText(quote))}`;
  window.open(telegram, "_blank", "noopener,noreferrer");
  return "telegram";
}

/** Rasmni yuklab olish (kompyuterda) yoki ulashish oynasida (telefonda). */
export async function saveQuoteImage(quote: Quote): Promise<void> {
  const blob = await renderQuoteImage(quote);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "bir-ilm-iqtibos.png";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5_000);
}
