/**
 * Kursorli sahifalash.
 *
 * `rowid` o'rniga `(created_at, id)` juftligi ishlatiladi: u barqaror,
 * takrorlanuvchi vaqtlarda ham aniq tartib beradi va SQLite'ga bog'liq emas.
 */
export type Cursor = { createdAt: string; id: string };

export function encodeCursor(cursor: Cursor): string {
  return base64UrlEncode(`${cursor.createdAt}|${cursor.id}`);
}

export function decodeCursor(value: string | undefined): Cursor | null {
  if (!value) return null;
  try {
    const decoded = base64UrlDecode(value);
    const separator = decoded.indexOf("|");
    if (separator < 1) return null;
    const createdAt = decoded.slice(0, separator);
    const id = decoded.slice(separator + 1);
    return id ? { createdAt, id } : null;
  } catch {
    return null;
  }
}

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
