"use client";

import { Share, Smartphone, SquarePlus, X } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { dismissInstallCard, requestInstall, setInstallHelpOpen, useInstallCardVisible, useInstallHelpOpen, useInstallState } from "./pwa-install";

/** Bosh sahifadagi taklif: ilovani bosh ekranga o'rnatish. Faqat o'rnatish mumkin bo'lganda va yopilmagan bo'lsa ko'rinadi. */
export function InstallCard() {
  const visible = useInstallCardVisible();
  const state = useInstallState();
  if (!visible) return null;
  return (
    <section className="install-card" aria-label="Ilovani o‘rnatish">
      <span className="install-card-icon" aria-hidden="true"><Smartphone size={22} /></span>
      <div className="install-card-copy">
        <strong>Bir Ilm — ilova sifatida</strong>
        <small>Bosh ekranda belgi, brauzer satrisiz to‘liq ekran.</small>
      </div>
      <button type="button" className="install-card-go" onClick={() => void requestInstall()}>{state === "ios" ? "Qanday?" : "O‘rnatish"}</button>
      <button type="button" className="install-card-x" aria-label="Taklifni yopish" onClick={dismissInstallCard}><X size={16} /></button>
    </section>
  );
}

/** iPhone/iPad ko'rsatmasi (Safari o'rnatish oynasini bermaydi). Ilova ildizida bir marta joylanadi. */
export function InstallHelp() {
  const open = useInstallHelpOpen();
  return (
    <Dialog open={open} onOpenChange={setInstallHelpOpen}>
      <DialogContent className="install-dialog">
        <DialogTitle>Bosh ekranga qo‘shish</DialogTitle>
        <DialogDescription>iPhone va iPad’da Bir Ilm Safari orqali o‘rnatiladi:</DialogDescription>
        <ol className="install-steps">
          <li><span>1</span> Pastdagi <b>«Ulashish»</b> <Share size={17} aria-hidden="true" /> tugmasini bosing.</li>
          <li><span>2</span> <b>«Bosh ekranga qo‘shish»</b> <SquarePlus size={17} aria-hidden="true" /> ni tanlang.</li>
          <li><span>3</span> <b>«Qo‘shish»</b> ni bosing — Bir Ilm belgisi bosh ekranda paydo bo‘ladi.</li>
        </ol>
        <DialogClose className="install-dialog-ok">Tushunarli</DialogClose>
      </DialogContent>
    </Dialog>
  );
}
