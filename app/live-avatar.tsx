// Jonli suhbat xonasi va suhbat izohlari oynasi uchun umumiy avatar (ism bosh harfi, ismga bog'liq rang).

// Naqsh ranglari: oq harf bilan kontrasti yetarli (WCAG AA), efir foniga mos.
const AVATAR_COLORS = [
  "#2c4398", "#0d7a79", "#b83a2f", "#a8741a",
  "#5b4a8b", "#0b6a68", "#8e3b34", "#3b5bb5",
  "#7a5a0c", "#2f6f8f", "#7d3c98", "#1e2f6e",
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={`live-avatar-circle ${className ?? ""}`}
      style={{ background: avatarColor(name) }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
