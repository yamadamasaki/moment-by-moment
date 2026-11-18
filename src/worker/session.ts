/**
 * Session stored in an AES-GCM encrypted cookie: { login, token, exp }.
 * The GitHub token never reaches client-side JS (HttpOnly) and is unreadable without SESSION_SECRET.
 */
export type Session = { login: string; token: string; exp: number };

const enc = new TextEncoder();
const dec = new TextDecoder();

async function keyFrom(secret: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(secret));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const fromB64url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

export async function sealSession(session: Session, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await keyFrom(secret),
    enc.encode(JSON.stringify(session)),
  );
  const out = new Uint8Array(iv.length + ct.byteLength);
  out.set(iv);
  out.set(new Uint8Array(ct), iv.length);
  return b64url(out);
}

export async function openSession(value: string | undefined, secret: string): Promise<Session | null> {
  if (!value) return null;
  try {
    const bytes = fromB64url(value);
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.slice(0, 12) },
      await keyFrom(secret),
      bytes.slice(12),
    );
    const s = JSON.parse(dec.decode(pt)) as Session;
    return s.exp > Date.now() ? s : null;
  } catch {
    return null;
  }
}
