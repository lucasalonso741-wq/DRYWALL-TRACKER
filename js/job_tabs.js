'use strict';
/* =====================================================================
   Job page tabs
   ===================================================================== */

function phaseBudgets(buds) {
  const out = {};
  buds.forEach(b => {
    if (b.kind === 'material' && !b.building_id) {
      const mat = matOf(b.material_id);
      const k = phaseOf(mat ? mat.category : b.category);
      out[k] = (out[k] || 0) + n0(b.budget_cost);
    } else if (b.kind === 'labor') {
      const k = laborPhaseFromNote(b.notes);
      out[k] = (out[k] || 0) + n0(b.budget_cost);
    }
  });
  return out;
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

function watchItems(m, d, spent, bud) {
  const out = [];
  const contract = n0(m.contract_value);
  if (m.projected_profit != null && m.projected_profit < 0)
    out.push(['bad', `At this pace the job finishes ${money(-m.projected_profit)} over the contract.`]);
  else if (m.projected_profit != null && contract > 0 && m.projected_profit / contract < 0.08)
    out.push(['', `Projected margin is only ${Math.round(m.projected_profit / contract * 100)}%. Check what is still to be bought.`]);
  PHASES.forEach(([k, lab]) => {
    if (n0(bud[k]) > 0 && n0(spent[k]) > n0(bud[k]))
      out.push(['bad', `${lab} is ${money(spent[k] - bud[k])} over its budget (${Math.round(spent[k] / bud[k] * 100)}% used).`]);
  });
  const old = d.open.filter(p => n0(p.age_days) > 60);
  if (old.length) out.push(['', `${old.length} POs have been open more than 60 days (${money(old.reduce((a, p) => a + n0(p.total), 0))}). Close them in QuickBooks if they were billed or cancelled.`]);
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
  const spent = {}; d.pm.forEach(r => { spent[r.bucket] = (spent[r.bucket] || 0) + n0(r.cost); });
  const bud = phaseBudgets(d.bud);
  const rows = PHASES.filter(([k]) => n0(spent[k]) || n0(bud[k]));
  const totSpent = Object.values(spent).reduce((a, b) => a + b, 0);
  const totBud = Object.values(bud).reduce((a, b) => a + b, 0);
  const target = n0(m.target_price_per_board);
  const watch = watchItems(m, d, spent, bud);
  $('#tab').innerHTML = `
    <div class="mb"><h2>What to watch</h2><ul class="watch">${watch.map(([k, t]) => `<li class="${k}">${esc(t)}</li>`).join('')}</ul></div>
    <div class="two">
      <div>
        <h2>Where the money went</h2>
        <div class="card flush scroll"><table>
          <thead><tr><th>Phase</th><th class="r">Spent</th><th class="r">Budget</th><th style="min-width:140px">Budget used</th><th class="r">Share</th></tr></thead>
          <tbody>${rows.map(([k, l]) => {
            const s = n0(spent[k]), b = n0(bud[k]), used = b > 0 ? s / b * 100 : null;
            return `<tr><td><span class="sw" style="background:${PHASE_COLOR[k]}"></span>${l}</td><td class="r num">${money(s)}</td><td class="r num">${b ? money(b) : ''}</td>
              <td>${used != null ? `<div class="row" style="flex-wrap:nowrap;gap:8px"><div class="phasebar grow"><i style="width:${Math.min(100, used)}%;background:${used > 100 ? 'var(--bad)' : PHASE_COLOR[k]}"></i></div><span class="small num ${used > 100 ? 'bad' : ''}">${Math.round(used)}%</span></div>` : ''}</td>
              <td class="r num">${totSpent ? Math.round(s / totSpent * 100) + '%' : ''}</td></tr>`;
          }).join('') || '<tr><td colspan="5" class="empty">No costs on this job yet.</td></tr>'}
          ${rows.length ? `<tr class="total"><td>Total</td><td class="r num">${money(totSpent)}</td><td class="r num">${totBud ? money(totBud) : ''}</td><td></td><td></td></tr>` : ''}</tbody>
        </table></div>
        <div class="help mt">Materials are grouped into phases automatically: framing (metal, lumber, plywood), hang (board and fasteners), finish (mud, tape, sealants). Labor from your subcontractor bills shows as its own line. Labor you enter by phase on the Orders and bills tab lands in that phase.</div>
      </div>
      <div>
        <h2>Per board numbers</h2>
        <div class="card">
          <table><tbody>
            <tr><td>Boards used</td><td class="r num"><b>${qty(m.boards_used)}</b></td></tr>
            <tr><td>Material per board</td><td class="r num">${m.material_per_board ? money(m.material_per_board, 2) : ''}</td></tr>
            <tr><td>Labor per board</td><td class="r num">${m.labor_per_board ? money(m.labor_per_board, 2) : ''}</td></tr>
            <tr><td>All in per board</td><td class="r num"><b>${m.cost_per_board ? money(m.cost_per_board, 2) : ''}</b></td></tr>
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
  const bc = {};
  d.bud.filter(b => b.kind === 'material' && !b.building_id).forEach(b => {
    const mat = matOf(b.material_id), cat = (mat && mat.category) || b.category || 'uncategorized';
    const x = (bc[cat] = bc[cat] || { qty: 0, cost: 0 }); x.qty += n0(b.budget_qty); x.cost += n0(b.budget_cost);
  });
  const order = Object.keys(cats).sort((a, b) => cats[b].dollars - cats[a].dollars);
  const sumItems = (re, cat) => (cats[cat] ? cats[cat].items.filter(i => re.test(i.item)).reduce((a, i) => a + n0(i.qty), 0) : 0);
  const boards = cats.board ? cats.board.qty : 0, studs = sumItems(/stud/i, 'metal_framing'), track = sumItems(/track/i, 'metal_framing');
  const bb = bc.board;
  $('#tab').innerHTML = `
    <div class="tiles">
      ${moneyTile('Boards', qty(boards), bb && bb.qty ? `of ${qty(bb.qty)} budgeted (${Math.round(boards / bb.qty * 100)}%)` : 'sheets billed to this job')}
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
          items.map(it => `<tr data-g="mc${i}" hidden><td style="padding-left:30px">${esc(it.item)}</td><td class="r num">${qty(it.qty)} <span class="faint small">${esc(it.uom || '')}</span></td>
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
    body = `<div class="help mb">POs that are still open in QuickBooks with no bill against them yet. This is money you have committed but not been billed for: ${money(d.open.reduce((a, p) => a + n0(p.total), 0))}.</div>
      <div class="card flush scroll"><table>${poHead(false)}<tbody>${poRows(d.open, false) || '<tr><td colspan="5" class="empty">No open POs on this job.</td></tr>'}</tbody></table></div>`;
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

/* ---------- budget ---------- */
async function tabBudget(id) {
  const d = await jobData(id);
  const mats = d.bud.filter(b => b.kind === 'material' && !b.building_id);
  const labor = d.bud.filter(b => b.kind === 'labor');
  const cont = d.bud.find(b => b.kind === 'contingency');
  const hidden = d.bud.filter(b => b.kind === 'material' && b.building_id).length;
  const ai = (b, c, v, extra = '') => `data-t="budgets" data-id="${b.id}" data-c="${c}" data-k="num" value="${v ?? ''}" onchange="A.field(this)" ${extra}`;
  const totMat = mats.reduce((a, b) => a + n0(b.budget_cost), 0), totLab = labor.reduce((a, b) => a + n0(b.budget_cost), 0), totCont = cont ? n0(cont.budget_cost) : 0;
  $('#tab').innerHTML = `
    <div class="help mb">The budget is your bid: what you expected to spend. Everything else on this job is measured against it. Changes save as you type.</div>
    <div class="card mb"><div class="spread mb"><b>Material estimate</b><button class="btn sm primary" onclick="A.addBudgetLine('${id}')">Add material line</button></div>
      <div class="scroll"><table><thead><tr><th>Material</th><th class="r">Quantity</th><th class="r">Budget $</th><th></th></tr></thead>
      <tbody>${mats.map(b => { const mt = matOf(b.material_id); return `<tr>
        <td>${mt ? esc(mt.name) : esc(CATLABEL[b.category] || b.notes || 'Total')}</td>
        <td class="r"><input type="number" style="width:110px" placeholder="qty" ${ai(b, 'budget_qty', n0(b.budget_qty) || '')}></td>
        <td class="r"><input type="number" style="width:130px" placeholder="$" ${ai(b, 'budget_cost', n0(b.budget_cost) || '')}></td>
        <td class="r"><button class="btn sm danger" onclick="A.delBudget('${b.id}')">Remove</button></td></tr>`; }).join('') || '<tr><td colspan="4" class="empty">No material lines yet.</td></tr>'}
      ${mats.length ? `<tr class="total"><td>Material budget</td><td></td><td class="r num">${money(totMat)}</td><td></td></tr>` : ''}</tbody></table></div>
      ${hidden ? `<div class="help mt">${hidden} building level allocations are also stored for this job and counted in reports.</div>` : ''}</div>
    <div class="card mb"><div class="spread mb"><b>Labor budget</b><button class="btn sm primary" onclick="A.addLaborBudget('${id}')">Add labor line</button></div>
      <div class="help mb">Name each line with its phase (Framing, Hang, Finish, Punch out) and the Overview will compare it to what you actually spent.</div>
      <table><tbody>${labor.map(b => `<tr><td><input value="${esc(b.notes || '')}" data-t="budgets" data-id="${b.id}" data-c="notes" data-k="text0" onchange="A.field(this)"></td>
        <td class="r"><input type="number" style="width:130px" ${ai(b, 'budget_cost', n0(b.budget_cost) || '')}></td>
        <td class="r"><button class="btn sm danger" onclick="A.delBudget('${b.id}')">Remove</button></td></tr>`).join('') || '<tr><td class="empty">No labor lines yet.</td></tr>'}
      ${labor.length ? `<tr class="total"><td>Labor budget</td><td class="r num">${money(totLab)}</td><td></td></tr>` : ''}</tbody></table></div>
    <div class="card"><b>Cushion for small unplanned items</b>
      <div class="row mt">${cont ? `<input type="number" style="max-width:160px" ${ai(cont, 'budget_cost', n0(cont.budget_cost) || '')}>` : `<button class="btn sm" onclick="A.addCushion('${id}')">Add a cushion</button>`}</div></div>
    <div class="tile mt" style="max-width:300px"><div class="l">Total budget</div><div class="v">${money(totMat + totLab + totCont)}</div></div>`;
}
A.delBudget = (bid) => ask('Remove this budget line?', 'This only removes the estimate. No costs are touched.', 'Remove', async () => {
  await remove('budgets', bid); S.cache = {}; await loadCore(); await rerender();
}, true);
A.addBudgetLine = (jobId) => openModal('Add a material line', `
  ${fld('Material', matSelect('', 'id="bl-mat"'))}
  <div class="fields mt">${fld('Quantity', '<input id="bl-qty" type="number">')}${fld('Budget $', '<input id="bl-cost" type="number">')}</div>`, {
  onSave: async () => {
    const mid = $('#bl-mat').value; if (!mid) { toast('Pick a material', true); return false; }
    await insert('budgets', { job_id: jobId, material_id: mid, kind: 'material', budget_qty: parseNum($('#bl-qty').value) || 0, budget_cost: parseNum($('#bl-cost').value) || 0 });
    S.cache = {}; await loadCore(); await rerender();
  }
});
A.addLaborBudget = (jobId) => openModal('Add a labor line', `
  <div class="fields">${fld('Name', '<input id="lb-n" placeholder="Framing labor, Hang, Finish, Punch out">')}${fld('Budget $', '<input id="lb-c" type="number">')}</div>`, {
  onSave: async () => {
    await insert('budgets', { job_id: jobId, kind: 'labor', notes: $('#lb-n').value.trim() || 'Labor', budget_cost: parseNum($('#lb-c').value) || 0, budget_qty: 0 });
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
