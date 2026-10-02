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

## Google va Telegram orqali kirish

Tugmalar faqat tegishli sirlar (secrets) o‘rnatilganda ko‘rinadi. Ularni Cloudflare Workers'da `wrangler secret put` yoki boshqaruv panelidagi Variables and Secrets orqali qo‘shing, kodga yozmang.

### Google
1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → **Create credentials → OAuth client ID** → turi: **Web application**.
2. **Authorized redirect URIs** ga qo‘shing: `https://SIZNING-DOMEN/api/auth/google/callback` (lokal sinov uchun `http://127.0.0.1:8787/api/auth/google/callback`).
3. OAuth consent screen'da ilova nomi va support email'ni to‘ldiring.
4. Sirlar: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

### Telegram
1. [@BotFather](https://t.me/BotFather) → `/newbot` → bot yarating, tokenni oling.
2. `/setdomain` → botni tanlang → saytingiz domenini kiriting (masalan `bir-ilm.uz`). Telegram tugmasi faqat shu domenda ishlaydi.
3. Sirlar: `TELEGRAM_BOT_TOKEN` (BotFather bergan token), `TELEGRAM_BOT_USERNAME` (bot nomi, `@` siz).

### Migratsiyalar
`drizzle/0006_*.sql` (hisoblar, sessiyalar) va `drizzle/0007_*.sql` (Google/Telegram bog‘lanishlari) qo‘llangan bo‘lishi kerak.

### Lokal sinov
```bash
TELEGRAM_BOT_TOKEN=123:test TELEGRAM_BOT_USERNAME=bir_ilm_test_bot GOOGLE_CLIENT_ID=test-client GOOGLE_CLIENT_SECRET=test-secret node scripts/preview-node.mjs
node tests/oauth-api.mjs
```

## Jonli efir (ovoz, video, ekran, yozuv)

Efir ovozli boshlanadi. Kimdir kamera yoqsa video uchun joy ochiladi, qolganlar ovozli holatda qoladi. Admin ekranni ulashsa, u videolar yoniga qo‘shiladi. Media Cloudflare Realtime (SFU) orqali uzatiladi. Har kim o‘z oqimini bir marta yuboradi va faqat kerakli oqimlarni oladi.

Trafik sarfi:
- ovoz ~32 kbit/s;
- video 360p/15fps ~350 kbit/s;
- ekran 8fps ~700 kbit/s;
- **Tejamkor** rejimda video va ekran umuman olinmaydi.

Mikrofonni o‘chirish qayta ulanishsiz ishlaydi.

### Sirlar
1. Cloudflare Dashboard → **Realtime → SFU → Create application**.
2. `CALLS_APP_ID` — ilova ID'si, `CALLS_APP_TOKEN` — ilova tokeni.
3. Ixtiyoriy (qattiq tarmoqlar va korporativ NAT uchun): **Realtime → TURN → Create** → `TURN_KEY_ID`, `TURN_KEY_TOKEN`. Bular bo‘lmasa faqat STUN ishlatiladi.
4. `TALK_ADMINS` — efirni boshlay oladigan loginlar, vergul bilan (masalan `usmon,admin2`). **Bo‘sh qoldirilsa, istalgan foydalanuvchi boshlay oladi**, shuning uchun productionda albatta o‘rnating.

`CALLS_APP_ID` va `CALLS_APP_TOKEN` bo‘lmasa, suhbat faqat matn rejimida ishlaydi (chat, qo‘l ko‘tarish, reaksiyalar).

### Ruxsatlar (serverda tekshiriladi)
- Ovoz va kamerani admin hamda so‘z berilgan ishtirokchi yoqa oladi. Ekranni faqat admin ulasha oladi.
- So‘z olib qo‘yilsa, mikrofon va kamera avtomatik o‘chadi.
- Oqim faqat efirdagi va hozir ruxsati bor ishtirokchidan olinadi.

### Yozib olish
Faqat admin yozib oladi, yozuv admin brauzerida bo‘ladi:
- barcha ovozlar bitta faylga aralashtiriladi (Opus mono 48 kbit/s, soatiga ~22 MB);
- yozuvni pauza qilish va to‘xtagan joydan davom ettirish mumkin;
- **To‘xtatish** bosilganda fayl nomi so‘raladi;
- Chrome/Edge'da tizimning "Saqlash" oynasi ochiladi, unda papka va nom tanlanadi; boshqa brauzerlarda fayl shu nom bilan yuklab olinadi.

Yozuv serverga yuklanmaydi. Ishtirokchilar ekranida "Yozilmoqda" belgisi ko‘rinadi.

### Migratsiya
`drizzle/0010_*.sql` (media holati va yozuv belgisi).

### Lokal sinov
```bash
CALLS_APP_ID=test-app CALLS_APP_TOKEN=test-token TALK_ADMINS=efir_admin_test node scripts/preview-node.mjs
node tests/talk-rtc-api.mjs
```
