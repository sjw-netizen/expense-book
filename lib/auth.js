import crypto from 'node:crypto';

const COOKIE_NAME = 'ledger_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7일

function signingKey() {
  const password = process.env.APP_PASSWORD;
  if (!password) throw new Error('APP_PASSWORD 환경변수가 설정되지 않았습니다.');
  // SESSION_SECRET이 있으면 함께 사용하고, 비밀번호를 바꾸면 기존 세션은 모두 무효가 된다.
  return crypto
    .createHash('sha256')
    .update(`${process.env.SESSION_SECRET || ''}:${password}`)
    .digest();
}

function hmac(value) {
  return crypto.createHmac('sha256', signingKey()).update(value).digest('base64url');
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function isValidToken(token) {
  if (!token) return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig || !/^\d+$/.test(exp)) return false;
  if (Number(exp) < Date.now()) return false;
  return safeEqual(sig, hmac(exp));
}

export function checkPassword(input) {
  return typeof input === 'string' && safeEqual(input, process.env.APP_PASSWORD || '');
}

export function setSessionCookie(req, res) {
  const exp = String(Date.now() + SESSION_TTL_MS);
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.cookie(COOKIE_NAME, `${exp}.${hmac(exp)}`, {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

export function isAuthenticated(req) {
  return isValidToken(parseCookies(req.headers.cookie)[COOKIE_NAME]);
}

export function requireAuth(req, res, next) {
  if (isAuthenticated(req)) return next();
  res.status(401).json({ error: '로그인이 필요합니다.' });
}
