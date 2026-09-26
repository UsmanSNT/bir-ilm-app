# Bir Ilm — arxitektura

Maqsad: **bitta loyiha, bitta backend, bitta ma'lumotlar bazasi, bitta frontend**,
va u web, Android hamda iOS da bir xil ma'lumot bilan ishlaydi.

## 1. Texnologiyalar

| Qatlam | Nima ishlatiladi |
| --- | --- |
| Frontend | Next.js 16 (vinext / Vite RSC), React 19, Tailwind 4 |
| Backend | Next.js route handler'lari, `runtime = "edge"` |
| Ishga tushish muhiti | Cloudflare Workers (Wrangler) |
| Baza | Cloudflare D1 (SQLite) |
| ORM | Drizzle ORM + drizzle-kit migratsiyalari |
| Validatsiya | zod (server va mijozda bir xil sxema) |

## 2. Qatlamlar

```
shared/contract/        Umumiy shartnoma: tiplar + zod sxemalari
        |               (server ham, mijoz ham shu bitta manbadan foydalanadi)
        v
server/
  http/                 CORS, xato konverti, route o'rovchisi (defineRoute)
  auth/                 Yagona identifikatsiya (cookie yoki Bearer)
  db/                   D1 ulanishi (Drizzle), tashqaridan uzatish mumkin
  services/             DOMEN MANTIQI — HTTP va platformadan mustaqil
        ^
        |
app/api/v1/             Yupqa REST route'lar: faqat kirish/chiqishni ulaydi
        ^
        |
lib/api/                Tipli mijoz — web, Android va iOS shuni ishlatadi
        ^
        |
app/*.tsx               UI (bitta frontend, mobil-responsiv)
```

Asosiy qoida: **domen mantiqi `server/services/` da yashaydi.** Route'lar ichida
biznes mantiq yozilmaydi, shuning uchun ertaga REST yonida GraphQL yoki WebSocket
qo'shilsa ham bir xil mantiq qayta ishlatiladi.

## 3. Nega bitta backend uchta platformaga yetadi

### 3.1 Identifikatsiya — bitta token, ikkita tashuvchi

Muammo: web cookie bilan ishlaydi, native ilova esa cookie'ni ishonchli
tashiy olmaydi (`capacitor://localhost` origin, WebView cookie jar farqlari).

Yechim (`server/auth/identity.ts`):

```
xom token (32 bayt) ──┬── Cookie: bir_reader=<token>       → web
                      └── Authorization: Bearer <token>     → Android / iOS
                              |
                              v
                   userId = "reader_" + sha256(token)
```

Ikkala yo'l ham **aynan bir xil** `userId` beradi. Foydalanuvchi telefonda
yozgan postini webda ko'radi va aksincha. Bu `tests/api-v1.mjs` da alohida
tekshiriladi.

`userId` **hech qachon** mijozdan qabul qilinmaydi — u serverda tokendan
hisoblanadi.

### 3.2 CORS

`server/http/cors.ts` native qobiqlarning originlariga ruxsat beradi
(`capacitor://localhost`, `ionic://localhost`, `localhost`). Qo'shimcha
domenlar `ALLOWED_ORIGINS` muhit o'zgaruvchisi orqali (vergul bilan) beriladi.

O'zgartiruvchi so'rovlarda (`POST`, `PATCH`, `PUT`, `DELETE`) origin shu
ro'yxatdan bo'lmasa, so'rov `403` bilan rad etiladi — begona sayt foydalanuvchi
cookie'si bilan yozuv qila olmaydi.

### 3.3 Katalog bazada

Kitoblar ro'yxati `books` jadvalidan o'qiladi. Ya'ni katalogni yangilash uchun
App Store / Play Store tekshiruvini kutish shart emas. Baza bo'sh bo'lsa
`app/app-data.ts` dagi boshlang'ich ro'yxat qaytariladi.

### 3.4 Kursorli sahifalash

Lenta `(created_at, id)` juftligi bo'yicha varaqlanadi. Bu mobil ilovadagi
cheksiz varaqlash uchun to'g'ri ishlaydi: sahifalar orasida post takrorlanmaydi
va tushib qolmaydi (`tests/api-v1.mjs` shuni tekshiradi).

## 4. API

Barcha javoblar bitta konvertda:

```json
{ "ok": true,  "data": { ... } }
{ "ok": false, "error": { "code": "validation_failed", "message": "...", "fields": { "book": ["..."] } } }
```

`code` — barqaror mashina o'qiydigan kod (`shared/contract/common.ts`).
Mobil ilova matnni emas, kodni tekshiradi, shuning uchun xabar matnini
o'zgartirish ilovani buzmaydi.

| Metod | Yo'l | Vazifasi |
| --- | --- | --- |
| `GET` | `/api/v1/health` | Server va baza holati (bazasiz ham javob beradi) |
| `POST` | `/api/v1/auth/session` | Sessiya ochish (native `wantToken: true` yuboradi) |
| `GET` | `/api/v1/auth/session` | Joriy foydalanuvchi |
| `GET` | `/api/v1/feed` | Lenta: `scope=all\|following\|mine\|author`, `cursor`, `limit` |
| `POST` | `/api/v1/posts` | Post yaratish |
| `DELETE` | `/api/v1/posts/{id}` | O'z postini o'chirish |
| `POST` | `/api/v1/posts/{id}/replies` | Izoh qoldirish |
| `GET` / `PATCH` | `/api/v1/profile` | Profilni o'qish / tahrirlash |
| `GET` | `/api/v1/readers` | Kitobxonlar ro'yxati |
| `POST` | `/api/v1/follows` | Obuna bo'lish / bekor qilish |
| `GET` / `POST` | `/api/v1/focus` | Fokus seanslari (idempotent) |
| `GET` | `/api/v1/books` | Kitoblar katalogi |
| `GET` / `POST` | `/api/v1/books/{id}/comments` | Kitob muhokamasi |
| `GET` / `PUT` | `/api/v1/progress` | O'qish jarayoni |
| `GET` | `/api/v1/leaderboard` | Reyting |
| `POST` | `/api/v1/community/posts` | Formatlangan post yoki maqola (faqat ro'yxatdan o'tganlar) |
| `PUT` | `/api/v1/community/posts/{id}` | O'z postini tahrirlash |
| `POST` | `/api/v1/community/reactions` | Reaksiya: qo'yish / almashtirish / olib tashlash |
| `POST` | `/api/v1/media` | Rasm/video yuklashni boshlash |
| `GET` / `PUT` | `/api/v1/media/{id}` | Bo'laklab yuklash (`X-Upload-Offset`) va davom ettirish |
| `GET` | `/media/posts/{fayl}` | Post rasmi/videosi (Range bilan) |
| `GET` | `/p/{id}` | Ulashiladigan havola: Open Graph preview, so'ng `/?post={id}` |

### Community

- **Yozish faqat ro'yxatdan o'tganlarga** (Google/Telegram bog'langan yoki admin/moderator):
  post, izoh, reaksiya, fayl yuklash. Mehmon faqat o'qiydi — server `401 unauthorized` qaytaradi.
- **Matn HTML emas** — bloklar (JSON) sifatida saqlanadi: `shared/contract/community.ts`
  (paragraf, sarlavha, iqtibos, kod, ro'yxat, rasm/video, ajratgich; belgilar: qalin, kursiv,
  tagiga/ustidan chizilgan, monospace, spoiler, havola). Server zod bilan tekshiradi,
  mijoz React elementlariga aylantiradi — XSS imkonsiz. `body` ustunida matnli nusxa
  (spoiler ▒ bilan yashirilgan) saqlanadi: e'lonlar, qidiruv va eski mijozlar uchun.
- **Fayllar**: `BIR_ILM_MEDIA_DIR/posts/<uuid>.<ext>`, turi sehrli baytlar bo'yicha tekshiriladi.
  24 soatda postga bog'lanmagan yuklamalar keyingi yuklashda tozalanadi; post o'chsa fayllar ham o'chadi.
- Lentada (`/api/social`) maqolaning faqat boshi keladi, to'liq matn `/api/social?post=<id>` bilan.

## 5. Yangi endpoint qanday qo'shiladi

1. `shared/contract/` da zod sxemasi va javob tipini yozing.
2. `server/services/` da domen funksiyasini yozing (HTTP haqida bilmaydi).
3. `app/api/v1/.../route.ts` da `defineRoute` bilan ulang:

```ts
export const POST = defineRoute<CreatePostInput, Post>({
  schema: createPostSchema,
  source: "body",
  status: 201,
  handler: ({ db, identity, input }) => createPost(db, identity.userId, input),
});

export const OPTIONS = POST; // CORS preflight
```

4. `lib/api/client.ts` ga metod qo'shing.
5. `tests/api-v1.mjs` ga tekshiruv qo'shing.

`defineRoute` CORS, preflight, identifikatsiya, CSRF tekshiruvi, validatsiya
va xatolarni o'girishni o'zi bajaradi.

## 6. Mijoz (bitta frontend, uchta platforma)

```ts
import { apiClient } from "@/lib/api";

const api = apiClient();
await api.ensureSession();
const feed = await api.feed({ scope: "following", limit: 20 });
```

Platforma `lib/api/config.ts` da avtomatik aniqlanadi (`window.Capacitor`).
Native uchun `NEXT_PUBLIC_API_BASE_URL` da server manzili ko'rsatiladi:

```
NEXT_PUBLIC_API_BASE_URL=https://bir-ilm.uz
```

Web uchun bu o'zgaruvchi kerak emas — so'rov o'z originiga ketadi.

### Tokenni saqlash

Standart holatda native mijoz tokenni `localStorage` da saqlaydi. Ishlab
chiqarishda uni Keychain (iOS) / EncryptedSharedPreferences (Android) ga
almashtirish tavsiya etiladi — `TokenStorage` interfeysi o'zgarmaydi:

```ts
apiClient({ storage: keychainStorage() });
```

## 7. Android va iOS

Tanlangan yo'l — **Capacitor**: bitta web build native qobiqqa o'raladi,
shuning uchun mobil-responsiv UI ilovada **hech o'zgarishsiz** chiqadi.
React Native tanlansa, frontend ikkiga bo'linar edi — bu talabga zid.

To'liq qo'llanma: [MOBILE.md](./MOBILE.md).

Tayyor:

- [x] CORS native originlar uchun ochiq
- [x] Bearer token bilan identifikatsiya (cookie'ga qo'shimcha)
- [x] To'liq manzilni sozlash (`NEXT_PUBLIC_API_BASE_URL`)
- [x] Kursorli sahifalash
- [x] Katalog bazadan (ilova yangilanishisiz o'zgartiriladi)
- [x] Barqaror xato kodlari
- [x] `/health` — ilova ishga tushganda serverni tekshiradi
- [x] Capacitor o'rnatildi, `android/` va `ios/` loyihalari yaratildi
- [x] Statik qobiq build'i (`npm run build:mobile` → `mobile/dist`)
- [x] `safe-area-inset-*`, tap highlight va klaviatura tuzatishlari
- [x] Android "orqaga" tugmasi uchun `bir-ilm:back` hodisasi
- [x] Eski API ham native qobiqdan ishlaydi (UI o'zgartirilmasdan)

Qolgan ishlar `MOBILE.md` ning 9-bo'limida.

### Nega `output: "export"` emas

Avval vinext'ning statik eksporti sinaldi, lekin u `/` sahifasini "dynamic"
deb tasniflab, `index.html` yaratmadi (vinext 1.0.0-beta.5 statik tahlilga
tayanadi va buni o'zi ham ogohlantiradi). Shuning uchun mobil qobiq alohida,
oddiy Vite build'i sifatida quriladi — natija bashorat qilinadigan va
framework'ning beta xatti-harakatiga bog'liq emas. UI kodi baribir bitta.

## 8. Serverga joylashtirish

1. Migratsiyalarni qo'llash (tartib bilan, faqat qo'llanmaganlarini):

```bash
npx wrangler d1 execute DB --remote --file drizzle/0003_daffy_lethal_legion.sql
```

2. Muhit o'zgaruvchilari:

| O'zgaruvchi | Kimga kerak | Izoh |
| --- | --- | --- |
| `ALLOWED_ORIGINS` | Server | Qo'shimcha ruxsat etilgan originlar, vergul bilan |
| `NEXT_PUBLIC_API_BASE_URL` | Native build | Backend manzili |

3. `d1` binding nomi `DB` bo'lishi kerak (`.openai/hosting.json`).

## 9. Eski API

`/api/app-state` va `/api/social` hozircha ishlashda davom etadi, chunki joriy
UI ularga bog'langan. Ular `v1` bilan **bir xil bazani** ishlatadi.

Mobil ilova uchun ularga ikkita moslik qo'shildi (javob shakli o'zgarmadi):

- `/api/social` endi cookie bilan birga `Authorization: Bearer` tokenni ham
  qabul qiladi va ikkalasi bir xil `reader_…` beradi;
- ikkalasida ham CORS va `OPTIONS` preflight bor, shuning uchun native
  qobiqdan chaqirish mumkin. Begona originlar hamon rad etiladi.

Farqlari — nega `v1` ga o'tish kerak:

| | Eski | `v1` |
| --- | --- | --- |
| Muallif | `/api/app-state` mijoz yuborgan `userId` ga ishonadi | Faqat serverdagi sessiyadan |
| Reyting balli | Mijoz yuboradi | Serverda hisoblanadi |
| Mobil | Cookie majburiy, CORS yo'q | Bearer + CORS |
| Sahifalash | `rowid` bo'yicha | Barqaror kursor |
| Xatolar | Har xil shakl | Bitta konvert va kod |

Ko'chirish tartibi: UI ekranlari birma-bir `lib/api` klientiga o'tkaziladi,
hammasi o'tgach eski route'lar o'chiriladi.

## 10. Testlar

```bash
npm test
```

`tests/api-v1.mjs` route funksiyalarini to'g'ridan-to'g'ri chaqiradi — server,
port yoki build kerak emas. Baza sifatida `.sites-runtime/node-preview.sqlite`
ishlatiladi va barcha migratsiyalar avtomatik qo'llanadi. Test o'zidan keyin
yaratgan foydalanuvchilarni tozalaydi.
