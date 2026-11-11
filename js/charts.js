'use strict';
/* Small chart helpers: plain HTML and SVG, no libraries */
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const monthYear = (d) => { if (!d) return ''; const s = String(d).slice(0, 7); return MON[Number(s.slice(5, 7)) - 1] + ' ' + s.slice(0, 4); };

/* horizontal bars: rows = [{label, value, color, text, href}] */
function hbars(rows, opts = {}) {
  const max = Math.max(1, ...rows.map(r => Math.abs(r.value)));
  return `<div class="hbars">${rows.map(r => {
    const w = Math.max(1, Math.abs(r.value) / max * 100);
    const col = r.color || (r.value < 0 ? 'var(--bad)' : 'var(--blue)');
    return `<${r.href ? 'a href="' + r.href + '"' : 'div'} class="hb"><span class="hl" title="${esc(r.label)}">${esc(r.label)}</span><span class="ht"><i style="width:${w}%;background:${col}"></i></span><span class="hv ${r.value < 0 ? 'bad' : ''}">${r.text}</span></${r.href ? 'a' : 'div'}>`;
  }).join('') || '<div class="empty">Nothing to chart yet.</div>'}</div>`;
}

/* column chart: data = [{label, value}] */
function colChart(data, fmt) {
  if (!data.length) return '<div class="empty">Nothing to chart yet.</div>';
  const W = 600, H = 190, pad = 24, bw = (W - pad * 2) / data.length;
  const max = Math.max(1, ...data.map(d => d.value));
  return `<svg viewBox="0 0 ${W} ${H}" class="col" role="img" preserveAspectRatio="xMidYMid meet">
    ${[0.25, 0.5, 0.75, 1].map(f => `<line x1="${pad}" x2="${W - pad}" y1="${H - 26 - (H - 56) * f}" y2="${H - 26 - (H - 56) * f}" stroke="var(--line)" stroke-width="1"/>`).join('')}
    ${data.map((d, i) => {
      const h = (H - 56) * d.value / max, x = pad + i * bw + bw * 0.16, y = H - 26 - h;
      return `<rect x="${x}" y="${y}" width="${bw * 0.68}" height="${h}" rx="3" fill="var(--hot)"><title>${esc(d.label)} ${fmt(d.value)}</title></rect>
        <text x="${x + bw * 0.34}" y="${H - 9}" text-anchor="middle" fill="var(--dim)" font-size="11">${esc(d.label)}</text>
        ${i % Math.ceil(data.length / 6) === 0 || i === data.length - 1 ? `<text x="${x + bw * 0.34}" y="${y - 5}" text-anchor="middle" fill="var(--ink)" font-size="11" font-weight="700">${fmt(d.value)}</text>` : ''}`;
    }).join('')}</svg>`;
}

/* donut: parts = [{label, value, color}] */
function donut(parts, centerTop, centerSub) {
  const tot = parts.reduce((a, p) => a + Math.max(0, p.value), 0);
  if (!tot) return '<div class="empty">Nothing to chart yet.</div>';
  let acc = 0;
  const stops = parts.map(p => { const a = acc / tot * 100; acc += Math.max(0, p.value); return `${p.color} ${a}% ${acc / tot * 100}%`; }).join(',');
  return `<div class="donutwrap"><div class="donut" style="background:conic-gradient(${stops})"><div><b>${centerTop}</b><small>${centerSub}</small></div></div>
    <div class="legend col">${parts.map(p => `<span><span class="sw" style="background:${p.color}"></span>${esc(p.label)} <b>${Math.round(p.value / tot * 100)}%</b></span>`).join('')}</div></div>`;
}
