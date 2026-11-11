'use strict';
/* =====================================================================
   Setup: import past data, materials, vendors, account
   ===================================================================== */

async function renderSetup(sub) {
  sub = sub || 'import';
  const tabs = [['import', 'Add past data'], ['materials', 'Materials'], ['vendors', 'Vendors'], ['account', 'Account']];
  const fn = { import: setupImport, materials: setupMaterials, vendors: setupVendors, account: setupAccount }[sub] || setupImport;
  view(`<h1 class="mb">Setup</h1><div class="seg mb">${tabs.map(([k, l]) => `<a href="#/setup/${k}" class="${sub === k ? 'on' : ''}">${l}</a>`).join('')}</div><div id="tab"></div>`);
  await fn();
}
ROUTES.setup = renderSetup;

/* ---------- backfill ---------- */
const IMPORT_TYPES = [['framing', 'Framing materials'], ['boards', 'Boards'], ['finishing', 'Finishing materials'], ['other', 'Other materials'], ['labor', 'Labor']];
function importKind(t) {
  t = String(t || '').toLowerCase();
  if (/labor|crew|hang(ing)? (pay|labor)|payroll|wage/.test(t)) return 'labor';
  if (/board|sheetrock|gypsum|drywall/.test(t)) return 'boards';
  if (/fram|stud|track|metal|lumber/.test(t)) return 'framing';
  if (/finish|mud|tape|joint|compound|bead/.test(t)) return 'finishing';
  return 'other';
}
let IMP = null;
function setupImport() {
  IMP = null;
  $('#tab').innerHTML = `
    <div class="card mb"><b>Load history for a job</b>
      <div class="help mb">Paste rows from a spreadsheet, or choose a CSV. One row per cost. The first row must name the columns. Only <b>job</b> and <b>amount</b> are required.</div>
      <table class="small"><thead><tr><th>job</th><th>date</th><th>type</th><th>amount</th><th>qty</th><th>phase</th><th>note</th></tr></thead>
        <tbody><tr><td>Amelia</td><td>3/14/2025</td><td>Boards</td><td>18400</td><td>1150</td><td></td><td></td></tr>
        <tr><td>Amelia</td><td>4/02/2025</td><td>Labor</td><td>6200</td><td>96 hours</td><td>framing</td><td>crew week 1</td></tr></tbody></table>
      <div class="help mt"><b>type</b>: Framing, Boards, Finishing, Other or Labor. <b>qty</b> on Boards rows is the number of boards, which feeds the per board numbers. <b>phase</b> on Labor rows: framing, hang, finish or punch.</div>
      <textarea id="imp-text" rows="7" style="width:100%;margin-top:12px" placeholder="Paste here"></textarea>
      <div class="row mt"><input type="file" id="imp-file" accept=".csv,.tsv,.txt"><button class="btn primary" onclick="A.impPreview()">Check it</button></div>
    </div><div id="imp-out"></div>`;
  $('#imp-file').onchange = async (e) => { const f = e.target.files[0]; if (f) { $('#imp-text').value = await f.text(); A.impPreview(); } };
}
A.impPreview = () => {
  const rows = parseTable($('#imp-text').value).rows;
  if (!rows.length) { $('#imp-out').innerHTML = '<div class="empty">Nothing to read yet.</div>'; return; }
  const norm = (o) => { const r = {}; Object.keys(o).forEach(k => { r[k.toLowerCase().trim()] = o[k]; }); return r; };
  const items = rows.map(norm).map((r, i) => {
    const amount = parseNum(r.amount ?? r.cost ?? r.total);
    const jobText = String(r.job ?? r.project ?? '').trim();
    const j = S.jobs.find(x => jn(x.name).toLowerCase() === jobText.toLowerCase()) || S.jobs.find(x => jobText && (jn(x.name).toLowerCase().includes(jobText.toLowerCase()) || (x.aliases || []).some(a => String(a).toLowerCase() === jobText.toLowerCase())));
    const kind = importKind(r.type ?? r.category);
    const note = String(r.note ?? r.description ?? '').trim();
    let phase = String(r.phase || '').toLowerCase().trim();
    if (kind === 'labor' && !['framing', 'hang', 'finish', 'punch'].includes(phase)) phase = laborPhaseFromNote(phase + ' ' + (r.type || '') + ' ' + note) || 'other';
    return { i, jobText, job: j, date: parseDate(r.date), amount, qty: parseNum(String(r.qty ?? r.quantity ?? r.boards ?? '').replace(/[^\d.\-]/g, '')), kind, phase, note, worker: String(r.worker ?? r.crew ?? '').trim() };
  });
  IMP = items;
  const bad = items.filter(x => x.amount === null || !x.jobText);
  const missing = [...new Set(items.filter(x => x.jobText && !x.job && x.amount !== null).map(x => x.jobText))];
  const good = items.filter(x => x.amount !== null && x.jobText);
  $('#imp-out').innerHTML = `<div class="card">
    <b>${good.length} rows ready</b>, ${money(good.reduce((a, x) => a + x.amount, 0))} total${bad.length ? `, <span class="bad">${bad.length} rows skipped (missing job or amount)</span>` : ''}
    ${missing.length ? `<div class="help mt">These jobs are not in the app yet: <b>${missing.map(esc).join(', ')}</b>. They will be added as finished jobs.</div>` : ''}
    <div class="card flush scroll mt" style="max-height:340px;overflow:auto"><table class="small"><thead><tr><th>Job</th><th>Date</th><th>Type</th><th class="r">Amount</th><th class="r">Qty</th><th>Phase</th></tr></thead><tbody>
    ${good.slice(0, 200).map(x => `<tr><td>${esc(x.jobText)}${x.job ? '' : ' <span class="chip warn">new</span>'}</td><td>${x.date ? dt(x.date) : '<span class="faint">no date</span>'}</td><td>${esc(x.kind)}</td><td class="r num">${money(x.amount)}</td><td class="r num">${x.qty ?? ''}</td><td>${x.kind === 'labor' ? esc(x.phase) : ''}</td></tr>`).join('')}</tbody></table></div>
    <div class="help mt">Rows without a date still count toward totals but will not show in the month chart.</div>
    <button class="btn primary mt" onclick="A.impRun()" ${good.length ? '' : 'disabled'}>Add these ${good.length} rows</button></div>`;
};
A.impRun = async () => {
  const items = (IMP || []).filter(x => x.amount !== null && x.jobText); if (!items.length) return;
  const mat = {}; S.mats.filter(m => /^Historical total/.test(m.name)).forEach(m => { mat[m.category] = m.id; });
  const matFor = { framing: mat.metal_framing, boards: mat.board, finishing: mat.finishing, other: mat.misc };
  const btn = event && event.target; if (btn) btn.disabled = true;
  try {
    const jobIds = {};
    for (const name of [...new Set(items.map(x => x.jobText))]) {
      const ex = items.find(x => x.jobText === name && x.job);
      if (ex) jobIds[name] = ex.job.id;
      else { const j = await insert('jobs', { name: 'JOB ' + name, active: false }); jobIds[name] = j.id; }
    }
    const labor = items.filter(x => x.kind === 'labor').map(x => ({ job_id: jobIds[x.jobText], entry_date: x.date, phase: x.phase, worker: x.worker || null, hours: x.qty, amount: x.amount, note: x.note || null, source: 'backfill' }));
    if (labor.length) await insert('labor_entries', labor);
    const mats = items.filter(x => x.kind !== 'labor');
    for (let i = 0; i < mats.length; i += 50) {
      const chunk = mats.slice(i, i + 50);
      const bills = await insert('bills', chunk.map((x, k) => ({ job_id: jobIds[x.jobText], bill_date: x.date, total: x.amount, balance: 0, payment_status: 'paid', source: 'backfill',
        invoice_number: 'HIST-' + Date.now().toString(36) + '-' + (i + k), memo: x.note || ('History: ' + x.kind) })));
      await insert('bill_line_items', bills.map((b, k) => ({ bill_id: b.id, raw_description: chunk[k].note || ('Historical ' + chunk[k].kind), qty: chunk[k].qty, unit_cost: chunk[k].qty ? Math.max(3, chunk[k].amount / chunk[k].qty) : null,
        line_total: chunk[k].amount, material_id: matFor[chunk[k].kind] || null, needs_mapping: !matFor[chunk[k].kind] })));
    }
    await audit('backfill', 'jobs', '', { rows: items.length });
    S.cache = {}; await loadCore();
    $('#imp-out').innerHTML = `<div class="card"><b class="good">Added ${items.length} rows.</b> <a href="#/archive">See them in the Archive</a>.</div>`; IMP = null;
  } catch (e) { fail(e); if (btn) btn.disabled = false; }
};

/* ---------- materials ---------- */
async function setupMaterials() {
  const mats = S.mats.filter(m => !/^Historical total/.test(m.name));
  $('#tab').innerHTML = `<div class="spread mb"><div class="help">The catalog of things you buy. Items matched to a material are counted in the job reports. Changes save as you type.</div>
    <div class="row"><input id="ms" placeholder="Search" style="width:200px"><button class="btn primary" onclick="A.addMaterial()">Add material</button></div></div>
    <div class="card flush scroll"><table><thead><tr><th>Name</th><th>Category</th><th>Unit</th><th>Active</th></tr></thead><tbody id="mrows">
    ${mats.map(m => `<tr data-n="${esc(m.name.toLowerCase())}"><td><input value="${esc(m.name)}" data-t="materials" data-id="${m.id}" data-c="name" data-k="text0" onchange="A.field(this)"></td>
      <td>${selectHtml(CATS.map(c => [c, CATLABEL[c]]), m.category, `data-t="materials" data-id="${m.id}" data-c="category" onchange="A.field(this)"`)}</td>
      <td><input style="width:70px" value="${esc(m.uom || '')}" data-t="materials" data-id="${m.id}" data-c="uom" data-k="text0" onchange="A.field(this)"></td>
      <td><input type="checkbox" ${m.active !== false ? 'checked' : ''} data-t="materials" data-id="${m.id}" data-c="active" data-k="bool" onchange="A.field(this)"></td></tr>`).join('')}</tbody></table></div>`;
  $('#ms').addEventListener('input', debounce(() => { const q = $('#ms').value.toLowerCase(); $$('#mrows tr').forEach(r => { r.hidden = q && !r.dataset.n.includes(q); }); }, 150));
}
A.addMaterial = () => openModal('Add a material', `<div class="fields">${fld('Name', '<input id="am-n">')}${fld('Category', selectHtml(CATS.map(c => [c, CATLABEL[c]]), 'misc', 'id="am-c"'))}${fld('Unit', '<input id="am-u" value="ea">')}</div>`, {
  onSave: async () => { const n = $('#am-n').value.trim(); if (!n) return false; await insert('materials', { name: n, category: $('#am-c').value, uom: $('#am-u').value.trim() || 'ea', active: true }); await loadCore(); await rerender(); }
});

/* ---------- vendors ---------- */
async function setupVendors() {
  $('#tab').innerHTML = `<div class="help mb">Mark who is a labor vendor. Everything billed by a labor vendor counts as labor on the job, not materials.</div>
    <div class="card flush scroll"><table><thead><tr><th>Vendor</th><th>Counts as</th></tr></thead><tbody>
    ${S.vendors.map(v => `<tr><td>${esc(v.name)}</td><td>${selectHtml([['material', 'Materials'], ['labor', 'Labor']], v.type || 'material', `data-t="vendors" data-id="${v.id}" data-c="type" data-after="vendorSaved" onchange="A.field(this)"`)}</td></tr>`).join('')}</tbody></table></div>`;
}
A.vendorSaved = async () => { await loadCore(); };

/* ---------- account ---------- */
function setupAccount() {
  $('#tab').innerHTML = `<div class="card" style="max-width:480px"><div class="mb">Signed in as <b>${esc(S.user?.email || '')}</b></div>
    <div class="row"><button class="btn" onclick="A.changePassword()">Change password</button><button class="btn" onclick="A.signOut()">Sign out</button></div></div>`;
}
