/**
 * Kun hikmatini ulashish va rasm sifatida saqlash.
 *
 * Ulashish matni toza: hikmat, muallif va oxirida bitta qisqa havola (birilm.uz/h/<kod>), «https://» va
 * uzun parametrlarsiz. Telegram havola uchun Bir Ilm brendi va hikmat matni bilan oldindan ko'rinish chizadi.
 * Rasm — Naqsh uslubidagi karta (1080×1350, Instagram/Telegram uchun qulay o'lcham), brauzerning o'zida chiziladi.
 */
import { detectPlatform, resolveBaseUrl } from "@/lib/api/config";
import type { Wisdom } from "@/shared/contract";

/** Qisqa havola: `href` — to'liq manzil, `label` — ko'rinadigan qismi (protokolsiz). Kodsiz — bosh sahifa. */
export function wisdomLink(id: string): { href: string; label: string } {
  const origin = detectPlatform() === "web" ? window.location.origin : resolveBaseUrl();
  const href = id ? `${origin}/h/${id}` : origin;
  return { href, label: href.replace(/^https?:\/\//, "") };
}

/** Telefonda tizim ulashish oynasi (Telegram ham ichida), kompyuterda — to'g'ridan-to'g'ri Telegram. */
export async function shareWisdom(wisdom: Wisdom): Promise<"shared" | "telegram" | "cancelled"> {
  const link = wisdomLink(wisdom.id);
  const quote = `«${wisdom.text}»\n— ${wisdom.author}`;
  const touch = window.matchMedia("(pointer: coarse)").matches;
  if (touch && typeof navigator.share === "function") {
    try {
      await navigator.share({ text: `${quote}\n\nKun hikmati · ${link.label}` });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
      // Ulashish oynasi ochilmadi (ruxsat yo'q va h.k.) — Telegram orqali davom etamiz.
    }
  }
  const telegram = `https://t.me/share/url?url=${encodeURIComponent(link.label)}&text=${encodeURIComponent(quote)}`;
  window.open(telegram, "_blank", "noopener,noreferrer");
  return "telegram";
}

const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const W = 1080;
const H = 1350;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Sakkiz qirrali yulduz (ikki kvadrat ustma-ust) — ilovadagi belgi bilan bir xil. */
function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = color;
  for (const angle of [0, Math.PI / 4]) {
    ctx.save();
    ctx.rotate(angle);
    ctx.fillRect(-size / 2, -size / 2, size, size);
    ctx.restore();
  }
  ctx.restore();
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function spaced(ctx: CanvasRenderingContext2D, value: string) {
  (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = value;
}

/** Hikmat kartasi rasmi (PNG). Shriftlar ilovaning o'zidagi (Fraunces, Manrope), rasm qurilmaning o'zida chiziladi. */
export async function renderWisdomImage(wisdom: Wisdom, now = new Date()): Promise<Blob> {
  await Promise.all([
    document.fonts.load('italic 600 60px "Fraunces Variable"'),
    document.fonts.load('700 52px "Fraunces Variable"'),
    document.fonts.load('800 30px "Manrope Variable"'),
  ]).catch(() => undefined);
  const [tile, adras, logo] = await Promise.all([loadImage("/assets/girih-koshin.webp"), loadImage("/assets/adras.png"), loadImage("/assets/bir-ilm-logo.jpg")]);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Rasm chizib bo'lmadi.");

  // Fon: lojuvard koshin (navbardagi kabi), yon tomonlari to'qroq.
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
  const shade = ctx.createLinearGradient(0, 0, W, 0);
  shade.addColorStop(0, "#131f4ce6");
  shade.addColorStop(0.5, "#1e2f6e8c");
  shade.addColorStop(1, "#131f4ce6");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);

  // Tilla hoshiya va burchak yulduzlari.
  ctx.strokeStyle = "#e2b65ccc";
  ctx.lineWidth = 2;
  ctx.strokeRect(36, 36, W - 72, H - 72);
  ctx.strokeStyle = "#e2b65c59";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(48, 48, W - 96, H - 96);
  for (const [x, y] of [[36, 36], [W - 36, 36], [36, H - 36], [W - 36, H - 36]]) star(ctx, x, y, 22, "#e2b65c");

  // Sana.
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#e2b65c";
  ctx.font = '800 28px "Manrope Variable", "Segoe UI", sans-serif';
  spaced(ctx, "6px");
  ctx.fillText(`${now.getDate()}-${MONTHS[now.getMonth()]}`.toUpperCase(), W / 2, 168);
  spaced(ctx, "0px");

  // Qog'oz karta.
  const card = { x: 96, y: 230, w: W - 192, h: 800 };
  ctx.save();
  ctx.shadowColor = "#000000aa";
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 24;
  roundedRect(ctx, card.x, card.y, card.w, card.h, 44);
  const paper = ctx.createLinearGradient(card.x, card.y, card.x + card.w, card.y + card.h);
  paper.addColorStop(0, "#fffbf2");
  paper.addColorStop(1, "#fbf2df");
  ctx.fillStyle = paper;
  ctx.fill();
  ctx.restore();
  roundedRect(ctx, card.x + 16, card.y + 16, card.w - 32, card.h - 32, 32);
  ctx.strokeStyle = "#e3cc98";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Adras lentasi kartaning tepasida.
  if (adras) {
    ctx.save();
    const band = { w: 300, h: 30 };
    roundedRect(ctx, W / 2 - band.w / 2, card.y - 2, band.w, band.h, 14);
    ctx.clip();
    const scale = (band.h * 2.6) / adras.height;
    for (let x = W / 2 - band.w / 2; x < W / 2 + band.w / 2; x += adras.width * scale) ctx.drawImage(adras, x, card.y - band.h * 0.8, adras.width * scale, adras.height * scale);
    ctx.restore();
  }

  // «KUN HIKMATI» va yulduzchalar.
  ctx.fillStyle = "#a5782a";
  ctx.font = '800 30px "Manrope Variable", "Segoe UI", sans-serif';
  spaced(ctx, "9px");
  ctx.fillText("KUN HIKMATI", W / 2 + 4, card.y + 118);
  spaced(ctx, "0px");
  star(ctx, W / 2 - 160, card.y + 108, 14, "#1e2f6e");
  star(ctx, W / 2 + 168, card.y + 108, 14, "#1e2f6e");

  // Hikmat matni: sig'guncha shrift kichrayadi.
  const area = { top: card.y + 190, bottom: card.y + card.h - 170, width: card.w - 200 };
  let size = 68;
  let lines: string[] = [];
  for (; size >= 36; size -= 4) {
    ctx.font = `italic 600 ${size}px "Fraunces Variable", Georgia, serif`;
    lines = wrapLines(ctx, wisdom.text, area.width);
    if (lines.length * size * 1.34 <= area.bottom - area.top) break;
  }
  const lineHeight = size * 1.34;
  const startY = area.top + (area.bottom - area.top - lines.length * lineHeight) / 2 + size;
  ctx.fillStyle = "#161b3b";
  lines.forEach((line, i) => ctx.fillText(line, W / 2, startY + i * lineHeight));

  // Katta qo'shtirnoqlar.
  ctx.fillStyle = "#1925584d";
  ctx.font = '600 150px "Fraunces Variable", Georgia, serif';
  ctx.textAlign = "left";
  ctx.fillText("“", card.x + 44, card.y + 250);
  ctx.textAlign = "right";
  ctx.fillText("”", card.x + card.w - 44, card.y + card.h - 70);

  // Muallif.
  ctx.textAlign = "center";
  ctx.fillStyle = "#8a7a55";
  ctx.font = '700 32px "Manrope Variable", "Segoe UI", sans-serif';
  ctx.fillText(`— ${wisdom.author}`, W / 2, card.y + card.h - 92);

  // Brend: logo, nom va manzil.
  const brandY = card.y + card.h + 130;
  const domain = wisdomLink(wisdom.id).label.split("/")[0];
  ctx.font = '700 54px "Fraunces Variable", Georgia, serif';
  const nameWidth = ctx.measureText("Bir Ilm").width;
  const logoSize = 96;
  const groupWidth = logoSize + 28 + Math.max(nameWidth, 300);
  const left = W / 2 - groupWidth / 2;
  if (logo) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(left + logoSize / 2, brandY - 18, logoSize / 2 + 5, 0, Math.PI * 2);
    ctx.fillStyle = "#e2b65c";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(left + logoSize / 2, brandY - 18, logoSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = "#fffbf3";
    ctx.fill();
    ctx.clip();
    ctx.drawImage(logo, left, brandY - 18 - logoSize / 2, logoSize, logoSize);
    ctx.restore();
  }
  ctx.textAlign = "left";
  ctx.fillStyle = "#fffbf3";
  ctx.fillText("Bir Ilm", left + logoSize + 28, brandY - 10);
  ctx.fillStyle = "#e2b65c";
  ctx.font = '700 28px "Manrope Variable", "Segoe UI", sans-serif';
  ctx.fillText(domain, left + logoSize + 30, brandY + 32);

  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Rasm chizib bo'lmadi."))), "image/png"));
}

const isApple = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/**
 * Rasmni qurilmaga saqlaydi. iPhone/iPad'da ulashish oynasi («Rasmni saqlash» u yerda), boshqa joyda — yuklab olish.
 */
export async function saveWisdomImage(wisdom: Wisdom): Promise<"saved" | "cancelled"> {
  const blob = await renderWisdomImage(wisdom);
  const name = `kun-hikmati-${wisdom.id}.png`;
  const file = new File([blob], name, { type: "image/png" });
  if (isApple() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return "saved";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5_000);
  return "saved";
}
