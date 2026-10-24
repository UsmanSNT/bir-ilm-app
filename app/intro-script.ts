/**
 * Ilova ochilish animatsiyasining skriptlari. Ular sahifa yuklanishida, React ulanishidan oldin ishlaydi:
 * animatsiya sahifa qanchalik sekin yuklanishidan qat'i nazar darhol boshlanadi, bosib o'tkazib yuboriladi
 * va o'z vaqtida yo'qoladi. Qatlamning o'zi `IntroSplash` komponentida (app/intro-splash.tsx).
 */

/** Animatsiya ijro etilishi mumkin bo'lgan manzil (public/assets). */
export const INTRO_SRC = "/assets/bir-ilm-splash.mp4";
/** Shu sessiyada animatsiya ko'rsatilgan belgisi: sahifa yangilansa qayta ijro etilmaydi. */
export const INTRO_SESSION_KEY = "bir-intro";
/** Video ~3,5 s; sekin qurilmada ham ilova shundan ortiq yopilib turmasin. */
export const INTRO_MAX_MS = 5000;
/** Yo'qolish davomiyligi (intro-splash.css dagi `transition` bilan bir xil). */
export const INTRO_FADE_MS = 450;

/**
 * `<head>` da: faqat ilova sifatida ochilganda (o'rnatilgan, to'liq ekran) va shu sessiyada hali ko'rsatilmagan bo'lsa,
 * `<html>` ga `show-intro` qo'shadi — qatlam birinchi chizilishdayoq ko'rinadi (sahifa miltillamaydi).
 */
export const INTRO_HEAD_SCRIPT = `(function(){try{var d=document.documentElement;var app=matchMedia("(display-mode: standalone)").matches||matchMedia("(display-mode: fullscreen)").matches||navigator.standalone===true;if(app&&!sessionStorage.getItem("${INTRO_SESSION_KEY}")){d.classList.add("show-intro")}}catch(e){}})();`;

/**
 * Qatlamdan keyin: animatsiyani boshlaydi va tugatadi. Video manzili shu yerda qo'yiladi, shuning uchun
 * oddiy brauzerda fayl umuman yuklanmaydi. Tugash: video oxiri, xato (kodek yo'q), bosish, vaqt chegarasi yoki
 * kamaytirilgan harakat — qaysi biri birinchi bo'lsa.
 */
export const INTRO_START_SCRIPT = `(function(){var d=document.documentElement;if(!d.classList.contains("show-intro"))return;try{sessionStorage.setItem("${INTRO_SESSION_KEY}","1")}catch(e){}var r=document.getElementById("bir-intro"),v=document.getElementById("bir-intro-video");if(!r||!v){d.classList.remove("show-intro");return}var done=false,t;function finish(){if(done)return;done=true;clearTimeout(t);r.classList.add("is-done");setTimeout(function(){d.classList.remove("show-intro");r.classList.remove("is-done");try{v.pause();v.removeAttribute("src");v.load()}catch(e){}},${INTRO_FADE_MS})}t=setTimeout(finish,${INTRO_MAX_MS});r.addEventListener("pointerdown",finish,{once:true});v.addEventListener("ended",finish,{once:true});v.addEventListener("error",finish,{once:true});if(matchMedia("(prefers-reduced-motion: reduce)").matches){finish();return}v.src="${INTRO_SRC}";var p=v.play();if(p&&p.catch)p.catch(finish)})();`;
