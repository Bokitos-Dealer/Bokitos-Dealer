/* Shop admin: list orders and quote requests, change their status, export CSV. */
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const eur = (n) => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(n || 0);
  const date = (iso) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  const label = (s) => s.replace(/_/g, ' ');
  const PAID = ['paid', 'scheduled', 'shipped', 'installed', 'completed'];

  let password = '';
  try { password = sessionStorage.getItem('adminPw') || ''; } catch { /* ignore */ }
  let data = null;
  let tab = 'orders';
  const open = new Set();

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 2200);
  }

  async function api(path, body) {
    const res = await fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: 'Bearer ' + password, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(json.error || 'HTTP ' + res.status), { status: res.status });
    return json;
  }

  async function load() {
    try {
      data = await api('/api/admin/data');
      try { sessionStorage.setItem('adminPw', password); } catch { /* ignore */ }
      $('#loginForm').hidden = true;
      $('#app').hidden = false;
      $('#refreshBtn').hidden = false;
      $('#logoutBtn').hidden = false;
      fillStatusFilter();
      render();
    } catch (e) {
      $('#loginForm').hidden = false;
      $('#app').hidden = true;
      $('#loginStatus').textContent = password ? e.message : '';
      if (e.status === 401) try { sessionStorage.removeItem('adminPw'); } catch { /* ignore */ }
    }
  }

  function fillStatusFilter() {
    const sel = $('#statusFilter');
    const current = sel.value;
    sel.innerHTML = '<option value="">All statuses</option>' + data.statuses[tab].map((s) => `<option value="${s}">${label(s)}</option>`).join('');
    sel.value = data.statuses[tab].includes(current) ? current : '';
  }

  function filtered() {
    const q = $('#adminSearch').value.trim().toLowerCase();
    const st = $('#statusFilter').value;
    return data[tab]
      .filter((x) => !st || x.status === st)
      .filter((x) => !q || JSON.stringify(x).toLowerCase().includes(q))
      .slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  function renderStats() {
    const o = data.orders;
    const paid = o.filter((x) => PAID.includes(x.status));
    const invoiced = o.filter((x) => x.payment === 'invoice' && x.status !== 'cancelled');
    $('#stats').innerHTML = [
      [o.length, 'Orders'],
      [eur(paid.reduce((s, x) => s + x.totals.total, 0)), 'Revenue paid'],
      [o.filter((x) => x.status === 'awaiting_payment').length, 'Awaiting payment'],
      [eur(invoiced.filter((x) => !PAID.includes(x.status)).reduce((s, x) => s + x.totals.total, 0)), 'To invoice after installation'],
      [data.quotes.filter((x) => x.status === 'new').length, 'New quote requests'],
    ].map(([v, l]) => `<div class="stat"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('');
  }

  function statusSelect(item) {
    return `<select data-status="${esc(item.id)}">${data.statuses[tab].map((s) => `<option value="${s}"${s === item.status ? ' selected' : ''}>${label(s)}</option>`).join('')}</select>`;
  }

  function orderRows(o) {
    const c = o.customer;
    const main = `<tr class="main" data-id="${esc(o.id)}">
      <td><b>${esc(o.id)}</b><small>${date(o.createdAt)}</small></td>
      <td>${esc(c.name)}<small>${esc(c.email)}</small></td>
      <td>${esc(c.city)}, ${esc(c.country)}</td>
      <td>${o.items.map((i) => `${i.qty} × ${esc(i.name)}`).join('<br>')}</td>
      <td><b>${eur(o.totals.total)}</b><small>${esc(o.payment)}</small></td>
      <td>${statusSelect(o)}</td>
    </tr>`;
    if (!open.has(o.id)) return main;
    return main + `<tr class="detail"><td colspan="6"><div class="detail-grid">
      <div><h4>Customer</h4><p>${esc(c.name)}<br>${esc(c.email)}<br>${esc(c.phone)}<br>${esc(c.address)}<br>${esc(c.zip)} ${esc(c.city)}, ${esc(c.country)}</p></div>
      <div><h4>Items</h4><ul>${o.items.map((i) => `<li>${i.qty} × ${esc(i.name)} – ${eur(i.unit * i.qty)}${i.install ? ` + installation ${eur(i.installUnit * i.qty)}` : ''}</li>`).join('')}</ul>
        <p>Shipping ${eur(o.totals.shipping)} · Total ${eur(o.totals.total)}${o.totals.vatRate != null ? ` · incl. ${o.totals.vatRate}% VAT ${eur(o.totals.vat)}` : ''}</p></div>
      <div><h4>Installation</h4><p>Preferred date: ${esc(c.preferredDate || '–')}<br>Notes: ${esc(c.notes || '–')}<br>Language: ${esc(o.lang)}</p>
        ${o.history && o.history.length ? `<h4 style="margin-top:10px">History</h4><ul>${o.history.map((h) => `<li>${date(h.at)}: ${label(h.from)} → ${label(h.to)} (${esc(h.by)})</li>`).join('')}</ul>` : ''}</div>
    </div></td></tr>`;
  }

  function quoteRows(q) {
    const main = `<tr class="main" data-id="${esc(q.id)}">
      <td><b>${esc(q.id)}</b><small>${date(q.createdAt)}</small></td>
      <td>${esc(q.name)}<small><a href="mailto:${esc(q.email)}">${esc(q.email)}</a></small></td>
      <td>${esc(q.country)}</td>
      <td>${q.rooms}</td>
      <td>${esc((q.message || '').slice(0, 80))}${(q.message || '').length > 80 ? '…' : ''}</td>
      <td>${statusSelect(q)}</td>
    </tr>`;
    if (!open.has(q.id)) return main;
    return main + `<tr class="detail"><td colspan="6"><p style="white-space:pre-wrap;margin:0">${esc(q.message || '–')}</p></td></tr>`;
  }

  function render() {
    renderStats();
    const list = filtered();
    const head = tab === 'orders'
      ? '<tr><th>Order</th><th>Customer</th><th>Location</th><th>Items</th><th>Total</th><th>Status</th></tr>'
      : '<tr><th>Request</th><th>Name</th><th>Country</th><th>Rooms</th><th>Message</th><th>Status</th></tr>';
    const rows = list.map(tab === 'orders' ? orderRows : quoteRows).join('');
    $('#table').innerHTML = `<thead>${head}</thead><tbody>${rows || `<tr><td colspan="6" class="empty-row">Nothing here yet.</td></tr>`}</tbody>`;
  }

  function exportCsv() {
    const cell = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    let rows;
    if (tab === 'orders') {
      rows = [['id', 'created', 'status', 'payment', 'name', 'email', 'phone', 'address', 'zip', 'city', 'country', 'items', 'subtotal', 'installation', 'shipping', 'total', 'vat_rate', 'vat', 'preferred_date', 'notes']]
        .concat(filtered().map((o) => [o.id, o.createdAt, o.status, o.payment, o.customer.name, o.customer.email, o.customer.phone, o.customer.address, o.customer.zip, o.customer.city, o.customer.country,
          o.items.map((i) => `${i.qty}x ${i.name}${i.install ? ' +install' : ''}`).join('; '), o.totals.subtotal, o.totals.install, o.totals.shipping, o.totals.total, o.totals.vatRate, o.totals.vat, o.customer.preferredDate, o.customer.notes]));
    } else {
      rows = [['id', 'created', 'status', 'name', 'email', 'country', 'rooms', 'message']]
        .concat(filtered().map((q) => [q.id, q.createdAt, q.status, q.name, q.email, q.country, q.rooms, q.message]));
    }
    const blob = new Blob(['﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `bokitos-${tab}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  $('#loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    password = $('#password').value;
    load();
  });
  $('#logoutBtn').addEventListener('click', () => {
    password = '';
    try { sessionStorage.removeItem('adminPw'); } catch { /* ignore */ }
    location.reload();
  });
  $('#refreshBtn').addEventListener('click', () => load().then(() => toast('Updated')));
  $('#csvBtn').addEventListener('click', exportCsv);
  $('#adminSearch').addEventListener('input', render);
  $('#statusFilter').addEventListener('change', render);
  document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
    tab = b.dataset.tab;
    document.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('active', x === b));
    fillStatusFilter();
    render();
  }));
  $('#table').addEventListener('click', (e) => {
    if (e.target.closest('select, a')) return;
    const row = e.target.closest('tr.main');
    if (!row) return;
    open.has(row.dataset.id) ? open.delete(row.dataset.id) : open.add(row.dataset.id);
    render();
  });
  $('#table').addEventListener('change', async (e) => {
    const sel = e.target.closest('[data-status]');
    if (!sel) return;
    try {
      const updated = await api(`/api/admin/${tab}/${encodeURIComponent(sel.dataset.status)}`, { status: sel.value });
      const list = data[tab];
      list[list.findIndex((x) => x.id === updated.id)] = updated;
      render();
      toast(`${updated.id}: ${label(updated.status)}`);
    } catch (err) {
      toast('Update failed: ' + err.message);
      render();
    }
  });

  if (password) load();
})();
