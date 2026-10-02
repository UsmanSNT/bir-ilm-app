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

## Book Store

- Do‘konda faqat **narxi qo‘yilgan** kitoblar chiqadi. Narx va janrni admin yoki moderator kitob tahririda («Book Store» bo‘limi) qo‘yadi. Bo‘sh narx — kitob sotuvda emas.
- Savat serverda saqlanadi (web va mobil ilovada bir xil). Mehmon savat to‘ldira oladi; buyurtma, sharh va AI faqat Google/Telegram bilan kirganlar uchun.
- Summa har doim serverda, bazadagi narxdan hisoblanadi. Buyurtmadagi nom va narx o‘sha paytdagi holatda saqlanadi.
- Onlayn to‘lov ulanmagan: buyurtma «Yangi» holatda tushadi, operator mijozga qo‘ng‘iroq qiladi. Buyurtmalar: **Profil → Do‘kon buyurtmalari** (faqat admin). Holatlar: Yangi → Tasdiqlandi → Yo‘lda → Yetkazildi / Bekor qilindi.
- AI yordamchi (tavsiya, mutolaa rejasi, kitob xulosasi) uchun serverga `GEMINI_API_KEY` o‘rnating (ixtiyoriy: `GEMINI_MODEL`, standart `gemini-2.5-flash`). Kalit faqat serverda; har foydalanuvchiga 10 daqiqada 20 ta so‘rov.
- Migratsiya: `drizzle/0014_book_store.sql` — yangi jadvallar va `books` ga ikki ustun qo‘shadi, mavjud ma’lumotga tegmaydi. Server ishga tushganda avtomatik qo‘llanadi.
- Test: `node tests/store-v1.mjs`.

## Email va parol bilan kirish

- Kirish oynasida (Profil, Suhbat, Do‘kon) Google/Telegram tugmalari ostida **Email bilan kirish** formasi bor: «Kirish», «Hisob ochish», «Parolni unutdingizmi?».
- Ro‘yxatdan o‘tganda hozirgi mehmon ma’lumotlari (savat, progress, postlar) shu hisobga o‘tadi.
- Parollar PBKDF2-SHA256 (600 000 iteratsiya, tasodifiy tuz) bilan xeshlanadi; ochiq parol hech qayerda saqlanmaydi.
- Urinishlar cheklangan: kirish — IP va email bo‘yicha 15 daqiqada 10 ta; tiklash so‘rovi — 15 daqiqada 3 ta.
- **Parolni tiklash** havolasi 30 daqiqa amal qiladi, bir martalik; ishlatilganda shu hisobning barcha qurilmalardagi kirishlari yopiladi. Yuborish kanallari:
  - Email: `RESEND_API_KEY` va `MAIL_FROM` (resend.com, masalan `Bir Ilm <noreply@birilm.uz>`; domen Resend'da tasdiqlangan bo‘lishi kerak).
  - Telegram: foydalanuvchi hisobiga Telegram ham bog‘langan bo‘lsa, `TELEGRAM_BOT_TOKEN` orqali bot xabari ham yuboriladi.
  - Ikkalasi ham sozlanmagan bo‘lsa, «Parolni unutdingizmi?» tugmasi ko‘rinmaydi.
- Havola `PUBLIC_URL` (masalan `https://birilm.uz`) asosida yasaladi — Caddy orqasida ham to‘g‘ri domen chiqadi.
- Parolni o‘zgartirish: **Profil → Sozlamalar → Parolni o‘zgartirish**.
- Migratsiya: `drizzle/0015_email_login.sql` (faqat yangi jadvallar). Test: `node tests/auth-password-v1.mjs`.
