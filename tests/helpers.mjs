import assert from "node:assert/strict";

export const origin = "http://127.0.0.1:8787";

/** Javobdagi barcha Set-Cookie'lardan "nom=qiymat" juftlarini yig'adi. */
export const cookiesFrom = res => res.headers.getSetCookie().map(c => c.split(";")[0]).filter(c => !c.endsWith("=")).join("; ");

/** Test uchun yangi hisob ochadi va sessiya cookie'sini qaytaradi. */
export async function account(name = "Test", fixedLogin = "") {
  const login = fixedLogin || `t_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const res = await fetch(`${origin}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify({ type: "register", name, login, password: "parol12345" }) });
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  const cookie = cookiesFrom(res);
  assert.match(cookie, /bir_session=/);
  return { id: body.user.id, login, cookie };
}
