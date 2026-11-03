'use strict';

const $ = (sel) => document.querySelector(sel);
const won = (n) => `${Number(n).toLocaleString('ko-KR')}원`;

const pad = (n) => String(n).padStart(2, '0');
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const thisMonth = () => todayStr().slice(0, 7);
const monthBounds = (month) => {
  const [y, m] = month.split('-').map(Number);
  return { from: `${month}-01`, to: `${month}-${pad(new Date(y, m, 0).getDate())}` };
};

const state = {
  editingId: null,
  expenses: [],
  filter: monthBounds(thisMonth()),
};

// ---------- API ----------
async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/api/login') {
    showLogin();
    throw new Error(data.error || '로그인이 필요합니다.');
  }
  if (!res.ok) throw new Error(data.error || `요청 실패 (${res.status})`);
  return data;
}

// ---------- 화면 전환 ----------
function showLogin() {
  $('#app-view').hidden = true;
  $('#login-view').hidden = false;
  $('#password').value = '';
  $('#password').focus();
}

async function showApp() {
  $('#login-view').hidden = true;
  $('#app-view').hidden = false;
  resetForm();
  setupYearSelect();
  $('#category-month').value = thisMonth();
  $('#search-form').from.value = state.filter.from;
  $('#search-form').to.value = state.filter.to;
  await refreshAll();
}

async function refreshAll() {
  await Promise.all([loadExpenses(), loadMonthly(), loadCategory()]).catch((err) => alert(err.message));
}

// ---------- 로그인 ----------
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#login-error').textContent = '';
  try {
    await api('/api/login', { method: 'POST', body: JSON.stringify({ password: $('#password').value }) });
    await showApp();
  } catch (err) {
    $('#login-error').textContent = err.message;
  }
});

$('#logout-btn').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' }).catch(() => {});
  showLogin();
});

// ---------- 지출 추가 / 수정 ----------
const form = $('#expense-form');

function resetForm() {
  state.editingId = null;
  form.reset();
  form.date.value = todayStr();
  $('#form-title').textContent = '지출 추가';
  $('#submit-btn').textContent = '추가';
  $('#cancel-edit-btn').hidden = true;
  $('#form-error').textContent = '';
  renderExpenses();
}

function startEdit(expense) {
  state.editingId = expense.id;
  form.date.value = expense.date;
  form.item.value = expense.item;
  if (![...form.category.options].some((o) => o.value === expense.category)) {
    form.category.add(new Option(expense.category));
  }
  form.category.value = expense.category;
  form.amount.value = expense.amount;
  $('#form-title').textContent = '지출 수정';
  $('#submit-btn').textContent = '저장';
  $('#cancel-edit-btn').hidden = false;
  renderExpenses();
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  form.item.focus();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#form-error').textContent = '';
  const payload = {
    date: form.date.value,
    item: form.item.value.trim(),
    category: form.category.value,
    amount: Number(form.amount.value),
  };
  const btn = $('#submit-btn');
  btn.disabled = true;
  try {
    if (state.editingId) {
      await api(`/api/expenses/${state.editingId}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await api('/api/expenses', { method: 'POST', body: JSON.stringify(payload) });
    }
    const keepDate = payload.date;
    resetForm();
    form.date.value = keepDate;
    await refreshAll();
  } catch (err) {
    $('#form-error').textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

$('#cancel-edit-btn').addEventListener('click', resetForm);

async function deleteExpense(expense) {
  if (!confirm(`"${expense.item}" (${won(expense.amount)}) 내역을 삭제할까요?`)) return;
  try {
    await api(`/api/expenses/${expense.id}`, { method: 'DELETE' });
    if (state.editingId === expense.id) resetForm();
    await refreshAll();
  } catch (err) {
    alert(err.message);
  }
}

// ---------- 내역 조회 / 검색 ----------
async function loadExpenses() {
  const params = new URLSearchParams();
  if (state.filter.from) params.set('from', state.filter.from);
  if (state.filter.to) params.set('to', state.filter.to);
  state.expenses = await api(`/api/expenses?${params}`);
  renderExpenses();
}

function renderExpenses() {
  const tbody = $('#expense-rows');
  tbody.replaceChildren();
  for (const exp of state.expenses) {
    const tr = document.createElement('tr');
    if (exp.id === state.editingId) tr.className = 'editing';

    const cells = [exp.date, exp.item];
    for (const text of cells) {
      const td = document.createElement('td');
      td.textContent = text;
      tr.append(td);
    }
    const catTd = document.createElement('td');
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = exp.category;
    catTd.append(tag);
    tr.append(catTd);

    const amountTd = document.createElement('td');
    amountTd.className = 'num';
    amountTd.textContent = won(exp.amount);
    tr.append(amountTd);

    const actions = document.createElement('td');
    actions.className = 'actions';
    const editBtn = document.createElement('button');
    editBtn.className = 'btn small';
    editBtn.textContent = '수정';
    editBtn.addEventListener('click', () => startEdit(exp));
    const delBtn = document.createElement('button');
    delBtn.className = 'btn small danger';
    delBtn.textContent = '삭제';
    delBtn.addEventListener('click', () => deleteExpense(exp));
    actions.append(editBtn, delBtn);
    tr.append(actions);

    tbody.append(tr);
  }
  const total = state.expenses.reduce((s, e) => s + e.amount, 0);
  const { from, to } = state.filter;
  const range = from || to ? `${from || '처음'} ~ ${to || '끝'}` : '전체 기간';
  $('#list-summary').textContent = `${range} · ${state.expenses.length}건 · ${won(total)}`;
  $('#empty-msg').hidden = state.expenses.length > 0;
}

const searchForm = $('#search-form');
searchForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const from = searchForm.from.value;
  const to = searchForm.to.value;
  if (from && to && from > to) {
    alert('시작일이 종료일보다 늦을 수 없습니다.');
    return;
  }
  state.filter = { from, to };
  await loadExpenses().catch((err) => alert(err.message));
});

searchForm.addEventListener('click', async (e) => {
  const range = e.target.dataset?.range;
  if (!range) return;
  if (range === 'today') state.filter = { from: todayStr(), to: todayStr() };
  if (range === 'month') state.filter = monthBounds(thisMonth());
  if (range === 'all') state.filter = { from: '', to: '' };
  searchForm.from.value = state.filter.from;
  searchForm.to.value = state.filter.to;
  await loadExpenses().catch((err) => alert(err.message));
});

// ---------- 월별 합계 ----------
function setupYearSelect() {
  const sel = $('#year-select');
  const current = new Date().getFullYear();
  const selected = Number(sel.value) || current;
  sel.replaceChildren();
  for (let y = current + 1; y >= current - 5; y--) {
    sel.add(new Option(`${y}년`, String(y), false, y === selected));
  }
}

$('#year-select').addEventListener('change', () => loadMonthly().catch((err) => alert(err.message)));

async function loadMonthly() {
  const year = $('#year-select').value;
  const data = await api(`/api/summary/monthly?year=${encodeURIComponent(year)}`);
  const tbody = $('#monthly-rows');
  tbody.replaceChildren();
  for (const m of data.months) {
    const tr = document.createElement('tr');
    if (!m.total) tr.className = 'zero';
    const label = document.createElement('td');
    label.textContent = `${Number(m.month.slice(5))}월`;
    const count = document.createElement('td');
    count.className = 'num';
    count.textContent = m.count ? `${m.count}건` : '-';
    const total = document.createElement('td');
    total.className = 'num';
    total.textContent = won(m.total);
    tr.append(label, count, total);
    tbody.append(tr);
  }
  $('#year-total').textContent = won(data.total);
}

// ---------- 카테고리별 합계 + 막대그래프 ----------
$('#category-month').addEventListener('change', () => loadCategory().catch((err) => alert(err.message)));

async function loadCategory() {
  const month = $('#category-month').value;
  const query = month ? `?month=${encodeURIComponent(month)}` : '';
  const data = await api(`/api/summary/category${query}`);
  const chart = $('#category-chart');
  chart.replaceChildren();
  const max = Math.max(1, ...data.categories.map((c) => c.total));

  for (const c of data.categories) {
    const row = document.createElement('div');
    row.className = 'bar-row';

    const label = document.createElement('div');
    label.className = 'bar-label';
    label.textContent = c.category;
    label.title = c.category;

    const wrap = document.createElement('div');
    const track = document.createElement('div');
    track.className = 'bar-track';
    const fill = document.createElement('div');
    fill.className = 'bar-fill';
    fill.style.width = '0%';
    track.append(fill);
    const value = document.createElement('div');
    value.className = 'bar-value';
    const pct = data.total ? Math.round((c.total / data.total) * 100) : 0;
    value.textContent = `${won(c.total)} · ${pct}% · ${c.count}건`;
    wrap.append(track, value);

    row.append(label, wrap);
    chart.append(row);
    requestAnimationFrame(() => { fill.style.width = `${(c.total / max) * 100}%`; });
  }
  $('#category-total').textContent = won(data.total);
  $('#category-empty').hidden = data.categories.length > 0;
}

// ---------- 시작 ----------
(async () => {
  try {
    const { authenticated } = await api('/api/me');
    if (authenticated) await showApp();
    else showLogin();
  } catch {
    showLogin();
  }
})();
