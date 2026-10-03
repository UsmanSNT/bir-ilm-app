/* Bir Ilm: o'rnatiladigan veb-ilova (PWA). Keshlash yo'q — barcha so'rovlar to'g'ridan-to'g'ri tarmoqqa ketadi,
   shuning uchun yangilanishlar darrov ko'rinadi va jonli suhbatga halaqit bermaydi. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
