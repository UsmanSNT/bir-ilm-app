"use client";

/**
 * Qo'ng'iroqcha oynasi: faqat o'qilmaganlar — postlaringizga reaksiya va izohlar, do'kon xabarlari, e'lonlar.
 * Ochilgan bildirishnoma ro'yxatdan chiqadi va foydalanuvchi o'sha post yoki izohga olib boriladi.
 */
import { CheckCheck, ChevronRight, CornerDownRight, Heart, Megaphone, MessageCircle, MessageSquare } from "lucide-react";
import type { AppNotification, NotificationType, StoreInboxItem } from "@/shared/contract";
import { absoluteUrl } from "@/lib/api/config";
import { formatDate } from "./community/post-card";
import type { Announcement } from "./mobile-screens";
import type { AccountTab, AdminArea } from "./store-account";

const ACTION_TEXT: Record<NotificationType, (emoji: string) => string> = {
  reaction: (emoji) => (emoji ? `postingizga ${emoji} reaksiya bildirdi` : "postingizga reaksiya bildirdi"),
  reply: () => "postingizga izoh qoldirdi",
  reply_to_reply: () => "izohingizga javob yozdi",
};

const TYPE_ICON: Record<NotificationType, typeof Heart> = {
  reaction: Heart,
  reply: MessageCircle,
  reply_to_reply: CornerDownRight,
};

export type NotificationCenterProps = {
  notifications: AppNotification[];
  /** Faqat o'qilmagan e'lonlar. */
  announcements: Announcement[];
  /** O'qilmagan do'kon yozishmalari. */
  storeThreads: StoreInboxItem[];
  isAdmin: boolean;
  adminOrders: number;
  adminChats: number;
  onOpenNotification: (notification: AppNotification) => void;
  onOpenAnnouncement: (announcement: Announcement) => void;
  onOpenStore: (tab: AccountTab, area?: AdminArea) => void;
  onReadAll: () => void;
};

export default function NotificationCenter({
  notifications, announcements, storeThreads, isAdmin, adminOrders, adminChats,
  onOpenNotification, onOpenAnnouncement, onOpenStore, onReadAll,
}: NotificationCenterProps) {
  const adminItems = isAdmin && (adminOrders > 0 || adminChats > 0);
  const empty = !notifications.length && !announcements.length && !storeThreads.length && !adminItems;

  return (
    <div className="notification-center">
      {(notifications.length > 0 || announcements.length > 0) && (
        <button type="button" className="notification-read-all" onClick={onReadAll}>
          <CheckCheck size={16} aria-hidden="true" /> Hammasini o‘qilgan deb belgilash
        </button>
      )}

      {empty && (
        <div className="notification-empty">
          <span className="notification-icon"><CheckCheck size={20} /></span>
          <strong>Yangi bildirishnoma yo‘q</strong>
          <small>Postlaringizga reaksiya yoki izoh qoldirilsa, shu yerda ko‘rinadi.</small>
        </div>
      )}

      {notifications.length > 0 && (
        <>
          <p className="notification-group">Faollik</p>
          {notifications.map((item) => {
            const Icon = TYPE_ICON[item.type];
            return (
              <button type="button" className="notification-item" key={item.id} onClick={() => onOpenNotification(item)}>
                <span className="notification-avatar" aria-hidden="true">
                  {item.actor.avatarUrl
                    ? <img src={absoluteUrl(item.actor.avatarUrl)} alt="" referrerPolicy="no-referrer" />
                    : item.actor.name.slice(0, 1).toUpperCase()}
                  <i className={`notification-badge is-${item.type}`}><Icon size={11} strokeWidth={2.6} /></i>
                </span>
                <span className="notification-copy">
                  <strong><b>{item.actor.name}</b> {ACTION_TEXT[item.type](item.emoji)}</strong>
                  {item.replyExcerpt && <small className="notification-quote">“{item.replyExcerpt}”</small>}
                  {item.postExcerpt && <small>{item.postExcerpt}</small>}
                  <time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time>
                </span>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            );
          })}
        </>
      )}

      {storeThreads.length > 0 && (
        <>
          <p className="notification-group">Do‘kon xabarlari</p>
          {storeThreads.map((item) => (
            <button type="button" className="notification-item" key={item.key} onClick={() => onOpenStore("messages")}>
              <span className="notification-icon"><MessageSquare size={19} /></span>
              <span className="notification-copy">
                <strong>{item.kind === "general" ? "Umumiy savollar" : `Buyurtma № ${item.order?.id}`}</strong>
                <small>{item.preview || "Yangi xabar"}</small>
                <time>{item.unread} ta yangi</time>
              </span>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          ))}
        </>
      )}
      {isAdmin && adminOrders > 0 && (
        <button type="button" className="notification-item" onClick={() => onOpenStore("admin", "orders")}>
          <span className="notification-icon"><MessageSquare size={19} /></span>
          <span className="notification-copy"><strong>Yangi buyurtmalar</strong><time>{adminOrders} ta</time></span>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      )}
      {isAdmin && adminChats > 0 && (
        <button type="button" className="notification-item" onClick={() => onOpenStore("admin", "chat")}>
          <span className="notification-icon"><MessageSquare size={19} /></span>
          <span className="notification-copy"><strong>Do‘kon chati</strong><time>{adminChats} ta o‘qilmagan</time></span>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      )}

      {announcements.length > 0 && (
        <>
          <p className="notification-group">E‘lonlar</p>
          {announcements.map((item) => (
            <button type="button" className="notification-item" key={item.id} onClick={() => onOpenAnnouncement(item)}>
              <span className="notification-icon notification-icon-gold"><Megaphone size={19} /></span>
              <span className="notification-copy">
                <strong>{item.title}</strong>
                <small>{item.body.slice(0, 90)}{item.body.length > 90 ? "…" : ""}</small>
                <time>{item.time}</time>
              </span>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          ))}
        </>
      )}
    </div>
  );
}
