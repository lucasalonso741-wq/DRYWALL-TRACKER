'use strict';
/* =====================================================================
   Archive (finished jobs), Inbox (things to sort out), Orders (search everything)
   ===================================================================== */

/* ---------- archive ---------- */
async function renderArchive() {
  const onSheet = (m) => m.has_override && /master sheet/.test(m.override_note || '');
  const allDone = S.money.filter(m => !m.active && (n0(m.total_cost) > 0 || n0(m.contract_value) > 0));
  const left = allDone.filter(m => !onSheet(m));
  const done = allDone.filter(onSheet)
    .sort((a, b) => (b.completed_on || b.last_dt || '').localeCompare(a.completed_on || a.last_dt || ''));
  const row = (m) => { const c = n0(m.contract_value), cost = n0(m.total_cost), mat = n0(m.material_cost), lab = n0(m.labor_cost), b = n0(m.boards_used), u = n0(m.units);
    return { m, c, cost, mat, lab, b, u, profit: c ? c - cost : null, margin: c ? (c - cost) / c * 100 : null, perBoard: b >= 100 ? cost / b : null, perUnit: u ? cost / u : null }; };
  const R = done.map(row);
  const withC = R.filter(r => r.c > 0);
  const T = (k, list = R) => list.reduce((a, r) => a + (r[k] || 0), 0);
  const totC = T('c', withC), totCost = T('cost', withC), totProfit = totC - totCost, totMargin = totC ? totProfit / totC * 100 : 0;
  const bR = R.filter(r => r.b >= 100), avgBoard = bR.length ? T('cost', bR) / T('b', bR) : 0;
  const uR = R.filter(r => r.u > 0 && r.c > 0), avgUnit = uR.length ? T('cost', uR) / T('u', uR) : 0;
  const matT = T('mat', withC), labT = T('lab', withC);
  const byProfit = withC.slice().sort((a, b) => b.profit - a.profit);
  const flags = [];
  withC.forEach(r => {
    const n = jn(r.m.name);
    if (r.profit < 0) flags.push(['bad', n, `lost ${money(-r.profit)}`, r.m.job_id]);
    else if (r.margin < 20) flags.push(['warn', n, `only made ${Math.round(r.margin)}% (${money(r.profit)})`, r.m.job_id]);
    if (r.mat < r.c * 0.02 && r.c > 50000) flags.push(['warn', n, 'has almost no material cost on it, so profit may be overstated', r.m.job_id]);
    if (r.lab < r.c * 0.02 && r.c > 50000) flags.push(['warn', n, 'has almost no labor cost on it, so profit may be overstated', r.m.job_id]);
    if (r.margin > 85 && r.c > 50000) flags.push(['warn', n, `shows a ${Math.round(r.margin)}% margin, check that all costs are in`, r.m.job_id]);
  });
  R.filter(r => n0(r.m.open_po_total) > 5000).forEach(r => flags.push(['warn', jn(r.m.name), `still shows ${money(r.m.open_po_total)} in open POs even though it is finished, probably already billed, so they are not counted in its cost`, r.m.job_id]));
  if (left.length) flags.push(['warn', left.length + ' finished jobs not on your spreadsheet', '(' + left.map(m => jn(m.name)).join(', ') + ') are left out of every total and chart so they do not skew your numbers', null]);
  const noC = R.filter(r => !r.c); if (noC.length) flags.push(['warn', noC.length + ' finished jobs', 'have no contract amount, so they are left out of the profit totals', null]);
  const pillFor = (r) => r.margin == null ? ['gray', 'No contract'] : r.profit < 0 ? ['bad', 'Loss'] : r.margin < 20 ? ['warn', 'Thin'] : ['good', 'Healthy'];
  view(`
    <div class="spread mb"><div><h1>Finished Jobs</h1><div class="muted small">What each job really made. Profit is contract minus all material and labor.</div></div>
      <div class="row"><button class="btn" onclick="location.hash='#/setup/import'">Add past job data</button><button class="btn sm" onclick="A.dlArchive()">Download</button></div></div>

    <div class="tiles">
      <div class="tile"><div class="l">Finished jobs</div><div class="v">${R.length}</div><div class="s">${withC.length} with a contract</div></div>
      <div class="tile"><div class="l">Total contracts</div><div class="v">${moneyK(totC)}</div></div>
      <div class="tile"><div class="l">Total profit</div><div class="v ${totProfit < 0 ? 'bad' : 'good'}">${moneyK(totProfit)}</div><div class="s">${Math.round(totMargin)}% overall margin</div></div>
      <div class="tile"><div class="l">Avg cost per board</div><div class="v">${avgBoard ? money(avgBoard, 2) : '?'}</div><div class="s">${bR.length} jobs with board counts</div></div>
      <div class="tile"><div class="l">Avg cost per unit</div><div class="v">${avgUnit ? money(avgUnit) : '?'}</div><div class="s">${uR.length} jobs with units</div></div>
    </div>

    ${flags.length ? `<div class="panel flags mb"><h2>Red flags<small>${flags.length}</small></h2>${flags.slice(0, 8).map(([l, n, t, id]) => `<${id ? `a href="#/job/${id}"` : 'div'} class="flag"><span class="dotf" style="background:var(--${l === 'bad' ? 'bad' : 'warn'})"></span><span><b>${esc(n)}</b> ${esc(t)}</span></${id ? 'a' : 'div'}>`).join('')}${flags.length > 8 ? `<div class="tiny muted">and ${flags.length - 8} more.</div>` : ''}</div>` : ''}

    <div class="duo">
      <div class="panel"><h2>Profit by job <small>biggest first</small></h2>
        ${hbars(byProfit.slice(0, 14).map(r => ({ label: jn(r.m.name), value: r.profit, text: moneyK(r.profit), href: '#/job/' + r.m.job_id, color: r.profit < 0 ? 'var(--bad)' : 'var(--good)' })))}</div>
      <div class="panel"><h2>Margin by job <small>profit as % of contract</small></h2>
        ${hbars(withC.slice().sort((a, b) => b.margin - a.margin).slice(0, 14).map(r => ({ label: jn(r.m.name), value: r.margin, text: Math.round(r.margin) + '%', href: '#/job/' + r.m.job_id, color: r.margin < 20 ? 'var(--warn)' : 'var(--blue)' })))}</div>
    </div>
    <div class="duo">
      <div class="panel"><h2>Cost per board <small>jobs with 100+ boards counted</small></h2>
        ${hbars(bR.slice().sort((a, b) => b.perBoard - a.perBoard).map(r => ({ label: jn(r.m.name), value: r.perBoard, text: money(r.perBoard, 2), href: '#/job/' + r.m.job_id, color: 'var(--hot)' })))}
        <div class="tiny muted mt">More jobs show up here as you backfill board counts.</div></div>
      <div class="panel"><h2>Where the money went <small>all finished jobs</small></h2>
        ${donut([{ label: 'Material', value: matT, color: 'var(--hot)' }, { label: 'Labor', value: labT, color: 'var(--labor)' }, { label: 'Profit', value: Math.max(0, totProfit), color: 'var(--good)' }], moneyK(totC), 'billed')}
        <div class="tiny muted mt">Of every $100 billed: $${totC ? Math.round(matT / totC * 100) : 0} material, $${totC ? Math.round(labT / totC * 100) : 0} labor, $${totC ? Math.round(totProfit / totC * 100) : 0} profit.</div></div>
    </div>

    <div class="panel" style="padding:0;overflow:hidden"><div style="padding:16px 16px 0"><h2>Every finished job</h2></div>
      <div class="scroll"><table class="board">
        <thead><tr><th>Job</th><th>Finished</th><th class="r">Units</th><th class="r">Contract</th><th class="r">Material</th><th class="r">Labor</th><th class="r">Real profit</th><th class="r">Margin</th><th class="r">Boards</th><th class="r">Per board</th><th class="r">Per unit</th><th></th></tr></thead>
        <tbody>${R.map(r => { const st = pillFor(r); return `<tr class="click" onclick="location.hash='#/job/${r.m.job_id}'">
          <td class="nm"><b>${esc(jn(r.m.name))}</b></td><td class="nowrap">${monthYear(r.m.completed_on || r.m.last_dt)}</td>
          <td class="r num">${r.u ? qty(r.u) : ''}</td><td class="r num">${r.c ? money(r.c) : ''}</td>
          <td class="r num">${money(r.mat)}</td><td class="r num">${money(r.lab)}</td>
          <td class="r num ${r.profit != null ? (r.profit < 0 ? 'bad' : 'good') : ''}"><b>${r.profit != null ? money(r.profit) : ''}</b></td>
          <td class="r num">${r.margin != null ? Math.round(r.margin) + '%' : ''}</td>
          <td class="r num">${r.b ? qty(Math.round(r.b)) : ''}</td><td class="r num">${r.perBoard ? money(r.perBoard, 2) : ''}</td><td class="r num">${r.perUnit ? money(r.perUnit) : ''}</td>
          <td><span class="pill ${st[0]}">${st[1]}</span></td></tr>`; }).join('') || '<tr><td colspan="12" class="empty">No finished jobs yet. Mark a job finished from its page, or add past job data.</td></tr>'}</tbody>
        <tfoot><tr><td>TOTAL</td><td></td><td class="r num">${qty(T('u', withC))}</td><td class="r num">${money(totC)}</td><td class="r num">${money(matT)}</td><td class="r num">${money(labT)}</td>
          <td class="r num ${totProfit < 0 ? 'bad' : 'good'}">${money(totProfit)}</td><td class="r num">${Math.round(totMargin)}%</td><td class="r num">${qty(Math.round(T('b', withC)))}</td><td class="r num">${avgBoard ? money(avgBoard, 2) : ''}</td><td class="r num">${avgUnit ? money(avgUnit) : ''}</td><td></td></tr></tfoot>
      </table></div></div>

    <div class="totalbar"><div><div class="l">Total profit, all finished jobs</div><div class="big">${money(totProfit)}</div></div>
      <div><div class="l">On contracts of</div><div class="v">${money(totC)}</div></div><div><div class="l">Total cost</div><div class="v">${money(totCost)}</div></div><div><div class="l">Overall margin</div><div class="v">${Math.round(totMargin)}%</div></div></div>`);
}
ROUTES.archive = renderArchive;
A.dlArchive = () => downloadCSV('finished_jobs.csv', S.money.filter(m => !m.active).map(m => ({ job: jn(m.name), finished: monthYear(m.completed_on), units: m.units, contract: m.contract_value, cost: m.total_cost, material: m.material_cost, labor: m.labor_cost, boards: Math.round(n0(m.boards_used)), cost_per_board: m.cost_per_board })));

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
A.rematch = async () => { try { await run(sb.rpc('rematch_unmapped')); await run(sb.rpc('auto_map_lines')); S.cache = {}; await loadCore(); await rerender(); toast('Matching re-run'); } catch (e) { fail(e); } };

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
