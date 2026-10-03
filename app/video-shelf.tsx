"use client";

import { FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link2, Play, X } from "lucide-react";
import { toast } from "sonner";
import { addSiteVideo, notifySiteChanged, useSiteVideos } from "@/lib/api/site-client";
import { Facebook, Instagram, YouTube } from "./brand-icons";
import { videoEmbedUrl, videoThumbnail, type SiteVideo } from "@/shared/contract";

const PLATFORM = { youtube: { label: "YouTube", icon: YouTube }, instagram: { label: "Instagram", icon: Instagram }, facebook: { label: "Facebook", icon: Facebook } } as const;

/**
 * Qisqa videolar: YouTube Shorts, Instagram Reels va Facebook videolari havola orqali ilova ichida ijro etiladi.
 * Video serverga yuklanmaydi — pleyer platformaning o'zidan (iframe) yuklanadi va faqat bosilganda ochiladi.
 * Havolani faqat admin qo'shadi (Sozlamalar → Qisqa videolar).
 */
export default function VideoShelf() {
  const { value: videos, loading } = useSiteVideos();
  const [playing, setPlaying] = useState<SiteVideo | null>(null);

  if (!loading && videos.length === 0) return null;

  return (
    <section className="video-shelf" aria-label="Qisqa videolar">
      <ul className="video-rail">
        {videos.map((video) => {
          const { icon: Icon, label } = PLATFORM[video.platform];
          const thumb = videoThumbnail(video);
          return (
            <li key={video.id}>
              <button type="button" className={`video-card is-${video.platform}`} onClick={() => setPlaying(video)} aria-label={`${video.title || label + " videosi"} — ijro etish`}>
                {thumb && <img src={thumb} alt="" loading="lazy" referrerPolicy="no-referrer" />}
                <span className="video-badge"><Icon size={13} aria-hidden="true" />{label}</span>
                <span className="video-play"><Play size={22} fill="currentColor" aria-hidden="true" /></span>
                {video.title && <strong>{video.title}</strong>}
              </button>
            </li>
          );
        })}
      </ul>
      {playing && <VideoPlayer video={playing} onClose={() => setPlaying(null)} />}
    </section>
  );
}

export function AddVideo({ onDone }: { onDone: () => void }) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !url.trim()) return;
    setBusy(true);
    try {
      await addSiteVideo(url.trim(), title.trim());
      notifySiteChanged();
      toast.success("Video qo‘shildi");
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Qo‘shilmadi.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="video-form" onSubmit={(e) => void submit(e)}>
      <label><Link2 size={16} aria-hidden="true" /><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="YouTube, Instagram yoki Facebook video havolasi" aria-label="Video havolasi" inputMode="url" autoComplete="off" /></label>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sarlavha (ixtiyoriy)" aria-label="Sarlavha" maxLength={100} />
      <button className="video-submit" disabled={busy || !url.trim()}>{busy ? "Tekshirilmoqda…" : "Qo‘shish"}</button>
    </form>
  );
}

function VideoPlayer({ video, onClose }: { video: SiteVideo; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const { label } = PLATFORM[video.platform];
  return createPortal(
    <div className="video-modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="video-modal-card" role="dialog" aria-modal="true" aria-label={video.title || `${label} videosi`}>
        <button type="button" className="video-close" onClick={onClose} aria-label="Yopish"><X size={20} /></button>
        <iframe
          src={videoEmbedUrl(video)}
          title={video.title || `${label} videosi`}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          loading="lazy"
        />
        <a className="video-origin" href={video.url} target="_blank" rel="noopener noreferrer">{label}da ochish</a>
      </div>
    </div>,
    document.body,
  );
}
