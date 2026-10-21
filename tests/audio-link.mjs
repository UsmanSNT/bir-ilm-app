/** Audio havolasini tekshirish va ko'rsatish. `node --experimental-strip-types` bilan ishlaydi. */
import assert from "node:assert/strict";
import { describeAudioLink, normalizeAudioLink } from "../shared/contract/audio-link.ts";

// Istalgan havola o'z manziliga yo'naltiriladi; sxemasiz yozuv https bilan to'ldiriladi.
assert.equal(normalizeAudioLink("https://www.youtube.com/watch?v=abc123"), "https://www.youtube.com/watch?v=abc123");
assert.equal(normalizeAudioLink("youtu.be/abc123"), "https://youtu.be/abc123");
assert.equal(normalizeAudioLink("  t.me/bir_ilm/45  "), "https://t.me/bir_ilm/45");
assert.equal(normalizeAudioLink("@bir_ilm"), "https://t.me/bir_ilm");
assert.equal(normalizeAudioLink("https://example.com/audio.mp3?x=1#t=5"), "https://example.com/audio.mp3?x=1#t=5");
// Ma'lum platformalar doim https orqali ochiladi.
assert.equal(normalizeAudioLink("http://youtu.be/abc123"), "https://youtu.be/abc123");
assert.equal(normalizeAudioLink("http://t.me/kanal"), "https://t.me/kanal");
// Boshqa saytning http manzili o'zgarmaydi.
assert.equal(normalizeAudioLink("http://example.com/a"), "http://example.com/a");

// Xavfli yoki yaroqsiz yozuvlar rad etiladi.
for (const bad of ["", "   ", "javascript:alert(1)", "data:text/html,<b>x</b>", "file:///etc/passwd", "ftp://example.com/a", "https://user:pass@example.com", "https://localhost/a", "https://abc", "salom dunyo", "https://exa mple.com", "@ab", `https://example.com/${"a".repeat(2100)}`]) {
  assert.equal(normalizeAudioLink(bad), null, `Rad etilishi kerak: ${bad.slice(0, 40)}`);
}

// Ko'rsatiladigan nom va manzil.
assert.deepEqual(describeAudioLink("youtu.be/abc123"), { href: "https://youtu.be/abc123", label: "YouTube", display: "youtu.be/abc123" });
assert.deepEqual(describeAudioLink("https://www.youtube.com/watch?v=abc"), { href: "https://www.youtube.com/watch?v=abc", label: "YouTube", display: "youtube.com/watch?v=abc" });
assert.equal(describeAudioLink("https://t.me/bir_ilm/45")?.label, "Telegram");
assert.equal(describeAudioLink("https://t.me/bir_ilm/45")?.display, "t.me/bir_ilm/45");
assert.equal(describeAudioLink("https://eshittirish.uz/kitob/1/")?.label, "eshittirish.uz", "Noma'lum saytda sayt nomi ko'rsatiladi");
assert.equal(describeAudioLink("https://eshittirish.uz/kitob/1/")?.display, "eshittirish.uz/kitob/1");
assert.equal(describeAudioLink("javascript:alert(1)"), null);

console.log("PASS: audio havolasi — sxemasiz yozuvlar, Telegram/YouTube, xavfli sxemalar rad etilishi, ko'rsatiladigan manzil.");
