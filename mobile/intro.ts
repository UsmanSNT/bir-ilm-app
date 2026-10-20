/**
 * Ilova ochilish animatsiyasi: daraxt o'sib, «BIR ILM» yozuvi chiqadi (public/assets/bir-ilm-splash.mp4).
 *
 * Qatlam `index.html` ning o'zida turadi — JS yuklanguncha ham native splash bilan bir xil fon ko'rinadi.
 * Video native splash yopilgandan keyin boshlanadi (aks holda boshi splash ostida o'tib ketadi), oxirigacha
 * ijro etiladi va ilova ustidan yumshoq yo'qoladi. Bosilsa — darhol o'tkazib yuboriladi.
 * Video ijro etilmasa (xato, kodek yo'q) yoki harakat kamaytirilgan bo'lsa — kutib o'tirilmaydi.
 */

/** Video 3,5 s; tarmoq/qurilma sekin bo'lsa ham ilova shundan ortiq yopilib turmasin. */
const MAX_INTRO_MS = 5000;
const FADE_MS = 450;

export function playIntro(): void {
  const intro = document.getElementById("intro");
  const video = intro?.querySelector("video");
  if (!intro || !video) return;

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    window.clearTimeout(limit);
    intro.classList.add("is-done");
    window.setTimeout(() => {
      video.pause();
      video.removeAttribute("src");
      video.load(); // dekoder xotirasini bo'shatadi
      intro.remove();
    }, FADE_MS);
  };
  const limit = window.setTimeout(finish, MAX_INTRO_MS);

  intro.addEventListener("pointerdown", finish, { once: true });
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    finish();
    return;
  }
  video.addEventListener("ended", finish, { once: true });
  video.addEventListener("error", finish, { once: true });
  void video.play().catch(finish);
}
