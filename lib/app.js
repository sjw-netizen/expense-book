import express from 'express';
import { getSql, ensureSchema } from './db.js';
import {
  checkPassword,
  setSessionCookie,
  clearSessionCookie,
  isAuthenticated,
  requireAuth,
} from './auth.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '10kb' }));

app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'same-origin');
  if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
  next();
});

// ---------- 입력 검증 ----------
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

function isValidDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function parseExpense(body) {
  const { date, item, category, amount } = body || {};
  const errors = [];
  if (!isValidDate(date)) errors.push('날짜 형식이 올바르지 않습니다.');
  const itemText = typeof item === 'string' ? item.trim() : '';
  if (!itemText || itemText.length > 100) errors.push('항목은 1~100자로 입력해 주세요.');
  const categoryText = typeof category === 'string' ? category.trim() : '';
  if (!categoryText || categoryText.length > 30) errors.push('카테고리는 1~30자로 입력해 주세요.');
  const amountNum = Number(amount);
  if (!Number.isInteger(amountNum) || amountNum < 0 || amountNum > 2147483647) errors.push('금액은 0 ~ 2,147,483,647 사이의 정수로 입력해 주세요.');
  return { errors, value: { date, item: itemText, category: categoryText, amount: amountNum } };
}

function parseId(raw) {
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 && id <= 2147483647 ? id : null;
}

function monthRange(month) {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

const toExpense = (r) => ({
  id: Number(r.id),
  date: r.date,
  item: r.item,
  category: r.category,
  amount: Number(r.amount),
});

// ---------- 인증 ----------
const loginAttempts = new Map(); // 인스턴스 단위의 간단한 무차별 대입 방지
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

app.post('/api/login', (req, res) => {
  const key = req.ip || 'unknown';
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (entry && now - entry.first < WINDOW_MS && entry.count >= MAX_ATTEMPTS) {
    return res.status(429).json({ error: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.' });
  }
  if (!process.env.APP_PASSWORD) {
    return res.status(500).json({ error: '서버에 APP_PASSWORD가 설정되지 않았습니다.' });
  }
  if (!checkPassword(req.body?.password)) {
    if (!entry || now - entry.first >= WINDOW_MS) loginAttempts.set(key, { first: now, count: 1 });
    else entry.count += 1;
    return res.status(401).json({ error: '비밀번호가 올바르지 않습니다.' });
  }
  loginAttempts.delete(key);
  setSessionCookie(req, res);
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  res.json({ authenticated: isAuthenticated(req) });
});

// 이하 모든 /api 요청은 로그인 필요
app.use('/api', requireAuth, async (req, res, next) => {
  try {
    await ensureSchema();
    next();
  } catch (err) {
    next(err);
  }
});

// ---------- 지출 CRUD ----------
// GET /api/expenses?from=YYYY-MM-DD&to=YYYY-MM-DD  (둘 다 선택)
app.get('/api/expenses', async (req, res) => {
  const from = req.query.from || null;
  const to = req.query.to || null;
  if ((from && !isValidDate(from)) || (to && !isValidDate(to))) {
    return res.status(400).json({ error: '날짜 형식이 올바르지 않습니다.' });
  }
  const sql = getSql();
  const rows = await sql`
    SELECT id, to_char(date, 'YYYY-MM-DD') AS date, item, category, amount
    FROM expenses
    WHERE (${from}::date IS NULL OR date >= ${from}::date)
      AND (${to}::date IS NULL OR date <= ${to}::date)
    ORDER BY date DESC, id DESC
    LIMIT 1000`;
  res.json(rows.map(toExpense));
});

app.post('/api/expenses', async (req, res) => {
  const { errors, value } = parseExpense(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });
  const sql = getSql();
  const [row] = await sql`
    INSERT INTO expenses (date, item, category, amount)
    VALUES (${value.date}, ${value.item}, ${value.category}, ${value.amount})
    RETURNING id, to_char(date, 'YYYY-MM-DD') AS date, item, category, amount`;
  res.status(201).json(toExpense(row));
});

app.put('/api/expenses/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: '잘못된 ID입니다.' });
  const { errors, value } = parseExpense(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });
  const sql = getSql();
  const [row] = await sql`
    UPDATE expenses
    SET date = ${value.date}, item = ${value.item}, category = ${value.category},
        amount = ${value.amount}
    WHERE id = ${id}
    RETURNING id, to_char(date, 'YYYY-MM-DD') AS date, item, category, amount`;
  if (!row) return res.status(404).json({ error: '내역을 찾을 수 없습니다.' });
  res.json(toExpense(row));
});

app.delete('/api/expenses/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: '잘못된 ID입니다.' });
  const sql = getSql();
  const rows = await sql`DELETE FROM expenses WHERE id = ${id} RETURNING id`;
  if (!rows.length) return res.status(404).json({ error: '내역을 찾을 수 없습니다.' });
  res.json({ ok: true });
});

// ---------- 통계 ----------
// GET /api/summary/monthly?year=2026
app.get('/api/summary/monthly', async (req, res) => {
  const year = Number(req.query.year || new Date().getFullYear());
  if (!Number.isInteger(year) || year < 1900 || year > 3000) {
    return res.status(400).json({ error: '연도가 올바르지 않습니다.' });
  }
  const sql = getSql();
  const rows = await sql`
    SELECT to_char(date, 'YYYY-MM') AS month,
           COALESCE(SUM(amount), 0) AS total,
           COUNT(*) AS count
    FROM expenses
    WHERE date >= make_date(${year}::int, 1, 1)
      AND date <  make_date(${year}::int + 1, 1, 1)
    GROUP BY 1
    ORDER BY 1`;
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  const months = Array.from({ length: 12 }, (_, i) => {
    const month = `${year}-${String(i + 1).padStart(2, '0')}`;
    const r = byMonth.get(month);
    return { month, total: r ? Number(r.total) : 0, count: r ? Number(r.count) : 0 };
  });
  res.json({ year, months, total: months.reduce((s, m) => s + m.total, 0) });
});

// GET /api/summary/category?month=YYYY-MM  (생략 시 전체 기간)
app.get('/api/summary/category', async (req, res) => {
  const month = req.query.month || null;
  if (month && !MONTH_RE.test(month)) {
    return res.status(400).json({ error: '월 형식이 올바르지 않습니다.' });
  }
  const { from, to } = month ? monthRange(month) : { from: null, to: null };
  const sql = getSql();
  const rows = await sql`
    SELECT category, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
    FROM expenses
    WHERE (${from}::date IS NULL OR date >= ${from}::date)
      AND (${to}::date IS NULL OR date <= ${to}::date)
    GROUP BY category
    ORDER BY total DESC`;
  const categories = rows.map((r) => ({
    category: r.category,
    total: Number(r.total),
    count: Number(r.count),
  }));
  res.json({ month, categories, total: categories.reduce((s, c) => s + c.total, 0) });
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: '존재하지 않는 API입니다.' });
});

// 오류 상세(접속 정보 등)는 서버 로그에만 남기고 클라이언트에는 일반 메시지만 보낸다.
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: '서버 오류가 발생했습니다.' });
});

export default app;
