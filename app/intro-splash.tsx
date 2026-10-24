/**
 * Ilova ochilish animatsiyasi qatlami: daraxt o'sib, «BIR ILM» yozuvi chiqadi (public/assets/bir-ilm-splash.mp4).
 *
 * Faqat ilova sifatida o'rnatilib ochilganda va har sessiyada bir marta ko'rinadi: qaror, ijro va yo'qolish
 * `intro-script.ts` dagi skriptlarda (React ulanishidan oldin), ko'rinishi `intro-splash.css` da. Oddiy brauzer
 * oynasida qatlam yashirin va video yuklanmaydi.
 */
export default function IntroSplash() {
  return (
    // Sinf va video manzilini skriptlar o'zgartiradi: React ularga tegmasin.
    <div id="bir-intro" aria-hidden="true" suppressHydrationWarning>
      <video id="bir-intro-video" muted playsInline preload="auto" disablePictureInPicture disableRemotePlayback suppressHydrationWarning />
    </div>
  );
}
