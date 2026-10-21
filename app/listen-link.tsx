import { ExternalLink, Headphones } from "lucide-react";
import { describeAudioLink, type AudioLinkInfo, type Book } from "@/shared/contract";

type Listenable = Pick<Book, "audioUrl" | "audioLink">;

/** Yuklangan audio bo'lmasa, kitobning tashqi havolasi (YouTube, Telegram...); aks holda `null`. */
export function audioLinkOf(book: Listenable): AudioLinkInfo | null {
  return book.audioUrl || !book.audioLink ? null : describeAudioLink(book.audioLink);
}

/** «Eshitish» — havolaning o'z manzilini yangi oynada ochadi. Havola bo'lmasa hech narsa chizmaydi. */
export default function ListenLink({ book, className = "button", label = "Eshitish" }: { book: Listenable; className?: string; label?: string }) {
  const info = audioLinkOf(book);
  if (!info) return null;
  return (
    <a className={className} href={info.href} target="_blank" rel="noopener noreferrer" aria-label={`${label}: ${info.label} (yangi oynada ochiladi)`}>
      <Headphones size={17} /> {label} · {info.label} <ExternalLink size={14} aria-hidden="true" />
    </a>
  );
}
