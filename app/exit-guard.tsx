"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import "./exit-guard.css";

/** `history.state` dagi belgi: bu yozuv sayt tomonidan qo'yilgan qo'riqchi. */
const GUARD_STATE = { birIlmExitGuard: true } as const;

/**
 * Sayt ildizida «orqaga» harakat bilan butun saytdan bir zumda chiqib ketishni oldini oladi.
 *
 * Mexanizm: mount paytida joriy yozuv ustiga qo'riqchi yozuv qo'yiladi. Orqaga bosilganda brauzer shu
 * qo'riqchini olib tashlaydi (`popstate`) va sayt ochiq qoladi; foydalanuvchidan tasdiq so'raladi.
 * «Ha» — `history.back()` bilan haqiqatan oldingi sahifaga; «Yo'q» — `history.forward()` bilan qo'riqchiga qaytadi.
 */
export function ExitGuard() {
  const [asking, setAsking] = useState(false);
  const leaving = useRef(false);
  const askingRef = useRef(false);

  useEffect(() => {
    try {
      window.history.pushState(GUARD_STATE, "", window.location.href);
    } catch {
      return;
    }

    const onPop = (event: PopStateEvent) => {
      // Qo'riqchiga qaytish (forward) yoki boshqa sayt tomonidan qo'yilgan yozuvlar e'tiborsiz qoldiriladi.
      if ((event.state as { birIlmExitGuard?: boolean } | null)?.birIlmExitGuard) return;
      if (leaving.current || askingRef.current) return;
      askingRef.current = true;
      setAsking(true);
    };

    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function stay() {
    askingRef.current = false;
    setAsking(false);
    window.history.forward();
  }

  function leave() {
    leaving.current = true;
    askingRef.current = false;
    setAsking(false);
    window.history.back();
  }

  return (
    <Dialog open={asking} onOpenChange={(open) => { if (!open) stay(); }}>
      <DialogContent className="exit-guard">
        <DialogTitle>Sahifadan chiqmoqchimisiz?</DialogTitle>
        <DialogDescription>Bu sahifani tark etsangiz, joriy holat saqlanmasligi mumkin.</DialogDescription>
        <div className="exit-guard-actions">
          <button type="button" className="exit-guard-stay" onClick={stay}>Yo‘q, qolish</button>
          <button type="button" className="exit-guard-leave" onClick={leave}>Ha, chiqish</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
