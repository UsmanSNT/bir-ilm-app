/** Kun hikmati: o'qish — hamma (mehmon ham), qo'shish — faqat admin. Admin to'liq ro'yxatni ham oladi. */
import { defineRoute } from "@/server/http/handler";
import { getUserRole, requireRole } from "@/server/services/roles";
import { createWisdom, listWisdoms, pickToday } from "@/server/services/wisdom";
import { wisdomInputSchema, type Wisdom, type WisdomInput, type WisdomToday } from "@/shared/contract";

export const runtime = "edge";

export const GET = defineRoute<undefined, WisdomToday>({
  handler: async ({ db, identity }) => {
    const [items, role] = await Promise.all([listWisdoms(db), getUserRole(db, identity.userId)]);
    return { today: pickToday(items), items: role === "admin" ? items : null };
  },
});

export const POST = defineRoute<WisdomInput, Wisdom>({
  schema: wisdomInputSchema,
  source: "body",
  status: 201,
  handler: async ({ db, identity, input }) => {
    await requireRole(db, identity.userId, ["admin"], "Hikmatni faqat admin qo'shadi.");
    return createWisdom(db, identity.userId, input);
  },
});

export const OPTIONS = GET;
