# Bir Ilm

HTML v2 namunasining ranglari, kartalari va 3 ustunli javoniga asoslangan ishlaydigan demo. Lucide ikonlar, React 19, Vinext / Next.js App Router, TypeScript, Tailwind va mavjud Shadcn komponentlari.

## Lokal ishga tushirish

Node.js 22.13+ va pnpm 11.19.0 kerak.

```bash
corepack enable
pnpm install
pnpm dev
```

Terminal ko‘rsatgan lokal URLni oching. `pnpm build` ishlab chiqarish buildini yaratadi.

## Funksiyalar

- 5 tab, splash va onboarding.
- Yakshanba 18:00 uchun dinamik hisoblagich, qurilma mahalliy vaqtida. O‘tgan vaqtdan keyin kelgusi yakshanbaga o‘tadi.
- Sahifa progressi, kunlik reja, shaxsiy fikr, profil va bildirishnoma parametrlari.
- Community demo: haqiqiy ko‘p foydalanuvchili chat emas.
- Kutubxona qidiruvi, tafsilotlar va shaxsiy javon. Har qatorda 3 kitob.
- Foydalanuvchi yuklaydigan audio, IndexedDB saqlash va HTML audio player. Uydirma suhbat yozuvlari yo‘q.

localStorage kaliti: `bir-ilm-v1`. Audio: `bir-ilm-audio` IndexedDB. Brauzer ma’lumotlarini tozalash lokal yozuvlarni o‘chiradi. Backend, login, sinxronlash va fon push bildirishnomalari yo‘q. Hozircha PWA/offline kafolati yo‘q.

Asl logo va illyustratsiyalar `public/assets/README.md` orqali ulanadi. Kitob muqovalari HTML namunadagi kabi matnli demo ko‘rinishlar.

## Tashrif buyuruvchilar, a‘zolar va admin

- **Tashrif buyuruvchi (anonim):** kitoblar, lenta va reytingni o‘qiy oladi. Unga profil/ID berilmaydi, `users` jadvaliga yozilmaydi. Faqat `site_visitors` ro‘yxatida hisoblanadi (tasodifiy `bir_visitor` cookie xeshi, birinchi/oxirgi kirish, tashriflar soni, mamlakat, qurilma turi; IP va to‘liq User-Agent saqlanmaydi; botlar hisoblanmaydi; 90 kundan keyin tozalanadi).
- **Ro‘yxatdan o‘tgan a‘zo:** platforma orqali tizimga kirgan foydalanuvchi ism kiritib ro‘yxatdan o‘tadi (`POST /api/me`). Faqat a‘zolar chatda yozadi, post/izoh qoldiradi, obuna bo‘ladi va reytingga yoziladi. Shaxs serverda tekshiriladi; so‘rov tanasidagi `userId` hech qachon ishlatilmaydi.
- **Admin panel:** `/admin`. Kirish huquqi `ADMIN_EMAILS` (vergul bilan ajratilgan email ro‘yxati) muhit o‘zgaruvchisida belgilanadi. Lokal sinov: `ADMIN_EMAILS=you@example.com pnpm preview:node`.
- Migratsiya: `drizzle/0003_*.sql`. Oldingi cookie-mehmon (`reader_…`) yozuvlari o‘chirilmagan: postlari lentada ko‘rinadi, lekin ular endi yozolmaydi va a‘zolar ro‘yxatida chiqmaydi.
