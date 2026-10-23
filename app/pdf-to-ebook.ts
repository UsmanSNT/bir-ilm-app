/**
 * PDF → e-kitob belgilashi, to'liq admin brauzerida (fayl serverga yuborilmaydi). pdf.js faqat shu funksiya
 * chaqirilganda yuklanadi. Skaner qilingan (rasmdan iborat) PDF'da matn qatlami bo'lmaydi — `ScannedPdfError`.
 */
import { itemsToLines, pagesToMarkup, type PdfItem, type PdfPage } from "@/lib/pdf-layout";

export class ScannedPdfError extends Error {
  constructor() {
    super("Bu PDF skaner qilingan (sahifalar rasm ko‘rinishida) — ichida matn yo‘q. Matnni .txt fayl qilib yoki nusxa ko‘chirib joylang.");
  }
}

/** pdf.js shrift ma'lumoti: `name` — PDF ichidagi asl nom (masalan «ABCDEF+TimesNewRoman-BoldItalic»). */
type FontInfo = { name?: string; bold?: boolean; black?: boolean; italic?: boolean };
const BOLD_NAME = /bold|black|heavy|semibold|demi/i;
const ITALIC_NAME = /italic|oblique|kursiv/i;

export async function pdfToEbook(file: File, onProgress?: (page: number, total: number) => void, signal?: AbortSignal): Promise<string> {
  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist/legacy/build/pdf.mjs"),
    import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  // fontExtraProperties — shrift nomini beradi (qalin/kursiv shundan aniqlanadi).
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), fontExtraProperties: true });
  signal?.addEventListener("abort", () => void task.destroy(), { once: true });
  const doc = await task.promise;
  try {
    const pages: PdfPage[] = [];
    let characters = 0;
    for (let number = 1; number <= doc.numPages; number++) {
      if (signal?.aborted) throw new DOMException("To‘xtatildi", "AbortError");
      const page = await doc.getPage(number);
      const width = page.view[2] - page.view[0];
      const height = page.view[3] - page.view[1];
      // Shriftlar (qalin/kursiv belgisi) operator ro'yxati o'qilgandan keyin tayyor bo'ladi.
      await page.getOperatorList();
      const content = await page.getTextContent();
      const items: PdfItem[] = [];
      for (const item of content.items) {
        if (!("str" in item) || !item.str) continue;
        const [, , c, d, e, f] = item.transform as number[];
        let font: FontInfo = {};
        try {
          font = page.commonObjs.has(item.fontName) ? (page.commonObjs.get(item.fontName) as FontInfo) : {};
        } catch {
          font = {};
        }
        const fontName = font.name ?? "";
        characters += item.str.trim().length;
        items.push({
          text: item.str,
          x: e - page.view[0],
          y: height - (f - page.view[1]),
          width: item.width,
          size: Math.hypot(c, d) || item.height || 10,
          bold: Boolean(font.bold || font.black || BOLD_NAME.test(fontName)),
          italic: Boolean(font.italic || ITALIC_NAME.test(fontName)),
        });
      }
      pages.push({ width, lines: itemsToLines(items) });
      page.cleanup();
      onProgress?.(number, doc.numPages);
    }
    if (characters < doc.numPages * 40) throw new ScannedPdfError();
    return pagesToMarkup(pages);
  } finally {
    void task.destroy();
  }
}
