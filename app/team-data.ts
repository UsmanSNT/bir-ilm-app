export type TeamMember = {
  id: string;
  name: string;
  role: string;
  bio: string;
  /** Fayl public/assets/team/ ichida bo'lishi kerak, masalan "/assets/team/ali.jpg". Bo'sh bo'lsa bosh harflar ko'rsatiladi. */
  photo?: string;
  /** Faqat foydalanuvchi nomi, "@"siz. Masalan: "bir_ilm" */
  telegram?: string;
  instagram?: string;
};

// Haqiqiy a'zolar ma'lumotlari bilan almashtiring.
export const team: TeamMember[] = [
  {
    id: "member-1",
    name: "Ism Familiya",
    role: "Loyiha asoschisi",
    bio: "Bu yerga a'zo haqida 2-3 gaplik qisqa ma'lumot yoziladi.",
    telegram: "username",
    instagram: "username",
  },
  {
    id: "member-2",
    name: "Ism Familiya",
    role: "Dasturchi",
    bio: "Bu yerga a'zo haqida 2-3 gaplik qisqa ma'lumot yoziladi.",
  },
  {
    id: "member-3",
    name: "Ism Familiya",
    role: "Dizayner",
    bio: "Bu yerga a'zo haqida 2-3 gaplik qisqa ma'lumot yoziladi.",
  },
];
