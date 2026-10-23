// Vite `?url` importi: fayl alohida aktiv sifatida chiqariladi, import uning manzilini beradi.
declare module "*?url" {
  const url: string;
  export default url;
}
