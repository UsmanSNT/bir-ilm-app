/**
 * `/api/v1` uchun integratsion testlar.
 *
 * Route funksiyalari TO'G'RIDAN-TO'G'RI chaqiriladi, shuning uchun test ishga
 * tushirilgan server, port yoki build talab qilmaydi va lokal D1 nusxasida
 * (`.sites-runtime/node-preview.sqlite`) barcha migratsiyalar bilan ishlaydi.
 *
 * Eng muhim tekshiruv: AYNAN bir token web cookie orqali ham, mobil
 * `Authorization: Bearer` orqali ham BIR XIL foydalanuvchini beradi. Bu —
 * "bitta backend, bitta baza, uchta platforma" va'dasining isboti.
 *
 * Ishga tushirish: `node tests/api-v1.mjs`
 */
import assert from "node:assert/strict";
import { statSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

const projectRoot = new URL("../", import.meta.url);
const d1Module = new URL("scripts/local-d1.mjs", projectRoot).href;

/** Bundler kengaytmasiz import qiladi; Node uchun uni o'zimiz topamiz. */
function isFile(url) {
  try {
    return statSync(fileURLToPath(url)).isFile();
  } catch {
    return false;
  }
}

function withExtension(url) {
  if (isFile(url)) return url;

  for (const candidate of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const attempt = `${url}${candidate}`;
    if (isFile(attempt)) return attempt;
  }

  return url;
}

// Loyihada `@/*` aliasi va Worker moduli ishlatiladi; Node uchun ularni
// preview serveri qiladigan tarzda xaritalaymiz.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "cloudflare:workers") return { url: d1Module, shortCircuit: true };

    if (specifier.startsWith("@/")) {
      return next(withExtension(new URL(specifier.slice(2), projectRoot).href), context);
    }

    if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      return next(withExtension(new URL(specifier, context.parentURL).href), context);
    }

    return next(specifier, context);
  },
});

const { sqlite } = await import(d1Module);

const load = (path) => import(new URL(path, projectRoot).href);

const session = await load("app/api/v1/auth/session/route.ts");
const feed = await load("app/api/v1/feed/route.ts");
const posts = await load("app/api/v1/posts/route.ts");
const post = await load("app/api/v1/posts/[id]/route.ts");
const replies = await load("app/api/v1/posts/[id]/replies/route.ts");
const profile = await load("app/api/v1/profile/route.ts");
const follows = await load("app/api/v1/follows/route.ts");
const focus = await load("app/api/v1/focus/route.ts");
const books = await load("app/api/v1/books/route.ts");
const progress = await load("app/api/v1/progress/route.ts");
const leaderboard = await load("app/api/v1/leaderboard/route.ts");
const health = await load("app/api/v1/health/route.ts");
const live = await load("app/api/v1/live/route.ts");
const adminUsers = await load("app/api/v1/admin/users/route.ts");
const adminUser = await load("app/api/v1/admin/users/[id]/route.ts");

// Eski (v1 dan oldingi) route'lar — mobil qobiq ular bilan ham ishlashi kerak.
const legacySocial = await load("app/api/social/route.ts");
const legacyAppState = await load("app/api/app-state/route.ts");

const ORIGIN = "http://127.0.0.1:8787";
const createdUsers = [];
const createdBooks = [];

function request(path, { method = "GET", body, headers = {} } = {}) {
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Route'ni chaqiradi, konvertni ochadi va kutilgan kodni tekshiradi. */
async function call(handler, path, { params, expect = 200, ...options } = {}) {
  const response = await handler(
    request(path, options),
    params ? { params: Promise.resolve(params) } : undefined,
  );

  const payload = await response.json();
  assert.equal(
    response.status,
    expect,
    `${options.method ?? "GET"} ${path} → ${response.status}: ${JSON.stringify(payload)}`,
  );

  return { response, payload };
}

/** Web mijoz: cookie bilan, xuddi brauzerdek. */
async function webClient() {
  const { response, payload } = await call(session.POST, "/api/v1/auth/session", {
    method: "POST",
    body: { platform: "web", wantToken: false },
    headers: { Origin: ORIGIN },
    expect: 201,
  });

  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie, "Web sessiyasi cookie o'rnatishi kerak");
  assert.match(setCookie, /HttpOnly/, "Cookie HttpOnly bo'lishi kerak");
  assert.equal(payload.data.token, null, "Web tokenni javob tanasida olmasligi kerak");

  const cookie = setCookie.split(";")[0];
  createdUsers.push(payload.data.userId);

  return {
    userId: payload.data.userId,
    cookie,
    call: (handler, path, options = {}) =>
      call(handler, path, {
        ...options,
        headers: { Cookie: cookie, Origin: ORIGIN, ...options.headers },
      }),
  };
}

/** Native mijoz: token bilan, xuddi Android/iOS ilovasidek. */
async function nativeClient(platform) {
  const { response, payload } = await call(session.POST, "/api/v1/auth/session", {
    method: "POST",
    body: { platform, wantToken: true },
    headers: { Origin: "capacitor://localhost", "X-Client-Platform": platform },
    expect: 201,
  });

  assert.ok(payload.data.token, "Native mijoz tokenni javobda olishi kerak");
  assert.match(payload.data.token, /^[a-f0-9]{64}$/);
  assert.equal(
    response.headers.get("set-cookie"),
    null,
    "Native mijozga cookie yuborilmasligi kerak",
  );

  createdUsers.push(payload.data.userId);

  return {
    userId: payload.data.userId,
    token: payload.data.token,
    call: (handler, path, options = {}) =>
      call(handler, path, {
        ...options,
        headers: {
          Authorization: `Bearer ${payload.data.token}`,
          Origin: "capacitor://localhost",
          "X-Client-Platform": platform,
          ...options.headers,
        },
      }),
  };
}

try {
  // --- 1. Sog'liq ---------------------------------------------------------
  {
    const { payload } = await call(health.GET, "/api/v1/health");
    assert.equal(payload.ok, true);
    assert.equal(payload.data.version, "v1");
    assert.equal(payload.data.database, "connected");
    console.log("PASS: sog'liq tekshiruvi.");
  }

  // --- 2. Platformalar aro bir xil shaxs ----------------------------------
  {
    const android = await nativeClient("android");

    // AYNAN o'sha tokenni cookie sifatida yuboramiz — web tashuvchisi.
    const { payload: viaCookie } = await call(session.GET, "/api/v1/auth/session", {
      headers: { Cookie: `bir_reader=${android.token}` },
    });

    assert.equal(
      viaCookie.data.userId,
      android.userId,
      "Bir token ikki tashuvchida ham bir xil foydalanuvchi berishi kerak",
    );

    await android.call(posts.POST, "/api/v1/posts", {
      method: "POST",
      body: { book: "Sinov kitobi", body: "Telefonda yozilgan fikr." },
      expect: 201,
    });

    const { payload: webFeed } = await call(feed.GET, "/api/v1/feed?scope=mine", {
      headers: { Cookie: `bir_reader=${android.token}` },
    });

    assert.equal(webFeed.data.items.length, 1);
    assert.equal(webFeed.data.items[0].body, "Telefonda yozilgan fikr.");
    console.log("PASS: bir token — web va mobil uchun bir xil foydalanuvchi va bir xil ma'lumot.");
  }

  // --- 3. Postlar, izohlar, egalik ----------------------------------------
  const alisher = await webClient();
  const zuhra = await webClient();
  {
    await alisher.call(profile.PATCH, "/api/v1/profile", {
      method: "PATCH",
      body: { name: "Alisher", bio: "Tarixiy romanlar." },
    });

    const { payload: me } = await alisher.call(profile.GET, "/api/v1/profile");
    assert.equal(me.data.name, "Alisher");
    assert.equal(me.data.bio, "Tarixiy romanlar.");
    assert.equal(me.data.isSelf, true);

    const { payload: created } = await alisher.call(posts.POST, "/api/v1/posts", {
      method: "POST",
      body: { book: "O'tkan kunlar", body: "Birinchi taassurot." },
      expect: 201,
    });

    const postId = created.data.id;
    assert.equal(created.data.userId, alisher.userId);

    await zuhra.call(replies.POST, `/api/v1/posts/${postId}/replies`, {
      method: "POST",
      body: { body: "Men ham o'qiganman." },
      params: { id: postId },
      expect: 201,
    });

    const { payload: list } = await zuhra.call(feed.GET, "/api/v1/feed");
    const target = list.data.items.find((item) => item.id === postId);
    assert.ok(target, "Post umumiy lentada ko'rinishi kerak");
    assert.equal(target.replies.length, 1);
    assert.equal(target.replies[0].body, "Men ham o'qiganman.");

    // Boshqa odamning postini o'chirib bo'lmaydi.
    await zuhra.call(post.DELETE, `/api/v1/posts/${postId}`, {
      method: "DELETE",
      params: { id: postId },
      expect: 403,
    });
    await alisher.call(post.DELETE, `/api/v1/posts/${postId}`, {
      method: "DELETE",
      params: { id: postId },
    });
    console.log("PASS: post, izoh va egalik nazorati.");
  }

  // --- 4. Obuna -----------------------------------------------------------
  {
    await zuhra.call(follows.POST, "/api/v1/follows", {
      method: "POST",
      body: { target: alisher.userId, follow: true },
    });

    const { payload: seen } = await zuhra.call(
      profile.GET,
      `/api/v1/profile?userId=${alisher.userId}`,
    );
    assert.equal(seen.data.isFollowing, true);
    assert.equal(seen.data.isSelf, false);
    assert.equal(seen.data.followers, 1);

    // O'ziga obuna bo'lish taqiqlangan.
    await zuhra.call(follows.POST, "/api/v1/follows", {
      method: "POST",
      body: { target: zuhra.userId, follow: true },
      expect: 403,
    });

    await zuhra.call(follows.POST, "/api/v1/follows", {
      method: "POST",
      body: { target: alisher.userId, follow: false },
    });
    const { payload: after } = await zuhra.call(
      profile.GET,
      `/api/v1/profile?userId=${alisher.userId}`,
    );
    assert.equal(after.data.followers, 0);
    console.log("PASS: obuna va profil ko'rinishi.");
  }

  // --- 5. Validatsiya -----------------------------------------------------
  {
    const { payload: invalid } = await alisher.call(posts.POST, "/api/v1/posts", {
      method: "POST",
      body: { book: "", body: "" },
      expect: 422,
    });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.error.code, "validation_failed");
    assert.ok(invalid.error.fields.book, "Xato maydon nomi bilan qaytishi kerak");

    const { payload: longBio } = await alisher.call(profile.PATCH, "/api/v1/profile", {
      method: "PATCH",
      body: { bio: "x".repeat(301) },
      expect: 422,
    });
    assert.ok(longBio.error.fields.bio);
    console.log("PASS: validatsiya maydon nomlari bilan qaytadi.");
  }

  // --- 6. Fokus seansi takrorlanmaydi -------------------------------------
  {
    const focusSession = { sessionId: crypto.randomUUID(), minutes: 25 };
    await alisher.call(focus.POST, "/api/v1/focus", {
      method: "POST",
      body: focusSession,
      expect: 201,
    });
    await alisher.call(focus.POST, "/api/v1/focus", {
      method: "POST",
      body: focusSession,
      expect: 201,
    });

    const { payload: summary } = await alisher.call(focus.GET, "/api/v1/focus");
    assert.equal(summary.data.sessions, 1, "Bir xil sessionId ikki marta hisoblanmasligi kerak");
    assert.equal(summary.data.minutes, 25);

    // Ruxsat etilmagan davomiylik rad etiladi.
    await alisher.call(focus.POST, "/api/v1/focus", {
      method: "POST",
      body: { sessionId: crypto.randomUUID(), minutes: 7 },
      expect: 422,
    });
    console.log("PASS: fokus seansi idempotent va tekshiriladi.");
  }

  // --- 7. Katalog va reyting serverda hisoblanadi --------------------------
  {
    // Namuna katalog yo'q — kitobni admin qo'shadi.
    const librarian = await webClient();
    sqlite.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(librarian.userId);
    const { payload: created } = await librarian.call(books.POST, "/api/v1/books", { method: "POST", body: { title: "Test kitob", author: "Muallif" }, expect: 201 });
    const bookId = created.data.id;
    createdBooks.push(bookId);

    await alisher.call(progress.PUT, "/api/v1/progress", {
      method: "PUT",
      body: { bookId, page: 120, total: 320 },
    });

    const { payload: saved } = await alisher.call(progress.GET, "/api/v1/progress");
    assert.equal(saved.data.items.find((item) => item.bookId === bookId).page, 120);

    const { payload: board } = await alisher.call(leaderboard.GET, "/api/v1/leaderboard?limit=100");
    const entry = board.data.items.find((item) => item.id === alisher.userId);
    assert.ok(entry, "Faol foydalanuvchi reytingda bo'lishi kerak");
    assert.equal(entry.pages, 120, "Sahifalar bazadagi haqiqiy jarayondan olinadi");
    assert.ok(entry.score > 0);

    // Mijoz o'z ballini yozib yubora olmaydi — bunday maydon qabul qilinmaydi.
    await alisher.call(progress.PUT, "/api/v1/progress", {
      method: "PUT",
      body: { bookId, page: 120, total: 320, score: 999999, streak: 500 },
    });
    const { payload: recheck } = await alisher.call(
      leaderboard.GET,
      "/api/v1/leaderboard?limit=100",
    );
    const unchanged = recheck.data.items.find((item) => item.id === alisher.userId);
    assert.equal(unchanged.score, entry.score, "Mijoz ballni o'zgartira olmasligi kerak");
    assert.equal(unchanged.streak, entry.streak);

    // Sahifa jami sahifadan oshmasligi kerak.
    await alisher.call(progress.PUT, "/api/v1/progress", {
      method: "PUT",
      body: { bookId, page: 9999, total: 320 },
    });
    const { payload: capped } = await alisher.call(progress.GET, "/api/v1/progress");
    assert.equal(capped.data.items.find((item) => item.bookId === bookId).page, 320);
    console.log("PASS: reyting serverda hisoblanadi, mijoz uni buza olmaydi.");
  }

  // --- 8. Kursorli sahifalash ---------------------------------------------
  {
    for (let index = 0; index < 5; index += 1) {
      await zuhra.call(posts.POST, "/api/v1/posts", {
        method: "POST",
        body: { book: `Kitob ${index}`, body: `Fikr ${index}` },
        expect: 201,
      });
    }

    const { payload: first } = await zuhra.call(feed.GET, "/api/v1/feed?scope=mine&limit=2");
    assert.equal(first.data.items.length, 2);
    assert.ok(first.data.nextCursor, "Keyingi sahifa kursori bo'lishi kerak");

    const seen = new Set(first.data.items.map((item) => item.id));
    let cursor = first.data.nextCursor;
    let guard = 0;

    while (cursor && guard < 10) {
      const { payload: page } = await zuhra.call(
        feed.GET,
        `/api/v1/feed?scope=mine&limit=2&cursor=${encodeURIComponent(cursor)}`,
      );
      for (const item of page.data.items) {
        assert.ok(!seen.has(item.id), "Sahifalar orasida takror bo'lmasligi kerak");
        seen.add(item.id);
      }
      cursor = page.data.nextCursor;
      guard += 1;
    }

    assert.equal(seen.size, 5, "Varaqlashda hamma post bir marta ko'rinishi kerak");
    console.log("PASS: kursorli sahifalash takrorlamaydi va hech narsani tushirmaydi.");
  }

  // --- 9. CORS va CSRF -----------------------------------------------------
  {
    const preflight = await feed.OPTIONS(
      request("/api/v1/feed", {
        method: "OPTIONS",
        headers: { Origin: "capacitor://localhost" },
      }),
    );
    assert.equal(preflight.status, 204);
    assert.equal(
      preflight.headers.get("access-control-allow-origin"),
      "capacitor://localhost",
      "Native origin uchun CORS ruxsat berilishi kerak",
    );
    assert.match(preflight.headers.get("access-control-allow-headers"), /Authorization/);

    const { payload: evil } = await call(posts.POST, "/api/v1/posts", {
      method: "POST",
      body: { book: "x", body: "y" },
      headers: { Origin: "https://yovuz-sayt.example" },
      expect: 403,
    });
    assert.equal(evil.error.code, "forbidden");
    console.log("PASS: native originlarga CORS ochiq, begona originlarga yopiq.");
  }

  // --- 10. Mijoz yuborgan userId e'tiborga olinmaydi -----------------------
  {
    const { payload } = await alisher.call(posts.POST, "/api/v1/posts", {
      method: "POST",
      body: { book: "Soxta", body: "Boshqa nom ostida.", userId: zuhra.userId },
      expect: 201,
    });
    assert.equal(
      payload.data.userId,
      alisher.userId,
      "Muallif faqat sessiyadan olinishi kerak",
    );
    console.log("PASS: mijoz boshqa foydalanuvchi nomidan yoza olmaydi.");
  }

  // --- 11. Eski API ham native qobiqdan ishlaydi ---------------------------
  // Mobil ilova hozircha UI bilan birga eski `/api/social` ni chaqiradi.
  // Cookie cross-site yuborilmaydi, shuning uchun u Bearer tokenni ham
  // qabul qilishi va CORS ochishi SHART — aks holda ilovada ma'lumot
  // ko'rinmaydi.
  {
    const android = await nativeClient("android");

    const legacyResponse = await legacySocial.GET(
      request("/api/social", {
        headers: {
          Authorization: `Bearer ${android.token}`,
          Origin: "capacitor://localhost",
          "X-Client-Platform": "android",
        },
      }),
    );
    const legacy = await legacyResponse.json();

    assert.equal(legacyResponse.status, 200, JSON.stringify(legacy));
    assert.equal(
      legacy.userId,
      android.userId,
      "Eski API va /api/v1 bir xil foydalanuvchini ko'rsatishi kerak",
    );
    assert.equal(
      legacyResponse.headers.get("access-control-allow-origin"),
      "capacitor://localhost",
    );
    assert.equal(
      legacyResponse.headers.get("set-cookie"),
      null,
      "Native mijozga cookie yuborilmasligi kerak",
    );

    // Yozuv ham native origindan o'tishi kerak (ilgari 403 bo'lardi).
    const writeResponse = await legacySocial.POST(
      request("/api/social", {
        method: "POST",
        body: { type: "post", book: "Native kitob", body: "Ilovadan yozilgan." },
        headers: {
          Authorization: `Bearer ${android.token}`,
          Origin: "capacitor://localhost",
          "X-Client-Platform": "android",
        },
      }),
    );
    assert.equal(writeResponse.status, 200, await writeResponse.text());

    // Begona sayt esa hamon rad etilishi kerak.
    const evilResponse = await legacySocial.POST(
      request("/api/social", {
        method: "POST",
        body: { type: "post", book: "x", body: "y" },
        headers: { Origin: "https://yovuz-sayt.example" },
      }),
    );
    assert.equal(evilResponse.status, 403, "Begona origin yozuv qila olmasligi kerak");

    // `/api/app-state` preflight'i ham native uchun ochiq bo'lsin.
    const appStatePreflight = legacyAppState.OPTIONS(
      request("/api/app-state", {
        method: "OPTIONS",
        headers: { Origin: "capacitor://localhost" },
      }),
    );
    assert.equal(appStatePreflight.status, 204);
    assert.equal(
      appStatePreflight.headers.get("access-control-allow-origin"),
      "capacitor://localhost",
    );

    console.log("PASS: eski API native qobiqdan ham ishlaydi (Bearer + CORS).");
  }

  // --- Rollar: faqat admin suhbat yaratadi va rol beradi ---------------------
  {
    const admin = await webClient();
    const member = await webClient();
    const newSession = {
      bookTitle: "Atom odatlar",
      title: "Rol testi",
      scheduledAt: new Date().toISOString(),
    };

    const { payload: me } = await member.call(session.GET, "/api/v1/auth/session");
    assert.equal(me.data.role, "user", "Yangi foydalanuvchi oddiy user bo'lishi kerak");

    await member.call(live.POST, "/api/v1/live", { method: "POST", body: newSession, expect: 403 });
    await member.call(adminUsers.GET, "/api/v1/admin/users", { expect: 403 });
    await member.call(adminUser.PATCH, `/api/v1/admin/users/${member.userId}`, {
      method: "PATCH",
      body: { role: "admin" },
      params: { id: member.userId },
      expect: 403,
    });

    sqlite.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(admin.userId);

    await admin.call(live.POST, "/api/v1/live", { method: "POST", body: newSession, expect: 201 });

    const { payload: promoted } = await admin.call(adminUser.PATCH, `/api/v1/admin/users/${member.userId}`, {
      method: "PATCH",
      body: { role: "moderator" },
      params: { id: member.userId },
    });
    assert.equal(promoted.data.role, "moderator");

    // Moderator ham suhbat yarata olmaydi — bu faqat admin ishi.
    await member.call(live.POST, "/api/v1/live", { method: "POST", body: newSession, expect: 403 });

    await admin.call(adminUser.PATCH, `/api/v1/admin/users/${admin.userId}`, {
      method: "PATCH",
      body: { role: "user" },
      params: { id: admin.userId },
      expect: 400,
    });

    const { payload: found } = await admin.call(adminUsers.GET, `/api/v1/admin/users?q=${member.userId.slice(0, 20)}`);
    assert.ok(found.data.some((u) => u.id === member.userId && u.role === "moderator"));

    console.log("PASS: faqat admin suhbat yaratadi va rol beradi; admin o'zini tushira olmaydi.");
  }

  // --- Kitoblar: faqat admin/moderator, bo'laklab yuklash, Range bilan tinglash --
  {
    const { mkdtemp, rm: rmDir, readdir: listDir } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const pathMod = await import("node:path");
    process.env.BIR_ILM_MEDIA_DIR = await mkdtemp(pathMod.join(tmpdir(), "bir-ilm-media-"));
    const bookItem = await load("app/api/v1/books/[id]/route.ts");
    const bookMedia = await load("app/api/v1/books/[id]/media/route.ts");
    const mediaFile = await load("app/media/books/[id]/[file]/route.ts");

    const reader = await webClient();
    const editor = await webClient();
    sqlite.prepare("UPDATE users SET role = 'moderator' WHERE id = ?").run(editor.userId);
    await reader.call(books.POST, "/api/v1/books", { method: "POST", body: { title: "X", author: "Y" }, expect: 403 });
    const { payload: made } = await editor.call(books.POST, "/api/v1/books", {
      method: "POST",
      body: { title: "Alkimyogar", author: "Paulo Coelho", summary: "Orzular haqida" },
      expect: 201,
    });
    const id = made.data.id;
    createdBooks.push(id);

    const put = (client, bytes, offset, total, type, extra = {}) =>
      bookMedia.PUT(new Request(`${ORIGIN}/api/v1/books/${id}/media?kind=audio`, {
        method: "PUT",
        body: bytes,
        headers: { Cookie: client.cookie, Origin: ORIGIN, "X-Upload-Offset": String(offset), "X-Upload-Total": String(total), "X-Upload-Type": type, ...extra },
      }), { params: Promise.resolve({ id }) });
    const audio = new Uint8Array(15).map((_, i) => i + 1);

    assert.equal((await put(reader, audio.slice(0, 10), 0, 15, "audio/mpeg")).status, 403, "Oddiy foydalanuvchi yuklay olmaydi");
    assert.equal((await put(editor, audio, 0, 15, "video/mp4")).status, 415, "Audio bo'lmagan fayl rad etiladi");
    assert.equal((await put(editor, audio, 0, 2 * 1024 * 1024 * 1024, "audio/mpeg")).status, 413, "1 GB dan katta fayl rad etiladi");

    const first = await (await put(editor, audio.slice(0, 10), 0, 15, "audio/mpeg")).json();
    assert.deepEqual(first.data, { done: false, received: 10 });
    const wrong = await put(editor, audio.slice(10), 7, 15, "audio/mpeg");
    assert.equal(wrong.status, 409);
    assert.equal((await wrong.json()).error.received, 10, "Server qayerdan davom etishni aytadi");
    const status = await (await bookMedia.GET(new Request(`${ORIGIN}/api/v1/books/${id}/media?kind=audio`, { headers: { Cookie: editor.cookie } }), { params: Promise.resolve({ id }) })).json();
    assert.equal(status.data.received, 10);
    const done = await (await put(editor, audio.slice(10), 10, 15, "audio/mpeg", { "X-Audio-Seconds": "3725" })).json();
    assert.equal(done.data.done, true);
    assert.equal(done.data.book.audioSeconds, 3725);
    assert.match(done.data.book.audioUrl, new RegExp(`^/media/books/${id}/audio\\.mp3\\?v=`));

    // Tinglash: Range so'rovi faylning bir qismini beradi.
    const media = (range) => mediaFile.GET(new Request(`${ORIGIN}/media/books/${id}/audio.mp3`, { headers: range ? { Range: range } : {} }), { params: Promise.resolve({ id, file: "audio.mp3" }) });
    const partial = await media("bytes=5-9");
    assert.equal(partial.status, 206);
    assert.equal(partial.headers.get("content-range"), "bytes 5-9/15");
    assert.deepEqual([...new Uint8Array(await partial.arrayBuffer())], [6, 7, 8, 9, 10]);
    assert.equal((await media()).status, 200);
    assert.equal((await mediaFile.GET(new Request(`${ORIGIN}/media/books/${id}/..%2F..%2Fsecret`), { params: Promise.resolve({ id, file: "../../secret" }) })).status, 404, "Papkadan chiqib ketish bloklanadi");

    // Haftaning kitobi bitta; o'chirilganda fayllar ham ketadi.
    await editor.call(bookItem.PATCH, `/api/v1/books/${id}`, { method: "PATCH", body: { active: true }, params: { id } });
    const { payload: list } = await reader.call(books.GET, "/api/v1/books");
    assert.equal(list.data.activeBookId, id);
    assert.equal(list.data.items.filter((b) => b.active).length, 1);
    await reader.call(bookItem.DELETE, `/api/v1/books/${id}`, { method: "DELETE", params: { id }, expect: 403 });
    await editor.call(bookItem.DELETE, `/api/v1/books/${id}`, { method: "DELETE", params: { id } });
    assert.deepEqual(await listDir(pathMod.join(process.env.BIR_ILM_MEDIA_DIR, "books")), [], "Kitob papkasi o'chishi kerak");

    await rmDir(process.env.BIR_ILM_MEDIA_DIR, { recursive: true, force: true });
    console.log("PASS: kitobni admin/moderator qo'shadi, audio bo'laklab yuklanadi va davom ettiriladi, Range bilan tinglanadi.");
  }

  // --- Postlar: e'lon, shikoyat, moderator o'chirishi, ism saqlanishi ----------
  {
    const author = await webClient();
    const reporter = await webClient();
    const mod = await webClient();
    sqlite.prepare("UPDATE users SET role = 'moderator' WHERE id = ?").run(mod.userId);
    const social = (client, method, body, query = "") =>
      legacySocial[method](request(`/api/social${query}`, {
        method,
        body,
        headers: { Cookie: client.cookie, Origin: ORIGIN },
      }));
    const json = async (res) => ({ status: res.status, body: await res.json() });

    // Oddiy foydalanuvchi e'lon joylay olmaydi, moderator joylaydi.
    assert.equal((await json(await social(author, "POST", { type: "post", kind: "announcement", book: "E'lon", body: "Soxta" }))).status, 403);
    assert.equal((await social(mod, "POST", { type: "post", kind: "announcement", book: "Yakshanba suhbati", body: "18:00 da" })).status, 200);
    const news = (await json(await social(author, "GET", undefined, "?scope=announcements"))).body;
    assert.ok(news.posts.some((p) => p.kind === "announcement" && p.book === "Yakshanba suhbati"));

    // Oddiy post → shikoyat → faqat moderator ko'radi → moderator o'chiradi.
    await social(author, "POST", { type: "post", book: "Test kitob", body: "Nomaqbul matn" });
    const mine = (await json(await social(author, "GET", undefined, "?scope=mine"))).body.posts[0];
    assert.equal((await social(reporter, "POST", { type: "report", postId: mine.id, reason: "spam" })).status, 200);
    assert.equal((await social(author, "GET", undefined, "?scope=reported")).status, 403);
    const reported = (await json(await social(mod, "GET", undefined, "?scope=reported"))).body;
    assert.equal(reported.reportedPosts >= 1, true);
    assert.equal(reported.posts.find((p) => p.id === mine.id)?.reports, 1);
    await social(reporter, "POST", { type: "delete", postId: mine.id });
    assert.ok((await json(await social(author, "GET", undefined, "?scope=mine"))).body.posts.some((p) => p.id === mine.id), "Begona odam postni o'chira olmasligi kerak");
    await social(mod, "POST", { type: "delete", postId: mine.id });
    assert.ok(!(await json(await social(author, "GET", undefined, "?scope=mine"))).body.posts.some((p) => p.id === mine.id), "Moderator postni o'chira olishi kerak");

    // Haqiqiy ism brauzerdagi standart "Kitobxon" bilan bosib ketilmaydi.
    sqlite.prepare("UPDATE users SET name = 'Haqiqiy Ism' WHERE id = ?").run(author.userId);
    await social(author, "POST", { type: "profile", name: "Kitobxon", bio: "salom" });
    assert.equal(sqlite.prepare("SELECT name FROM users WHERE id = ?").get(author.userId).name, "Haqiqiy Ism");

    sqlite.prepare("DELETE FROM reading_posts WHERE user_id IN (?, ?, ?)").run(author.userId, reporter.userId, mod.userId);
    console.log("PASS: e'lon faqat moderatorda, shikoyat moderatorga boradi, moderator o'chiradi, ism saqlanadi.");
  }

  // --- app-state: foydalanuvchi so'rovdagi userId'dan emas, tokendan aniqlanadi ---
  {
    const victim = await webClient();
    const attacker = await webClient();
    const res = await legacyAppState.POST(request("/api/app-state", {
      method: "POST",
      body: { type: "comment", userId: victim.userId, name: "Buzg'unchi", text: "soxta izoh" },
      headers: { Cookie: attacker.cookie, Origin: ORIGIN },
    }));
    assert.equal(res.status, 201);
    const row = sqlite.prepare("SELECT user_id FROM comments WHERE body = 'soxta izoh'").get();
    assert.equal(row.user_id, attacker.userId, "Izoh hujumchining o'z akkauntiga yozilishi kerak");
    sqlite.prepare("DELETE FROM comments WHERE body = 'soxta izoh'").run();
    console.log("PASS: app-state boshqa foydalanuvchi nomidan yozishga yo'l qo'ymaydi.");
  }

  // --- Login: Telegram imzosi, mehmonni bog'lash, ikkinchi qurilma, chiqish -----
  {
    process.env.TELEGRAM_BOT_TOKEN = "123456:TEST-TOKEN";
    process.env.TELEGRAM_BOT_USERNAME = "birilm_test_bot";
    process.env.PUBLIC_URL = ORIGIN;
    const { createHash, createHmac } = await import("node:crypto");
    const tgCallback = await load("app/api/auth/telegram/callback/route.ts");
    const logout = await load("app/api/auth/logout/route.ts");

    const signed = (fields) => {
      const check = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join("\n");
      const secret = createHash("sha256").update(process.env.TELEGRAM_BOT_TOKEN).digest();
      return new URLSearchParams({ ...fields, hash: createHmac("sha256", secret).update(check).digest("hex") });
    };
    const tgUser = { id: "777000111", first_name: "Test", last_name: "Kitobxon", auth_date: String(Math.floor(Date.now() / 1000)) };
    const loginAs = async (cookie, params) => {
      const res = await tgCallback.GET(request(`/api/auth/telegram/callback?${params}`, { headers: cookie ? { Cookie: cookie } : {} }));
      assert.equal(res.status, 302);
      const location = new URL(res.headers.get("location"));
      const session = res.headers.getSetCookie().find((c) => c.startsWith("bir_reader=") && !c.startsWith("bir_reader=;"));
      return { result: location.searchParams.get("login"), cookie: session?.split(";")[0] };
    };
    const viewerFor = async (cookie) =>
      (await (await session.GET(request("/api/v1/auth/session", { headers: { Cookie: cookie } }))).json()).data;

    // Mehmon post yozgan, keyin Telegram bilan kiradi — post va akkaunt saqlanib qoladi.
    const guest = await webClient();
    const first = await loginAs(guest.cookie, signed(tgUser));
    assert.equal(first.result, "ok");
    const me = await viewerFor(first.cookie);
    assert.equal(me.userId, guest.userId, "Birinchi kirishda mehmon akkaunt saqlanishi kerak");
    assert.deepEqual(me.accounts, [{ provider: "telegram", label: "Test Kitobxon" }]);
    assert.equal(me.name, "Test Kitobxon");

    // Ikkinchi qurilma (cookie'siz) o'sha Telegram bilan kirsa — o'sha akkaunt va o'sha rol.
    sqlite.prepare("UPDATE users SET role = 'moderator' WHERE id = ?").run(guest.userId);
    const second = await loginAs(null, signed({ ...tgUser, auth_date: String(Math.floor(Date.now() / 1000)) }));
    const other = await viewerFor(second.cookie);
    assert.equal(other.userId, guest.userId);
    assert.equal(other.role, "moderator");

    // Soxta imzo va eskirgan ma'lumot rad etiladi.
    const forged = signed(tgUser);
    forged.set("id", "999");
    assert.equal((await loginAs(null, forged)).result, "error");
    assert.equal((await loginAs(null, signed({ ...tgUser, auth_date: "1000" }))).result, "error");

    // Chiqish: sessiya o'chadi, eski token endi o'sha akkauntni ochmaydi.
    const out = await logout.POST(request("/api/auth/logout", { method: "POST", headers: { Cookie: second.cookie, Origin: ORIGIN } }));
    assert.equal(out.status, 200);
    const afterLogout = await viewerFor(second.cookie);
    assert.notEqual(afterLogout.userId, guest.userId);
    createdUsers.push(afterLogout.userId);
    console.log("PASS: Telegram login mehmonni saqlaydi, boshqa qurilmada rol bilan kiradi, soxta imzo rad etiladi.");
  }

  // --- Boshqa qurilmani kod bilan ulash ---------------------------------------
  {
    const linkCode = await load("app/api/v1/auth/link-code/route.ts");
    const redeem = await load("app/api/v1/auth/link-code/redeem/route.ts");
    const viewerOf = async (cookie) =>
      (await (await session.GET(request("/api/v1/auth/session", { headers: { Cookie: cookie } }))).json()).data;
    const tryCode = (code, headers) =>
      redeem.POST(request("/api/v1/auth/link-code/redeem", { method: "POST", body: { code }, headers: { Origin: ORIGIN, ...headers } }));

    // Mehmon kod ololmaydi — aks holda login talabini chetlab o'tardi.
    const guest = await webClient();
    await guest.call(linkCode.POST, "/api/v1/auth/link-code", { method: "POST", expect: 403 });
    assert.equal((await viewerOf(guest.cookie)).signedIn, false);

    // Admin (Google/Telegram'siz ham) kod oladi; ikkinchi qurilma o'sha akkauntga admin bo'lib kiradi.
    const admin = await webClient();
    sqlite.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(admin.userId);
    const { payload } = await admin.call(linkCode.POST, "/api/v1/auth/link-code", { method: "POST", expect: 201 });
    assert.match(payload.data.code, /^\d{6}$/);

    const device = await webClient();
    const ok = await tryCode(payload.data.code, { Cookie: device.cookie, "X-Forwarded-For": "203.0.113.7" });
    assert.equal(ok.status, 200);
    const cookies = ok.headers.getSetCookie();
    assert.equal(cookies.length, 1, "Faqat yangi sessiya cookie'si");
    const linked = await viewerOf(cookies[0].split(";")[0]);
    assert.equal(linked.userId, admin.userId);
    assert.equal(linked.role, "admin");
    assert.equal(linked.signedIn, true);

    // Kod bir marta ishlaydi; begona Origin rad etiladi; ko'p xato urinish bloklanadi.
    assert.equal((await tryCode(payload.data.code, { "X-Forwarded-For": "203.0.113.8" })).status, 400);
    assert.equal((await tryCode("123456", { Origin: "https://evil.example" })).status, 403);
    let last;
    for (let i = 0; i < 9; i++) last = await tryCode(String(100000 + i), { "X-Forwarded-For": "203.0.113.9" });
    assert.equal(last.status, 429);
    console.log("PASS: Kod bilan ulash: admin rolini boshqa qurilmaga beradi, bir martalik, mehmonga berilmaydi, taxmin cheklanadi.");
  }

  // --- Ilovada Telegram bilan kirish (brauzer → uz.birilm.app://auth → token) ----
  {
    const { createHash, createHmac, randomBytes } = await import("node:crypto");
    const appLogin = await load("app/api/v1/auth/app-login/route.ts");
    const appRedeem = await load("app/api/v1/auth/app-login/redeem/route.ts");
    const tgStart = await load("app/api/auth/telegram/route.ts");
    const tgCallback = await load("app/api/auth/telegram/callback/route.ts");
    const sha = (text) => createHash("sha256").update(text).digest("hex");
    const signed = (fields) => {
      const check = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join("\n");
      const secret = createHash("sha256").update(process.env.TELEGRAM_BOT_TOKEN).digest();
      return new URLSearchParams({ ...fields, hash: createHmac("sha256", secret).update(check).digest("hex") });
    };
    const tgUser = { id: "777000222", first_name: "Ilova", auth_date: String(Math.floor(Date.now() / 1000)) };

    // Ilova mehmoni kirishni boshlaydi: serverga faqat verifier xeshi ketadi.
    const app = await nativeClient("android");
    const verifier = randomBytes(32).toString("hex");
    const { payload: started } = await app.call(appLogin.POST, "/api/v1/auth/app-login", {
      method: "POST", body: { provider: "telegram", challenge: sha(verifier) }, expect: 201,
    });
    const startUrl = new URL(started.data.url);
    assert.equal(startUrl.pathname, "/api/auth/telegram");

    // Telefon brauzeri: widget sahifasi oqimni cookie'ga yozadi.
    const page = await tgStart.GET(request(startUrl.pathname + startUrl.search));
    assert.equal(page.status, 200);
    assert.match(await page.text(), /telegram-widget\.js/);
    const flowCookie = page.headers.getSetCookie().find((c) => c.startsWith("bir_app_flow="))?.split(";")[0];
    assert.ok(flowCookie, "Oqim cookie'si o'rnatilishi kerak");

    // Telegram tasdiqlaydi → sahifa ilovaga kod bilan qaytaradi, brauzerga sessiya yozilmaydi.
    const back = await tgCallback.GET(request(`/api/auth/telegram/callback?${signed(tgUser)}`, { headers: { Cookie: flowCookie } }));
    const html = await back.text();
    const code = /uz\.birilm\.app:\/\/auth\?code=([a-f0-9]{64})/.exec(html)?.[1];
    assert.ok(code, "Ilovaga qaytish havolasi bo'lishi kerak");
    assert.ok(!back.headers.getSetCookie().some((c) => c.startsWith("bir_reader=")), "Brauzerga sessiya yozilmasin");

    // Boshqa ilova (verifiersiz yoki boshqa token bilan) kodni ishlata olmaydi.
    const thief = await nativeClient("android");
    await thief.call(appRedeem.POST, "/api/v1/auth/app-login/redeem", {
      method: "POST", body: { code, verifier }, headers: { "X-Forwarded-For": "198.51.100.1" }, expect: 400,
    });

    // Kod bir martalik bo'lgani uchun o'g'ri urinishidan keyin u yaroqsiz — yangi oqim bilan to'g'ri yo'l.
    const verifier2 = randomBytes(32).toString("hex");
    const { payload: again } = await app.call(appLogin.POST, "/api/v1/auth/app-login", {
      method: "POST", body: { provider: "telegram", challenge: sha(verifier2) }, expect: 201,
    });
    const again2 = new URL(again.data.url);
    const page2 = await tgStart.GET(request(again2.pathname + again2.search));
    const flow2 = page2.headers.getSetCookie().find((c) => c.startsWith("bir_app_flow="))?.split(";")[0];
    const back2 = await tgCallback.GET(request(`/api/auth/telegram/callback?${signed(tgUser)}`, { headers: { Cookie: flow2 } }));
    const code2 = /code=([a-f0-9]{64})/.exec(await back2.text())?.[1];
    await app.call(appRedeem.POST, "/api/v1/auth/app-login/redeem", {
      method: "POST", body: { code: code2, verifier: randomBytes(32).toString("hex") }, headers: { "X-Forwarded-For": "198.51.100.2" }, expect: 400,
    });

    const verifier3 = randomBytes(32).toString("hex");
    const { payload: third } = await app.call(appLogin.POST, "/api/v1/auth/app-login", {
      method: "POST", body: { provider: "telegram", challenge: sha(verifier3) }, expect: 201,
    });
    const u3 = new URL(third.data.url);
    const flow3 = (await tgStart.GET(request(u3.pathname + u3.search))).headers.getSetCookie().find((c) => c.startsWith("bir_app_flow="))?.split(";")[0];
    const code3 = /code=([a-f0-9]{64})/.exec(await (await tgCallback.GET(request(`/api/auth/telegram/callback?${signed(tgUser)}`, { headers: { Cookie: flow3 } }))).text())?.[1];
    const { payload: redeemed } = await app.call(appRedeem.POST, "/api/v1/auth/app-login/redeem", {
      method: "POST", body: { code: code3, verifier: verifier3 }, headers: { "X-Forwarded-For": "198.51.100.3" },
    });
    assert.equal(redeemed.data.userId, app.userId, "Ilovadagi mehmon akkaunti saqlanishi kerak");
    assert.match(redeemed.data.token, /^[a-f0-9]{64}$/);

    const viewer = (await (await session.GET(request("/api/v1/auth/session", {
      headers: { Authorization: `Bearer ${redeemed.data.token}`, "X-Client-Platform": "android" },
    }))).json()).data;
    assert.equal(viewer.userId, app.userId);
    assert.deepEqual(viewer.accounts, [{ provider: "telegram", label: "Ilova" }]);
    assert.equal(viewer.signedIn, true);

    // Eskirgan/soxta oqim bilan ochilgan sahifa xato ko'rsatadi.
    const stale = await tgStart.GET(request(`/api/auth/telegram?flow=${"0".repeat(64)}`));
    assert.match(await stale.text(), /eskirgan/);
    console.log("PASS: Ilovada Telegram bilan kirish: PKCE bilan himoyalangan, mehmon akkaunti saqlanadi, kodni boshqa ilova ishlata olmaydi.");
  }

  console.log("\nHAMMASI O'TDI: /api/v1 va eski API web va mobil uchun bir xil ishlaydi.");
} finally {
  if (createdUsers.length) {
    const unique = [...new Set(createdUsers)];
    assert.ok(unique.every((id) => /^reader_[a-f0-9]{64}$/.test(id)));
    const placeholders = unique.map(() => "?").join(",");

    // Ba'zi jadvallarda cascade ishlamasligi mumkin — tartib bilan tozalaymiz.
    sqlite
      .prepare(
        `DELETE FROM post_replies WHERE user_id IN (${placeholders}) OR post_id IN (SELECT id FROM reading_posts WHERE user_id IN (${placeholders}))`,
      )
      .run(...unique, ...unique);
    sqlite.prepare(`DELETE FROM reading_posts WHERE user_id IN (${placeholders})`).run(...unique);
    sqlite.prepare(`DELETE FROM login_codes WHERE user_id IN (${placeholders})`).run(...unique);
    sqlite
      .prepare(
        `DELETE FROM reader_follows WHERE follower_id IN (${placeholders}) OR followed_id IN (${placeholders})`,
      )
      .run(...unique, ...unique);
    sqlite.prepare(`DELETE FROM focus_sessions WHERE user_id IN (${placeholders})`).run(...unique);
    sqlite.prepare(`DELETE FROM reading_progress WHERE user_id IN (${placeholders})`).run(...unique);
    sqlite.prepare(`DELETE FROM comments WHERE user_id IN (${placeholders})`).run(...unique);
    sqlite.prepare(`DELETE FROM user_activity WHERE user_id IN (${placeholders})`).run(...unique);
    sqlite.prepare(`DELETE FROM live_sessions WHERE moderator_id IN (${placeholders})`).run(...unique);
    for (const id of createdBooks) sqlite.prepare("DELETE FROM books WHERE id = ?").run(id);
    sqlite.prepare(`DELETE FROM users WHERE id IN (${placeholders})`).run(...unique);

    console.log(`Tozalandi: ${unique.length} ta test foydalanuvchisi.`);
  }
}
