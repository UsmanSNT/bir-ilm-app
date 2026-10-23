export type TeamMember = {
  id: string;
  name: string;
  role: string;
  bio: string;
  photo: string;
  telegram: string;
  instagram: string;
  sortOrder: number;
  visible: boolean;
};

export type TeamInput = Pick<TeamMember, "name" | "role" | "bio" | "photo" | "telegram" | "instagram" | "visible">;

export class TeamValidationError extends Error {}

export const TEAM_LIMITS = { name: 60, role: 60, bio: 500, photo: 400_000 } as const;
const HANDLE = /^[A-Za-z0-9._]{1,32}$/;
const PHOTO_DATA_URL = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

export const TEAM_COLUMNS =
  "id, name, role, bio, photo, telegram, instagram, sort_order AS sortOrder, visible";

type Row = Omit<TeamMember, "visible"> & { visible: number };
export const toMember = (row: Row): TeamMember => ({ ...row, visible: row.visible === 1 });

function handle(value: unknown, label: string): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") throw new TeamValidationError(`${label} noto'g'ri.`);
  const clean = value.trim().replace(/^@/, "");
  if (clean && !HANDLE.test(clean)) throw new TeamValidationError(`${label}: faqat harf, raqam, nuqta va pastki chiziq.`);
  return clean;
}

function photo(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string" || value.length > TEAM_LIMITS.photo) throw new TeamValidationError("Surat juda katta.");
  if (PHOTO_DATA_URL.test(value)) return value;
  try {
    if (new URL(value).protocol === "https:") return value;
  } catch { /* quyida rad etiladi */ }
  throw new TeamValidationError("Surat formati noto'g'ri (JPEG, PNG, WebP yoki https havola).");
}

function text(value: unknown, label: string, max: number, required = false): string {
  const clean = typeof value === "string" ? value.trim() : "";
  if (required && !clean) throw new TeamValidationError(`${label} kiritilishi shart.`);
  if (clean.length > max) throw new TeamValidationError(`${label} ${max} belgidan oshmasin.`);
  return clean;
}

/** Tashqaridan kelgan obyektni tekshiradi; xato bo'lsa Error tashlaydi. */
export function parseTeamInput(raw: Record<string, unknown>): TeamInput {
  return {
    name: text(raw.name, "Ism", TEAM_LIMITS.name, true),
    role: text(raw.role, "Lavozim", TEAM_LIMITS.role),
    bio: text(raw.bio, "Ma'lumot", TEAM_LIMITS.bio),
    photo: photo(raw.photo),
    telegram: handle(raw.telegram, "Telegram"),
    instagram: handle(raw.instagram, "Instagram"),
    visible: raw.visible !== false,
  };
}
