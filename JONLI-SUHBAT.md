# Jonli suhbat — bajarilgan qism va keyingi ulanish

Asl JPG logo ulandi. Suhbat kartasi, sana/vaqt, moderator boshlaydigan lokal sinov, qo‘shilish, qatnashchilar, qo‘l ko‘tarish, so‘z berish/olish, izohlarga o‘tish, barcha tablarda kichik panel va suhbatdan chiqish tayyor.

Bu komponent haqiqiy ovoz uzatmaydi. Moderator roli faqat aniq belgilangan interfeys sinovi. Uni haqiqiy avtorizatsiya deb ishlatmang.

Ishlaydigan qurilmalararo xizmat uchun:

1. Login va serverda tekshiriladigan admin/moderator vakolati.
2. Serverda saqlanadigan haftalik jadval, yagona vaqt zonasi va planned/live/ended holati. Barcha foydalanuvchilar aynan bitta sessiyani ko‘radi.
3. WebRTC audio xizmati va server beradigan qisqa muddatli room tokenlari. Tinglovchiga publish huquqi berilmaydi, moderator ruxsatidan keyin server uni yangilaydi.
4. Qatnashchilar, qo‘l ko‘tarish va umumiy izohlar uchun real vaqt sinxronlash.
5. Audio ulanishini tablardan yuqorida saqlash. Kichraytirish ulanishni uzmaydi, chiqish mikrofon treklarini to‘xtatadi.
6. Ruxsat berilmagan mikrofon, uzilgan internet, qayta ulanish va moderator chiqishi holatlarini tekshirish.

Hosting va audio xizmati tanlangach haqiqiy ulanish yoziladi. Hozirgi source paketda API kalitlari yo‘q. Browser/OS ilovani fon rejimida to‘xtatishi mumkin; boshqa ilovalarda ham doimiy audio ishlashini alohida qurilmalarda tekshirish kerak.
