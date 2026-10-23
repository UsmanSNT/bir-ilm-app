import { ExternalLink, Library } from "lucide-react";
import { ebookSourceLabel, type EbookSource } from "@/shared/contract";

/**
 * «Manba: …» — elektron kitob matni qayerdan olingani. Kitobga kirishdan oldin ko'rsatiladi.
 * Havola serverda tekshirilgan (faqat https); tashqi saytga yangi oynada, `nofollow` bilan olib boradi.
 */
export default function EbookSourceNote({ source, className }: { source: EbookSource; className?: string }) {
  const label = ebookSourceLabel(source);
  return (
    <p className={`ebook-source${className ? ` ${className}` : ""}`}>
      <Library size={14} aria-hidden="true" />
      <span>Manba:</span>
      {source.url ? (
        <a href={source.url} target="_blank" rel="noopener noreferrer nofollow" aria-label={`Manba: ${label} (yangi oynada ochiladi)`}>
          {label} <ExternalLink size={12} aria-hidden="true" />
        </a>
      ) : (
        <b>{label}</b>
      )}
    </p>
  );
}
