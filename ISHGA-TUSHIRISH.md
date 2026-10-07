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
- **Narxlar Koreya wonida (₩)** va butun sonda (masalan ₩59,000). Eski narxlar so‘mda kiritilgan bo‘lsa, ularni **Profil → Do‘kon kitoblari** orqali won bilan qayta kiriting (avtomatik o‘zgarmaydi).
- To‘lov ilovada emas: buyurtma «Yangi» holatda tushadi va xaridorning chatiga ham xabar bo‘lib tushadi; admin chatda hisob raqamni yuboradi, xaridor chek rasmini shu chatga tashlaydi. Buyurtmalar: **Profil → Do‘kon buyurtmalari** (faqat admin). Holatlar: Yangi → Tasdiqlandi → Yo‘lda → Yetkazildi / Bekor qilindi.
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

## Efir yozuvi: pauza va faylga saqlash

- **Yozuv suhbatdan mustaqil**: suhbat boshlanganda o‘zi yoqilmaydi, suhbat tugaganda ham o‘zi to‘xtamaydi. Admin xona ochilgach «Yozib olish» ni o‘zi bosadi. Yozuv ketayotganda «Tugatish» bosilsa, avval tasdiq so‘raladi (xona yopilgach yozuv ham to‘xtab saqlanadi).
- Yozuvni admin boshqaradi: «Yozib olish» → **Pauza** / **Davom ettirish** (to‘xtagan joydan o‘sha faylga qo‘shiladi) → «Yozuvni to‘xtatish».
- Hammaga «REC» yoki «PAUZA» belgisi ko‘rinadi; adminda pauzalarsiz vaqt hisoblagichi.
- Yozuv avvalgidek serverga bo‘laklab yuklanadi (Suhbatlar → o‘tganlar → yozuv). To‘xtatilgach admin oynasida **«Yozuvni faylga saqlash»** chiqadi: fayl nomini yozadi, Chrome/Edge’da papkani tizim oynasida tanlaydi, boshqa brauzerlarda shu nom bilan yuklab olinadi. «Keyinroq» — faqat serverdagi nusxa qoladi.

## Kitoblarni kim yuklaydi

Kitob qo‘shish, tahrirlash, muqova va audio yuklash, narx qo‘yish — faqat **admin va moderator** (server tekshiradi, oddiy foydalanuvchi qila olmaydi).
- Admin: bosh sahifadagi «Hafta kitobi» kartasida «Qo‘shish» / «Tahrirlash»; Javon sahifasida ham kitob qo‘shiladi. Oynada: muqova, nom, muallif, tavsif, **narx va janr (Book Store)**, audio qismlar (bir nechta fayl, 1 GB gacha).
- Rol berish: **Profil → Sozlamalar → Boshqaruv paneli** (admin boshqalarga «moderator» yoki «admin» beradi). Birinchi adminni serverda `node scripts\set-role.mjs <userId> admin` bilan tayinlaysiz (`--list` foydalanuvchilarni ko‘rsatadi).
- Do‘konda kitob chiqishi uchun **narx** (> 0) qo‘yiladi; narxsiz kitob faqat Javonda (tinglash uchun) qoladi.

## Google va Telegram bilan kirish (serverda)

Sirlar faqat serverda, `C:\bir-ilm\secrets.cmd` faylida turadi (git'ga tushmaydi). Har biri alohida qator:

```cmd
set "PUBLIC_URL=https://birilm.uz"
set "GOOGLE_CLIENT_ID=..."
set "GOOGLE_CLIENT_SECRET=..."
set "TELEGRAM_BOT_TOKEN=..."
set "TELEGRAM_BOT_USERNAME=bot_nomi_@siz"
```

Qiymatni qo‘shtirnoq ichida yozing (`%`, `&`, `!` belgilari cmd'ni buzmasin). Saqlagach saytni qayta ishga tushiring: `schtasks /end /tn "BirIlm-Site"`, keyin `schtasks /run /tn "BirIlm-Site"`. Tugmalar faqat tegishli sirlar bor bo‘lganda ko‘rinadi.

**Google:** [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials) → *Create credentials → OAuth client ID* → *Web application*. *Authorized redirect URIs*: `https://birilm.uz/api/auth/google/callback`. OAuth consent screen'da ilova nomi va support email to‘ldiriladi. `GOOGLE_CLIENT_ID` va `GOOGLE_CLIENT_SECRET` shu yerdan.

**Telegram:** [@BotFather](https://t.me/BotFather) → `/newbot` → token (`TELEGRAM_BOT_TOKEN`) va bot nomi (`TELEGRAM_BOT_USERNAME`, `@` siz). Keyin `/setdomain` → botni tanlang → `birilm.uz`. Telegram tugmasi faqat shu domenda ishlaydi.

## Suhbat boshlanmagan: timer oynasi

- Suhbat boshlanmaguncha **xonaga hech kim kira olmaydi** (admin ham). Server ham rad etadi (`Suhbat hali boshlanmadi`); sahifa yangilanganda ham rejadagi suhbatga avtomatik kirilmaydi.
- Suhbatlar ro‘yxatidagi rejadagi kartada oddiy foydalanuvchiga **«Suhbat hali boshlanmadi»** tugmasi (yoniga eslatma qo‘yish) chiqadi. Bossa **modal oyna** ochiladi: kitob, sana-vaqt, boshlanishigacha jonli timer va **«Orqaga»** tugmasi (Esc yoki fon ham yopadi).
- Admin kartasida **«Suhbatni boshlash»** tugmasi; u ham shu modalni ochadi va timer ostida «Suhbatni boshlash» tugmasi bor. Bosilganda `POST /api/v1/live/:id/start` (faqat admin, takror bosish zarar qilmaydi), so‘ng admin xonaga kiradi.
- Foydalanuvchining modali ochiq tursa, har 5 soniyada holatni tekshiradi: suhbat boshlangach modal «Suhbat boshlandi» + **«Kirish»** tugmasiga aylanadi.
- Hisoblagich qurilmaning soatiga tayanadi (boshlanish vaqti serverdan keladi); qurilma soati noto‘g‘ri bo‘lsa, shuncha farq qiladi.
- Test: `node tests/talk-countdown.mjs`; start endpointi `tests/api-v1.mjs` da.

## Suhbat xonasi ko‘rinishi

Jonli suhbat xonasi "Naqsh" tungi uslubida: sarlavhada kitob nomi va qatnashchilar soni, ostida holat chiplari (**LIVE**, **REC** + vaqt, ovoz holati: «Ovoz ulangan» / «Faqat izohlar»), admin uchun «Tugatish». So‘zlovchilar ixcham kartalarda (gapirayotganning atrofida yashil halqa), tinglovchilar ixcham ro‘yxatda, qo‘l ko‘targanlar alohida «Navbatda» kartasida. Pastda suzuvchi panel: Mikrofon, Kamera, Ekran ulashish, Izohlar, Chiqish; admin uchun ustida qo‘shimcha amallar (Qurilma, Yozib olish, Pauza). Izohlar va moderator oynalari o‘qish uchun qog‘oz rangida. Uslublar: `app/live-room.css`.

## Do'kon: kitoblarni admin paneldan boshqarish va chat

- **Profil → Do‘kon kitoblari** (faqat admin): barcha kitoblar ro‘yxati; «Yangi kitob qo‘shish» (muqova rasmi, nom, muallif, tavsif, janr, narx), qalam tugmasi — tahrirlash, narx maydoni — tezkor narx o‘zgartirish (Enter yoki maydondan chiqish bilan saqlanadi). Narx 0 — kitob do‘kondan olinadi. Kod orqali kitob qo‘shish shart emas.
- **Chat ilovaning ichida.** Do‘konning har sahifasida «Admin bilan chat» tugmasi, kitob sahifasida «Adminga yozish» (xabar o‘sha kitob haqida belgilanadi). Xaridor admindan yangi javob kelsa, tugmada son ko‘radi.
- Buyurtma berilganda to‘lov usuli so‘ralmaydi: buyurtma xaridorning chatiga «Buyurtma» xabari bo‘lib tushadi. Admin shu yerda hisob raqamni yuboradi, xaridor to‘lab, **chek rasmini** (JPG/PNG/WebP, 5 MB gacha) chatga tashlaydi. Chek rasmini faqat xaridorning o‘zi va admin ko‘radi.
- **Profil → Do‘kon chati** (faqat admin): har xaridorga bitta yozishma; buyurtmalar va kitob bo‘yicha savollar bir joyda, o‘qilmaganlar soni bilan. Admin har biriga alohida javob yozadi, rasm yuborishi mumkin.
- Yangilanish: ochiq chat har 4 soniyada, admin ro‘yxati har 8 soniyada o‘zi yangilanadi (WebSocket emas, oddiy so‘rov — qo‘shimcha server kerak emas).
- Migratsiya: `drizzle/0017_store_chat.sql` (yangi jadvallar, mavjud ma’lumotga tegmaydi) — server ishga tushganda o‘zi qo‘llanadi. Rasmlar `BIR_ILM_MEDIA_DIR/store-chat/` papkasida saqlanadi (zaxira nusxaga shu papkani ham qo‘shing).
- Test: `node tests/store-v1.mjs` (chat, o‘qilmaganlar, rasm ruxsatlari).

## Kitoblar ajratildi, xona dizayni, sozlamalar (oxirgi yangilanish)

- **Ikki xil kitob, aralashmaydi** (`books.kind`, migratsiya `0018_book_kind.sql`):
  - *Kutubxona/suhbat kitobi* — audio, haftaning kitobi, suhbat vaqti. Javon, bosh sahifa va suhbatlarda ko‘rinadi. Narx va janr yo‘q.
  - *Do‘kon mahsuloti* — o‘z muqovasi, tavsifi va narxi (**Profil → Sozlamalar → Do‘kon kitoblari**). Faqat do‘konda chiqadi; audio va «Haftaning kitobi» yo‘q.
- **Mavjud ma’lumotga ta’siri:** migratsiya audiosiz, narxi bor kitoblarni do‘kon mahsulotiga aylantiradi. **Audiosi bor** (kutubxona) kitoblarda narx 0 ga tushadi — ularni do‘konga **alohida mahsulot** qilib qo‘shing (muqova va tavsifni qayta yuklash kerak).
- **Sozlamalar** endi alohida ekran: profil tepasidagi tishli g‘ildirak tugmasi orqali ochiladi, orqaga tugmasi profilga qaytaradi. Profildagi «Sozlamalar» tabi olib tashlandi. Admin bo‘limlari (rollar, buyurtmalar, kitoblar, chat) ham shu ekranda.
- **Kamera va mikrofon** suhbat oynasidan olib tashlandi: **Sozlamalar → Kamera va mikrofon** da tanlanadi (shu brauzerda saqlanadi, suhbatda o‘zi qo‘llanadi).
- **Suhbat xonasi:** qatnashchilar gorizontal qatorda (kichik avatarlar, so‘zlovchi — tilla halqa, gapirayotgan — yashil); **kamerasi yoqiqlar** alohida kichik video qatorda; **qo‘l ko‘targanlar** tilla ramkali alohida qatorda (boshlovchida «So‘z berish») va sarlavhada soni; chat xonaning pastida kichik panel (Izohlar tugmasi yig‘adi). Telefonda kichraytirilgan panel dock ustida turadi.
- **Javon** yog‘och tokchaga o‘xshatildi; **Kutubxona** sarlavhasi ikki qatorga ajratildi; **Hamjamiyat** postlari alohida yumaloq kartalar; **profil tepasi** ekran tepasiga ulangan, pastki burchaklari yumaloq panel.
- Suhbat boshqaruv oynasida «Saqlash» va «O‘chirish» bitta qatorda.

## Ijtimoiy tarmoqlar va qisqa videolar

- **«Bizni kuzating»** bloki: Telegram, YouTube, Instagram, Facebook tugmalari (belgi + nom). Bosh sahifa oxirida, Sozlamalarda va PC pastki satrida chiqadi; havola yangi oynada ochiladi. Havolalar kodda emas — **Profil → Sozlamalar → Ijtimoiy tarmoqlar** (faqat admin): `@kanal` yoki to‘liq havola yoziladi, begona domen va xavfli sxemalar (masalan `javascript:`) rad etiladi, bo‘sh qoldirilgan tarmoq ko‘rinmaydi. API: `GET/PUT /api/v1/site/links`.
- **Qisqa videolar** (Gurung va bosh sahifa lentasi tepasida): YouTube Shorts / Instagram Reels / Facebook video **havolasi** qo‘shiladi, video serverga yuklanmaydi. Karta bosilganda ilova ichida platformaning o‘z pleyeri (iframe) ochiladi; YouTube `youtube-nocookie.com` orqali. Havolani faqat admin qo‘shadi/o‘chiradi («Havola qo‘shish» tugmasi). API: `/api/v1/site/videos`.
- **Cheklovlar (halol):** Instagram va Facebook pleyeri faqat *ochiq* postlarni ko‘rsatadi, ba’zan o‘z tizimiga kirishni taklif qilishi mumkin va ularning ishlashi shu kompaniyalarga bog‘liq; YouTube eng ishonchli. Ilova pleyer ochilmasa, pleyer tagidagi «…da ochish» havolasi bilan o‘tish mumkin. Agar Caddy/Nginx'da `Content-Security-Policy` yoki `X-Frame-Options` sarlavhalari qo‘yilgan bo‘lsa, `frame-src` ga `youtube-nocookie.com`, `instagram.com`, `facebook.com` qo‘shing (kodda bunday cheklov yo‘q).
- Migratsiya: `drizzle/0019_site_links_videos.sql`. Test: `node tests/site-v1.mjs`.

## PC'da audiokitob pleyeri

Javon (kutubxona) endi PC kengligida ham telefon maketidagi pleyer va yog‘och tokchani ko‘rsatadi (avval faqat ≤980 px da chiqardi, PC'da faqat katalog bor edi). Kitob pleyerida ijro, ±15 soniya, tezlik va uyqu taymeri ishlaydi.

## Post albomi: tartib va karusel

- **Joylashda tartib:** har bir rasmda raqam (1, 2, 3…) — postda ko‘rinish tartibi. Tartibni **sudrab** (kompyuterda) yoki rasm pastidagi katta **‹ ›** tugmalari bilan (telefonda) o‘zgartirasiz; × — olib tashlash. Tahrirlashda ham shu ishlaydi.
- **Postda karusel:** ikki va undan ko‘p rasm/video Instagram kabi karusel bo‘lib ko‘rinadi — barmoq bilan suriladi (kompyuterda ‹ › tugmalari va klaviatura strelkalari), tagida nuqtalar, yuqorida «2 / 10». Karusel nisbati birinchi rasmniki (4:5 dan 1.91:1 gacha). Rasm bosilsa, to‘liq ekranli ko‘ruvchi ochiladi. Bitta rasm/video avvalgidek katta ko‘rinadi.
- Bu o‘zgarish faqat interfeys: ma’lumotlar bazasi va API o‘zgarmagan, migratsiya yo‘q.

## Do'kon mahsulotlarini zaxiradan tiklash

`0018` migratsiyasi audiosi bor (kutubxona) kitoblarda narxni 0 ga tushiradi, shuning uchun do‘kon bo‘sh qolishi mumkin. Zaxiradagi narxi qo‘yilgan kitoblardan do‘konda **alohida mahsulot** yaratish (muqova nusxasi bilan):

```
set BIR_ILM_DB_PATH=C:\bir-ilm\data\bir-ilm.sqlite
set BIR_ILM_MEDIA_DIR=C:\bir-ilm\media
node scripts\restore-store-products.mjs C:\bir-ilm\backups\before-deploy-2026-10-03.sqlite
node scripts\restore-store-products.mjs C:\bir-ilm\backups\before-deploy-2026-10-03.sqlite --apply
```

Birinchi buyruq faqat nima yaratilishini ko‘rsatadi. Takror yurgizish xavfsiz (shu nomli mahsulot bor bo‘lsa, o‘tkazib yuboradi). Narx zaxiradagi son bilan olinadi (so‘m edi) — won bilan **Do‘kon kitoblari** da tuzating.

## Do'konga kitob qo'shish (admin)

Do‘konning o‘zida (Book Store) admin uchun **«Kitob qo‘shish»** tugmasi, kartalarda qalam (tahrirlash) va kitob sahifasida «Tahrirlash» bor. Oyna faqat do‘kon maydonlarini ko‘rsatadi: muqova, nom, muallif, tavsif, janr, narx (audio va «Haftaning kitobi» yo‘q). Kutubxona kitobi alohida: Javon → «Kitob qo‘shish». Shu yerning o‘zi Profil → Sozlamalar → Do‘kon kitoblari bilan bir xil ro‘yxatni boshqaradi.

## Do'kon: telefon, Telegram, tugmalar

- **Telefon** endi xalqaro raqamlarni qabul qiladi: `+998 90 123 45 67`, **Koreya `+82 10 1234 5678`** va mahalliy `010-1234-5678` (o‘zi `+821012345678` ga aylanadi). Boshqa davlat raqamlari ham o‘tadi (+ va 8–15 raqam).
- **Telegram (ixtiyoriy)** maydoni: `@nom` yoki `t.me/nom`; admin buyurtmada va chatdagi buyurtma xabarida ko‘radi (admin ro‘yxatida bosiladigan havola). Migratsiya: `drizzle/0020_order_telegram.sql` (bitta ustun qo‘shadi).
- **Yordamchi tugmalar:** katta AI banner va «Admin bilan chat» tugmasi o‘rniga ikkita yumaloq tugma — robot (AI yordamchi) va chat belgisi (yangi javob bo‘lsa, soni bilan). Ularni **sudrab** istalgan joyga qo‘yasiz (joy eslab qolinadi), shunda orqasidagi kitobni yopmaydi; bosish esa ochadi.
- **Qidiruv** tepaga chiqarildi; admin uchun uning yonida yumaloq «+» (kitob qo‘shish).
- **Kitob sahifasi:** «Savatga qo‘shish» katta tugma, yoniga faqat belgi bilan «Adminga yozish», «Tahrirlash» (admin) va yurak; muqova va tugmalar kartadan chiqib ketmaydi.
- Katalog va «Ko‘p baholangan» da kitob muqovalari kattaroq.

## Do'kon: tugmalar va matn (yangilanish)

- **AI (robot) va Adminga yozish** tugmalari endi **ustma-ust** va **har biri alohida** sudrab ko‘chiriladi (joyi alohida eslab qolinadi).
- **Orqaga** tugmasi hamma joyda bitta dumaloq belgi: kitob sahifasida, shuningdek chat, AI, savat va Kutubxonam bo‘limlarida (avval chatdan qaytib bo‘lmasdi). Buyurtma berish bo‘limidan orqaga — savatga.
- **Savatga qo‘shish** — faqat savatcha belgisi (yozuvsiz, dumaloq tilla tugma).
- **Kitob kartasi** ixchamlashtirildi (kichikroq sarlavha, narx va muqova).
- **Tavsif matni:** boshqa joydan (masalan AI'dan) ko‘chirilgan `##`, `**`, `- ` belgilari sarlavha, qalin matn va ro‘yxat bo‘lib chiroyli ko‘rsatiladi; kitob saqlanganda bu belgilar matndan olib tashlanadi. AI javoblari ham shunday ko‘rsatiladi.

## Do'kon bosh sahifasi: ixcham qidiruv qatori

Katta sarlavha («Har bir kitob — yangi imkoniyat») va janr chiplari qatori olib tashlandi. Tepada bitta qator: **qidiruv**, uning yonida **filtr** tugmasi (janr tanlash oynasi ochiladi; tanlangan janrda tugma rangi o‘zgaradi) va admin uchun kichik «+». Bo‘lim sarlavhalari va yordamchi tugmalar (AI, chat) kichraytirildi.

## Bitta buyruq bilan yangilash va qayta ishga tushirish

Serverda (cmd):

```
cd /d C:\bir-ilm\app
git pull
scripts\deploy.cmd
```

`deploy.cmd` ketma-ket bajaradi: zaxira nusxa → Site va Chat'ni to‘xtatish → `git pull` → `pnpm install` → `pnpm build` → **Site'ni, so‘ng Chat'ni qayta ishga tushirish** → health va port (8787, 8788) tekshiruvi. Xato bo‘lsa to‘xtaydi, sababini yozadi va saytni o‘chiq qoldirmaslik uchun xizmatlarni qayta ishga tushiradi. Fayl o‘zini vaqtinchalik nusxadan yurgizadi, shuning uchun `git pull` uni ish paytida buzmaydi.

Faqat qayta ishga tushirish kerak bo‘lsa (kod o‘zgarmagan): `scripts\restart.cmd` — to‘xtatadi, Site'ni, keyin Chat'ni ishga tushiradi, portlar va xizmat holatini ko‘rsatadi.

## Matn joylash (ChatGPT), sahifalar soni, muharrir

- **Matn joylashda `##`, `**`, `- ` belgilari endi chiqmaydi.** ChatGPT va boshqa joylardan ko‘chirilgan markdown post/maqola muharririda avtomatik sarlavha (`##` → sarlavha, `###` → kichik sarlavha), qalin (`**x**`), kursiv, ro‘yxat va iqtibosga aylanadi. Kitob tavsifi maydoniga joylanganda belgilar darrov olib tashlanadi (bandlar «• » bo‘lib qoladi), saqlashda ham tozalanadi. Oddiy matn va saytdan nusxalangan formatlangan matn avvalgidek ishlaydi.
- **Sahifalar soni** kitob muharririda kiritiladi (1–5000, avval hamma kitobda 320 deb qattiq yozilgan edi). O‘qish jarayoni va «N bet» shu sondan hisoblanadi. Eski kitoblarda 320 qoladi — kerak bo‘lsa tahrirlab o‘zgartiring.
- Do‘kon muharririda sarlavha va muqova rangi tanlovi olib tashlandi (muqova rasmi yuklanadi). Pastdagi «O‘chirish», «Bekor qilish», «Saqlash» bitta qatorda.
- **Yordamchi tugmalar:** AI — do‘ppi kiygan o‘zbekcha robot (krem doira, tilla hoshiya), chat — firuza gradient. Muharrir oynalari ustida emas, ostida turadi.
- Test: `node --experimental-strip-types tests/markdown-paste.mjs`.

## Do'kon: bir xil tugmalar va robot

- **AI tugmasi** — siz bergan robot rasmi (`public/assets/ai-robot.webp`, 7 KB, dumaloq). Rasmni almashtirish uchun shu faylni (192×192, webp) o‘zgartiring. Rasm huquqlari (litsenziya) sizning javobgarligingizda.
- **Bitta standart:** hamma dumaloq tugma (orqaga, janr filtri, «+», adminga yozish, kitob sahifasidagi chat/tahrirlash/yurak) — oq fon, yupqa hoshiya, to‘q ko‘k belgi, 38 px. Rangli faqat asosiy amal (savat, tilla) va AI (robot). O‘lcham bitta o‘zgaruvchida: `--zb-btn` (`app/store.css`).
- Qidiruv qatori ixchamlashtirildi (qidiruv 40 px, belgi va yozuvlar kichikroq).

## Gurung: lenta filtri

- "Barchasi / Obunalarim / E'lonlar / Shikoyatlar" tablar qatori ochiladigan filtr tugmasiga almashtirildi (`app/feed-filter.tsx`). Moderatorda "Shikoyatlar" va soni ko'rinadi.
- Postlardagi "tahrirlangan" yozuvi olib tashlandi.
- Serverga chiqarish: `cd /d C:\bir-ilm\app`, `git pull`, `scripts\deploy.cmd`.

## Ikki bosqichli himoya, shaxsiy ma'lumotlar, profil rasmlari

- Sozlamalardan "Hisob ID" va "Boshqa qurilmani ulash" olib tashlandi; kirish oynasidagi "kod bilan kirish" ham.
- **Ikki bosqichli himoya** (Sozlamalar → "Ikki bosqichli himoya"): foydalanuvchi 6–32 belgili kod qo'yadi. Email+parol, parolni tiklash, Google va Telegram bilan kirganda parol/akkauntdan keyin shu kod ham so'raladi; to'g'ri kodsiz sessiya ochilmaydi. Kod xesh (PBKDF2) ko'rinishida saqlanadi; 5 ta xato urinishdan keyin kirish urinishi bekor bo'ladi. Kodni almashtirish/o'chirish joriy kodni talab qiladi.
- **Shaxsiy ma'lumotlar** sahifasi: profil rasmi, orqa fon rasmi, ism va "o'zim haqimda". Rasmlar telefonda kichraytirilib yuboriladi; serverda `BIR_ILM_MEDIA_DIR\profile\` ga yoziladi. Google/Telegram bilan kirganda ularning rasmi (hali rasm qo'yilmagan bo'lsa) avtomatik avatar bo'ladi.
- Migratsiya `0021_two_factor_cover` birinchi so'rovda o'zi qo'llanadi.
- Serverga chiqarish: `cd /d C:\bir-ilm\app`, `git pull`, `scripts\deploy.cmd`.

## Gurung: ixcham sarlavha

- "Qisqa videolar" sarlavhasi, "Havola qo'shish" tugmasi, "Kitobxonlar davrasi" sarlavhasi, yangilash tugmasi va "(siz)" yozuvi olib tashlandi.
- Qisqa video havolalarini admin endi Sozlamalar → "Sayt havolalari" ichidagi "Qisqa videolar" bo'limidan qo'shadi va o'chiradi.

## Gurung: faqat rasm

- Gurungdagi "Qisqa videolar" qatori olib tashlandi (admin bo'limidagi video havolalari ham).
- Postlarga video yuklab bo'lmaydi: tanlash oynasi faqat rasm qabul qiladi, server ham videoni rad etadi (415). Avval joylangan video postlar ko'rinishda qoladi.

## Suhbat: yozuv, bitta qurilma, ekran ulashish, veb-ilova

- **Yozuv suhbatdan mustaqil.** Admin «Yozib olish» ni suhbat boshlangach xohlagan paytda bosadi va «Yozuvni to'xtatish» bilan to'xtatadi. «Tugatish» bosilsa, suhbat tugaydi (qatnashchilar chiqariladi), lekin yozayotgan adminning yozuvi to'xtamaydi — u yozuvni o'zi to'xtatguncha davom etadi.
- **Yozuv formati MP3** (128 kbit/s, mono). Avvalgi WebM/Opus fayllar ko'p pleyerlarda ochilmasdi va davomiyligi ko'rinmasdi; MP3 hamma qurilmada ochiladi. Eski WebM yozuvlar o'zgarmaydi.
- **Ovoz sifati:** suhbatdagi mikrofon 64 kbit/s (avval ~24 kbit/s) va bir kanalli, 48 kHz.
- **Bitta hisob — bitta qurilma:** hisob boshqa qurilmadan (yoki boshqa tabdan) suhbatga kirsa, yangisi qoladi, eskisi «Hisobingiz boshqa qurilmadan kirdi» xabari bilan chiqariladi.
- **Izohlar paneli** avvalgi joyiga qaytdi: yopiq turadi, «Izohlar» tugmasi bilan ochiladi.
- **Ekran ulashish (taqdimot):** faqat kompyuterda ishlaydi (telefon brauzerlari qo'llamaydi — endi shu haqda xabar chiqadi). Ovozsiz variantga o'tish va 25 soniyalik kutish qo'shildi. **LiveKit serveri yangi bo'lishi kerak** (sinov 1.9.11 da o'tdi; 1.8.x bilan ulanish tuzilishi buzildi). Versiyani tekshirish: `livekit-server.exe --version`.
- **Veb-ilova (PWA):** sayt Chrome/Edge'da «O'rnatish», Safari'da «Bosh ekranga qo'shish» orqali ilova kabi o'rnatiladi (belgi PNG, service worker keshlamaydi). Play Market versiyasi chiqquncha shu yo'l.
- Serverga chiqarish: `cd /d C:\bir-ilm\app`, `git pull`, `scripts\deploy.cmd` (suhbat serveri ham qayta ishga tushishi kerak).

## Filtr tugmalari, sana-vaqt tanlagich, kitob muharriri

- Gurung filtri ochiladigan ro'yxat o'rniga bitta qatordagi kichik tugmalar; yozish paneli va birinchi post orasiga bo'shliq qo'shildi.
- Sana va vaqt endi maxsus tanlagich: avval kalendar (sana) → «Keyingi» → soat va daqiqa (24 soatlik) → «Saqlash». Kitob muharriri, suhbatni boshqarish va yangi suhbat e'lon qilish oynalarida.
- Kitob muharriri: rang tanlash, ikkinchi sarlavha maydoni va «Kitobni tahrirlash» yozuvi olib tashlandi; audio va sahifalar soni bir qatorda; pastdagi uch tugma bir xil o'lchamda, hover faqat sichqoncha ustida.

## Ro'yxatdan o'tmaganlar

- Shaxsiy sahifada ro'yxatdan o'tmagan foydalanuvchiga faqat kirish/ro'yxatdan o'tish oynasi ko'rinadi (statistika, tablar, sozlamalar yo'q).
- Eski mehmon akkauntlarini o'chirish: `scripts\prune-unregistered.mjs`. Email, Google yoki Telegram bog'lanmagan va admin/moderator bo'lmagan akkauntlarni (ularning postlari bilan) o'chiradi. Avval sanaydi: `node scripts\prune-unregistered.mjs`, so'ng `--apply`. Zaxira: `scripts\backup-db.mjs`.

## Viktorinalar (admin boshqaradi)

- Viktorinalar endi bazada va admin/moderator tomonidan boshqariladi: kitobga bog'lanadi (muqova viktorinada ko'rinadi) yoki "Kitobsiz".
- **Qo'shish va tahrirlash:** Bosh sahifa → Viktorinalar → «Viktorina qo'shish» (har qatorda qalam belgisi bilan tahrirlash). Admin uchun yana: Profil → Sozlamalar → «Viktorinalar». Muharrirda kitob, nom, savollar, 2–6 variant va to'g'ri javobni (yashil doira) belgilash, savollar tartibi, o'chirish bor.
- **Eski 3 ta ichki viktorina** («Atom odatlar», «O'tkan kunlar», «Alkimyogar») bazaga o'tkazilmagan. Kerak bo'lsa (deploydan keyin, saytni bir marta ochgach): `set BIR_ILM_DB_PATH=C:\bir-ilm\data\bir-ilm.sqlite`, `node --experimental-strip-types scripts\import-demo-quizzes.mjs --apply`. Keyin ularni kitobga bog'lab tahrirlash mumkin.
- Migratsiya `0022_quizzes` birinchi so'rovda o'zi qo'llanadi.

## Jonli viktorina: vaqtlar, kirish kodlari

- Har bir viktorinaga bir necha **jonli vaqt** qo'shish mumkin; **har bir vaqtning o'z 6 xonali kirish kodi** bor. Qo'shish: Viktorinani tahrirlash (qalam) → pastda «Jonli o'tkazish vaqtlari» → vaqt tanlang → «Vaqt va kod qo'shish». Kod shu yerda va jonli viktorina kartasida (faqat admin/moderatorga) ko'rinadi; ustiga bosilsa nusxalanadi.
- Oddiy foydalanuvchi: Viktorinalar → «Jonli» kartasida eng yaqin vaqt; boshlanishidan 10 daqiqa oldin «Qo'shilish» tugmasi ochiladi (3 soat ochiq turadi) va u viktorinaga olib boradi. Kod bilan ham kirish mumkin: kod hali ochilmagan yoki o'tib ketgan bo'lsa, aniq xabar chiqadi.
- «Ishtirokchilar» — shu vaqt uchun natija topshirgan kirgan foydalanuvchilar soni (bir kishi ikki marta o'ynasa ham bitta).
- Viktorina har o'ynalganda **savollar tartibi aralashadi**.
- Kutubxona (Javon) ekraniga orqaga qaytish tugmasi qo'shildi.
- Migratsiya `0023_quiz_sessions` birinchi so'rovda o'zi qo'llanadi.

## Adminga buyurtma xabari; hafta kitobi kartasi

- **Yangi buyurtma kelganda adminga xabar:** (1) ilovada: yuqoridagi profil rasmida qizil nishon (yangi buyurtmalar + o'qilmagan do'kon chatlari), kelganda xabar ("Yangi buyurtma keldi!"), Sozlamalardagi "Do'kon buyurtmalari" va "Do'kon chati" qatorlarida "N ta yangi"; (2) tashqarida: admin Telegram bilan kirgan bo'lsa — bot orqali Telegram xabari, emaili bo'lsa — email (`TELEGRAM_BOT_TOKEN` va `RESEND_API_KEY` + `MAIL_FROM` sozlangan bo'lsa; sozlanmagan kanal jim o'tkazib yuboriladi). Xabarda raqam, ism, telefon, Telegram, manzil, kitoblar va jami summa bor.
- Hafta kitobi tanlanmaganda admin ko'radigan kartada uzun kitob nomi kartani o'ngga cho'zib yubormaydi.
