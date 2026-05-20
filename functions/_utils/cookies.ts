// functions/_utils/cookies.ts
// Cookie helpers — anon browser_id issuance + read.

const COOKIE_NAME = 'sa_bid';

export function readBrowserId(request: Request): string | null {
  const cookie = request.headers.get('Cookie');
  if (!cookie) return null;
  const pairs = cookie.split(/;\s*/);
  for (const pair of pairs) {
    const [k, v] = pair.split('=');
    if (k === COOKIE_NAME) return v;
  }
  return null;
}

export function mintBrowserId(): string {
  // 16 random bytes → 32-char hex.
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  let s = '';
  for (let i = 0; i < buf.length; i++) {
    s += buf[i].toString(16).padStart(2, '0');
  }
  return s;
}

export function setBrowserIdHeader(id: string): string {
  // 90 days; site-only (Lax); HTTP-only.
  const maxAge = 60 * 60 * 24 * 90;
  return `${COOKIE_NAME}=${id}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax; Secure`;
}
