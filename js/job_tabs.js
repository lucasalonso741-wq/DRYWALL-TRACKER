'use strict';
/* =====================================================================
   Job page tabs
   ===================================================================== */

/* ---------- estimate helpers (lump sum or by item) ---------- */
const LAB_SLOTS = [['framing', 'Framing'], ['hang', 'Hang'], ['finish', 'Finish'], ['punch', 'Punch out']];
const slotOf = (note) => { const t = String(note || '').trim().toLowerCase(); return t.startsWith('punch') ? 'punch' : /^(framing|hang|finish)/.test(t) ? t.match(/^(framing|hang|finish)/)[1] : null; };
const matBudgets = (bud) => bud.filter(b => b.kind === 'material' && !b.building_id);
const labBudgets = (bud) => bud.filter(b => b.kind === 'labor');
const matchRows = (rows, b, nameKey) => {
  const mat = matOf(b.material_id);
  if (mat) return rows.filter(r => r.item === mat.name || r.item === mat.family);
  if (b.category && b.category !== 'misc') return rows.filter(r => r.category === b.category);
  return [];
};
const lineLabel = (b) => { const mt = matOf(b.material_id); return mt ? mt.name : (b.category && b.category !== 'misc' && CATLABEL[b.category]) || b.notes || 'Miscellaneous'; };

/* every by-item material line, with what has been billed and what is on open POs against it */
function materialLines(d, pur) {
  return matBudgets(d.bud).map(b => {
    const used = matchRows(d.mu, b), ord = matchRows(pur, b);
    const isBoard = (matOf(b.material_id) || {}).category === 'board' || b.category === 'board';
    const bq = used.reduce((a, r) => a + n0(r.qty), 0), bd = used.reduce((a, r) => a + n0(r.dollars), 0);
    const oq = ord.reduce((a, r) => a + n0(isBoard ? r.ordered_boards : r.ordered_qty), 0), od = ord.reduce((a, r) => a + n0(r.ordered_dollars), 0);
    const bq2 = isBoard ? ord.reduce((a, r) => a + n0(r.billed_boards), 0) || bq : bq;
    const budQ = n0(b.budget_qty), budD = n0(b.budget_cost);
    const tracked = !!(matOf(b.material_id) || (b.category && b.category !== 'misc'));
    let st = ['gray', tracked ? 'No number set' : 'Not tracked'];
    if (budD > 0 || budQ > 0) {
      const overD = budD > 0 && bd > budD, overQ = budQ > 0 && bq2 > budQ;
      const ballD = budD > 0 && bd + od > budD, ballQ = budQ > 0 && bq2 + oq > budQ;
      st = !tracked ? ['gray', 'Not tracked'] : (overD || overQ) ? ['bad', 'Over'] : (ballD || ballQ) ? ['warn', 'Open POs push it over'] : ['good', 'Under'];
    }
    return { b, label: lineLabel(b), tracked, isBoard, bq: bq2, bd, oq, od, budQ, budD, st };
  });
}
/* labor by phase: only entries you typed in by phase can be compared per phase */
function laborSlots(d) {
  const spentBy = {}; (d.lab || []).forEach(r => { spentBy[r.phase] = (spentBy[r.phase] || 0) + n0(r.cost); });
  const lines = labBudgets(d.bud), used = new Set();
  const slots = LAB_SLOTS.map(([k, label]) => {
    const b = lines.find(x => !used.has(x.id) && slotOf(x.notes) === k); if (b) used.add(b.id);
    return { k, label, b, spent: n0(spentBy[k]), budget: b ? n0(b.budget_cost) : 0 };
  });
  const extra = lines.filter(x => !used.has(x.id));
  return { slots, extra, unsplit: n0(spentBy.labor) + n0(spentBy.other) };
}

function niceMax(v) {
  const p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}
const monthLabel = (mo) => new Date(mo + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' }) + " '" + mo.slice(2, 4);

function monthChart(pm) {
  if (!pm.length) return '<div class="empty">No dated costs yet.</div>';
  const months = [...new Set(pm.map(r => r.month))].sort();
  let y = +months[0].slice(0, 4), m = +months[0].slice(5, 7) - 1;
  const ly = +months[months.length - 1].slice(0, 4), lm = +months[months.length - 1].slice(5, 7) - 1;
  const all = [];
  while (y < ly || (y === ly && m <= lm)) { all.push(`${y}-${String(m + 1).padStart(2, '0')}-01`); m++; if (m > 11) { m = 0; y++; } }
  const by = {};
  pm.forEach(r => { (by[r.month] = by[r.month] || {})[r.bucket] = n0(r.cost); });
  const totals = all.map(mo => Object.values(by[mo] || {}).reduce((a, b) => a + Math.max(0, b), 0));
  const max = niceMax(Math.max(...totals, 1));
  const W = 900, H = 250, L = 58, B = 32, T = 10, R = 10, iw = W - L - R, ih = H - T - B;
  const bw = Math.min(48, iw / all.length * 0.72);
  const step = Math.ceil(all.length / 14);
  let svg = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" role="img" aria-label="Cost by month">`;
  for (let i = 0; i <= 4; i++) {
    const yy = T + ih - ih * i / 4;
    svg += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="#2a3645"/><text x="${L - 8}" y="${yy + 4}" font-size="12" text-anchor="end" fill="#9aa9bb">${moneyK(max * i / 4)}</text>`;
  }
  const present = new Set();
  all.forEach((mo, i) => {
    const x = L + iw * (i + 0.5) / all.length - bw / 2;
    let yy = T + ih;
    PHASES.forEach(([k, lab]) => {
      const v = n0(by[mo] && by[mo][k]); if (v <= 0) return;
      present.add(k);
      const h = ih * v / max; yy -= h;
      svg += `<rect x="${x.toFixed(1)}" y="${yy.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" style="fill:${PHASE_COLOR[k]}"><title>${monthLabel(mo)}: ${lab} ${money(v)}</title></rect>`;
    });
    if (i % step === 0) svg += `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 10}" font-size="12" text-anchor="middle" fill="#9aa9bb">${monthLabel(mo)}</text>`;
  });
  svg += '</svg>';
  const legend = `<div class="legend">${PHASES.filter(([k]) => present.has(k)).map(([k, l]) => `<span><span class="sw" style="background:${PHASE_COLOR[k]}"></span>${l}</span>`).join('')}</div>`;
  return svg + legend;
}

function watchItems(m, d) {
  const out = [], e = estOf(m), contract = n0(m.contract_value);
  if (m.projected_profit != null && m.projected_profit < 0)
    out.push(['bad', `At this pace the job finishes ${money(-m.projected_profit)} over the contract.`]);
  else if (m.projected_profit != null && contract > 0 && m.projected_profit / contract < 0.08)
    out.push(['', `Projected margin is only ${Math.round(m.projected_profit / contract * 100)}%. Check what is still to be bought.`]);
  if (e.mat.over) out.push(['bad', `Material is ${money(e.mat.spent - e.mat.est)} over the ${money(e.mat.est)} estimate (${Math.round(e.mat.pct)}% used).`]);
  else if (e.mat.ballOver) out.push(['', `Material billed plus open POs would be ${money(e.mat.spent + e.mat.open - e.mat.est)} over the estimate. Open POs are only a ballpark until the bills come in.`]);
  if (e.lab.over) out.push(['bad', `Labor is ${money(e.lab.spent - e.lab.est)} over the ${money(e.lab.est)} estimate (${Math.round(e.lab.pct)}% used).`]);
  /* line by line checks only when that estimate was entered by item. A lump sum is only checked as a total. */
  if (e.mat.mode === 'items') {
    materialLines(d, d.pur || []).forEach(l => { if (l.st[0] === 'bad') out.push(['bad', `${l.label} is over its estimate${l.budQ && l.bq > l.budQ ? ` (${qty(Math.round(l.bq))} of ${qty(l.budQ)} ordered)` : ` (${money(l.bd)} of ${money(l.budD)})`}.`]); });
  }
  if (e.lab.mode === 'items') {
    laborSlots(d).slots.forEach(x => { if (x.budget > 0 && x.spent > x.budget) out.push(['bad', `${x.label} labor is ${money(x.spent - x.budget)} over its ${money(x.budget)} estimate.`]); });
  }
  if (!e.mat.has && !e.lab.has) out.push(['', 'No estimate yet. Add one on the Estimate tab so the app can tell you when you are over.']);
  if (n0(m.unmapped) > 0) out.push(['', `${m.unmapped} lines on this job still need a material match, so the material counts are low. Fix them in the Inbox.`]);
  if (m.active && m.last_dt) {
    const days = Math.round((Date.now() - new Date(m.last_dt + 'T12:00:00')) / 86400e3);
    if (days > 21) out.push(['', `No bills have come in for ${days} days. Is the job still moving?`]);
  }
  if (!out.length) out.push(['good', 'Nothing is flagged on this job right now.']);
  return out;
}

async function tabOverview(id) {
  const m = moneyOf(id), d = await jobData(id);
  d.pur = d.pur || await run(sb.from('v_job_purchases').select('*').eq('job_id', id));
  const spent = {}; d.pm.forEach(r => { spent[r.bucket] = (spent[r.bucket] || 0) + n0(r.cost); });
  const rows = PHASES.filter(([k]) => n0(spent[k]));
  const totSpent = Object.values(spent).reduce((a, b) => a + b, 0);
  const target = n0(m.target_price_per_board);
  const watch = watchItems(m, d);
  $('#tab').innerHTML = `
    ${hideable('watch', 'What to watch', `<ul class="watch">${watch.map(([k, t]) => `<li class="${k}">${esc(t)}</li>`).join('')}</ul>`, '')}
    <div class="two">
      <div>
        <h2>Where the money went</h2>
        <div class="card flush scroll"><table>
          <thead><tr><th>Phase</th><th class="r">Spent</th><th style="min-width:140px"></th><th class="r">Share</th></tr></thead>
          <tbody>${rows.map(([k, l]) => {
            const sp = n0(spent[k]);
            return `<tr><td><span class="sw" style="background:${PHASE_COLOR[k]}"></span>${l}</td><td class="r num">${money(sp)}</td>
              <td><div class="phasebar"><i style="width:${totSpent ? Math.min(100, sp / totSpent * 100) : 0}%;background:${PHASE_COLOR[k]}"></i></div></td>
              <td class="r num">${totSpent ? Math.round(sp / totSpent * 100) + '%' : ''}</td></tr>`;
          }).join('') || '<tr><td colspan="4" class="empty">No costs on this job yet.</td></tr>'}
          ${rows.length ? `<tr class="total"><td>Total</td><td class="r num">${money(totSpent)}</td><td></td><td></td></tr>` : ''}</tbody>
        </table></div>
        <div class="help mt">Materials are grouped into phases automatically: framing (metal, lumber, plywood), hang (board and fasteners), finish (mud, tape, sealants). Labor from your subcontractor bills shows as its own line. Your estimate and how much of it is used are on the Estimate tab.</div>
      </div>
      <div>
        <h2>Per board numbers</h2>
        <div class="card">
          <table><tbody>
            <tr><td>Boards billed</td><td class="r num"><b>${qty(m.boards_used)}</b></td></tr>
            <tr><td>Boards on open POs (last 120 days)</td><td class="r num">${qty(Math.round(n0(m.open_po_boards)))}</td></tr>
            <tr><td>Estimated boards (billed + open POs)</td><td class="r num"><b>${qty(Math.round(n0(m.est_boards)))}</b></td></tr>
            <tr><td>Material per board</td><td class="r num">${m.material_per_board ? pbStar(m, money(m.material_per_board, 2)) : ''}</td></tr>
            <tr><td>Labor per board</td><td class="r num">${m.labor_per_board ? pbStar(m, money(m.labor_per_board, 2)) : ''}</td></tr>
            <tr><td>All in per board</td><td class="r num"><b>${m.cost_per_board ? pbStar(m, money(m.cost_per_board, 2)) : ''}</b></td></tr>
            ${target ? `<tr><td>Your target</td><td class="r num">${money(target, 2)}</td></tr>` : ''}
          </tbody></table>
          ${m.cost_per_board && target ? `<div class="help mt">${n0(m.cost_per_board) > target ? `<span class="bad">Running ${money(n0(m.cost_per_board) - target, 2)} per board over target.</span>` : `<span class="good">Running ${money(target - n0(m.cost_per_board), 2)} per board under target.</span>`}</div>` : ''}
        </div>
      </div>
    </div>
    <h2 class="mt2">Cost by month</h2>
    <div class="card">${monthChart(d.pm)}</div>
    ${d.prog.length ? `<div class="help mt">Progress updates: ${d.prog.slice(-10).map(p => `${dtShort(p.as_of)} ${Math.round(p.pct_complete)}%`).join(', ')}</div>` : ''}`;
}

/* ---------- materials used ---------- */
async function tabMaterials(id) {
  const m = moneyOf(id), d = await jobData(id);
  const cats = {};
  d.mu.forEach(r => { const c = (cats[r.category] = cats[r.category] || { dollars: 0, qty: 0, items: [] }); c.dollars += n0(r.dollars); c.qty += n0(r.qty); c.items.push(r); });
  const bc = {}, itemsMode = (m.material_est_mode || 'items') === 'items';
  (itemsMode ? d.bud.filter(b => b.kind === 'material' && !b.building_id) : []).forEach(b => {
    const mat = matOf(b.material_id), cat = (mat && mat.category) || b.category || 'uncategorized';
    const x = (bc[cat] = bc[cat] || { qty: 0, cost: 0 }); x.qty += n0(b.budget_qty); x.cost += n0(b.budget_cost);
  });
  const order = Object.keys(cats).sort((a, b) => cats[b].dollars - cats[a].dollars);
  const sumItems = (re, cat) => (cats[cat] ? cats[cat].items.filter(i => re.test(i.item)).reduce((a, i) => a + n0(i.qty), 0) : 0);
  const boards = cats.board ? cats.board.qty : 0, studs = sumItems(/stud/i, 'metal_framing'), track = sumItems(/track/i, 'metal_framing');
  const bb = bc.board;
  $('#tab').innerHTML = `
    <div class="tiles">
      ${moneyTile('Boards', qty(boards), (bb && bb.qty ? `of ${qty(bb.qty)} budgeted (${Math.round(boards / bb.qty * 100)}%)` : 'sheets billed to this job') + (n0(m.open_po_boards) ? `, plus about ${qty(Math.round(m.open_po_boards))} on open POs` : ''), bb && bb.qty && boards > bb.qty ? 'bad' : '')}
      ${moneyTile('Studs', qty(studs), 'pieces billed')}
      ${moneyTile('Track', qty(track), 'pieces billed')}
      ${moneyTile('Materials total', money(m.material_cost), 'from supplier bills')}
    </div>
    <div class="spread mb"><div class="help">Counts come from supplier bills. Board counts are converted to sheets when a bill lists square feet. Tap a category to see each item.</div>
      <button class="btn sm" onclick="A.dlMaterials('${id}')">Download list</button></div>
    <div class="card flush scroll"><table>
      <thead><tr><th>Category and item</th><th class="r">Quantity</th><th class="r">Spent</th><th class="r">Average price</th><th class="r">Budget</th></tr></thead>
      <tbody>${order.map((c, i) => {
        const x = cats[c], b = bc[c], isBoard = c === 'board';
        const items = x.items.slice().sort((p, q) => n0(q.dollars) - n0(p.dollars));
        return `<tr class="click" onclick="A.toggleRows('mc${i}')" style="background:#1b2430"><td><b>${esc(CATLABEL[c] || c)}</b> <span class="faint small">${items.length} items</span></td>
          <td class="r num">${isBoard ? '<b>' + qty(x.qty) + '</b>' : ''}</td><td class="r num"><b>${money(x.dollars)}</b></td><td class="r"></td>
          <td class="r num ${b && n0(b.cost) && x.dollars > b.cost ? 'bad' : ''}">${b ? (n0(b.cost) ? money(b.cost) : (n0(b.qty) ? qty(b.qty) + ' units' : '')) : ''}</td></tr>` +
          items.map(it => `<tr data-g="mc${i}" hidden><td style="padding-left:30px">${esc(it.item)}</td><td class="r num">${qty(Math.round(n0(it.qty)))} <span class="faint small">${c === 'board' ? 'sheets' : esc(it.uom || '')}</span></td>
            <td class="r num">${money(it.dollars)}</td><td class="r num">${n0(it.qty) ? money(n0(it.dollars) / n0(it.qty), 2) : ''}</td><td class="r small faint">${it.lines} lines</td></tr>`).join('');
      }).join('') || '<tr><td colspan="5" class="empty">No material bills on this job yet.</td></tr>'}</tbody>
    </table></div>`;
}
A.toggleRows = (g) => { $$(`tr[data-g="${g}"]`).forEach(r => { r.hidden = !r.hidden; }); };
A.dlMaterials = async (id) => {
  const d = await jobData(id);
  downloadCSV(jn(jobOf(id).name).replace(/\W+/g, '_') + '_materials.csv', d.mu.map(r => ({ category: r.category, item: r.item, quantity: Math.round(n0(r.qty) * 10) / 10, unit: r.uom || '', spent: Math.round(n0(r.dollars) * 100) / 100, lines: r.lines })));
};

/* ---------- orders and bills ---------- */
const srcChip = (s) => {
  s = String(s || '');
  if (s === 'qb') return '<span class="chip blue">QuickBooks</span>';
  if (s === 'backfill') return '<span class="chip">History</span>';
  if (s === 'manual') return '<span class="chip">Typed in</span>';
  if (s.startsWith('email') || s === 'pdf') return '<span class="chip">PDF</span>';
  return '';
};
const payChip = (b) => b.payment_status === 'paid' ? '<span class="chip good">Paid</span>' : b.payment_status === 'partial' ? '<span class="chip blue">Part paid</span>' : '<span class="chip warn">Unpaid</span>';

function poRows(rows, showJob) {
  return rows.map(p => `<tr class="click" onclick="A.openPO('${p.id}')">
    <td><b>${esc(p.po_number)}</b> ${srcChip(p.source)}${p.archived ? ' <span class="chip">Archived</span>' : ''}</td><td>${dt(p.po_date)}</td>
    ${showJob ? `<td>${p.job_id ? esc(jobName(p.job_id)) : '<span class="chip warn">No job</span>'}</td>` : ''}
    <td>${esc(p.vendor_name || (p.vendors && p.vendors.name) || '')}</td>
    <td class="r num">${money(p.total)}</td><td class="small muted">${esc(p.qb_status || '')}${p.age_days != null ? ' ' + p.age_days + ' days' : ''}</td></tr>`).join('');
}
const poHead = (showJob) => `<thead><tr><th>PO</th><th>Date</th>${showJob ? '<th>Job</th>' : ''}<th>Vendor</th><th class="r">Total</th><th>Status</th></tr></thead>`;
function billRows(rows, showJob) {
  return rows.map(b => `<tr class="click" onclick="A.openBill('${b.id}')">
    <td><b>${esc(b.invoice_number || '')}</b> ${srcChip(b.source)}</td><td>${dt(b.bill_date)}</td>
    ${showJob ? `<td>${b.job_id ? esc(jobName(b.job_id)) : '<span class="chip warn">No job</span>'}</td>` : ''}
    <td>${esc(b.vendors ? b.vendors.name : '')} ${b.vendors && b.vendors.type === 'labor' ? '<span class="chip blue">Labor</span>' : ''}</td>
    <td class="r num">${money(b.total)}</td><td class="r num">${n0(b.balance) ? money(b.balance) : ''}</td><td>${payChip(b)}</td></tr>`).join('');
}
const billHead = (showJob) => `<thead><tr><th>Invoice</th><th>Date</th>${showJob ? '<th>Job</th>' : ''}<th>Vendor</th><th class="r">Total</th><th class="r">Balance</th><th>Status</th></tr></thead>`;

async function tabOrders(id, sub) {
  sub = sub || 'open';
  const d = await jobData(id);
  const segs = [['open', 'Open POs'], ['pos', 'All POs'], ['bills', 'Bills'], ['labor', 'Labor']];
  const head = `<div class="spread mb"><div class="seg">${segs.map(([k, l]) => `<a href="#/job/${id}/orders/${k}" class="${sub === k ? 'on' : ''}">${l}</a>`).join('')}</div>
    <div class="row">${sub === 'open' || sub === 'pos' ? `<button class="btn primary" onclick="A.newPO('${id}')">Add a PO</button>` : ''}</div></div>`;
  let body = '';
  if (sub === 'open') {
    body = `<div class="help mb">POs from the last 120 days that no bill has covered yet: ${money(d.open.reduce((a, p) => a + n0(p.total), 0))}. This is a ballpark of what is being ordered. Older POs are treated as closed, and the real spend is always the bills.</div>
      <div class="card flush scroll"><table>${poHead(false)}<tbody>${poRows(d.open, false) || '<tr><td colspan="5" class="empty">No open POs in the last 120 days.</td></tr>'}</tbody></table></div>`;
  } else if (sub === 'pos') {
    const rows = await all(() => sb.from('purchase_orders').select('id,job_id,po_number,po_date,total,qb_status,source,archived,vendors(name)').eq('job_id', id).order('po_date', { ascending: false, nullsFirst: false }));
    body = `<div class="card flush scroll"><table>${poHead(false)}<tbody>${poRows(rows, false) || '<tr><td colspan="5" class="empty">No POs yet.</td></tr>'}</tbody></table></div><div class="help mt">${rows.length} POs</div>`;
  } else if (sub === 'bills') {
    const rows = await all(() => sb.from('bills').select('id,job_id,invoice_number,bill_date,total,balance,payment_status,source,vendors(name,type)').eq('job_id', id).order('bill_date', { ascending: false, nullsFirst: false }));
    body = `<div class="card flush scroll"><table>${billHead(false)}<tbody>${billRows(rows, false) || '<tr><td colspan="6" class="empty">No bills yet.</td></tr>'}</tbody></table></div>
      <div class="help mt">${rows.length} bills, ${money(rows.reduce((a, b) => a + n0(b.total), 0))} total. Bills and payment status come from QuickBooks every night.</div>`;
  } else {
    const rows = await run(sb.from('labor_entries').select('*').eq('job_id', id).order('entry_date', { ascending: false }));
    body = `<div class="card mb"><b>Add labor</b><div class="help mb">Use this for in house labor or any payroll you track outside QuickBooks bills. Pick the phase so the Overview can show where labor went.</div>
      <div class="fields">
        ${fld('Date', `<input id="lab-date" type="date" value="${today()}">`)}
        ${fld('Phase', selectHtml(LABOR_PHASES, 'framing', 'id="lab-phase"'))}
        ${fld('Worker or crew', '<input id="lab-worker">')}
        ${fld('Hours', '<input id="lab-hours" type="number" step="0.25">')}
        ${fld('Amount paid', '<input id="lab-amount" type="number" step="0.01">')}
        ${fld('Note', '<input id="lab-note">')}
      </div><button class="btn primary" onclick="A.addLabor('${id}')">Add labor</button></div>
      <div class="card flush scroll"><table><thead><tr><th>Date</th><th>Phase</th><th>Worker or crew</th><th class="r">Hours</th><th class="r">Amount</th><th>Note</th><th></th></tr></thead>
      <tbody>${rows.map(l => `<tr>
        <td><input type="date" value="${l.entry_date || ''}" data-t="labor_entries" data-id="${l.id}" data-c="entry_date" onchange="A.field(this)"></td>
        <td>${selectHtml(LABOR_PHASES, l.phase || 'other', `data-t="labor_entries" data-id="${l.id}" data-c="phase" onchange="A.field(this)"`)}</td>
        <td><input value="${esc(l.worker || '')}" data-t="labor_entries" data-id="${l.id}" data-c="worker" data-k="text0" onchange="A.field(this)"></td>
        <td class="r"><input type="number" step="0.25" style="width:80px" value="${l.hours ?? ''}" data-t="labor_entries" data-id="${l.id}" data-c="hours" data-k="num" onchange="A.field(this)"></td>
        <td class="r"><input type="number" step="0.01" style="width:110px" value="${l.amount ?? ''}" data-t="labor_entries" data-id="${l.id}" data-c="amount" data-k="num" onchange="A.field(this)"></td>
        <td><input value="${esc(l.note || '')}" data-t="labor_entries" data-id="${l.id}" data-c="note" data-k="text0" onchange="A.field(this)"></td>
        <td><button class="btn sm danger" onclick="A.delLabor('${l.id}')">Delete</button></td></tr>`).join('') || '<tr><td colspan="7" class="empty">No labor entries yet.</td></tr>'}
        ${rows.length ? `<tr class="total"><td colspan="3">Total</td><td class="r num">${qty(rows.reduce((a, l) => a + n0(l.hours), 0))}</td><td class="r num">${money(rows.reduce((a, l) => a + n0(l.amount), 0))}</td><td colspan="2"></td></tr>` : ''}</tbody></table></div>`;
  }
  $('#tab').innerHTML = head + body;
}
A.addLabor = async (id) => {
  const amount = parseNum($('#lab-amount').value);
  if (amount === null) { toast('Type the amount paid', true); return; }
  try {
    await insert('labor_entries', { job_id: id, entry_date: $('#lab-date').value || today(), phase: $('#lab-phase').value, worker: $('#lab-worker').value.trim() || null,
      hours: parseNum($('#lab-hours').value), amount, note: $('#lab-note').value.trim() || null, source: 'manual' });
    S.cache = {}; await loadCore(); await rerender(); toast('Labor added');
  } catch (e) { fail(e); }
};
A.delLabor = (lid) => ask('Delete this labor entry?', 'It will be removed from the job cost.', 'Delete', async () => {
  await remove('labor_entries', lid); S.cache = {}; await loadCore(); await rerender(); toast('Deleted');
}, true);

/* ---------- estimate: lump sum or by item, material and labor ---------- */
const cmpTiles = (x, extra) => `<div class="estcmp">
  <div><div class="l">Estimate</div><div class="v">${x.has ? money(x.est) : '<span class="faint">none</span>'}</div></div>
  <div><div class="l">${x.kind === 'labor' ? 'Spent' : 'Billed'}</div><div class="v">${money(x.spent)}</div></div>
  <div><div class="l">${x.over ? 'Over by' : 'Left'}</div><div class="v ${x.over ? 'bad' : ''}">${x.has ? money(Math.abs(x.est - x.spent)) : ''}</div></div>
  <div><div class="l">Used</div><div class="v ${x.over ? 'bad' : ''}">${x.has ? Math.round(x.pct) + '%' : ''}</div></div>
  ${extra || ''}</div>`;
const modeToggle = (id, kind, mode) => `<div class="estmode"><button class="${mode === 'lump' ? 'on' : ''}" onclick="A.setEstMode('${id}','${kind}','lump')">Lump sum</button><button class="${mode === 'items' ? 'on' : ''}" onclick="A.setEstMode('${id}','${kind}','items')">By item</button></div>`;

async function tabBudget(id) {
  const d = await jobData(id), m = moneyOf(id), j = jobOf(id), e = estOf(m);
  const pur = await run(sb.from('v_job_purchases').select('*').eq('job_id', id));
  const ai = (b, c, v, extra = '') => `data-t="budgets" data-id="${b.id}" data-c="${c}" data-k="num" value="${v ?? ''}" onchange="A.field(this)" ${extra}`;
  const cont = d.bud.find(b => b.kind === 'contingency'), totCont = cont ? n0(cont.budget_cost) : 0;
  const hidden = d.bud.filter(b => b.kind === 'material' && b.building_id).length;
  const matMode = e.mat.mode, labMode = e.lab.mode;
  const ml = materialLines(d, pur), ls = laborSlots(d);
  const itemsMat = ml.reduce((a, l) => a + l.budD, 0), itemsLab = ls.slots.reduce((a, x) => a + x.budget, 0) + ls.extra.reduce((a, b) => a + n0(b.budget_cost), 0);
  const lumpInput = (kind, val) => `<div class="row"><span class="muted">Total ${kind} estimate</span><input type="number" step="any" style="width:170px;font-size:20px;font-weight:800" placeholder="$ total" value="${val ?? ''}"
      data-t="jobs" data-id="${id}" data-c="${kind}_estimate" data-k="num" data-after="jobEdited" onchange="A.field(this)"></div>`;

  const matBody = matMode === 'lump' ? `
      <div class="help mb">One number for all material on this job. The app only watches the total, so it will not flag individual items as over budget, because you did not set one for them.</div>
      ${lumpInput('material', j.material_estimate)}
      ${itemsMat ? `<div class="tiny muted mt">Your by-item lines add up to ${money(itemsMat)}. Switch to By item to use them instead.</div>` : ''}`
    : `<div class="spread mb"><div class="help">Set a quantity and/or a dollar amount for the materials you want to watch. Leave a box empty if you do not want to track it. The app checks each line against what is billed, and against open POs from the last 120 days as a ballpark.</div>
        <div class="row"><button class="btn sm primary" onclick="A.addBudgetLine('${id}')">Add material</button><button class="btn sm" onclick="A.addMiscMaterial('${id}')">Add miscellaneous item</button></div></div>
      <div class="scroll"><table><thead><tr><th>Material</th><th class="r">Budget qty</th><th class="r">Budget $</th><th class="r">Billed</th><th class="r">Open POs</th><th>Status</th><th></th></tr></thead>
      <tbody>${ml.map(l => { const b = l.b; return `<tr>
        <td>${matOf(b.material_id) || (b.category && b.category !== 'misc') ? esc(l.label) : `<input value="${esc(b.notes || '')}" placeholder="Name this item" data-t="budgets" data-id="${b.id}" data-c="notes" data-k="text0" onchange="A.field(this)">`}</td>
        <td class="r"><input type="number" style="width:100px" placeholder="qty" ${ai(b, 'budget_qty', n0(b.budget_qty) || '')}></td>
        <td class="r"><input type="number" style="width:120px" placeholder="$" ${ai(b, 'budget_cost', n0(b.budget_cost) || '')}></td>
        <td class="r num">${l.tracked ? `${qty(Math.round(l.bq))}<div class="tiny muted">${money(l.bd)}</div>` : ''}</td>
        <td class="r num">${l.tracked && (l.oq || l.od) ? `${qty(Math.round(l.oq))}<div class="tiny muted">${money(l.od)}</div>` : ''}</td>
        <td><span class="pill ${l.st[0]}">${esc(l.st[1])}</span></td>
        <td class="r"><button class="btn sm danger" onclick="A.delBudget('${b.id}')">Remove</button></td></tr>`; }).join('') || '<tr><td colspan="7" class="empty">No lines yet. Add the materials you want to watch, like boards.</td></tr>'}
      ${ml.length ? `<tr class="total"><td>Material estimate</td><td></td><td class="r num">${money(itemsMat)}</td><td></td><td></td><td></td><td></td></tr>` : ''}</tbody></table></div>
      ${hidden ? `<div class="help mt">${hidden} building level allocations are also stored for this job and counted in reports.</div>` : ''}`;

  const labBody = labMode === 'lump' ? `
      <div class="help mb">One number for all labor on this job (framing, hang, finish and punch out together). The app only watches the total.</div>
      ${lumpInput('labor', j.labor_estimate)}
      ${itemsLab ? `<div class="tiny muted mt">Your by-phase lines add up to ${money(itemsLab)}. Switch to By item to use them instead.</div>` : ''}`
    : `<div class="spread mb"><div class="help">Enter what you expect each phase to cost. Add a miscellaneous item for anything else.</div><button class="btn sm" onclick="A.addLaborBudget('${id}')">Add miscellaneous item</button></div>
      <table><thead><tr><th>Phase</th><th class="r">Estimate $</th><th class="r">Spent</th><th>Status</th><th></th></tr></thead><tbody>
      ${ls.slots.map(x => { const st = x.budget > 0 ? (x.spent > x.budget ? ['bad', 'Over'] : ['good', 'Under']) : ['gray', 'No number set'];
        return `<tr><td><b>${x.label}</b></td>
        <td class="r"><input type="number" style="width:130px" placeholder="$" value="${x.b ? n0(x.b.budget_cost) || '' : ''}" onchange="A.setLaborPhase('${id}','${x.k}','${esc(x.label)}',this.value)"></td>
        <td class="r num">${x.spent ? money(x.spent) : ''}</td><td><span class="pill ${st[0]}">${st[1]}</span></td>
        <td class="r">${x.b ? `<button class="btn sm danger" onclick="A.delBudget('${x.b.id}')">Clear</button>` : ''}</td></tr>`; }).join('')}
      ${ls.extra.map(b => `<tr><td><input value="${esc(b.notes || '')}" placeholder="Name this item" data-t="budgets" data-id="${b.id}" data-c="notes" data-k="text0" onchange="A.field(this)"></td>
        <td class="r"><input type="number" style="width:130px" ${ai(b, 'budget_cost', n0(b.budget_cost) || '')}></td><td></td><td><span class="pill gray">Not tracked</span></td>
        <td class="r"><button class="btn sm danger" onclick="A.delBudget('${b.id}')">Remove</button></td></tr>`).join('')}
      <tr class="total"><td>Labor estimate</td><td class="r num">${money(itemsLab)}</td><td></td><td></td><td></td></tr></tbody></table>
      <div class="help mt">Labor from payroll and subcontractor bills is not split by phase, so those dollars count toward the total labor estimate above. The Spent column only shows labor you entered by phase on the Orders and bills tab.</div>`;

  $('#tab').innerHTML = `
    <div class="help mb">Your estimate is the bid: what you expect this job to cost. For both material and labor, pick <b>Lump sum</b> if you only have one total, or <b>By item</b> if you want to set numbers line by line. Nothing is flagged as over unless you set a number for it. Changes save as you type.</div>
    <div class="card mb"><div class="spread mb"><b style="font-size:17px">Material estimate</b>${modeToggle(id, 'material', matMode)}</div>
      ${matBody}
      ${cmpTiles({ ...e.mat, kind: 'material' }, `<div><div class="l">Open POs (120 days)</div><div class="v">${money(e.mat.open)}</div><div class="tiny muted">billed + open = ${money(e.mat.spent + e.mat.open)}${e.mat.has ? ', ' + Math.round((e.mat.spent + e.mat.open) / e.mat.est * 100) + '%' : ''}</div></div>`)}</div>
    <div class="card mb"><div class="spread mb"><b style="font-size:17px">Labor estimate</b>${modeToggle(id, 'labor', labMode)}</div>
      ${labBody}
      ${cmpTiles({ ...e.lab, kind: 'labor' })}</div>
    <div class="card"><b>Cushion for small unplanned items</b>
      <div class="row mt">${cont ? `<input type="number" style="max-width:160px" ${ai(cont, 'budget_cost', n0(cont.budget_cost) || '')}>` : `<button class="btn sm" onclick="A.addCushion('${id}')">Add a cushion</button>`}</div></div>
    <div class="tile mt" style="max-width:320px"><div class="l">Total estimate</div><div class="v">${money(e.mat.est + e.lab.est + totCont)}</div><div class="s">material + labor${totCont ? ' + cushion' : ''}</div></div>`;
}
A.setEstMode = async (id, kind, mode) => {
  try {
    const j = jobOf(id), patch = { [kind + '_est_mode']: mode };
    if (mode === 'lump' && j[kind + '_estimate'] == null) {
      const d = await jobData(id);
      const tot = kind === 'material' ? matBudgets(d.bud).reduce((a, b) => a + n0(b.budget_cost), 0) : labBudgets(d.bud).reduce((a, b) => a + n0(b.budget_cost), 0);
      if (tot > 0) patch[kind + '_estimate'] = tot;
    }
    await save('jobs', id, patch);
    S.cache = {}; await loadCore(); await rerender();
  } catch (e) { fail(e); }
};
A.setLaborPhase = async (id, k, label, v) => {
  try {
    const d = await jobData(id), cur = laborSlots(d).slots.find(x => x.k === k), val = parseNum(v);
    if (cur && cur.b) await save('budgets', cur.b.id, { budget_cost: val || 0 });
    else if (val) await insert('budgets', { job_id: id, kind: 'labor', notes: label, budget_cost: val, budget_qty: 0 });
    S.cache = {}; await loadCore(); await rerender();
  } catch (e) { fail(e); }
};
A.delBudget = (bid) => ask('Remove this estimate line?', 'This only removes the estimate. No costs are touched.', 'Remove', async () => {
  await remove('budgets', bid); S.cache = {}; await loadCore(); await rerender();
}, true);
A.addBudgetLine = (jobId) => openModal('Add a material', `
  ${fld('Material', matSelect('', 'id="bl-mat"'))}
  <div class="fields mt">${fld('Quantity (optional)', '<input id="bl-qty" type="number">')}${fld('Budget $ (optional)', '<input id="bl-cost" type="number">')}</div>`, {
  onSave: async () => {
    const mid = $('#bl-mat').value; if (!mid) { toast('Pick a material', true); return false; }
    await insert('budgets', { job_id: jobId, material_id: mid, kind: 'material', budget_qty: parseNum($('#bl-qty').value) || 0, budget_cost: parseNum($('#bl-cost').value) || 0 });
    S.cache = {}; await loadCore(); await rerender();
  }
});
A.addMiscMaterial = (jobId) => openModal('Add a miscellaneous material item', `
  <div class="fields">${fld('Name', '<input id="mm-n" placeholder="Example: Delivery fees, special trim">')}${fld('Budget $', '<input id="mm-c" type="number">')}</div>
  <div class="help mt">Miscellaneous items count toward your material estimate total but are not matched to bills.</div>`, {
  onSave: async () => {
    const n = $('#mm-n').value.trim(); if (!n) { toast('Give it a name', true); return false; }
    await insert('budgets', { job_id: jobId, kind: 'material', category: 'misc', notes: n, budget_cost: parseNum($('#mm-c').value) || 0, budget_qty: 0 });
    S.cache = {}; await loadCore(); await rerender();
  }
});
A.addLaborBudget = (jobId) => openModal('Add a miscellaneous labor item', `
  <div class="fields">${fld('Name', '<input id="lb-n" placeholder="Example: Punch out extras, cleanup crew">')}${fld('Estimate $', '<input id="lb-c" type="number">')}</div>`, {
  onSave: async () => {
    await insert('budgets', { job_id: jobId, kind: 'labor', notes: $('#lb-n').value.trim() || 'Miscellaneous', budget_cost: parseNum($('#lb-c').value) || 0, budget_qty: 0 });
    S.cache = {}; await loadCore(); await rerender();
  }
});
A.addCushion = async (jobId) => {
  try { await insert('budgets', { job_id: jobId, kind: 'contingency', budget_cost: 0, budget_qty: 0, notes: 'Cushion' }); S.cache = {}; await rerender(); } catch (e) { fail(e); }
};

/* ---------- locations ---------- */
async function tabLocations(id) {
  const [locs, buildings, floors, units] = await Promise.all([
    run(sb.from('v_job_locations').select('*').eq('job_id', id)),
    run(sb.from('buildings').select('*').eq('job_id', id).order('name')),
    run(sb.from('floors').select('*, buildings!inner(job_id)').eq('buildings.job_id', id)),
    all(() => sb.from('units').select('*, floors!inner(building_id, buildings!inner(job_id))').eq('floors.buildings.job_id', id)),
  ]);
  const agg = (b, f, u) => {
    let t = 0, bd = 0;
    locs.forEach(l => {
      if (b !== undefined && (l.building_name || '') !== b) return;
      if (f !== undefined && String(l.floor_number || '') !== String(f)) return;
      if (u !== undefined && String(l.unit_number || '') !== String(u)) return;
      t += n0(l.total); bd += n0(l.boards);
    });
    return { t, bd };
  };
  const html = buildings.map(b => {
    const fl = floors.filter(f => f.building_id === b.id).sort((x, y) => n0(x.floor_number) - n0(y.floor_number));
    const ab = agg(b.name);
    return `<div class="node"><div class="row"><b style="font-size:16px">Building ${esc(b.name)}</b><span class="muted small">${money(ab.t)}, ${qty(ab.bd)} boards ordered</span>
        <button class="btn sm ghost" onclick="A.addFloor('${id}','${b.id}')">Add floor</button><button class="btn sm ghost danger" onclick="A.delLoc('${id}','buildings','${b.id}','Building ${esc(b.name)}')">Delete</button></div>
      ${fl.map(f => {
        const us = units.filter(u => u.floor_id === f.id).sort((x, y) => String(x.unit_number).localeCompare(String(y.unit_number), undefined, { numeric: true }));
        const af = agg(b.name, f.floor_number);
        return `<div class="node"><div class="row"><b>Floor ${esc(f.floor_number)}</b><span class="muted small">${money(af.t)}, ${qty(af.bd)} boards ordered</span>
          <button class="btn sm ghost" onclick="A.addUnit('${id}','${f.id}')">Add unit</button><button class="btn sm ghost danger" onclick="A.delLoc('${id}','floors','${f.id}','Floor ${esc(f.floor_number)}')">Delete</button></div>
          <div>${us.map(u => { const au = agg(b.name, f.floor_number, u.unit_number); return `<span class="unit" title="${money(au.t)}">${esc(u.unit_number)}${au.bd ? ' <b>' + qty(au.bd) + '</b>' : ''}</span>`; }).join('')}</div></div>`;
      }).join('')}</div>`;
  }).join('');
  $('#tab').innerHTML = `<div class="spread mb"><div class="help">Break the job into buildings, floors and units so POs can be tagged to where the material went. Numbers beside units are boards ordered.</div>
    <button class="btn primary" onclick="A.addBuilding('${id}')">Add building</button></div>
    <div class="card tree">${html || '<div class="empty">No buildings yet.</div>'}</div>`;
}
function oneBox(label, cb) {
  openModal(label, `<div class="fld"><label>${esc(label)}</label><input id="ob-v"></div>`, { onSave: async () => { const v = $('#ob-v').value.trim(); if (!v) return false; await cb(v); } });
}
A.addBuilding = (id) => oneBox('Building name or number', async (v) => { await insert('buildings', { job_id: id, name: v.toUpperCase() }); S.cache = {}; await rerender(); });
A.addFloor = (id, bid) => oneBox('Floor number', async (v) => { await insert('floors', { building_id: bid, floor_number: v }); await rerender(); });
A.addUnit = (id, fid) => oneBox('Unit number', async (v) => { await insert('units', { floor_id: fid, unit_number: v.toUpperCase() }); await rerender(); });
A.delLoc = (jobId, table, id, label) => ask('Delete ' + esc(label) + '?', 'POs and bills tagged here keep their data but lose this location tag.', 'Delete', async () => {
  const col = { buildings: 'building_id', floors: 'floor_id', units: 'unit_id' }[table];
  const clear = { buildings: { building_id: null, floor_id: null, unit_id: null }, floors: { floor_id: null, unit_id: null }, units: { unit_id: null } }[table];
  await sb.from('purchase_orders').update(clear).eq(col, id); await sb.from('bills').update(clear).eq(col, id);
  await remove(table, id); await audit('delete', table, id, { label }); await rerender(); toast('Deleted');
}, true);

/* ---------- spend: tracked totals vs your own numbers ---------- */
async function tabSpend(id) {
  const m = moneyOf(id), j = jobOf(id);
  const row = (label, tracked, col, val, fmt) => `<tr><td><b>${label}</b></td><td class="r num">${fmt(tracked)}</td>
    <td class="r"><input type="number" step="any" style="width:150px" placeholder="same as tracked" value="${val ?? ''}" data-t="jobs" data-id="${id}" data-c="${col}" data-k="num" data-after="jobEdited" onchange="A.field(this)"></td>
    <td class="r num"><b>${fmt(val ?? tracked)}</b></td></tr>`;
  const mt = n0(m.tracked_material), lt = n0(m.tracked_labor), bt = n0(m.tracked_boards);
  $('#tab').innerHTML = `
    <div class="help mb">Totals for this job. The tracked column comes from QuickBooks bills and what you entered in the app. If you have better numbers, such as a real labor total or a real board count, type them in the middle column and every report uses yours. Clear a box to go back to tracked.</div>
    <div class="card flush scroll"><table>
      <thead><tr><th></th><th class="r">Tracked</th><th class="r">Your number</th><th class="r">Used in reports</th></tr></thead><tbody>
      ${row('Material spend', mt, 'material_override', j.material_override, (v) => money(v))}
      ${row('Labor spend', lt, 'labor_override', j.labor_override, (v) => money(v))}
      ${row('Boards used', bt, 'boards_override', j.boards_override, (v) => qty(Math.round(n0(v))))}
      <tr class="total"><td>Total cost</td><td class="r num">${money(mt + lt)}</td><td></td><td class="r num">${money(m.total_cost)}</td></tr>
      <tr class="total"><td>Cost per board</td><td class="r num">${bt ? money((mt + lt) / bt, 2) : ''}</td><td></td><td class="r num">${m.cost_per_board ? money(m.cost_per_board, 2) : ''}</td></tr>
      </tbody></table></div>
    <div class="fld mt" style="max-width:560px"><label>Note (where your numbers came from)</label>
      <input value="${esc(j.override_note || '')}" placeholder="Example: final numbers from the job closeout sheet" data-t="jobs" data-id="${id}" data-c="override_note" data-k="text0" onchange="A.field(this)"></div>
    ${m.has_override ? `<button class="btn mt" onclick="A.clearOverrides('${id}')">Go back to tracked numbers</button>` : ''}
    <div class="help mt">The phase chart and the Materials used tab still show tracked items only.</div>`;
}
A.clearOverrides = async (id) => {
  try { await save('jobs', id, { material_override: null, labor_override: null, boards_override: null, override_note: null }); S.cache = {}; await loadCore(); await rerender(); toast('Back to tracked numbers'); } catch (e) { fail(e); }
};

/* ---------- ordered vs billed: what you bought, item by item ---------- */
async function tabPurchases(id) {
  const rows = await run(sb.from('v_job_purchases').select('*').eq('job_id', id));
  const cats = {};
  rows.forEach(r => { const c = (cats[r.category] = cats[r.category] || { o: 0, b: 0, p: 0, ob: 0, bb: 0, items: [] }); c.o += n0(r.ordered_dollars); c.b += n0(r.billed_dollars); c.p += n0(r.paid_dollars); c.ob += n0(r.ordered_boards); c.bb += n0(r.billed_boards); c.items.push(r); });
  const order = Object.keys(cats).sort((a, b) => (cats[b].o + cats[b].b) - (cats[a].o + cats[a].b));
  const O = order.reduce((a, c) => a + cats[c].o, 0), B = order.reduce((a, c) => a + cats[c].b, 0), P = order.reduce((a, c) => a + cats[c].p, 0);
  const boardsB = order.reduce((a, c) => a + cats[c].bb, 0), boardsO = order.reduce((a, c) => a + cats[c].ob, 0);
  const cell = (q, d, u) => (n0(d) || n0(q)) ? `${money(d)}<div class="tiny faint">${qty(q)} ${esc(u || '')}</div>` : '';
  $('#tab').innerHTML = `
    <div class="help mb">Everything bought for this job. <b>Open POs</b> are the last 120 days of POs that no bill has covered yet, a ballpark of what is coming. <b>Billed</b> is the real spend. When a bill comes in from QuickBooks it replaces its PO automatically, and when the bill is paid the Paid column fills in.</div>
    <div class="tiles">
      ${moneyTile('Open POs (120 days)', money(O), boardsO ? 'about ' + qty(Math.round(boardsO)) + ' boards, ballpark' : 'ballpark only')}
      ${moneyTile('Billed', money(B), boardsB ? qty(Math.round(boardsB)) + ' boards billed' : 'materials on bills')}
      ${moneyTile('Paid', money(P), 'of billed')}
      ${moneyTile('Billed, still owed', money(B - P), 'unpaid to suppliers', B - P > 0 ? 'warn' : '')}
    </div>
    <div class="card flush scroll"><table>
      <thead><tr><th>Category and item</th><th class="r">Open POs</th><th class="r">Billed</th><th class="r">Paid</th><th class="r">Billed + open POs</th></tr></thead>
      <tbody>${order.map((c, i) => {
        const x = cats[c], items = x.items.slice().sort((p, q) => (n0(q.ordered_dollars) + n0(q.billed_dollars)) - (n0(p.ordered_dollars) + n0(p.billed_dollars)));
        return `<tr class="click" onclick="A.toggleRows('pc${i}')" style="background:#1b2430"><td><b>${esc(CATLABEL[c] || c)}</b> <span class="faint small">${items.length} items</span></td>
          <td class="r num">${x.o ? money(x.o) : ''}</td><td class="r num">${x.b ? money(x.b) : ''}</td><td class="r num">${x.p ? money(x.p) : ''}</td><td class="r num"><b>${money(x.o + x.b)}</b></td></tr>` +
          items.map(it => `<tr data-g="pc${i}" hidden><td style="padding-left:30px">${esc(it.item)}</td><td class="r num">${cell(it.ordered_qty, it.ordered_dollars, it.uom)}</td>
            <td class="r num">${cell(it.billed_qty, it.billed_dollars, it.uom)}</td><td class="r num">${n0(it.paid_dollars) ? money(it.paid_dollars) : ''}</td><td class="r num">${money(n0(it.ordered_dollars) + n0(it.billed_dollars))}</td></tr>`).join('');
      }).join('') || '<tr><td colspan="5" class="empty">Nothing ordered or billed on this job yet.</td></tr>'}
      ${order.length ? `<tr class="total"><td>Total</td><td class="r num">${money(O)}</td><td class="r num">${money(B)}</td><td class="r num">${money(P)}</td><td class="r num">${money(O + B)}</td></tr>` : ''}</tbody>
    </table></div>
    <div class="row mt"><button class="btn" onclick="location.hash='#/job/${id}/orders/open'">See the open POs</button><button class="btn" onclick="A.dlPurchases('${id}')">Download</button></div>`;
}
A.dlPurchases = async (id) => {
  const rows = await run(sb.from('v_job_purchases').select('*').eq('job_id', id));
  downloadCSV(jn(jobOf(id).name).replace(/\W+/g, '_') + '_ordered_vs_billed.csv', rows.map(r => ({ category: r.category, item: r.item, on_order_qty: r.ordered_qty, on_order_dollars: r.ordered_dollars, billed_qty: r.billed_qty, billed_dollars: r.billed_dollars, paid_dollars: r.paid_dollars })));
};
