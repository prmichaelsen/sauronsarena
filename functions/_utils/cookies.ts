// functions/_utils/cookies.ts
// Cookie helpers — anon browser_id issuance + read, and admin/dev
// bypass cookie for the originator's iteration loop.

const COOKIE_NAME = 'sa_bid';
const DEV_COOKIE_NAME = 'sa_dev';

function readCookie(request: Request, name: string): string | null {
  const cookie = request.headers.get('Cookie');
  if (!cookie) return null;
  const pairs = cookie.split(/;\s*/);
  for (const pair of pairs) {
    const [k, v] = pair.split('=');
    if (k === name) return v;
  }
  return null;
}

export function readBrowserId(request: Request): string | null {
  return readCookie(request, COOKIE_NAME);
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

// --- Admin/dev bypass ---------------------------------------------

export function readDevToken(request: Request): string | null {
  return readCookie(request, DEV_COOKIE_NAME);
}

export function setDevTokenHeader(token: string): string {
  // 30 days; site-only; HTTP-only. Shorter than the browser_id cookie
  // — admin tokens should rotate more often than anon identities.
  const maxAge = 60 * 60 * 24 * 30;
  return `${DEV_COOKIE_NAME}=${token}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax; Secure`;
}

/**
 * Resolve whether this request is an admin/dev request that should
 * bypass per-user and spend caps. Two ways in:
 *   1. `?dev=<token>` query param matches `env.ADMIN_DEV_TOKEN`
 *   2. `sa_dev` cookie matches `env.ADMIN_DEV_TOKEN`
 *
 * Returns `{ isAdmin, setCookie }` where setCookie is the cookie
 * value to issue when admin was authenticated via query param (so
 * subsequent navigations bypass without needing the URL param).
 * setCookie is null when the request was already authenticated by
 * cookie or when not admin.
 */
export function resolveAdmin(
  request: Request,
  adminToken: string | undefined,
): { isAdmin: boolean; setCookie: string | null } {
  if (!adminToken) return { isAdmin: false, setCookie: null };

  const url = new URL(request.url);
  const queryToken = url.searchParams.get('dev');
  if (queryToken && queryToken === adminToken) {
    return { isAdmin: true, setCookie: setDevTokenHeader(adminToken) };
  }

  const cookieToken = readDevToken(request);
  if (cookieToken && cookieToken === adminToken) {
    return { isAdmin: true, setCookie: null };
  }

  return { isAdmin: false, setCookie: null };
}
