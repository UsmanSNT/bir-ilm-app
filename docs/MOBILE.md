# Android va iOS ilovasi (Capacitor)

Bitta kod bazasi, bitta UI, bitta backend. Android va iOS ilovasi **aynan
o'sha** `app/page.tsx` ni ko'rsatadi — mobil ko'rinish ilovaga hech qanday
o'zgarishsiz chiqadi.

## 1. Qanday ishlaydi

```
app/page.tsx  ──┬── vinext build ──→ Cloudflare Worker ──→ web (birilm.uz)
   (bitta UI)   │
                └── vite.mobile.config.ts ──→ mobile/dist ──┬─→ android/  (APK / AAB)
                                              (statik)      └─→ ios/      (IPA)
                                                              │
                                                              └─→ HTTPS ──→ o'sha backend
                                                                            /api/v1
```

Native ilova ichida server yo'q: u `mobile/dist` dagi statik fayllarni
telefon xotirasidan ko'taradi va ma'lumotni internetdagi serverdan oladi.
Shu sababli web, Android va iOS **bitta ma'lumotlar bazasi** bilan ishlaydi.

## 2. Papkalar

| Yo'l | Nima |
| --- | --- |
| `mobile/index.html` | Native qobiqning HTML sahifasi (`app/layout.tsx` o'rnida) |
| `mobile/main.tsx` | Kirish nuqtasi: `app/page.tsx` ni render qiladi |
| `mobile/entry.css` | `app/layout.tsx` dagi AYNAN o'sha CSS ro'yxati |
| `mobile/native.css` | Faqat telefon uchun tuzatishlar (safe-area, tap highlight) |
| `mobile/native-shell.ts` | Status bar, splash, Android "orqaga" tugmasi |
| `mobile/native-storage.ts` | Tokenni qurilmada saqlash |
| `mobile/api-bridge.ts` | Nisbiy `/api/...` so'rovlarini serverga yo'naltiradi |
| `mobile/shims/next-image.tsx` | `next/image` o'rnini bosuvchi |
| `vite.mobile.config.ts` | Mobil build sozlamasi |
| `capacitor.config.ts` | Ilova nomi, ID, plaginlar |
| `android/`, `ios/` | Native loyihalar (Capacitor yaratgan) |

`vite.config.ts` va `next.config.ts` ga TEGILMAGAN — web build avvalgidek.

## 3. Ishga tushirish

### Build va sinxronlash

```bash
NEXT_PUBLIC_API_BASE_URL=https://bir-ilm.uz npm run build:mobile
npm run cap:sync
```

`build:mobile` — `mobile/dist` ni yasaydi, `cap:sync` — uni `android/` va
`ios/` ichiga ko'chiradi va plaginlarni yangilaydi.

> `NEXT_PUBLIC_API_BASE_URL` **majburiy**. U bo'lmasa build to'xtaydi, chunki
> ilova qaysi serverga murojaat qilishini bilmaydi.

### Android

```bash
npm run cap:android
```

Android Studio ochiladi. U yerdan qurilmaga o'rnatish yoki AAB yig'ish mumkin.
Kerak: Android Studio va JDK 21. Ilova ID: `uz.birilm.app`, minSdk 24.

### iOS

```bash
npm run cap:ios
```

Xcode ochiladi. **iOS ilovasini yig'ish faqat macOS'da mumkin** — loyiha
papkasi Windows'da ham yaratildi, lekin qurish uchun Mac kerak bo'ladi.

### Brauzerda tekshirish

```bash
npm run dev:mobile
```

Native plaginlarsiz, lekin qobiq bilan bir xil bundle — tez tekshirish uchun.

## 4. Server tomonida nima qilish kerak

Serverga joylashtirgandan keyin ilova domenini CORS ro'yxatiga qo'shish
shart emas: `capacitor://localhost`, `https://localhost` va `http://localhost`
allaqachon ruxsat etilgan (`server/http/cors.ts`). Boshqa domen kerak bo'lsa:

```
ALLOWED_ORIGINS=https://app.bir-ilm.uz,https://admin.bir-ilm.uz
```

## 5. Identifikatsiya

Webda cookie ishlaydi, lekin native ilovada cookie **cross-site yuborilmaydi**.
Shuning uchun ilova tokenni o'zi saqlaydi va har so'rovga qo'shadi:

```
POST /api/v1/auth/session   { platform: "android", wantToken: true }
   → { token: "…" }   → Capacitor Preferences da saqlanadi
GET  /api/social            Authorization: Bearer <token>
```

Ikkala usul ham bir xil `reader_<sha256(token)>` beradi — ya'ni foydalanuvchi
telefonda yozgan postini webda ham ko'radi. Buni `tests/api-v1.mjs` tekshiradi.

### Eski API bilan moslik

Mavjud UI hali `/api/social` va `/api/app-state` ni chaqiradi. Ular ham endi
Bearer tokenni va native originlarni qabul qiladi, shuning uchun **UI kodini
o'zgartirmasdan** ilova ishlaydi. `mobile/api-bridge.ts` nisbiy manzillarni
serverga yo'naltiradi va tokenni qo'shadi.

UI `lib/api` klientiga o'tkazilgandan keyin bu ko'prik keraksiz bo'ladi —
klient to'liq manzilni o'zi quradi.

## 6. Telefon ekraniga moslashish

`mobile/native.css` quyidagilarni hal qiladi:

- **Safe area** — "tirqish" (notch) va pastki chiziq ostida kontent qolmaydi
  (`env(safe-area-inset-*)`).
- **Tap highlight** — bosganda ko'k quti chiqmaydi.
- **Matn tanlash** — tugma va navigatsiyada uzoq bosish menyu ochmaydi.
- **Kirish maydonlari** — `font-size: max(16px, 1em)`, aks holda iOS fokusda
  sahifani kattalashtirib yuboradi.

UI dizayni bu yerda o'zgartirilmaydi. Mobil ko'rinish `app/*.css` da qanday
bo'lsa, ilovada ham shunday.

## 7. Android "orqaga" tugmasi

Qobiq `bir-ilm:back` hodisasini tarqatadi. UI uni tinglab, o'z ichki
navigatsiyasini orqaga qaytarishi mumkin:

```ts
useEffect(() => {
  const onBack = (event: Event) => {
    if (screen !== "home") {
      event.preventDefault();   // ilovadan chiqishni to'xtatadi
      setScreen("home");
    }
  };
  window.addEventListener("bir-ilm:back", onBack);
  return () => window.removeEventListener("bir-ilm:back", onBack);
}, [screen]);
```

Hech kim ushlamasa: bosh ekranda ikki marta bosilganda ilova yopiladi
(tasodifan chiqib ketmaslik uchun).

## 8. Ikonka va splash ekran

`@capacitor/assets` o'rnatilgan. Manba rasmlarni tayyorlab:

```
assets/icon.png          1024×1024
assets/splash.png        2732×2732
```

so'ng:

```bash
npx capacitor-assets generate
```

## 9. Qolgan ishlar

- [ ] Ikonka va splash rasmlarini tayyorlash (`assets/icon.png`, `assets/splash.png`)
- [ ] Android imzo kaliti (keystore) va Play Console hisobi
- [ ] Apple Developer hisobi va iOS'da yig'ish (macOS kerak)
- [ ] UI'da `bir-ilm:back` hodisasini ushlash
- [ ] UI'ni `lib/api` klientiga ko'chirish (keyin `api-bridge.ts` olib tashlanadi)
- [ ] Tokenni Keychain / EncryptedSharedPreferences ga o'tkazish
