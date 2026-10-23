/**
 * Shaxsiy bildirishnomalar (qo'ng'iroqcha): postingizga reaksiya, izoh va izohingizga javob.
 * Ro'yxatda faqat o'qilmaganlari bo'ladi; ochilgani o'chiriladi.
 */
import { z } from "zod";

export const NOTIFICATION_TYPES = ["reaction", "reply", "reply_to_reply"] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Qo'ng'iroqchada bir martada ko'rsatiladigan eng ko'p bildirishnoma. */
export const NOTIFICATION_PAGE = 50;
/** Matn parchalari (post va izoh) shu uzunlikda qisqartiriladi. */
export const NOTIFICATION_EXCERPT = 90;

export type NotificationActor = { id: string; name: string; avatarUrl: string | null };

export type AppNotification = {
  id: string;
  type: NotificationType;
  actor: NotificationActor;
  postId: string;
  /** Post sarlavhasi yoki matnining boshi. */
  postExcerpt: string;
  /** Yangi izoh (izoh turlarida) — bosilganda shu izohga olib boriladi. */
  replyId: string | null;
  /** Izoh matnining boshi; reaksiyada bo'sh. */
  replyExcerpt: string;
  /** Reaksiya belgisi; izohda bo'sh. */
  emoji: string;
  createdAt: string;
};

export type NotificationInbox = {
  items: AppNotification[];
  /** Jami o'qilmaganlar (ro'yxat chegarasidan ko'p bo'lishi mumkin). */
  unread: number;
};

export const markNotificationsReadSchema = z
  .object({
    ids: z.array(z.string().min(1).max(160)).max(NOTIFICATION_PAGE).optional(),
    all: z.literal(true).optional(),
  })
  .refine((value) => Boolean(value.all) || Boolean(value.ids?.length), { message: "Qaysi bildirishnoma o'qilganini ko'rsating." });
export type MarkNotificationsReadInput = z.infer<typeof markNotificationsReadSchema>;

/** Postlaringizga bildirilgan reaksiyalar (Faollik → Reaksiyalar). */
export type ReceivedReaction = {
  postId: string;
  postExcerpt: string;
  actor: NotificationActor;
  emoji: string;
  createdAt: string;
};
