'use strict';
/* =====================================================================
   Archive (finished jobs), Inbox (things to sort out), Orders (search everything)
   ===================================================================== */

/* ---------- archive ---------- */
async function renderArchive() {
  loading();
  const pm = await all(() => sb.from('v_job_phase_month').select('job_id,bucket,cost'));
  const by = {};
  pm.forEach(r => { const o = (by[r.job_id] = by[r.job_id] || {}); o[r.bucket] = (o[r.bucket] || 0) + n0(r.cost); });
  const done = S.money.filter(m => !m.active).sort((a, b) => (b.completed_on || b.last_dt || '').localeCompare(a.completed_on || a.last_dt || ''));
  const withData = done.filter(m => n0(m.total_cost) > 0 || n0(m.contract_value) > 0);
  const empty = done.length - withData.length;
  const tot = (k) => withData.reduce((a, m) => a + n0(m[k]), 0);
  const profitTot = withData.reduce((a, m) => a + (n0(m.contract_value) ? n0(m.contract_value) - n0(m.total_cost) : 0), 0);
  view(`
    <div class="spread mb"><h1>Archive</h1>
      <div class="row"><button class="btn" onclick="location.hash='#/setup/import'">Add past job data</button><button class="btn sm" onclick="A.dlArchive()">Download</button></div></div>
    <div class="help mb">Finished jobs, with how each one actually ran. Tap a job to see where its money went and how many boards and studs it used. Use "Add past job data" to load history that never went through QuickBooks.</div>
    <div class="tiles">
      <div class="tile"><div class="l">Finished jobs</div><div class="v">${withData.length}</div></div>
      <div class="tile"><div class="l">Total cost</div><div class="v">${moneyK(tot('total_cost'))}</div></div>
      <div class="tile"><div class="l">Boards</div><div class="v">${qty(Math.round(tot('boards_used')))}</div></div>
      <div class="tile"><div class="l">Profit (with contract)</div><div class="v">${moneyK(profitTot)}</div></div>
    </div>
    <div class="card flush scroll"><table>
      <thead><tr><th>Job</th><th>Finished</th><th class="r">Contract</th><th class="r">Cost</th><th class="r">Profit</th><th class="r">Margin</th><th class="r">Boards</th><th class="r">Per board</th><th style="min-width:150px">Where it went</th></tr></thead>
      <tbody>${withData.map(m => {
        const c = n0(m.contract_value), cost = n0(m.total_cost), p = c ? c - cost : null, ph = by[m.job_id] || {}, sum = Object.values(ph).reduce((a, b) => a + Math.max(0, b), 0);
        return `<tr class="click" onclick="location.hash='#/job/${m.job_id}'"><td><b>${esc(jn(m.name))}</b></td><td>${dt(m.completed_on || m.last_dt)}</td>
          <td class="r num">${c ? money(c) : ''}</td><td class="r num">${money(cost)}</td>
          <td class="r num ${p != null && p < 0 ? 'bad' : ''}">${p != null ? money(p) : ''}</td><td class="r num">${p != null ? Math.round(p / c * 100) + '%' : ''}</td>
          <td class="r num">${m.boards_used ? qty(Math.round(m.boards_used)) : ''}</td><td class="r num">${m.cost_per_board ? money(m.cost_per_board, 2) : ''}</td>
          <td>${sum ? `<div class="phasebar">${PHASES.map(([k, l]) => n0(ph[k]) > 0 ? `<i title="${l} ${money(ph[k])}" style="width:${ph[k] / sum * 100}%;background:${PHASE_COLOR[k]}"></i>` : '').join('')}</div>` : ''}</td></tr>`;
      }).join('') || '<tr><td colspan="9" class="empty">No finished jobs yet. Mark a job finished from its page, or add past job data.</td></tr>'}</tbody>
    </table></div>
    ${empty ? `<div class="help mt">${empty} finished jobs have no cost data and are hidden here.</div>` : ''}
    <div class="legend mt">${PHASES.map(([k, l]) => `<span><span class="sw" style="background:${PHASE_COLOR[k]}"></span>${l}</span>`).join('')}</div>`);
}
ROUTES.archive = renderArchive;
A.dlArchive = () => downloadCSV('archive.csv', S.money.filter(m => !m.active).map(m => ({ job: jn(m.name), finished: m.completed_on || '', contract: m.contract_value, cost: m.total_cost, material: m.material_cost, labor: m.labor_cost, boards: Math.round(n0(m.boards_used)), cost_per_board: m.cost_per_board })));

/* ---------- inbox ---------- */
async function renderInbox(sub) {
  sub = sub || (S.inbox.pos ? 'pos' : S.inbox.bills ? 'bills' : S.inbox.mats ? 'mats' : 'pos');
  loading();
  const seg = `<div class="seg mb">${[['pos', 'POs with no job', S.inbox.pos], ['bills', 'Bills with no job', S.inbox.bills], ['mats', 'Materials to match', S.inbox.mats]]
    .map(([k, l, c]) => `<a href="#/inbox/${k}" class="${sub === k ? 'on' : ''}">${l}${c ? ` (${c})` : ''}</a>`).join('')}</div>`;
  let body = '';
  const jobSel = (t, id) => selectHtml(jobOptions(true), '', `data-t="${t}" data-id="${id}" data-c="job_id" data-after="inboxAssigned" onchange="A.field(this)"`, 'Pick job...');
  if (sub === 'pos') {
    const rows = await run(sb.from('purchase_orders').select('id,po_number,po_date,total,memo,qb_status,vendors(name)').is('job_id', null).eq('archived', false).order('po_date', { ascending: false, nullsFirst: false }).limit(300));
    body = `<div class="help mb">Pick the job for each PO and it is saved at once. If a PO is junk or a duplicate, open it and archive it.</div>
      <div class="card flush scroll"><table><thead><tr><th>PO</th><th>Date</th><th>Vendor</th><th class="r">Total</th><th>Memo</th><th>Job</th><th></th></tr></thead><tbody>
      ${rows.map(p => `<tr id="r-${p.id}"><td><b>${esc(p.po_number)}</b></td><td>${dt(p.po_date)}</td><td>${esc(p.vendors?.name || '')}</td><td class="r num">${money(p.total)}</td>
        <td class="small muted">${esc((p.memo || '').slice(0, 60))}</td><td>${jobSel('purchase_orders', p.id)}</td><td><button class="btn sm" onclick="A.openPO('${p.id}')">Open</button></td></tr>`).join('') || '<tr><td colspan="7" class="empty">All POs have a job. Nice.</td></tr>'}</tbody></table></div>`;
  } else if (sub === 'bills') {
    const rows = await run(sb.from('bills').select('id,invoice_number,bill_date,total,memo,vendors(name)').is('job_id', null).order('bill_date', { ascending: false, nullsFirst: false }).limit(300));
    body = `<div class="help mb">Pick the job for each bill. Labor bills and supplier bills both count toward the job once assigned.</div>
      <div class="card flush scroll"><table><thead><tr><th>Invoice</th><th>Date</th><th>Vendor</th><th class="r">Total</th><th>Memo</th><th>Job</th><th></th></tr></thead><tbody>
      ${rows.map(b => `<tr id="r-${b.id}"><td><b>${esc(b.invoice_number || '')}</b></td><td>${dt(b.bill_date)}</td><td>${esc(b.vendors?.name || '')}</td><td class="r num">${money(b.total)}</td>
        <td class="small muted">${esc((b.memo || '').slice(0, 60))}</td><td>${jobSel('bills', b.id)}</td><td><button class="btn sm" onclick="A.openBill('${b.id}')">Open</button></td></tr>`).join('') || '<tr><td colspan="7" class="empty">All bills have a job. Nice.</td></tr>'}</tbody></table></div>`;
  } else {
    const rows = await run(sb.from('v_review_queue').select('*').order('dollars', { ascending: false }).limit(60));
    body = `<div class="spread mb"><div class="help">Item descriptions the app does not recognize yet. Teach it once and every past and future line with that wording is matched. Biggest dollars first.</div>
      <button class="btn" onclick="A.rematch()">Re-run matching</button></div>
      <div class="card flush scroll"><table><thead><tr><th>Description</th><th class="r">Lines</th><th class="r">Dollars</th><th style="min-width:240px">Match to</th></tr></thead><tbody>
      ${rows.map((r, i) => `<tr id="q${i}"><td>${esc(r.raw_description)}</td><td class="r num">${r.line_count}</td><td class="r num">${money(r.dollars)}</td>
        <td><div class="row" style="flex-wrap:nowrap">${matSelect('', `id="qm${i}" onchange="A.applyAlias(${i})"`, 'Pick...')}<button class="btn sm ghost" onclick="A.suggest(${i})">Suggest</button></div><div id="qs${i}" class="small"></div></td></tr>`).join('') || '<tr><td colspan="4" class="empty">Every line item is matched.</td></tr>'}</tbody></table></div>`;
    S.queue = rows;
  }
  view(`<h1 class="mb">Inbox</h1>${seg}${body}`);
}
ROUTES.inbox = renderInbox;
A.inboxAssigned = async (el) => {
  const tr = el.closest('tr'); if (tr) tr.remove();
  S.cache = {}; await loadCore();
  const keep = S.route[2] || 'pos';
  $('#nav') && renderNav();
  toast('Saved');
};
A.suggest = async (i) => {
  const r = S.queue[i], box = $('#qs' + i); box.textContent = 'Looking...';
  try {
    const s = await run(sb.rpc('suggest_materials', { raw: r.raw_description }));
    box.innerHTML = s.slice(0, 4).map(x => `<a href="#" class="chip ${x.compatible ? 'good' : ''}" onclick="event.preventDefault();$('#qm${i}').value='${x.material_id}';A.applyAlias(${i})">${esc(x.name)}</a>`).join(' ') || 'No close match. Pick one from the list, or add the material in Setup.';
  } catch (e) { box.textContent = ''; fail(e); }
};
A.applyAlias = async (i) => {
  const r = S.queue[i], mid = $('#qm' + i).value; if (!mid) return;
  try {
    const res = await run(sb.rpc('apply_alias', { p_raw: r.raw_description, p_material: mid, p_actor: S.user?.email || 'app' }));
    $('#q' + i).remove(); S.cache = {}; await loadCore(); toast('Matched ' + (res && res.updated != null ? res.updated + ' lines' : ''));
  } catch (e) { fail(e); }
};
A.rematch = async () => { try { const r = await run(sb.rpc('rematch_unmapped')); S.cache = {}; await loadCore(); await rerender(); toast('Matching re-run'); } catch (e) { fail(e); } };

/* ---------- orders: search everything ---------- */
const OQ = { q: '', job: '', kind: 'pos', open: false };
async function renderOrders(sub) {
  if (sub === 'pos' || sub === 'bills') OQ.kind = sub;
  view(`<h1 class="mb">Orders</h1>
    <div class="spread mb"><div class="seg"><a href="#/orders/pos" class="${OQ.kind === 'pos' ? 'on' : ''}">Purchase orders</a><a href="#/orders/bills" class="${OQ.kind === 'bills' ? 'on' : ''}">Bills</a></div>
      <div class="row"><input id="oq" placeholder="Search number, vendor, memo" value="${esc(OQ.q)}" style="width:240px">
      ${selectHtml(jobOptions(false), OQ.job, 'id="oj"', 'All jobs')}
      ${OQ.kind === 'pos' ? `<label class="row small"><input type="checkbox" id="oo" ${OQ.open ? 'checked' : ''}> Open only</label>` : ''}
      <button class="btn primary" onclick="A.newPO('')">Add a PO</button></div></div>
    <div id="olist"><div class="empty">Loading...</div></div>`);
  const go = debounce(() => { OQ.q = $('#oq').value.trim(); OQ.job = $('#oj').value; OQ.open = !!($('#oo') && $('#oo').checked); loadOrders(); }, 300);
  $('#oq').addEventListener('input', go); $('#oj').onchange = go; if ($('#oo')) $('#oo').onchange = go;
  loadOrders();
}
async function loadOrders() {
  const box = $('#olist'); if (!box) return;
  const k = OQ.kind;
  let rows, q;
  if (k === 'pos') {
    q = sb.from('purchase_orders').select('id,job_id,po_number,po_date,total,qb_status,source,archived,memo,vendors!inner(name)').order('po_date', { ascending: false, nullsFirst: false }).limit(200);
    if (OQ.open) q = q.eq('archived', false).neq('qb_status', 'Closed');
    if (OQ.q) q = q.or(`po_number.ilike.%${OQ.q.replace(/[,%()]/g, ' ')}%,memo.ilike.%${OQ.q.replace(/[,%()]/g, ' ')}%`);
  } else {
    q = sb.from('bills').select('id,job_id,invoice_number,bill_date,total,balance,payment_status,source,memo,vendors!inner(name,type)').order('bill_date', { ascending: false, nullsFirst: false }).limit(200);
    if (OQ.q) q = q.or(`invoice_number.ilike.%${OQ.q.replace(/[,%()]/g, ' ')}%,memo.ilike.%${OQ.q.replace(/[,%()]/g, ' ')}%`);
  }
  if (OQ.job) q = q.eq('job_id', OQ.job);
  try {
    rows = await run(q);
    if (OQ.q && !rows.length) { // vendor name search
      const vs = S.vendors.filter(v => v.name.toLowerCase().includes(OQ.q.toLowerCase())).map(v => v.id);
      if (vs.length) {
        let q2 = k === 'pos' ? sb.from('purchase_orders').select('id,job_id,po_number,po_date,total,qb_status,source,archived,memo,vendors!inner(name)') : sb.from('bills').select('id,job_id,invoice_number,bill_date,total,balance,payment_status,source,memo,vendors!inner(name,type)');
        q2 = q2.in('vendor_id', vs).order(k === 'pos' ? 'po_date' : 'bill_date', { ascending: false, nullsFirst: false }).limit(200);
        if (OQ.job) q2 = q2.eq('job_id', OQ.job);
        rows = await run(q2);
      }
    }
    box.innerHTML = `<div class="card flush scroll"><table>${k === 'pos' ? poHead(true) : billHead(true)}<tbody>${(k === 'pos' ? poRows(rows, true) : billRows(rows, true)) || '<tr><td colspan="7" class="empty">Nothing found.</td></tr>'}</tbody></table></div>
      <div class="help mt">${rows.length === 200 ? 'Showing the newest 200. Narrow the search to see others.' : rows.length + ' shown'}</div>`;
  } catch (e) { box.innerHTML = ''; fail(e); }
}
ROUTES.orders = renderOrders;
