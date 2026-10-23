"use client";

/**
 * Belgilangan iqtibosni yuborish oynasi: matn naqsh fonda karta ko'rinishida, keyin «Yuborish» (rasm bilan
 * yoki matn bilan ulashish), rasmni yuklab olish va nusxalash.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { Copy, Download, Send, X } from "lucide-react";
import { toast } from "sonner";
import { copyText, quoteAttribution, quoteText, QUOTE_MAX_CHARS, saveQuoteImage, sendQuote, type Quote } from "./ebook-quote";

export default function QuoteDialog({ quote, onClose }: { quote: Quote; onClose: () => void }) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const shown = quote.text.length > QUOTE_MAX_CHARS ? `${quote.text.slice(0, QUOTE_MAX_CHARS).trimEnd()}…` : quote.text;

  const send = async () => {
    setBusy(true);
    try {
      const result = await sendQuote(quote);
      if (result === "shared") {
        toast.success("Yuborildi");
        onClose();
      }
    } catch {
      toast.error("Yuborib bo‘lmadi. Rasmni yuklab olib, qo‘lda yuboring.");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      await saveQuoteImage(quote);
    } catch {
      toast.error("Rasm tayyorlanmadi.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    const ok = await copyText(quoteText(quote));
    toast(ok ? "Nusxalandi" : "Nusxalab bo‘lmadi.");
  };

  return (
    <div className="eb-scrim" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Iqtibosni yuborish" className="eb-modal" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="eb-modal-close" aria-label="Yopish" onClick={onClose}><X size={18} /></button>
        <div className="eb-quote-card" style={{ "--accent": quote.accent } as CSSProperties}>
          <span className="eb-quote-bar" aria-hidden="true" />
          <p className="eb-quote-text">«{shown}»</p>
          <p className="eb-quote-by">{quoteAttribution(quote)}</p>
          <span className="eb-quote-brand">Bir Ilm · birilm.uz</span>
        </div>
        <div className="eb-modal-actions">
          <button type="button" className="button" disabled={busy} onClick={() => void send()}><Send size={16} /> Yuborish</button>
          <button type="button" className="button secondary" disabled={busy} onClick={() => void save()}><Download size={16} /> Rasmni yuklab olish</button>
          <button type="button" className="button secondary" onClick={() => void copy()}><Copy size={16} /> Nusxalash</button>
        </div>
      </div>
    </div>
  );
}
