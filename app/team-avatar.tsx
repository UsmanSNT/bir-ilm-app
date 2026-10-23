import type { TeamAvatar } from "@/shared/contract";

/** Tayyor avatar rasmlari (public/assets): shaffof fonli, 4:5 — kartaning rasm maydoniga to'g'ri keladi. */
const AVATAR_SRC: Record<TeamAvatar, string> = {
  woman: "/assets/avatar-woman.webp",
  man: "/assets/avatar-man.webp",
};

/**
 * Rasm qo'ymaslikni xohlaganlar uchun tayyor avatar. Ota elementni to'ldiradi (kartada 4:5, kichik belgida
 * kvadrat — u yerda bosh va yelka ko'rinadi). Bezak: ma'noni a'zoning ismi beradi, shuning uchun `alt` bo'sh.
 */
export default function TeamAvatarArt({ kind, className }: { kind: TeamAvatar; className?: string }) {
  return (
    <img
      className={`team-avatar-img${className ? ` ${className}` : ""}`}
      src={AVATAR_SRC[kind]}
      alt=""
      width={560}
      height={700}
      loading="lazy"
      decoding="async"
      draggable={false}
    />
  );
}
