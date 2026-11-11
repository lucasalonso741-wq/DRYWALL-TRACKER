'use strict';
/* =====================================================================
   Drawers for opening and editing a PO or a bill, with line items
   Every field saves the moment you leave it, and says so at the top.
   ===================================================================== */

const vendorOptions = () => S.vendors.map(v => [v.id, v.name]);

function lineTable(kind, lines) {
  const t = kind === 'po' ? 'po_line_items' : 'bill_line_items';
  return `<div class="scroll"><table><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">Total</th><th>Material</th><th></th></tr></thead><tbody>
    ${lines.map(l => `<tr>
      <td><input value="${esc(l.raw_description || '')}" data-t="${t}" data-id="${l.id}" data-c="raw_description" data-k="text0" onchange="A.field(this)"></td>
      <td class="r"><input type="number" step="any" style="width:80px" value="${l.qty ?? ''}" data-t="${t}" data-id="${l.id}" data-c="qty" data-k="num" onchange="A.field(this)"></td>
      <td class="r"><input type="number" step="any" style="width:90px" value="${l.unit_cost ?? ''}" data-t="${t}" data-id="${l.id}" data-c="unit_cost" data-k="num" onchange="A.field(this)"></td>
      <td class="r"><input type="number" step="any" style="width:100px" value="${l.line_total ?? ''}" data-t="${t}" data-id="${l.id}" data-c="line_total" data-k="num" data-after="lineSaved" onchange="A.field(this)"></td>
      <td>${matSelect(l.material_id, `data-t="${t}" data-id="${l.id}" data-c="material_id" data-k="text0" data-after="matSaved" onchange="A.field(this)"`, 'Not matched')}</td>
      <td><button class="btn sm danger" onclick="A.delLine('${kind}','${l.id}')">&times;</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">No line items.</td></tr>'}
  </tbody></table></div>`;
}
A.lineSaved = () => {};
A.matSaved = () => { S.cache = {}; };

async function drawerPO(id) {
  const [po, lines] = await Promise.all([
    run(sb.from('purchase_orders').select('*, vendors(name)').eq('id', id).single()),
    run(sb.from('po_line_items').select('*').eq('po_id', id).order('created_at')),
  ]);
  const sum = lines.reduce((a, l) => a + n0(l.line_total), 0);
  const d = (c, k) => `data-t="purchase_orders" data-id="${id}" data-c="${c}" ${k ? `data-k="${k}"` : ''} onchange="A.field(this)"`;
  openDrawer('PO ' + po.po_number, `
    <div class="fields">
      ${fld('PO number', `<input value="${esc(po.po_number)}" ${d('po_number', 'text0')}>`)}
      ${fld('Date', `<input type="date" value="${po.po_date || ''}" ${d('po_date', 'text0')}>`)}
      ${fld('Vendor', selectHtml(vendorOptions(), po.vendor_id, d('vendor_id', 'text0'), 'Pick vendor'))}
      ${fld('Job', selectHtml(jobOptions(false), po.job_id, d('job_id', 'text0'), 'No job'))}
      ${fld('Total', `<input type="number" step="any" value="${po.total ?? ''}" ${d('total', 'num')}>`, lines.length ? `Lines add up to ${money(sum, 2)}` : '')}
      ${fld('Status in QuickBooks', `<input value="${esc(po.qb_status || '')}" ${d('qb_status', 'text0')}>`)}
    </div>
    ${fld('Memo', `<input value="${esc(po.memo || '')}" ${d('memo', 'text0')}>`)}
    <label class="row mt small"><input type="checkbox" ${po.archived ? 'checked' : ''} ${d('archived', 'bool')}> Archived (hidden from open POs and the inbox)</label>
    <h3 class="mt2">Line items</h3>${lineTable('po', lines)}
    <div class="row mt"><button class="btn sm" onclick="A.addLine('po','${id}')">Add a line</button>
      ${lines.length && Math.abs(sum - n0(po.total)) > 0.01 ? `<button class="btn sm" onclick="A.useLineTotal('purchase_orders','${id}',${sum})">Set total to ${money(sum, 2)}</button>` : ''}</div>
    <div class="sticky-actions"><button class="btn danger" onclick="A.delDoc('po','${id}','${esc(po.po_number)}')">Delete this PO</button></div>`);
}
async function drawerBill(id) {
  const [b, lines] = await Promise.all([
    run(sb.from('bills').select('*, vendors(name)').eq('id', id).single()),
    run(sb.from('bill_line_items').select('*').eq('bill_id', id).order('created_at')),
  ]);
  const sum = lines.reduce((a, l) => a + n0(l.line_total), 0);
  const d = (c, k) => `data-t="bills" data-id="${id}" data-c="${c}" ${k ? `data-k="${k}"` : ''} onchange="A.field(this)"`;
  openDrawer('Bill ' + (b.invoice_number || ''), `
    <div class="fields">
      ${fld('Invoice number', `<input value="${esc(b.invoice_number || '')}" ${d('invoice_number', 'text0')}>`)}
      ${fld('Date', `<input type="date" value="${b.bill_date || ''}" ${d('bill_date', 'text0')}>`)}
      ${fld('Vendor', selectHtml(vendorOptions(), b.vendor_id, d('vendor_id', 'text0'), 'Pick vendor'))}
      ${fld('Job', selectHtml(jobOptions(false), b.job_id, d('job_id', 'text0'), 'No job'))}
      ${fld('Total', `<input type="number" step="any" value="${b.total ?? ''}" ${d('total', 'num')}>`, lines.length ? `Lines add up to ${money(sum, 2)}` : '')}
      ${fld('Balance still owed', `<input type="number" step="any" value="${b.balance ?? ''}" ${d('balance', 'num')}>`)}
      ${fld('Payment', selectHtml([['unpaid', 'Unpaid'], ['partial', 'Part paid'], ['paid', 'Paid']], b.payment_status, d('payment_status', 'text0')))}
    </div>
    ${fld('Memo', `<input value="${esc(b.memo || '')}" ${d('memo', 'text0')}>`)}
    <div class="help mt">${b.source === 'qb' ? 'This bill came from QuickBooks. If QuickBooks changes it, your edits to job and lines are kept; amounts and payment status follow QuickBooks.' : 'Added by hand or from history.'}</div>
    <h3 class="mt2">Line items</h3>${lineTable('bill', lines)}
    <div class="row mt"><button class="btn sm" onclick="A.addLine('bill','${id}')">Add a line</button>
      ${lines.length && Math.abs(sum - n0(b.total)) > 0.01 ? `<button class="btn sm" onclick="A.useLineTotal('bills','${id}',${sum})">Set total to ${money(sum, 2)}</button>` : ''}</div>
    <div class="sticky-actions"><button class="btn danger" onclick="A.delDoc('bill','${id}','${esc(b.invoice_number || '')}')">Delete this bill</button></div>`);
}
A.openPO = (id) => drawerPO(id).catch(fail);
A.openBill = (id) => drawerBill(id).catch(fail);
A.useLineTotal = async (t, id, v) => { try { await save(t, id, { total: Math.round(v * 100) / 100 }); S.cache = {}; (t === 'bills' ? drawerBill : drawerPO)(id); } catch (e) { fail(e); } };
A.addLine = async (kind, id) => {
  try {
    await insert(kind === 'po' ? 'po_line_items' : 'bill_line_items', kind === 'po' ? { po_id: id, raw_description: 'New item', qty: 1 } : { bill_id: id, raw_description: 'New item', qty: 1 });
    S.cache = {}; (kind === 'po' ? drawerPO : drawerBill)(id);
  } catch (e) { fail(e); }
};
A.delLine = async (kind, lid) => {
  try {
    const t = kind === 'po' ? 'po_line_items' : 'bill_line_items';
    const row = await run(sb.from(t).select(kind === 'po' ? 'po_id' : 'bill_id').eq('id', lid).single());
    await remove(t, lid); S.cache = {}; (kind === 'po' ? drawerPO : drawerBill)(row.po_id || row.bill_id);
  } catch (e) { fail(e); }
};
A.delDoc = (kind, id, label) => ask('Delete ' + (kind === 'po' ? 'PO ' : 'bill ') + esc(label) + '?', 'This removes it and its line items for good. QuickBooks is not changed, so a QuickBooks record may come back on the next sync. For POs you only want hidden, use Archived instead.', 'Delete', async () => {
  const t = kind === 'po' ? 'purchase_orders' : 'bills', lt = kind === 'po' ? 'po_line_items' : 'bill_line_items', col = kind === 'po' ? 'po_id' : 'bill_id';
  await sb.from(lt).delete().eq(col, id); await remove(t, id); await audit('delete', t, id, { label });
  closeDrawer(true); S.cache = {}; await loadCore(); await rerender(); toast('Deleted');
}, true);

A.newPO = (jobId) => openModal('Add a PO', `
  <div class="fields">
    ${fld('PO number', '<input id="np-num">')}
    ${fld('Date', `<input id="np-date" type="date" value="${today()}">`)}
    ${fld('Vendor', selectHtml(vendorOptions(), '', 'id="np-ven"', 'Pick vendor'))}
    ${fld('Job', selectHtml(jobOptions(true), jobId, 'id="np-job"', 'No job yet'))}
    ${fld('Total', '<input id="np-tot" type="number" step="any">')}
  </div>${fld('Memo', '<input id="np-memo">')}`, {
  saveLabel: 'Add and open',
  onSave: async () => {
    const num = $('#np-num').value.trim(); if (!num) { toast('Type a PO number', true); return false; }
    const po = await insert('purchase_orders', { po_number: num, po_date: $('#np-date').value || today(), vendor_id: $('#np-ven').value || null, job_id: $('#np-job').value || null,
      total: parseNum($('#np-tot').value) || 0, memo: $('#np-memo').value.trim() || null, source: 'manual', qb_status: 'Open' });
    await audit('create', 'purchase_orders', po.id, { po_number: num });
    S.cache = {}; await loadCore(); await rerender(); setTimeout(() => A.openPO(po.id), 50);
  }
});
