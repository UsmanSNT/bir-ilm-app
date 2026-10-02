"use client";

import { Facebook, Instagram, Telegram, YouTube } from "./brand-icons";
import { useSiteLinks } from "@/lib/api/site-client";
import { SOCIAL_KEYS, SOCIAL_LABELS, type SocialKey } from "@/shared/contract";

const ICONS = { telegram: Telegram, youtube: YouTube, instagram: Instagram, facebook: Facebook } as const;

/**
 * «Bizni kuzating»: Bir Ilm'ning Telegram, YouTube, Instagram va Facebook sahifalariga o'tish.
 * Havolalar admin paneldan kiritiladi; hech biri kiritilmagan bo'lsa, blok ko'rinmaydi.
 */
export default function SocialLinks({ variant = "card" }: { variant?: "card" | "inline" }) {
  const { value: links } = useSiteLinks();
  const active = SOCIAL_KEYS.filter((key): key is SocialKey => Boolean(links[key]));
  if (!active.length) return null;
  return (
    <section className={`social-links social-links-${variant}`} aria-label="Bir Ilm ijtimoiy tarmoqlarda">
      {variant === "card" && (
        <div className="social-links-text">
          <strong>Bizni kuzating</strong>
          <span>Yangiliklar, suhbat e’lonlari va kitoblar haqida — ijtimoiy tarmoqlarda.</span>
        </div>
      )}
      <ul>
        {active.map((key) => {
          const Icon = ICONS[key];
          return (
            <li key={key}>
              <a className={`social-link is-${key}`} href={links[key]} target="_blank" rel="noopener noreferrer" aria-label={`Bir Ilm — ${SOCIAL_LABELS[key]}`}>
                <Icon size={19} aria-hidden="true" />
                <span>{SOCIAL_LABELS[key]}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
