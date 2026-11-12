'use strict';
/* =====================================================================
   Jobs home + the top of every job page (progress, money tiles, job actions)
   ===================================================================== */

/* simple yes/no box used instead of the browser popup */
function ask(title, message, okLabel, onYes, danger) {
  openModal(title, `<p>${message}</p>`, {
    saveLabel: okLabel || 'Yes', onSave: async () => { await onYes(); }, foot: ''
  });
  if (danger) { const b = $('#m-save'); if (b) { b.classList.remove('primary'); b.classList.add('danger'); } }
}

function jobFlags(m) {
  const chips = [];
  const contract = n0(m.contract_value);
  const margin = (m.projected_profit != null && contract > 0) ? m.projected_profit / contract * 100 : null;
  if (!contract) chips.push(['', 'Add contract amount']);
  else if (m.projected_profit == null) chips.push(['', 'Set percent complete to see a projection']);
  else if (margin < 0) chips.push(['bad', 'Projected loss']);
  else if (margin < 8) chips.push(['warn', 'Thin margin']);
  else chips.push(['good', 'On track']);
  if (m.has_override) chips.push(['blue', 'Using your numbers']);
  if (n0(m.unmapped) > 0) chips.push(['warn', m.unmapped + ' lines need a material match']);
  if (m.active && m.last_dt) {
    const d = Math.round((Date.now() - new Date(m.last_dt + 'T12:00:00')) / 86400e3);
    if (d > 21) chips.push(['warn', 'No bills in ' + d + ' days']);
  }
  return { chips, margin };
}

/* percent complete: the number Lucas set, or an estimate from spend against budget */
function pctOf(m) {
  const set = n0(m.pct_complete);
  if (set > 0) return { pct: set, est: false };
  const bud = n0(m.material_budget) + n0(m.labor_budget) + n0(m.contingency_budget);
  if (bud > 0 && n0(m.total_cost) > 0 && n0(m.total_cost) <= bud) return { pct: Math.min(95, Math.round(n0(m.total_cost) / bud * 100)), est: true };
  return { pct: null, est: false };
}

function jobCard(m) {
  const { chips, margin } = jobFlags(m);
  const { pct, est } = pctOf(m);
  const pp = m.projected_profit, target = n0(m.target_price_per_board), cpb = n0(m.cost_per_board);
  const st = pp != null ? (pp < 0 ? 's-bad' : margin < 8 ? 's-warn' : 's-good') : (target && cpb ? (cpb > target ? 's-bad' : 's-good') : '');
  return `<a class="job ${st}" href="#/job/${m.job_id}">
    <div class="spread" style="align-items:flex-start;flex-wrap:nowrap">
      <div><div class="name">${esc(jn(m.name))}</div><div class="gc">${esc(m.gc || m.address || '')}</div></div>
      <div class="ring" style="--p:${pct || 0};--c:${est ? 'var(--blue)' : 'var(--hot)'}"><div><span><b>${pct == null ? '?' : pct + '%'}</b><small>${est ? 'EST' : 'DONE'}</small></span></div></div>
    </div>
    <div class="hero"><span class="big">${cpb ? money(cpb, 2) : '<span class="faint">no boards yet</span>'}</span><span class="u">per board, all in</span>
      ${target && cpb ? `<span class="vs ${cpb > target ? 'bad' : 'good'}">${cpb > target ? '+' : '-'}${money(Math.abs(cpb - target), 2)} vs target</span>` : ''}</div>
    <div class="tiny muted">${qty(Math.round(n0(m.boards_used)))} boards billed${n0(m.open_po_boards) ? ` + ${qty(Math.round(n0(m.open_po_boards)))} on open POs (est ${qty(Math.round(n0(m.est_boards)))})` : ''}${m.material_per_board ? ` &middot; material ${money(m.material_per_board, 2)} &middot; labor ${money(m.labor_per_board, 2)}` : ''}</div>
    <div class="kv">
      <div><div class="l">Cost so far</div><div class="v">${money(m.total_cost)}</div></div>
      <div><div class="l">Contract</div><div class="v">${n0(m.contract_value) ? money(m.contract_value) : '<span class="faint">not set</span>'}</div></div>
      <div><div class="l">Projected profit</div><div class="v ${pp == null ? '' : (pp < 0 ? 'bad' : 'good')}">${pp == null ? '<span class="faint">not yet</span>' : money(pp) + ' (' + Math.round(margin) + '%)'}</div></div>
      <div><div class="l">Open POs</div><div class="v">${money(m.open_po_total)}</div></div>
    </div>
    <div class="chips">${chips.map(([k, t]) => `<span class="chip ${k}">${esc(t)}</span>`).join('')}</div>
    <div class="tiny muted" style="margin-top:8px">${m.last_dt ? 'Last bill ' + dt(m.last_dt) : ''}</div>
  </a>`;
}

/* ---------- estimates: lump sum or by item, material and labor ---------- */
function estOf(m) {
  const mk = (kind) => {
    const mode = m[kind + '_est_mode'] || 'items';
    const est = n0(m[kind + '_budget']);            /* the view already honors the mode */
    const spent = n0(m[kind + '_cost']);
    const open = kind === 'material' ? n0(m.open_po_total) : 0;
    return { mode, est, spent, open, has: est > 0, pct: est > 0 ? spent / est * 100 : null,
      over: est > 0 && spent > est, ballOver: est > 0 && spent <= est && spent + open > est };
  };
  return { mat: mk('material'), lab: mk('labor') };
}

/* the Summary can look at all time or only the last 120 days */
const rangeOn = () => pref.get('range', 'all') === '120';
function rangeVals(m) {
  if (rangeOn()) { const r = S.recent[m.job_id] || {}; return { mat: n0(r.material_120), lab: n0(r.labor_120), boards: n0(r.boards_120) }; }
  return { mat: n0(m.material_cost), lab: n0(m.labor_cost), boards: n0(m.boards_used) };
}
A.setRange = (v) => { pref.set('range', v); rerender(); };
A.toggleAttn = () => { pref.set('attn', pref.get('attn', 'show') === 'show' ? 'hide' : 'show'); rerender(); };

function projOf(m) {
  /* projected final cost needs a percent complete we trust */
  const { pct, est } = pctOf(m);
  if (!pct || pct < 10) return null;
  const cost = n0(m.total_cost), proj = cost / (pct / 100), c = n0(m.contract_value);
  return { proj, profit: c ? c - proj : null, margin: c ? (c - proj) / c * 100 : null, est };
}
function jobStatus(m) {
  const e = estOf(m), pr = projOf(m);
  if (e.mat.over || e.lab.over || (pr && pr.profit != null && pr.profit < 0)) return ['bad', 'Over'];
  if (e.mat.ballOver || (pr && pr.margin != null && pr.margin < 12)) return ['warn', 'Watch'];
  if (e.mat.has || e.lab.has || pr) return ['good', 'On track'];
  return ['gray', 'Set estimate'];
}
function summaryFlags(active) {
  const f = [];
  const add = (lvl, m, text) => f.push({ lvl, id: m.job_id, name: jn(m.name), text });
  active.forEach(m => {
    const pr = projOf(m), target = n0(m.target_price_per_board), cpb = n0(m.cost_per_board), c = n0(m.contract_value), e = estOf(m);
    if (e.mat.over) add('bad', m, `material is ${money(e.mat.spent - e.mat.est)} over its estimate (${Math.round(e.mat.pct)}% used)`);
    else if (e.mat.ballOver) add('warn', m, `material billed plus open POs is ${money(e.mat.spent + e.mat.open - e.mat.est)} over its estimate`);
    if (e.lab.over) add('bad', m, `labor is ${money(e.lab.spent - e.lab.est)} over its estimate (${Math.round(e.lab.pct)}% used)`);
    if (pr && pr.profit != null && pr.profit < 0) add('bad', m, `is projected to lose ${money(-pr.profit)}`);
    else if (pr && pr.margin != null && pr.margin < 12) add('warn', m, `margin is thin, about ${Math.round(pr.margin)}%`);
    if (c && n0(m.total_cost) > c) add('bad', m, `has spent ${money(n0(m.total_cost) - c)} more than the contract`);
    if (target && cpb > target) add('warn', m, `is running ${money(cpb - target, 2)} per board over target`);
    const need = [];
    if (!c) need.push('contract amount');
    if (!n0(m.pct_complete)) need.push('% done');
    if (!e.mat.has) need.push('material estimate');
    if (!e.lab.has) need.push('labor estimate');
    if (need.length) add('warn', m, 'still needs ' + need.join(', '));
    if (n0(m.material_cost) > 5000 && !n0(m.labor_cost)) add('warn', m, 'has material but no labor entered yet');
    if (m.last_dt) { const d = Math.round((Date.now() - new Date(m.last_dt + 'T12:00:00')) / 86400e3); if (d > 30) add('warn', m, `has had no bills in ${d} days`); }
  });
  return f.sort((x, y) => (x.lvl === 'bad' ? 0 : 1) - (y.lvl === 'bad' ? 0 : 1));
}

function costCard(title, sub, spent, est, extra) {
  /* est = { total, spentOn, jobs, missing } for jobs that have an estimate */
  const pct = est.total > 0 ? est.spentOn / est.total * 100 : null;
  return `<div class="panel costcard"><h2>${title}<small>${sub}</small></h2>
    <div class="bigv">${money(spent)}</div>
    ${rangeOn() ? '<div class="tiny muted mt">Estimates are for the whole job, so switch to All time to see how much of each is used.</div>' :
      est.total > 0 ? `<div class="mini mt" style="height:12px"><i style="width:${Math.min(100, pct)}%;background:${pct > 100 ? 'var(--bad)' : 'var(--blue)'}"></i></div>
        <div class="small mt"><b class="num">${Math.round(pct)}%</b> of the ${money(est.total)} estimated on the ${est.jobs} job${est.jobs === 1 ? '' : 's'} that have one</div>` :
        '<div class="tiny muted mt">No estimates entered yet. Open a job and use its Estimate tab.</div>'}
    ${!rangeOn() && est.missing ? `<div class="tiny muted">${est.missing} job${est.missing === 1 ? ' has' : 's have'} no estimate yet</div>` : ''}
    ${extra || ''}</div>`;
}

async function renderJobs() {
  const active = S.money.filter(m => m.active).sort((a, b) => n0(b.total_cost) - n0(a.total_cost));
  const finished = S.money.filter(m => !m.active && (n0(m.total_cost) > 0 || n0(m.contract_value) > 0)).length;
  const sum = (k) => active.reduce((a, m) => a + n0(m[k]), 0);
  const attn = S.inbox.pos + S.inbox.bills + S.inbox.mats;
  const R = active.map(m => ({ m, r: rangeVals(m) }));
  const matT = R.reduce((a, x) => a + x.r.mat, 0), labT = R.reduce((a, x) => a + x.r.lab, 0), boardsT = R.reduce((a, x) => a + x.r.boards, 0);
  const estSum = (kind) => { const w = active.filter(m => estOf(m)[kind].has); return { total: w.reduce((a, m) => a + estOf(m)[kind].est, 0), spentOn: w.reduce((a, m) => a + estOf(m)[kind].spent, 0), jobs: w.length, missing: active.length - w.length }; };
  const contract = sum('contract_value');
  const proj = active.map(m => ({ m, p: projOf(m) })).filter(x => x.p && x.p.profit != null);
  const projProfit = proj.reduce((a, x) => a + x.p.profit, 0), projRev = proj.reduce((a, x) => a + n0(x.m.contract_value), 0);
  const flags = summaryFlags(active);
  const showAttn = pref.get('attn', 'show') === 'show';
  const boardsJobs = R.filter(x => x.r.boards >= 100 && (x.r.mat + x.r.lab) > 0).map(x => ({ m: x.m, cpb: (x.r.mat + x.r.lab) / x.r.boards })).sort((a, b) => b.cpb - a.cpb);
  const openT = sum('open_po_total'), openBoards = Math.round(sum('open_po_boards'));
  const chartsOpen = pref.get('charts', 'open') === 'open';
  view(`
    <div class="spread mb"><div><h1>Summary</h1><div class="muted small">${active.length} jobs in progress. Bills update from QuickBooks every night.</div></div>
      <div class="row"><div class="seg"><a href="#" onclick="event.preventDefault();A.setRange('all')" class="${rangeOn() ? '' : 'on'}">All time</a><a href="#" onclick="event.preventDefault();A.setRange('120')" class="${rangeOn() ? 'on' : ''}">Last 120 days</a></div>
      <button class="btn primary" onclick="A.newJob()">New job</button></div></div>

    ${(flags.length || attn) ? (showAttn ? `<div class="panel flags mb">
      <h2>Needs your attention<small>${flags.length + (attn ? 1 : 0)} item${flags.length + (attn ? 1 : 0) > 1 ? 's' : ''} <a href="#" onclick="event.preventDefault();A.toggleAttn()">Hide</a></small></h2>
      ${flags.slice(0, 7).map(x => `<a class="flag" href="#/job/${x.id}"><span class="dotf" style="background:var(--${x.lvl === 'bad' ? 'bad' : 'warn'})"></span><span><b>${esc(x.name)}</b> ${esc(x.text)}</span></a>`).join('')}
      ${flags.length > 7 ? `<div class="tiny muted">and ${flags.length - 7} more, open each job to see them.</div>` : ''}
      ${attn ? `<a class="flag" href="#/inbox"><span class="dotf" style="background:var(--warn)"></span><span><b>${attn} items</b> in the Inbox need a job or material match</span></a>` : ''}
    </div>` : `<div class="mb"><a href="#" class="small" onclick="event.preventDefault();A.toggleAttn()">Show ${flags.length + (attn ? 1 : 0)} item${flags.length + (attn ? 1 : 0) > 1 ? 's' : ''} that need your attention</a></div>`) : ''}

    <div class="duo">
      ${costCard('Material cost', rangeOn() ? 'billed, last 120 days' : 'billed so far', matT, estSum('mat'),
        `<div class="sub mt"><div><span class="l">Open POs, last 120 days</span><b class="num">${money(openT)}</b></div><div class="tiny muted">${qty(sum('open_po_count'))} POs, about ${qty(openBoards)} boards. Ballpark only. The bill is the real number.</div></div>`)}
      ${costCard('Labor cost', rangeOn() ? 'last 120 days' : 'spent so far', labT, estSum('lab'), '')}
    </div>

    <div class="tiles">
      <div class="tile"><div class="l">In progress</div><div class="v">${active.length}</div><div class="s">${finished} finished, see Finished Jobs</div></div>
      <div class="tile"><div class="l">Contract value</div><div class="v">${moneyK(contract)}</div><div class="s">${contract ? Math.round(sum('total_cost') / contract * 100) + '% spent, all time' : 'add contracts to see this'}</div></div>
      <div class="tile"><div class="l">Projected profit</div><div class="v ${projProfit < 0 ? 'bad' : 'good'}">${proj.length ? moneyK(projProfit) : '?'}</div><div class="s">${proj.length ? Math.round(projProfit / projRev * 100) + '% margin, ' + proj.length + ' jobs with a % done' : 'set a % done on each job'}</div></div>
      <div class="tile"><div class="l">Boards billed</div><div class="v">${qty(Math.round(boardsT))}</div><div class="s">${rangeOn() ? 'last 120 days' : 'all time'}${openBoards ? ', plus about ' + qty(openBoards) + ' on open POs' : ''}</div></div>
    </div>

    <div class="panel mb" style="padding:0;overflow:hidden"><div style="padding:16px 16px 0"><h2>Jobs in progress<small>${rangeOn() ? 'billed in the last 120 days' : 'billed so far'}. Tap the % to change it.</small></h2></div>
      <div class="scroll"><table class="board">
        <thead><tr><th>Job</th><th>Done</th><th style="min-width:160px">Material</th><th style="min-width:160px">Labor</th><th class="r">Open POs</th><th class="r">Per board</th><th></th></tr></thead>
        <tbody>${R.map(({ m, r }) => {
          const { pct, est } = pctOf(m), e = estOf(m), st = jobStatus(m), t = n0(m.target_price_per_board);
          const cpb = r.boards > 0 ? (r.mat + r.lab) / r.boards : 0;
          const cell = (spent, x) => `<div class="num"><b>${money(spent)}</b>${!rangeOn() && x.has ? `<span class="tiny muted"> of ${moneyK(x.est)}</span>` : ''}</div>` +
            (!rangeOn() && x.has ? `<div class="mini"><i style="width:${Math.min(100, x.pct)}%;background:${x.over ? 'var(--bad)' : 'var(--blue)'}"></i></div>` : (!rangeOn() ? '<div class="tiny faint">no estimate</div>' : ''));
          return `<tr class="click" onclick="location.hash='#/job/${m.job_id}'">
            <td class="nm"><b>${esc(jn(m.name))}</b><div class="tiny muted">${esc(m.gc || '')}</div></td>
            <td onclick="event.stopPropagation()"><input type="number" min="0" max="100" step="5" class="pcin" value="${pct == null ? '' : pct}" placeholder="${est ? 'est' : '?'}" title="Percent complete" onchange="A.setPct('${m.job_id}',this.value)">${est ? '<div class="tiny muted">estimated</div>' : ''}</td>
            <td>${cell(r.mat, e.mat)}</td><td>${cell(r.lab, e.lab)}</td>
            <td class="r num">${n0(m.open_po_total) ? money(m.open_po_total) : ''}${n0(m.open_po_boards) ? `<div class="tiny muted">~${qty(Math.round(m.open_po_boards))} boards</div>` : ''}</td>
            <td class="r num"><b ${t && cpb ? `class="${cpb > t ? 'bad' : 'good'}"` : ''}>${cpb ? money(cpb, 2) : '<span class="faint">none</span>'}</b>${r.boards ? `<div class="tiny muted">${qty(Math.round(r.boards))} boards</div>` : ''}</td>
            <td><span class="pill ${st[0]}">${st[1]}</span></td></tr>`;
        }).join('') || '<tr><td colspan="7" class="empty">No jobs in progress. Tap New job to start one.</td></tr>'}</tbody></table></div></div>

    <details class="panel" ${chartsOpen ? 'open' : ''} ontoggle="pref.set('charts', this.open ? 'open' : 'closed')"><summary><b>Charts</b> <span class="tiny muted">cost per board and spending by month</span></summary>
      <div class="duo mt">
        <div><h2>Cost per board <small>all in${rangeOn() ? ', last 120 days' : ''}</small></h2>
          ${hbars(boardsJobs.map(({ m, cpb }) => { const t = n0(m.target_price_per_board); return { label: jn(m.name), value: cpb, text: money(cpb, 2), href: '#/job/' + m.job_id, color: t ? (cpb > t ? 'var(--bad)' : 'var(--good)') : 'var(--blue)' }; }))}
          <div class="tiny muted mt">Green is at or under the job's target, red is over. Blue means no target set.</div></div>
        <div><h2>Spending by month <small>bills, jobs in progress</small></h2><div id="sum-months"><div class="empty">Loading...</div></div></div>
      </div>
    </details>`);

  /* spending by month, loaded after the page is up */
  try {
    const ids = new Set(active.map(m => m.job_id));
    const pm = await all(() => sb.from('v_job_phase_month').select('job_id,month,cost'));
    const by = {}; pm.forEach(r => { if (ids.has(r.job_id) && r.month) by[String(r.month).slice(0, 7)] = (by[String(r.month).slice(0, 7)] || 0) + n0(r.cost); });
    const keys = Object.keys(by).sort().slice(rangeOn() ? -4 : -12);
    const el = $('#sum-months'); if (el) el.innerHTML = colChart(keys.map(k => ({ label: MON[Number(k.slice(5)) - 1], value: Math.max(0, by[k]) })), moneyK);
  } catch (e) { const el = $('#sum-months'); if (el) el.innerHTML = '<div class="empty">Could not load the monthly chart.</div>'; }
}
ROUTES.jobs = renderJobs;

/* ---------- one job's data, fetched once and cached until something changes ---------- */
async function jobData(id) {
  if (S.cache[id]) return S.cache[id];
  const [pm, mu, bud, prog, open, lab] = await Promise.all([
    run(sb.from('v_job_phase_month').select('*').eq('job_id', id).order('month')),
    run(sb.from('v_job_material_use').select('*').eq('job_id', id)),
    run(sb.from('budgets').select('*').eq('job_id', id)),
    run(sb.from('job_progress').select('*').eq('job_id', id).order('as_of')),
    run(sb.from('v_open_pos').select('*').eq('job_id', id).order('po_date')),
    run(sb.from('v_job_labor_phase').select('*').eq('job_id', id)),
  ]);
  return (S.cache[id] = { pm, mu, bud, prog, open, lab });
}

function moneyTile(label, value, sub, cls) {
  return `<div class="tile"><div class="l">${label}</div><div class="v ${cls || ''}">${value}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>`;
}

async function renderJob(id, tab, sub) {
  tab = tab || 'overview';
  const m = moneyOf(id), job = jobOf(id);
  if (!m || !job) { view('<div class="empty">That job was not found. <a href="#/jobs">Back to jobs</a></div>'); return; }
  let d;
  try { d = await jobData(id); } catch (e) { return fail(e); }
  const pe = pctOf(m), pc = pe.pct == null ? 0 : pe.pct;
  const lastProg = d.prog.length ? d.prog[d.prog.length - 1] : null;
  const contract = n0(m.contract_value);
  const margin = (m.projected_profit != null && contract > 0) ? m.projected_profit / contract * 100 : null;
  const tabs = [['overview', 'Overview'], ['budget', 'Estimate'], ['spend', 'Spend'], ['purchases', 'Open POs vs billed'], ['materials', 'Materials used'], ['orders', 'Orders and bills'], ['locations', 'Locations']];
  view(`
    <div class="spread">
      <div>
        <a class="small" href="#/${job.active ? 'jobs' : 'archive'}">&larr; ${job.active ? 'Jobs' : 'Archive'}</a>
        <h1 style="text-transform:uppercase;margin-top:4px">${esc(jn(job.name))} ${job.active ? '' : '<span class="chip">Finished</span>'}</h1>
        <div class="muted small">${[job.gc, job.address].filter(Boolean).map(esc).join(', ')}</div>
      </div>
      <div class="row">
        <button class="btn" onclick="A.editJob('${id}')">Edit job</button>
        ${job.active ? `<button class="btn" onclick="A.finishJob('${id}')">Mark finished</button>` : `<button class="btn" onclick="A.reopenJob('${id}')">Reopen job</button>`}
        <button class="btn" onclick="window.print()">Print</button>
      </div>
    </div>

    <div class="card mt">
      <div class="fld" style="max-width:560px">
        <label>How far along is the job?</label>
        <div class="row" style="flex-wrap:nowrap">
          <input type="range" id="pc-range" min="0" max="100" step="5" value="${pc}" style="flex:1"
            oninput="$('#pc-num').value=this.value" onchange="A.setPct('${id}',this.value)">
          <input type="number" id="pc-num" min="0" max="100" value="${pc}" style="width:84px" onchange="A.setPct('${id}',this.value)"><span>%</span>
        </div>
        <div class="help">${pe.est ? `<b>Estimated ${pc}% from spend vs budget.</b> <a href="#" onclick="event.preventDefault();A.setPct('${id}',${pc})">Use this number</a>, or drag to set your own. ` : ''}${lastProg ? 'Last updated ' + dt(lastProg.as_of) + '. ' : ''}Drag or type a number. Every change is saved with today's date so you can see progress over time.</div>
      </div>
      <div class="tiles" style="margin:16px 0 0">
        <div class="tile"><div class="l">Contract</div>
          <input type="number" class="num" style="font-size:22px;font-weight:800;padding:4px 8px;margin-top:3px" value="${contract || ''}" placeholder="Enter amount"
            data-t="jobs" data-id="${id}" data-c="contract_value" data-k="num" data-after="jobEdited" onchange="A.field(this)"></div>
        ${moneyTile('Cost so far', money(m.total_cost), `Materials ${money(m.material_cost)}, labor ${money(m.labor_cost)}`)}
        ${(() => { const e = estOf(m); const t = (x, lab, extra) => moneyTile(lab, money(x.spent), x.has ? `${Math.round(x.pct)}% of ${money(x.est)} estimate${x.mode === 'lump' ? ' (lump sum)' : ''}${extra || ''}` : 'no estimate yet, add it on the Estimate tab', x.over ? 'bad' : '');
          return t(e.mat, 'Material cost', e.mat.open ? `, ${money(e.mat.open)} more on open POs` : '') + t(e.lab, 'Labor cost'); })()}
        ${contract ? moneyTile('Contract minus cost', money(m.profit_to_date), 'before the rest of the work', n0(m.profit_to_date) < 0 ? 'bad' : '') : ''}
        ${moneyTile('Projected profit',
          m.projected_profit != null ? money(m.projected_profit) : '<span class="faint" style="font-size:18px">not yet</span>',
          m.projected_profit != null ? (margin != null ? Math.round(margin) + '% margin if costs keep pace' : 'needs a contract amount') : 'needs a contract and 10% or more complete',
          m.projected_profit != null ? (m.projected_profit < 0 ? 'bad' : 'good') : '')}
        ${moneyTile('Open POs', money(m.open_po_total), m.open_po_count + ' in the last 120 days, ballpark only')}
        ${moneyTile('Cost per board', m.cost_per_board ? money(m.cost_per_board, 2) : '', qty(Math.round(n0(m.boards_used))) + ' boards billed' + (n0(m.open_po_boards) ? ', ' + qty(Math.round(n0(m.open_po_boards))) + ' more on open POs' : '') + (n0(m.target_price_per_board) ? ', target ' + money(m.target_price_per_board, 2) : ''))}
      </div>
    </div>

    <div class="tabs">${tabs.map(([t, l]) => `<a href="#/job/${id}/${t}" class="${tab === t ? 'on' : ''}">${l}</a>`).join('')}</div>
    <div id="tab"><div class="empty">Loading...</div></div>`);
  const fn = { overview: tabOverview, spend: tabSpend, purchases: tabPurchases, materials: tabMaterials, orders: tabOrders, budget: tabBudget, locations: tabLocations }[tab] || tabOverview;
  try { await fn(id, sub); } catch (e) { fail(e); }
}
ROUTES.job = renderJob;

A.jobEdited = async (el) => { el.blur(); S.cache = {}; await loadCore(); await rerender(); };

A.setPct = async (id, v) => {
  v = Math.max(0, Math.min(100, Number(v) || 0));
  try {
    await save('jobs', id, { pct_complete: v });
    const ex = await run(sb.from('job_progress').select('id').eq('job_id', id).eq('as_of', today()).limit(1));
    if (ex.length) await save('job_progress', ex[0].id, { pct_complete: v });
    else await insert('job_progress', { job_id: id, as_of: today(), pct_complete: v });
    S.cache = {}; await loadCore(); document.activeElement && document.activeElement.blur(); await rerender();
    toast('Progress saved at ' + v + '%');
  } catch (e) { fail(e); }
};

/* ---------- job actions ---------- */
A.newJob = () => {
  openModal('New job', `
    <div class="fields">
      ${fld('Job name', '<input id="nj-name" placeholder="Example: Pine Island">')}
      ${fld('General contractor', '<input id="nj-gc">')}
      ${fld('Address', '<input id="nj-addr">')}
      ${fld('Contract amount', '<input id="nj-contract" type="number">')}
      ${fld('Start date', `<input id="nj-start" type="date" value="${today()}">`)}
    </div>
    <div class="help">You can change any of this later.</div>`, {
    saveLabel: 'Create job',
    onSave: async () => {
      const name = $('#nj-name').value.trim().toUpperCase();
      if (!name) { toast('Type a job name', true); return false; }
      const j = await insert('jobs', { name, gc: $('#nj-gc').value.trim() || null, address: $('#nj-addr').value.trim() || null,
        contract_value: parseNum($('#nj-contract').value), start_date: $('#nj-start').value || null, active: true, pct_complete: 0 });
      await audit('create', 'jobs', j.id, { name });
      await loadCore(); location.hash = '#/job/' + j.id; toast('Job created');
    }
  });
};

A.editJob = (id) => {
  const j = jobOf(id);
  openModal('Edit job', `
    <div class="fields">
      ${fld('Job name', `<input id="ej-name" value="${esc(j.name)}">`)}
      ${fld('General contractor', `<input id="ej-gc" value="${esc(j.gc || '')}">`)}
      ${fld('Address', `<input id="ej-addr" value="${esc(j.address || '')}">`)}
      ${fld('Contract amount', `<input id="ej-contract" type="number" value="${j.contract_value ?? ''}">`)}
      ${fld('Start date', `<input id="ej-start" type="date" value="${j.start_date || ''}">`)}
      ${fld('Finished date', `<input id="ej-done" type="date" value="${j.completed_on || ''}">`)}
      ${fld('Target price per board', `<input id="ej-ppb" type="number" value="${j.target_price_per_board ?? ''}">`)}
    </div>
    ${fld('Other names used on POs and bills', `<input id="ej-alias" value="${esc((j.aliases || []).join(', '))}">`, 'Separate with commas. New POs and bills using these names land on this job automatically.')}
    <div class="fld mt">${'<label>Notes</label>'}<textarea id="ej-notes" rows="3">${esc(j.notes || '')}</textarea></div>`, {
    foot: `<button class="btn danger" style="margin-right:auto" onclick="A.deleteJob('${id}')">Delete job</button>`,
    onSave: async () => {
      const name = $('#ej-name').value.trim().toUpperCase();
      if (!name) { toast('The job needs a name', true); return false; }
      await save('jobs', id, {
        name, gc: $('#ej-gc').value.trim() || null, address: $('#ej-addr').value.trim() || null,
        contract_value: parseNum($('#ej-contract').value), start_date: $('#ej-start').value || null,
        completed_on: $('#ej-done').value || null, target_price_per_board: parseNum($('#ej-ppb').value),
        aliases: $('#ej-alias').value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean),
        notes: $('#ej-notes').value.trim() || null,
      });
      await audit('update', 'jobs', id, {}); S.cache = {}; await loadCore(); await rerender(); toast('Saved');
    }
  });
};

A.finishJob = (id) => {
  ask('Mark this job finished?', 'It moves to the Archive and stays there for reference. Percent complete is set to 100. You can reopen it any time.', 'Mark finished', async () => {
    await save('jobs', id, { active: false, completed_on: today(), pct_complete: 100 });
    const ex = await run(sb.from('job_progress').select('id').eq('job_id', id).eq('as_of', today()).limit(1));
    if (ex.length) await save('job_progress', ex[0].id, { pct_complete: 100 }); else await insert('job_progress', { job_id: id, as_of: today(), pct_complete: 100 });
    await audit('finish', 'jobs', id, {}); S.cache = {}; await loadCore(); location.hash = '#/archive'; toast('Moved to the archive');
  });
};
A.reopenJob = async (id) => {
  try { await save('jobs', id, { active: true, completed_on: null }); await audit('reopen', 'jobs', id, {}); S.cache = {}; await loadCore(); location.hash = '#/job/' + id; toast('Job reopened'); } catch (e) { fail(e); }
};
A.deleteJob = (id) => {
  const m = moneyOf(id);
  if (n0(m?.total_cost) > 0 || n0(m?.ordered_total) > 0) { closeModal(); toast('This job has POs or bills. Mark it finished instead of deleting it.', true); return; }
  closeModal();
  ask('Delete this job?', 'This removes the job, its budget, buildings and units. It cannot be undone.', 'Delete job', async () => {
    await remove('jobs', id); await audit('delete', 'jobs', id, { name: m?.name }); await loadCore(); location.hash = '#/jobs'; toast('Job deleted');
  }, true);
};
