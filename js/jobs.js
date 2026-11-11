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
  if (n0(m.unmapped) > 0) chips.push(['warn', m.unmapped + ' lines need a material match']);
  if (m.active && m.last_dt) {
    const d = Math.round((Date.now() - new Date(m.last_dt + 'T12:00:00')) / 86400e3);
    if (d > 21) chips.push(['warn', 'No bills in ' + d + ' days']);
  }
  return { chips, margin };
}

function jobCard(m) {
  const { chips, margin } = jobFlags(m);
  const pc = n0(m.pct_complete);
  const pp = m.projected_profit;
  return `<a class="job" href="#/job/${m.job_id}">
    <div class="spread" style="align-items:flex-start">
      <div><div class="name">${esc(jn(m.name))}</div><div class="gc">${esc(m.gc || m.address || '')}</div></div>
      <div class="r"><div style="font-size:24px;font-weight:800;line-height:1">${pc}%</div><div class="tiny muted">complete</div></div>
    </div>
    <div class="bar" style="margin-top:12px"><i style="width:${Math.min(100, pc)}%"></i></div>
    <div class="kv">
      <div><div class="l">Cost so far</div><div class="v">${money(m.total_cost)}</div></div>
      <div><div class="l">Contract</div><div class="v">${n0(m.contract_value) ? money(m.contract_value) : '<span class="faint">not set</span>'}</div></div>
      <div><div class="l">Projected profit</div><div class="v ${pp == null ? '' : (pp < 0 ? 'bad' : 'good')}">${pp == null ? '<span class="faint">not yet</span>' : money(pp) + ' (' + Math.round(margin) + '%)'}</div></div>
      <div><div class="l">Open POs</div><div class="v">${money(m.open_po_total)}</div></div>
    </div>
    <div class="chips">${chips.map(([k, t]) => `<span class="chip ${k}">${esc(t)}</span>`).join('')}</div>
    <div class="tiny muted" style="margin-top:10px">Boards used ${qty(m.boards_used)}${m.last_dt ? '. Last bill ' + dt(m.last_dt) : ''}</div>
  </a>`;
}

async function renderJobs() {
  const active = S.money.filter(m => m.active).sort((a, b) => (b.last_dt || '').localeCompare(a.last_dt || ''));
  const finished = S.money.filter(m => !m.active && (n0(m.total_cost) > 0 || n0(m.contract_value) > 0)).length;
  const sum = (k) => active.reduce((a, m) => a + n0(m[k]), 0);
  const attn = S.inbox.pos + S.inbox.bills + S.inbox.mats;
  view(`
    <div class="spread mb"><h1>Jobs</h1><button class="btn primary" onclick="A.newJob()">New job</button></div>
    <div class="tiles">
      <div class="tile"><div class="l">Active jobs</div><div class="v">${active.length}</div><div class="s">${finished} finished, see Archive</div></div>
      <div class="tile"><div class="l">Cost so far</div><div class="v">${money(sum('total_cost'))}</div><div class="s">materials and labor, active jobs</div></div>
      <div class="tile"><div class="l">Open POs</div><div class="v">${money(sum('open_po_total'))}</div><div class="s">${sum('open_po_count')} ordered, not billed yet</div></div>
      <a class="tile ${attn ? 'alert' : ''}" href="#/inbox"><div class="l">Needs a look</div><div class="v">${attn}</div><div class="s">${attn ? 'POs, bills and materials to sort out' : 'Nothing waiting'}</div></a>
    </div>
    <div class="jobs">${active.map(jobCard).join('') || '<div class="empty">No active jobs yet. Tap New job to start one.</div>'}</div>`);
}
ROUTES.jobs = renderJobs;

/* ---------- one job's data, fetched once and cached until something changes ---------- */
async function jobData(id) {
  if (S.cache[id]) return S.cache[id];
  const [pm, mu, bud, prog, open] = await Promise.all([
    run(sb.from('v_job_phase_month').select('*').eq('job_id', id).order('month')),
    run(sb.from('v_job_material_use').select('*').eq('job_id', id)),
    run(sb.from('budgets').select('*').eq('job_id', id)),
    run(sb.from('job_progress').select('*').eq('job_id', id).order('as_of')),
    run(sb.from('v_open_pos').select('*').eq('job_id', id).order('po_date')),
  ]);
  return (S.cache[id] = { pm, mu, bud, prog, open });
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
  const pc = n0(m.pct_complete);
  const lastProg = d.prog.length ? d.prog[d.prog.length - 1] : null;
  const contract = n0(m.contract_value);
  const margin = (m.projected_profit != null && contract > 0) ? m.projected_profit / contract * 100 : null;
  const tabs = [['overview', 'Overview'], ['materials', 'Materials used'], ['orders', 'Orders and bills'], ['budget', 'Budget'], ['locations', 'Locations']];
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
        <div class="help">${lastProg ? 'Last updated ' + dt(lastProg.as_of) + '. ' : ''}Drag or type a number. Every change is saved with today's date so you can see progress over time.</div>
      </div>
      <div class="tiles" style="margin:16px 0 0">
        <div class="tile"><div class="l">Contract</div>
          <input type="number" class="num" style="font-size:22px;font-weight:800;padding:4px 8px;margin-top:3px" value="${contract || ''}" placeholder="Enter amount"
            data-t="jobs" data-id="${id}" data-c="contract_value" data-k="num" data-after="jobEdited" onchange="A.field(this)"></div>
        ${moneyTile('Cost so far', money(m.total_cost), `Materials ${money(m.material_cost)}, labor ${money(m.labor_cost)}`)}
        ${contract ? moneyTile('Contract minus cost', money(m.profit_to_date), 'before the rest of the work', n0(m.profit_to_date) < 0 ? 'bad' : '') : ''}
        ${moneyTile('Projected profit',
          m.projected_profit != null ? money(m.projected_profit) : '<span class="faint" style="font-size:18px">not yet</span>',
          m.projected_profit != null ? (margin != null ? Math.round(margin) + '% margin if costs keep pace' : 'needs a contract amount') : 'needs a contract and 10% or more complete',
          m.projected_profit != null ? (m.projected_profit < 0 ? 'bad' : 'good') : '')}
        ${moneyTile('Open POs', money(m.open_po_total), m.open_po_count + ' ordered, not billed yet')}
        ${moneyTile('Boards used', qty(m.boards_used), m.cost_per_board ? money(m.cost_per_board, 1) + ' per board all in' : '')}
      </div>
    </div>

    <div class="tabs">${tabs.map(([t, l]) => `<a href="#/job/${id}/${t}" class="${tab === t ? 'on' : ''}">${l}</a>`).join('')}</div>
    <div id="tab"><div class="empty">Loading...</div></div>`);
  const fn = { overview: tabOverview, materials: tabMaterials, orders: tabOrders, budget: tabBudget, locations: tabLocations }[tab] || tabOverview;
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
