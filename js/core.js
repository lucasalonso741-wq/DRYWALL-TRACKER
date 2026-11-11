'use strict';
/* =====================================================================
   AA Drywall Job Tracker: core (auth, data, live updates, router, helpers)
   ===================================================================== */
const SB_URL = 'https://svvjsumhkbezbyskxxej.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2dmpzdW1oa2JlemJ5c2t4eGVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMjYxNzMsImV4cCI6MjA5MTcwMjE3M30.91A6_m36yMsOr2vofpH7wTVVnCtpuM2hssy1K-vStRQ';
const sb = window.sbLib.createClient(SB_URL, SB_KEY);

const S = {
  user: null, recovery: false,
  jobs: [], money: [], vendors: [], mats: [],
  inbox: { pos: 0, bills: 0, mats: 0 },
  lastSync: null, loadedAt: 0, live: false,
  cache: {}, route: ['jobs'], dirty: false,
};
const A = {};          // actions called from onclick

const CATS = ['board','metal_framing','lumber','sheet_goods','fasteners','finishing','sealants','insulation','tools_supplies','labor','tax_fees','misc'];
const CATLABEL = { board:'Boards', metal_framing:'Metal framing', lumber:'Lumber', sheet_goods:'Sheet goods', fasteners:'Fasteners', finishing:'Finishing', sealants:'Sealants', insulation:'Insulation', tools_supplies:'Tools and supplies', labor:'Labor', tax_fees:'Tax and fees', misc:'Misc', uncategorized:'Not matched yet' };
const PHASES = [['framing','Framing'],['hang','Hang'],['finish','Finish'],['punch','Punch out'],['other','Other materials'],['labor','Labor not split by phase']];
const PHASE_LABEL = Object.fromEntries(PHASES);
const PHASE_COLOR = { framing:'var(--framing)', hang:'var(--hang)', finish:'var(--finish)', punch:'var(--punch)', other:'var(--other)', labor:'var(--labor)' };
const LABOR_PHASES = [['framing','Framing'],['hang','Hang'],['finish','Finish'],['punch','Punch out'],['other','Other']];
function phaseOf(cat){
  if (['metal_framing','lumber','sheet_goods'].includes(cat)) return 'framing';
  if (['board','fasteners'].includes(cat)) return 'hang';
  if (['finishing','sealants'].includes(cat)) return 'finish';
  if (cat === 'labor') return 'labor';
  return 'other';
}
function laborPhaseFromNote(t){
  t = String(t || '');
  if (/fram/i.test(t)) return 'framing';
  if (/hang|board/i.test(t)) return 'hang';
  if (/finish|tape|mud|paint|sand/i.test(t)) return 'finish';
  if (/punch/i.test(t)) return 'punch';
  return 'labor';
}

/* ---------- small helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const n0 = (v) => Number(v || 0);
function money(v, cents) {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v); if (!isFinite(n)) return '';
  const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
  return (n < 0 ? '-$' : '$') + s;
}
function moneyK(v) {
  const n = Number(v || 0), a = Math.abs(n), sg = n < 0 ? '-' : '';
  if (a >= 1e6) return sg + '$' + (a / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
  if (a >= 1e3) return sg + '$' + Math.round(a / 1e3) + 'K';
  return sg + '$' + Math.round(a);
}
const qty = (v) => (v === null || v === undefined || v === '') ? '' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 1 });
const pctTxt = (v) => (v === null || v === undefined || !isFinite(v)) ? '' : Math.round(v) + '%';
function dt(d) { return d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''; }
function dtShort(d) { return d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''; }
const jn = (name) => String(name || '').replace(/^JOB\s+/i, '');
const today = () => new Date().toISOString().slice(0, 10);
function ago(ts) {
  if (!ts) return '';
  const m = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 2) return 'just now';
  if (m < 60) return m + ' minutes ago';
  const h = Math.round(m / 60);
  if (h < 36) return h + (h === 1 ? ' hour ago' : ' hours ago');
  return Math.round(h / 24) + ' days ago';
}
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const moneyOf = (id) => S.money.find(m => m.job_id === id);
const jobOf = (id) => S.jobs.find(j => j.id === id);
const matOf = (id) => S.mats.find(m => m.id === id);
const jobName = (id) => jn(jobOf(id)?.name || '');

function toast(msg, isErr) {
  const t = document.createElement('div');
  t.className = 'toast' + (isErr ? ' err' : ''); t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), isErr ? 7000 : 3000);
}
function errMsg(e) {
  const m = (e && e.message) || String(e);
  if (e && (e.code === '42501' || /row-level security|permission denied/i.test(m))) return 'You are not allowed to change this. Sign in again, or ask Lucas to give your account access.';
  if (/JWT|token.*expired/i.test(m)) return 'Your sign in expired. Please sign in again.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'No connection right now. Check your internet and try again.';
  return m.slice(0, 220);
}
function fail(e) { console.error(e); toast(errMsg(e), true); }

/* ---------- database helpers (every write is verified) ---------- */
async function run(p) { const { data, error } = await p; if (error) throw error; return data; }
async function all(makeQuery) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const rows = await run(makeQuery().range(from, from + 999));
    out.push(...rows); if (rows.length < 1000) break;
  }
  return out;
}
async function countOf(p) { const { count, error } = await p; if (error) throw error; return count || 0; }
async function save(table, id, patch) {
  const rows = await run(sb.from(table).update(patch).eq('id', id).select('id'));
  if (!rows || !rows.length) throw new Error('That change was not saved. It may be blocked, or the record was removed.');
  S.dirty = true; return rows[0];
}
async function insert(table, row) {
  const rows = await run(sb.from(table).insert(row).select());
  if (!rows || !rows.length) throw new Error('Could not add that. It may be blocked.');
  S.dirty = true; return Array.isArray(row) ? rows : rows[0];
}
async function remove(table, id) {
  const rows = await run(sb.from(table).delete().eq('id', id).select('id'));
  if (!rows || !rows.length) throw new Error('Could not delete that. It may be blocked, or already gone.');
  S.dirty = true;
}
async function audit(action, entity, id, detail) {
  try { await sb.from('app_audit').insert({ action, entity, entity_id: String(id || ''), detail: detail || {}, actor: S.user?.email || 'app' }); } catch (e) { /* log only */ }
}

/* ---------- csv ---------- */
function parseTable(text) {
  text = String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n').trim();
  if (!text) return { headers: [], rows: [] };
  const d = text.split('\n')[0].includes('\t') ? '\t' : ',';
  const out = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === d) { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); out.push(row); row = []; cur = ''; }
    else cur += c;
  }
  row.push(cur); out.push(row);
  const headers = out[0].map(h => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''));
  const rows = out.slice(1).filter(r => r.some(x => x.trim() !== '')).map(r => Object.fromEntries(headers.map((h, i) => [h, (r[i] || '').trim()])));
  return { headers, rows };
}
function parseNum(s) {
  if (s === null || s === undefined) return null;
  let t = String(s).trim(); if (t === '') return null;
  const neg = /^\(.*\)$/.test(t) || /^-/.test(t);
  t = t.replace(/[^0-9.]/g, ''); if (t === '') return null;
  const n = Number(t); return neg ? -n : n;
}
function parseDate(s) {
  s = String(s || '').trim(); if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) { let y = m[3]; if (y.length === 2) y = '20' + y; return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`; }
  return null;
}
function downloadCSV(name, rows) {
  if (!rows.length) return toast('Nothing to export yet', true);
  const cols = Object.keys(rows[0]);
  const q = (v) => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const csv = [cols.join(','), ...rows.map(r => cols.map(c => q(r[c])).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ---------- modal + drawer ---------- */
function openModal(title, body, opts = {}) {
  const m = $('#modal'); m.className = opts.wide ? 'wide' : '';
  m.innerHTML = `<div class="m-head"><h3>${title}</h3><button class="x" onclick="closeModal()" aria-label="Close">&times;</button></div>
    <div class="m-body">${body}</div>
    <div class="m-foot">${opts.foot || ''}<button class="btn" onclick="closeModal()">${opts.onSave ? 'Cancel' : 'Close'}</button>
    ${opts.onSave ? `<button class="btn primary" id="m-save">${opts.saveLabel || 'Save'}</button>` : ''}</div>`;
  $('#modal-back').hidden = false;
  if (opts.onSave) $('#m-save').onclick = async () => {
    const b = $('#m-save'); b.disabled = true;
    try { const r = await opts.onSave(); if (r !== false) closeModal(); } catch (e) { fail(e); } finally { if (b) b.disabled = false; }
  };
  setTimeout(() => { const f = $('#modal input:not([type=checkbox]),#modal select'); if (f) f.focus(); }, 30);
}
function closeModal() { $('#modal-back').hidden = true; $('#modal').innerHTML = ''; }
function openDrawer(title, html) {
  $('#drawer-title').textContent = title; $('#drawer-body').innerHTML = html;
  $('#drawer').hidden = false; $('#drawer-back').hidden = false; setSaveState('');
}
function closeDrawer(skipRefresh) {
  $('#drawer').hidden = true; $('#drawer-back').hidden = true; $('#drawer-body').innerHTML = '';
  if (!skipRefresh && S.dirty) { S.dirty = false; refreshSoft(); }
}
function setSaveState(kind, txt) {
  const e = $('#save-state'); if (!e) return;
  e.className = 'save-state ' + (kind || '');
  e.textContent = txt ?? ({ ok: 'Saved', err: 'Not saved', saving: 'Saving...' }[kind] || '');
}
$('#modal-back').addEventListener('mousedown', (e) => { if (e.target.id === 'modal-back') closeModal(); });
$('#drawer-back').addEventListener('mousedown', () => closeDrawer());
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if (!$('#modal-back').hidden) closeModal(); else if (!$('#drawer').hidden) closeDrawer(); }
  if (e.key === 'Enter' && !$('#modal-back').hidden && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') {
    const b = $('#m-save'); if (b && !b.disabled) { e.preventDefault(); b.click(); }
  }
});

/* ---------- autosave for any input with data-t / data-id / data-c ---------- */
A.field = async (el) => {
  const { t, id, c, k } = el.dataset;
  let v = el.value;
  if (k === 'num') v = v === '' ? null : Number(v);
  else if (k === 'text0') v = v.trim() || null;
  else if (k === 'bool') v = el.checked;
  else if (k === 'upper') v = v.trim().toUpperCase();
  setSaveState('saving');
  try {
    await save(t, id, { [c]: v });
    el.classList.remove('bad'); el.classList.add('saved'); setTimeout(() => el.classList.remove('saved'), 1400);
    setSaveState('ok'); S.cache = {};
    if (el.dataset.after && A[el.dataset.after]) A[el.dataset.after](el);
  } catch (e) { el.classList.add('bad'); setSaveState('err'); fail(e); }
};

/* ---------- sign in ---------- */
async function boot() {
  $('#login-form').addEventListener('submit', doLogin);
  $('#lg-forgot').addEventListener('click', doForgot);
  sb.auth.onAuthStateChange((ev) => {
    if (ev === 'SIGNED_OUT') { S.user = null; showLogin(); }
    if (ev === 'PASSWORD_RECOVERY') S.recovery = true;
  });
  const { data } = await sb.auth.getSession();
  if (data.session) { S.user = data.session.user; await enter(); } else showLogin();
}
function showLogin() { $('#app').hidden = true; $('#login').hidden = false; $('#lg-email').focus(); }
async function doLogin(e) {
  e.preventDefault();
  const btn = $('#lg-btn'); btn.disabled = true; $('#lg-err').textContent = '';
  const { data, error } = await sb.auth.signInWithPassword({ email: $('#lg-email').value.trim(), password: $('#lg-pass').value });
  btn.disabled = false;
  if (error) { $('#lg-err').textContent = /invalid/i.test(error.message) ? 'Wrong email or password.' : error.message; return; }
  S.user = data.user; await enter();
}
async function doForgot(e) {
  e.preventDefault();
  const email = $('#lg-email').value.trim();
  if (!email) { $('#lg-err').textContent = 'Type your email above first.'; return; }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  $('#lg-err').textContent = error ? error.message : 'Check your email for a reset link.';
}
A.signOut = async () => { await sb.auth.signOut(); };
A.changePassword = (forced) => {
  openModal(forced ? 'Set a new password' : 'Change password', `
    <div class="fields"><div class="fld"><label>New password</label><input id="pw1" type="password" autocomplete="new-password"></div>
    <div class="fld"><label>Type it again</label><input id="pw2" type="password" autocomplete="new-password"></div></div>
    <div class="help">At least 8 characters.</div>`, {
    saveLabel: 'Save password',
    onSave: async () => {
      const a = $('#pw1').value, b = $('#pw2').value;
      if (a.length < 8) { toast('Use at least 8 characters', true); return false; }
      if (a !== b) { toast('The two passwords do not match', true); return false; }
      const { error } = await sb.auth.updateUser({ password: a });
      if (error) throw error;
      S.recovery = false; toast('Password changed');
    }
  });
};
async function enter() {
  $('#login').hidden = true; $('#app').hidden = false;
  try { await loadCore(); } catch (e) { fail(e); }
  startLive(); route();
  if (S.recovery) A.changePassword(true);
}

/* ---------- load the shared data ---------- */
async function loadCore() {
  const [jobs, money, vendors, mats, poNo, billNo, rq, sync] = await Promise.all([
    run(sb.from('jobs').select('*').order('name')),
    run(sb.from('v_job_money').select('*').order('name')),
    all(() => sb.from('vendors').select('id,name,type').order('name')),
    run(sb.from('materials').select('*').order('name')),
    countOf(sb.from('purchase_orders').select('id', { count: 'exact', head: true }).is('job_id', null).eq('archived', false)),
    countOf(sb.from('bills').select('id', { count: 'exact', head: true }).is('job_id', null)),
    countOf(sb.from('v_review_queue').select('norm', { count: 'exact', head: true })),
    run(sb.from('app_audit').select('created_at').eq('action', 'qb_ingest').order('created_at', { ascending: false }).limit(1)),
  ]);
  S.jobs = jobs; S.money = money; S.vendors = vendors; S.mats = mats;
  S.inbox = { pos: poNo, bills: billNo, mats: rq };
  S.lastSync = sync[0]?.created_at || null;
  S.loadedAt = Date.now();
  renderNav(); renderStatus();
}
function vendorOf(id) { return S.vendors.find(v => v.id === id); }

/* ---------- live updates that never wipe what you are typing ---------- */
let _refreshing = false;
function isEditing() {
  if (!$('#drawer').hidden || !$('#modal-back').hidden) return true;
  const a = document.activeElement;
  return !!(a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName) && $('#view').contains(a));
}
async function refreshSoft() {
  if (_refreshing) return; _refreshing = true;
  try {
    S.cache = {}; await loadCore();
    if (isEditing()) $('#pending').hidden = false; else await rerender();
  } catch (e) { console.warn(e); } finally { _refreshing = false; }
}
async function rerender() {
  $('#pending').hidden = true;
  const y = window.scrollY;
  await route(true);
  window.scrollTo(0, y);
}
A.refresh = async () => { S.cache = {}; try { await loadCore(); await rerender(); toast('Up to date'); } catch (e) { fail(e); } };
function startLive() {
  if (S.chan) return;
  const bump = debounce(() => refreshSoft(), 1500);
  S.chan = sb.channel('live');
  ['purchase_orders', 'po_line_items', 'bills', 'bill_line_items', 'budgets', 'materials', 'jobs', 'labor_entries', 'job_progress']
    .forEach(t => S.chan.on('postgres_changes', { event: '*', schema: 'public', table: t }, bump));
  S.chan.subscribe((st) => { S.live = st === 'SUBSCRIBED'; renderStatus(); });
  setInterval(() => { if (document.visibilityState === 'visible' && Date.now() - S.loadedAt > 60000) refreshSoft(); }, 20000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - S.loadedAt > 30000) refreshSoft(); });
}

/* ---------- header + router ---------- */
const NAV = [['jobs', 'Jobs'], ['archive', 'Archive'], ['inbox', 'Inbox'], ['orders', 'Orders'], ['setup', 'Setup']];
function renderNav() {
  const cur = S.route[0] === 'job' ? 'jobs' : S.route[0];
  const n = S.inbox.pos + S.inbox.bills + S.inbox.mats;
  $('#nav').innerHTML = NAV.map(([r, l]) =>
    `<a href="#/${r}" class="${cur === r ? 'on' : ''}">${l}${r === 'inbox' && n ? `<span class="badge">${n}</span>` : ''}</a>`).join('');
}
function renderStatus() {
  const t = S.loadedAt ? new Date(S.loadedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
  const stale = S.lastSync && (Date.now() - new Date(S.lastSync).getTime() > 30 * 3600e3);
  $('#status').innerHTML = `<span class="dot ${S.live ? '' : 'off'}" title="${S.live ? 'Live updates on' : 'Live updates reconnecting'}"></span>
    <span class="txt">Updated ${t}${S.lastSync ? `, QuickBooks ${stale ? '<b style="color:#f0a030">last synced ' : 'synced '}${ago(S.lastSync)}${stale ? '</b>' : ''}` : ''}</span>
    <button onclick="A.refresh()">Refresh</button>`;
}
const ROUTES = {};
function route(soft) {
  const h = location.hash.replace(/^#\/?/, '') || 'jobs';
  const parts = h.split('/');
  S.route = parts; renderNav();
  const fn = ROUTES[parts[0]] || ROUTES.jobs;
  if (!soft) window.scrollTo(0, 0);
  return Promise.resolve(fn(...parts.slice(1))).catch(fail);
}
window.addEventListener('hashchange', () => { closeDrawer(true); closeModal(); route(); });
function view(html) { $('#view').innerHTML = html; }
function loading() { view('<div class="empty">Loading...</div>'); }

/* small shared html builders */
const fld = (label, html, help) => `<div class="fld"><label>${label}</label>${html}${help ? `<div class="help">${help}</div>` : ''}</div>`;
function selectHtml(options, selected, attrs = '', blank) {
  return `<select ${attrs}>${blank !== undefined ? `<option value="">${esc(blank)}</option>` : ''}${options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(selected ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
}
const jobOptions = (activeOnly) => S.jobs.filter(j => !activeOnly || j.active).map(j => [j.id, jn(j.name)]);
function matSelect(sel, attrs = '', blank = 'Pick a material') {
  const groups = {};
  S.mats.filter(m => m.active !== false).forEach(m => { (groups[m.category || 'misc'] = groups[m.category || 'misc'] || []).push(m); });
  return `<select ${attrs}><option value="">${esc(blank)}</option>${[...CATS, ...Object.keys(groups).filter(c => !CATS.includes(c))].filter(c => groups[c]).map(c =>
    `<optgroup label="${esc(CATLABEL[c] || c)}">${groups[c].map(m => `<option value="${m.id}" ${m.id === sel ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</optgroup>`).join('')}</select>`;
}
