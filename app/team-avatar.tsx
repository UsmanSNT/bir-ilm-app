import type { TeamAvatar } from "@/shared/contract";
import { AVATAR_ART, AVATAR_VIEWBOX } from "./team-avatar-art";

/**
 * Tayyor avatar. Ota elementni to'ldiradi: kartada (4:5) ham, kichik kvadrat belgida ham bosh va yelka ko'rinadi.
 * Faqat bezak — ma'noni a'zoning ismi beradi, shuning uchun ekran o'qigichlardan yashirilgan.
 */
export default function TeamAvatarArt({ kind, className }: { kind: TeamAvatar; className?: string }) {
  return (
    <svg
      className={className}
      viewBox={`0 0 ${AVATAR_VIEWBOX.width} ${AVATAR_VIEWBOX.height}`}
      preserveAspectRatio="xMidYMin slice"
      aria-hidden="true"
      focusable="false"
    >
      {AVATAR_ART[kind].map((shape, index) => (
        <path key={index} d={shape.d} fill={shape.fill} opacity={shape.opacity} />
      ))}
    </svg>
  );
}
