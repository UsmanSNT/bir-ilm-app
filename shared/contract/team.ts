/** Loyiha jamoasi: «Biz haqimizda» sahifasidagi kartalar. Admin qo'shadi, tahrirlaydi va tartiblaydi. */
import { z } from "zod";

export const TEAM_LIMITS = { name: 60, role: 60, bio: 500, members: 50, photoBytes: 3 * 1024 * 1024 } as const;

export type TeamMember = {
  id: string;
  name: string;
  role: string;
  bio: string;
  /** `/media/team/<fayl>` yoki null (bosh harflar ko'rsatiladi). */
  photoUrl: string | null;
  /** Foydalanuvchi nomi, "@"siz. Bo'sh — ko'rsatilmaydi. */
  telegram: string;
  instagram: string;
  visible: boolean;
  sortOrder: number;
};

const SOCIAL = {
  telegram: { hosts: ["t.me", "telegram.me", "telegram.dog"], pattern: /^[A-Za-z0-9_]{5,32}$/, label: "Telegram" },
  instagram: { hosts: ["instagram.com"], pattern: /^[A-Za-z0-9._]{1,30}$/, label: "Instagram" },
} as const;
export type TeamSocial = keyof typeof SOCIAL;

/**
 * Admin `@nom`, `nom` yoki to'liq havola (t.me/nom, instagram.com/nom) yozishi mumkin — hammasi nomga keltiriladi.
 * Bo'sh — `""`, noto'g'ri — `null`.
 */
export function normalizeHandle(kind: TeamSocial, input: string): string | null {
  const raw = input.trim();
  if (!raw) return "";
  let handle = raw.replace(/^@/, "");
  if (/[/:]/.test(raw)) {
    try {
      const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
      if (!SOCIAL[kind].hosts.includes(url.hostname.toLowerCase().replace(/^www\./, "") as never)) return null;
      handle = url.pathname.split("/").filter(Boolean)[0] ?? "";
    } catch {
      return null;
    }
  }
  return SOCIAL[kind].pattern.test(handle) ? handle : null;
}

export const teamProfileUrl = (kind: TeamSocial, handle: string) =>
  kind === "telegram" ? `https://t.me/${encodeURIComponent(handle)}` : `https://instagram.com/${encodeURIComponent(handle)}`;

const handleField = (kind: TeamSocial) =>
  z
    .string()
    .max(200)
    .default("")
    .transform((value, ctx) => {
      const handle = normalizeHandle(kind, value);
      if (handle === null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${SOCIAL[kind].label}: foydalanuvchi nomi yoki havolasini to'g'ri yozing.` });
        return z.NEVER;
      }
      return handle;
    });

export const teamMemberInputSchema = z.object({
  name: z.string().trim().min(1, "Ism familiyani kiriting.").max(TEAM_LIMITS.name, `Ism ${TEAM_LIMITS.name} belgidan oshmasin.`),
  role: z.string().trim().max(TEAM_LIMITS.role, `Lavozim ${TEAM_LIMITS.role} belgidan oshmasin.`).default(""),
  bio: z.string().trim().max(TEAM_LIMITS.bio, `Ma'lumot ${TEAM_LIMITS.bio} belgidan oshmasin.`).default(""),
  telegram: handleField("telegram"),
  instagram: handleField("instagram"),
  visible: z.boolean().default(true),
});
export type TeamMemberInput = z.input<typeof teamMemberInputSchema>;
export type TeamMemberData = z.output<typeof teamMemberInputSchema>;

export const teamMoveSchema = z.object({ direction: z.enum(["up", "down"]) });
export type TeamMoveInput = z.infer<typeof teamMoveSchema>;

/** `?all=1` — admin uchun yashirinlari bilan. */
export const teamListQuerySchema = z.object({ all: z.literal("1").optional() });
export type TeamListQuery = z.infer<typeof teamListQuerySchema>;
