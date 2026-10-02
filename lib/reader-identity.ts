// A random HttpOnly bearer cookie identifies a guest without accepting a caller-supplied user ID.
export async function readerIdentity(request: Request) {
  const existing = request.headers.get("cookie")?.match(/(?:^|;\s*)bir_reader=([a-f0-9]{64})(?:;|$)/)?.[1];
  const token = existing ?? Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const id = "reader_" + Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (!existing) headers.set("Set-Cookie", `bir_reader=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`);
  return { id, headers };
}
