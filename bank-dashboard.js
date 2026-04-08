/* ═══════════════════════════════════════════
   BloodLink TN — Bank Dashboard v4.0
   Real API + Socket.io + Sound Notifications
   All functions connected to /api/* endpoints
═══════════════════════════════════════════ */

/* ── State ── */
let currentStock  = {};
let originalStock = {};
let allRequests   = [];
let currentFilter = 'all';
let bankOpen      = true;
let currentBankId = null;
const GROUPS = ['A+','A-','B+','B-','O+','O-','AB+','AB-'];

/* ── Clock ── */
function updateClock() {
  const el = document.getElementById('topbarTime');
  if (el) el.textContent = new Date().toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', hour12:true });
}
updateClock();
setInterval(updateClock, 60000);

/* ── Sidebar ── */
const sidebar        = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
document.getElementById('menuBtn').addEventListener('click', () => {
  sidebar.classList.add('open'); sidebarOverlay.classList.add('open');
});
document.getElementById('sidebarClose').addEventListener('click', closeSidebar);
function closeSidebar() { sidebar.classList.remove('open'); sidebarOverlay.classList.remove('open'); }

/* ── Section nav ── */
const SECTIONS = {
  overview: { id:'sectionOverview', title:'Overview'      },
  stock:    { id:'sectionStock',    title:'Update stock'  },
  requests: { id:'sectionRequests', title:'Requests'      },
  history:  { id:'sectionHistory',  title:'History'       },
  profile:  { id:'sectionProfile',  title:'Bank profile'  },
};

function showSection(key) {
  document.querySelectorAll('.dash-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const m = SECTIONS[key]; if (!m) return;
  document.getElementById(m.id).classList.add('active');
  document.getElementById('topbarTitle').textContent = m.title;
  const nav = document.querySelector('.nav-item[data-section="' + key + '"]');
  if (nav) nav.classList.add('active');
  closeSidebar();
  if (key === 'overview') renderOverview();
  if (key === 'stock')    renderStockGrid();
  if (key === 'requests') loadAndRenderRequests('all');
  if (key === 'history')  renderHistory();
  if (key === 'profile')  renderBankProfile();
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => { e.preventDefault(); showSection(item.getAttribute('data-section')); });
});

/* ── Helpers ── */
function timeAgo(iso) {
  if (!iso) return '';
  const d = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (d < 1) return 'Just now'; if (d < 60) return d + 'm ago';
  if (d < 1440) return Math.floor(d/60) + 'h ago'; return Math.floor(d/1440) + 'd ago';
}
function extractStock(doc) {
  const s = {};
  GROUPS.forEach(g => { s[g] = doc ? (doc[g] || 0) : 0; });
  return s;
}
function patientName(r) {
  if (!r.patient) return 'Patient';
  return ((r.patient.firstName || '') + ' ' + (r.patient.lastName || '')).trim() || 'Patient';
}
function showApiError(msg) {
  let el = document.getElementById('bankApiErr');
  if (!el) {
    el = document.createElement('div');
    el.id = 'bankApiErr';
    el.className = 'form-alert error';
    el.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:9999;max-width:480px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.15)';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 7000);
}

/* ══════════════════════════════════════════
   STATUS TOGGLE
══════════════════════════════════════════ */
function toggleBankStatus() {
  bankOpen = !bankOpen;
  const toggle = document.getElementById('statusToggle');
  const dot    = document.getElementById('statusDot');
  const text   = document.getElementById('statusText');
  const btn    = document.getElementById('statusBtn');

  if (bankOpen) {
    toggle?.classList.remove('closed'); dot?.classList.add('active'); dot?.classList.remove('closed');
    if (text) text.textContent = 'Open & accepting donations';
    if (btn)  { btn.textContent = 'Close'; btn.classList.remove('closed'); }
  } else {
    toggle?.classList.add('closed'); dot?.classList.remove('active'); dot?.classList.add('closed');
    if (text) text.textContent = 'Closed — not accepting now';
    if (btn)  { btn.textContent = 'Open'; btn.classList.add('closed'); }
  }

  api.blood.setStatus(bankOpen).catch(err => showApiError('Status update failed: ' + err.message));
}

/* ══════════════════════════════════════════
   OVERVIEW
══════════════════════════════════════════ */
async function renderOverview() {
  try {
    const stockRes = await api.blood.getStock();
    currentStock   = extractStock(stockRes.stock);
    originalStock  = { ...currentStock };
  } catch(err) {
    showApiError('Could not load stock: ' + err.message);
    return;
  }

  const total    = Object.values(currentStock).reduce((a,b) => a+b, 0);
  const pending  = allRequests.filter(r => r.status === 'pending').length;
  const critical = GROUPS.filter(g => (currentStock[g]||0) > 0 && (currentStock[g]||0) <= 3).length;
  const empty    = GROUPS.filter(g => (currentStock[g]||0) === 0).length;

  animateNum('totalUnits',    total);
  animateNum('pendingCount',  pending);
  animateNum('criticalCount', critical);
  animateNum('fulfilledCount', allRequests.filter(r => r.status === 'approved').length);

  const badge = document.getElementById('requestBadge');
  if (badge) badge.textContent = pending;

  // Inventory tiles
  const grid = document.getElementById('inventoryOverviewGrid');
  if (grid) {
    grid.innerHTML = GROUPS.map(g => {
      const u   = currentStock[g] || 0;
      const lvl = u === 0 ? 'empty' : u <= 3 ? 'low' : u <= 8 ? 'medium' : 'high';
      const lbl = { empty:'Empty', low:'Critical', medium:'Low', high:'Good' }[lvl];
      return '<div class="inv-tile lvl-' + lvl + '"><div class="inv-group">' + g + '</div><div class="inv-units">' + u + '</div><div class="inv-label">' + lbl + '</div></div>';
    }).join('');
  }

  // Recent requests preview
  const recentList = document.getElementById('recentRequestsList');
  if (recentList) {
    if (!allRequests.length) {
      recentList.innerHTML = '<div style="padding:16px;color:var(--muted);font-size:.85rem">No requests yet</div>';
    } else {
      const sc = { pending:'req-pending', approved:'status-available', rejected:'status-critical' };
      const sl = { pending:'Pending', approved:'Approved', rejected:'Rejected' };
      recentList.innerHTML = allRequests.slice(0,4).map(r => [
        '<div class="recent-req-row">',
        '  <div class="recent-req-group">' + r.bloodGroup + '</div>',
        '  <div class="recent-req-info">',
        '    <div class="recent-req-name">' + patientName(r) + ' · ' + r.units + ' unit' + (r.units>1?'s':'') + '</div>',
        '    <div class="recent-req-sub">' + r.urgency + ' · ' + timeAgo(r.createdAt) + '</div>',
        '  </div>',
        '  <span class="recent-req-status card-status-badge ' + (sc[r.status]||'') + '">' + (sl[r.status]||r.status) + '</span>',
        '</div>',
      ].join('')).join('');
    }
  }
}

function animateNum(id, target) {
  const el = document.getElementById(id); if (!el) return;
  let cur = 0; const step = Math.max(1, Math.ceil(target/40));
  const t = setInterval(() => { cur = Math.min(cur+step, target); el.textContent = cur; if (cur>=target) clearInterval(t); }, 18);
}

/* ══════════════════════════════════════════
   STOCK GRID
══════════════════════════════════════════ */
function safeId(g) { return g.replace('+','p').replace('-','m'); }

function renderStockGrid() {
  const grid = document.getElementById('stockGrid');
  if (!grid) return;

  grid.innerHTML = GROUPS.map(g => {
    const u   = currentStock[g] || 0;
    const lvl = u === 0 ? 'empty' : u <= 3 ? 'low' : u <= 8 ? 'medium' : 'high';
    const dotCls = { empty:'dot-empty', low:'dot-low', medium:'dot-medium', high:'dot-high' }[lvl];
    const sid = safeId(g);
    return [
      '<div class="stock-item">',
      '  <div class="stock-item-header">',
      '    <div class="stock-group-tag">' + g + '</div>',
      '    <span class="stock-level-dot ' + dotCls + '" id="dot-' + sid + '"></span>',
      '  </div>',
      '  <div class="stock-controls">',
      '    <button class="stock-dec" onclick="adjustStock(\'' + g + '\',-1)">−</button>',
      '    <input class="stock-input" id="input-' + sid + '" type="number" min="0" max="9999" value="' + u + '" oninput="onInputChange(\'' + g + '\',this.value)"/>',
      '    <button class="stock-inc" onclick="adjustStock(\'' + g + '\',+1)">+</button>',
      '  </div>',
      '  <div class="stock-sublabel">units</div>',
      '</div>',
    ].join('');
  }).join('');
}

function adjustStock(g, delta) {
  const id    = safeId(g);
  const input = document.getElementById('input-' + id);
  const val   = Math.max(0, (currentStock[g] || 0) + delta);
  currentStock[g] = val;
  if (input) input.value = val;
  markChanged(g, id);
}

function onInputChange(g, raw) {
  const val = Math.max(0, parseInt(raw) || 0);
  currentStock[g] = val;
  markChanged(g, safeId(g));
}

function markChanged(g, id) {
  const input = document.getElementById('input-' + id);
  const dot   = document.getElementById('dot-'   + id);
  const u = currentStock[g] || 0;
  if (input) input.classList.toggle('changed', u !== (originalStock[g] || 0));
  if (dot) {
    dot.className = 'stock-level-dot';
    dot.classList.add(u===0?'dot-empty':u<=3?'dot-low':u<=8?'dot-medium':'dot-high');
  }
}

function resetStock() { currentStock = {...originalStock}; renderStockGrid(); }

async function saveStock() {
  const btn    = document.getElementById('saveStockBtn');
  const text   = btn?.querySelector('.btn-text');
  const loader = btn?.querySelector('.btn-loader');
  if (btn) btn.disabled = true;
  if (text)   text.style.display   = 'none';
  if (loader) loader.style.display = 'inline';

  try {
    await api.blood.updateStock(currentStock);
    originalStock = { ...currentStock };
    renderStockGrid();

    if (text)   { text.textContent = '✓ Saved!'; text.style.display = 'inline'; }
    if (loader)   loader.style.display = 'none';
    if (btn)    btn.disabled = false;

    const lastUpdate = document.getElementById('lastUpdate');
    if (lastUpdate) lastUpdate.textContent = 'just now';

    if (typeof showLiveToast === 'function') showLiveToast('Stock saved — patients notified live ⚡');
    setTimeout(() => { if (text) text.textContent = 'Save all changes'; }, 2500);

  } catch(err) {
    if (text)   { text.textContent = 'Save all changes'; text.style.display = 'inline'; }
    if (loader)   loader.style.display = 'none';
    if (btn)    btn.disabled = false;
    showApiError('Could not save stock: ' + err.message);
  }
}

/* ══════════════════════════════════════════
   LOG DONATION
══════════════════════════════════════════ */
async function logDonation() {
  const group   = document.getElementById('donationGroup')?.value;
  const units   = parseInt(document.getElementById('donationUnits')?.value || 1);
  const donor   = document.getElementById('donorName')?.value.trim() || 'Anonymous';
  const phone   = document.getElementById('donorPhone')?.value.trim() || '';
  const alertEl = document.getElementById('donationAlert');

  if (!group) {
    if (alertEl) { alertEl.className='form-alert error'; alertEl.textContent='Please select a blood group'; alertEl.style.display='block'; }
    return;
  }

  try {
    const data = await api.donations.log(group, units, donor, phone);
    currentStock[group]  = data.newUnits;
    originalStock[group] = data.newUnits;

    if (alertEl) {
      alertEl.className   = 'form-alert success';
      alertEl.textContent = '✓ ' + units + ' unit' + (units>1?'s':'') + ' of ' + group + ' added. Patients notified.';
      alertEl.style.display = 'block';
      setTimeout(() => { alertEl.style.display = 'none'; }, 3000);
    }

    if (document.getElementById('donationGroup'))  document.getElementById('donationGroup').value = '';
    if (document.getElementById('donorName'))       document.getElementById('donorName').value  = '';
    if (document.getElementById('donorPhone'))      document.getElementById('donorPhone').value = '';
    renderStockGrid();

  } catch(err) {
    if (alertEl) { alertEl.className='form-alert error'; alertEl.textContent='Error: '+err.message; alertEl.style.display='block'; }
  }
}

/* ══════════════════════════════════════════
   REQUESTS
══════════════════════════════════════════ */
function filterRequests(filter, btn) {
  currentFilter = filter;
  document.querySelectorAll('.req-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderRequests(filter);
}

function renderRequests(filter) {
  const list = document.getElementById('bankRequestsList');
  if (!list) return;
  const data = filter === 'all' ? allRequests : allRequests.filter(r => r.status === filter);

  if (!data.length) {
    list.innerHTML = '<div class="empty-state" style="padding:40px"><div class="empty-icon"><svg viewBox="0 0 48 48" fill="none" width="36" height="36"><rect x="8" y="10" width="32" height="28" rx="4" stroke="currentColor" stroke-width="2"/></svg></div><h3>No ' + (filter==='all'?'':filter) + ' requests</h3></div>';
    return;
  }

  const urgTag = {
    normal:   '',
    urgent:   '<span class="req-tag urgent-tag">Urgent</span>',
    critical: '<span class="req-tag critical-tag">Critical</span>',
  };

  list.innerHTML = data.map((r, i) => {
    const name = patientName(r);
    const init = name.replace(/\s+/g,'').slice(0,2).toUpperCase() || 'PT';
    const isU  = r.urgency === 'urgent' || r.urgency === 'critical';
    const acts = r.status === 'pending'
      ? '<button class="req-approve-btn" onclick="handleRequest(\''+r._id+'\',\'approved\')">Approve</button>' +
        '<button class="req-decline-btn" onclick="handleRequest(\''+r._id+'\',\'rejected\')">Decline</button>' +
        '<button class="req-view-btn"    onclick="viewRequest(\''+r._id+'\')">Details</button>'
      : r.status === 'approved'
        ? '<span class="req-status-approved">✓ Approved</span>'
        : '<span class="req-status-rejected">✗ Declined</span>';

    return [
      '<div class="bank-req-card ' + (isU?'req-urgent':'') + '" style="animation-delay:' + (i*.05) + 's">',
      '  <div class="req-avatar">' + init + '</div>',
      '  <div class="req-body">',
      '    <div class="req-top">',
      '      <div class="req-name">' + name + '</div>',
      '      <div class="req-time">' + timeAgo(r.createdAt) + '</div>',
      '    </div>',
      '    <div class="req-detail">' + (r.note || 'No note provided') + '</div>',
      '    <div class="req-tags">',
      '      <span class="req-tag blood">' + r.bloodGroup + '</span>',
      '      <span class="req-tag">' + r.units + ' unit' + (r.units>1?'s':'') + '</span>',
      '      ' + (urgTag[r.urgency] || ''),
      '      ' + (r.patient?.phone ? '<span class="req-tag">📞 ' + r.patient.phone + '</span>' : ''),
      '    </div>',
      '    <div class="req-actions">' + acts + '</div>',
      '  </div>',
      '</div>',
    ].join('');
  }).join('');
}

async function loadAndRenderRequests(filter) {
  currentFilter = filter;
  const list = document.getElementById('bankRequestsList');
  if (list) list.innerHTML = '<div style="padding:24px;color:var(--muted);font-size:.85rem">Loading requests...</div>';

  try {
    const data  = await api.requests.incoming(filter === 'all' ? '' : filter);
    allRequests = data.requests || [];
    const badge = document.getElementById('requestBadge');
    if (badge) badge.textContent = allRequests.filter(r => r.status === 'pending').length;
    renderRequests(filter);
  } catch(err) {
    if (list) list.innerHTML = '<div class="form-alert error">Could not load: ' + err.message + '</div>';
  }
}

async function handleRequest(id, status) {
  try {
    await api.requests.respond(id, status);
    const req = allRequests.find(r => r._id === id);
    if (req) req.status = status;
    const badge = document.getElementById('requestBadge');
    if (badge) badge.textContent = allRequests.filter(r => r.status === 'pending').length;
    renderRequests(currentFilter);
    if (typeof showLiveToast === 'function') showLiveToast('Request ' + status + ' ✓');
  } catch(err) { showApiError('Could not update: ' + err.message); }
}

function viewRequest(id) {
  const r = allRequests.find(req => req._id === id);
  if (!r) return;

  const name = patientName(r);
  const modal = document.getElementById('actionModal');
  const title = document.getElementById('actionModalTitle');
  const body  = document.getElementById('actionModalBody');
  const footer= document.getElementById('actionModalFooter');

  if (title) title.textContent = 'Request from ' + name;
  if (body)  body.innerHTML = [
    infoRow('Patient',    name),
    infoRow('Phone',      r.patient?.phone || '—'),
    infoRow('Blood group','<span class="blood-badge">' + r.bloodGroup + '</span>'),
    infoRow('Units',      r.units),
    infoRow('Urgency',    '<span style="text-transform:capitalize">' + r.urgency + '</span>'),
    infoRow('Note',       r.note || '—'),
    infoRow('Submitted',  timeAgo(r.createdAt)),
  ].join('');

  if (footer) footer.innerHTML = r.status === 'pending'
    ? '<button class="btn-ghost" onclick="closeActionModal()">Close</button>' +
      '<button class="req-decline-btn" style="padding:10px 18px" onclick="handleRequest(\''+r._id+'\',\'rejected\');closeActionModal()">Decline</button>' +
      '<button class="req-approve-btn" style="padding:10px 18px;border-radius:var(--radius-md)" onclick="handleRequest(\''+r._id+'\',\'approved\');closeActionModal()">Approve</button>'
    : '<button class="btn-primary" onclick="closeActionModal()">Close</button>';

  if (modal) { modal.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
}

function infoRow(label, value) {
  return '<div class="modal-info-row"><span>' + label + '</span><strong>' + value + '</strong></div>';
}

function closeActionModal() {
  const modal = document.getElementById('actionModal');
  if (modal) { modal.style.display = 'none'; document.body.style.overflow = ''; }
}

const actionModal = document.getElementById('actionModal');
if (actionModal) actionModal.addEventListener('click', e => { if (e.target === actionModal) closeActionModal(); });

/* ══════════════════════════════════════════
   HISTORY (from real donations API)
══════════════════════════════════════════ */
async function renderHistory() {
  const list = document.getElementById('historyList');
  if (!list) return;
  list.innerHTML = '<div style="padding:20px;color:var(--muted);font-size:.85rem">Loading...</div>';

  try {
    const data      = await api.donations.mine();
    const donations = data.donations || [];

    if (!donations.length) {
      list.innerHTML = '<div class="empty-state" style="padding:40px"><h3>No history yet</h3><p>Log a donation to see it here.</p></div>';
      return;
    }

    list.innerHTML = donations.map(d => [
      '<div class="history-item">',
      '  <span class="history-type-dot dot-in"></span>',
      '  <div style="flex:1">',
      '    <div class="history-desc">Donation received from ' + (d.donorName||'Anonymous') + '</div>',
      '    <div class="history-sub">' + d.units + ' unit' + (d.units>1?'s':'') + ' · ' + (d.donorPhone||'') + ' · ' + timeAgo(d.donatedAt) + '</div>',
      '  </div>',
      '  <span class="history-group">' + d.bloodGroup + '</span>',
      '  <span class="history-change change-pos">+' + d.units + '</span>',
      '</div>',
    ].join('')).join('');
  } catch(err) {
    list.innerHTML = '<div class="form-alert error">Could not load history: ' + err.message + '</div>';
  }
}

/* ══════════════════════════════════════════
   BANK PROFILE
══════════════════════════════════════════ */
async function renderBankProfile() {
  const sec = document.getElementById('sectionProfile');
  if (!sec) return;
  const user = api.auth.getUser ? api.auth.getUser() : null;
  if (!user) return;

  let profileEl = sec.querySelector('#bankProfileContent');
  if (!profileEl) { profileEl = document.createElement('div'); profileEl.id='bankProfileContent'; sec.appendChild(profileEl); }

  profileEl.innerHTML = `
    <div style="max-width:480px">
      <div style="background:var(--white);border:1px solid var(--border);border-radius:var(--radius-xl);padding:28px;margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px">
          <div style="width:52px;height:52px;background:var(--red);color:white;border-radius:12px;display:flex;align-items:center;justify-content:center;font-family:var(--font-mono);font-size:.9rem;font-weight:700;flex-shrink:0">
            ${(user.orgName||user.firstName||'BB').slice(0,2).toUpperCase()}
          </div>
          <div>
            <div style="font-size:1.05rem;font-weight:700">${user.orgName||user.firstName}</div>
            <div style="font-size:.8rem;color:var(--muted)">${user.email}</div>
          </div>
        </div>
        <div style="display:grid;gap:8px">
          ${profRow('License number', user.licenseNumber||'—', '#EEF6FF')}
          ${profRow('District',       user.district||'—',       '')}
          ${profRow('Phone',          user.phone||'—',           '')}
          ${profRow('Address',        user.address||'—',         '')}
          ${profRow('Working hours',  user.workingHours||'Open 24 hours', '')}
          ${profRow('Status',         user.isVerified?'Verified ✓':'Pending', user.isVerified?'#DCFCE7':'#FEF9C3')}
        </div>
      </div>
      <div style="text-align:right"><button class="btn-ghost" onclick="api.auth.logout()">Log out</button></div>
    </div>
  `;
}

function profRow(label, val, bg) {
  return '<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 13px;background:' + (bg||'var(--bg)') + ';border-radius:var(--radius-md)"><span style="font-size:.78rem;color:var(--muted);font-weight:600">' + label + '</span><span style="font-size:.85rem;font-weight:600;color:var(--dark)">' + val + '</span></div>';
}

/* ══════════════════════════════════════════
   🔊 SOUND ALARM — 5 second beep
   Web Audio API — no external file needed
══════════════════════════════════════════ */
function playRequestAlarm() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const beepPattern = [880, 660, 880, 660, 880, 660, 880, 660]; // 8 beeps over 5s
    let   time = ctx.currentTime;

    beepPattern.forEach(freq => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.5, time + 0.05);
      gain.gain.linearRampToValueAtTime(0.5, time + 0.45);
      gain.gain.linearRampToValueAtTime(0,   time + 0.5);
      osc.start(time);
      osc.stop(time + 0.5);
      time += 0.625; // ~5 seconds for 8 beeps
    });
  } catch(e) {
    console.warn('Audio alarm failed:', e.message);
  }
}

/* ══════════════════════════════════════════
   📣 NOTIFICATION BANNER
══════════════════════════════════════════ */
function showRequestNotification(data) {
  const existing = document.getElementById('reqNotifBanner');
  if (existing) existing.remove();

  const URGENCY_COLOR = { critical:'#DC2626', urgent:'#F59E0B', normal:'#3B82F6' };
  const color = URGENCY_COLOR[data.urgency] || '#3B82F6';

  // Inject keyframe once
  if (!document.getElementById('notifKF')) {
    const s = document.createElement('style');
    s.id = 'notifKF';
    s.textContent = '@keyframes notifIn{from{opacity:0;top:-80px}to{opacity:1;top:16px}}';
    document.head.appendChild(s);
  }

  const banner = document.createElement('div');
  banner.id = 'reqNotifBanner';
  Object.assign(banner.style, {
    position:'fixed', top:'16px', left:'50%', transform:'translateX(-50%)',
    zIndex:'99999', background:'#0E0E0E', border:'2px solid '+color,
    borderRadius:'16px', padding:'16px 20px', minWidth:'340px', maxWidth:'480px',
    boxShadow:'0 8px 40px rgba(0,0,0,.5)', fontFamily:'Sora,sans-serif',
    display:'flex', alignItems:'flex-start', gap:'14px',
    animation:'notifIn .35s cubic-bezier(.34,1.56,.64,1) forwards',
  });

  const urgLabel = { critical:'🚨 CRITICAL', urgent:'⚠ Urgent', normal:'📋 New' };
  const label    = urgLabel[data.urgency] || '📋 New';

  banner.innerHTML = [
    '<div style="width:42px;height:42px;border-radius:10px;background:'+color+';display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:1.3rem">🩸</div>',
    '<div style="flex:1;min-width:0">',
    '  <div style="font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:'+color+';margin-bottom:3px">'+label+' REQUEST</div>',
    '  <div style="font-size:.92rem;font-weight:600;color:#fff;margin-bottom:3px">'+(data.patientName||'Patient')+' needs '+data.units+' unit(s) of '+data.bloodGroup+'</div>',
    '  <div style="font-size:.75rem;color:#888;margin-bottom:10px">'+(data.patientPhone?'📞 '+data.patientPhone+' · ':'')+data.urgency+(data.note?' · "'+data.note.slice(0,50)+'"':'')+' · '+timeAgo(data.createdAt)+'</div>',
    '  <div style="display:flex;gap:8px">',
    '    <button onclick="showSection(\'requests\');document.getElementById(\'reqNotifBanner\').remove()" style="background:'+color+';color:#fff;border:none;padding:6px 14px;border-radius:7px;font-family:Sora,sans-serif;font-size:.72rem;font-weight:700;cursor:pointer">View request</button>',
    '    <button onclick="document.getElementById(\'reqNotifBanner\').remove()" style="background:#1a1a1a;color:#888;border:1px solid #333;padding:6px 12px;border-radius:7px;font-family:Sora,sans-serif;font-size:.72rem;cursor:pointer">Dismiss</button>',
    '  </div>',
    '</div>',
    '<div id="notifProg" style="position:absolute;bottom:0;left:0;height:3px;background:'+color+';width:100%;border-radius:0 0 14px 14px;transition:width 8s linear"></div>',
  ].join('');

  document.body.appendChild(banner);
  // Shrink progress bar
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const p = document.getElementById('notifProg');
    if (p) p.style.width = '0%';
  }));

  // Update badge
  const badge = document.getElementById('requestBadge');
  if (badge) badge.textContent = (parseInt(badge.textContent)||0) + 1;

  // Auto remove after 8s
  setTimeout(() => { if (banner.parentNode) banner.remove(); }, 8000);
}

/* ══════════════════════════════════════════
   INIT
══════════════════════════════════════════ */
function updateBankSidebar(user) {
  if (!user) return;
  const name    = user.orgName || ((user.firstName||'') + ' ' + (user.lastName||'')).trim() || 'Blood Bank';
  const roleMap = {patient:'Patient', bloodbank:'Blood Bank', hospital:'Hospital', admin:'Admin'};
  const initials= name.trim().split(/\s+/).slice(0,2).map(function(w){return w[0];}).join('').toUpperCase() || 'BB';
  const nameEl   = document.getElementById('sidebarName')   || document.querySelector('.user-name');
  const avatarEl = document.getElementById('sidebarAvatar') || document.querySelector('.user-avatar');
  const roleEl   = document.getElementById('sidebarRole')   || document.querySelector('.user-role');
  if (nameEl)   nameEl.textContent   = name;
  if (avatarEl) avatarEl.textContent = initials;
  if (roleEl)   roleEl.textContent   = roleMap[user.role] || user.role;
}

(async function init() {
  // Connect socket
  if (typeof socketConnect === 'function') socketConnect();

  // Load user info from localStorage
  const user = api.auth.getUser ? api.auth.getUser() : null;
  if (user) {
    currentBankId = user.id || user._id;
    updateBankSidebar(user);

    // Fetch fresh from server and update
    api.auth.me().then(function(meData) {
      if (meData && meData.user) {
        localStorage.setItem('bl_user', JSON.stringify(meData.user));
        updateBankSidebar(meData.user);
      }
    }).catch(function(){});

    // Join bank's socket room
    if (typeof socketJoinBank === 'function') socketJoinBank(currentBankId);
  }

  // Pre-load data
  try {
    const [stockRes, reqRes] = await Promise.all([
      api.blood.getStock(),
      api.requests.incoming(''),
    ]);
    currentStock  = extractStock(stockRes.stock);
    originalStock = { ...currentStock };
    allRequests   = reqRes.requests || [];
  } catch(err) {
    console.warn('Pre-load failed:', err.message);
    showApiError('Backend not reachable — run: npm run dev (port 8000)');
  }

  // Render default section
  renderOverview();

  // ── Socket listeners ────────────────────────
  if (typeof socket !== 'undefined') {

    // Stock save confirmed
    socket.on('stock:saved', () => {
      if (typeof showLiveToast === 'function') showLiveToast('Stock synced ✓');
    });

    // ⭐ NEW BLOOD REQUEST → 5-sec alarm + notification banner
    socket.on('new:request', data => {
      console.log('🔔 New request:', data);
      playRequestAlarm();
      showRequestNotification(data);
      // Refresh requests if that section is open
      const reqSec = document.getElementById('sectionRequests');
      if (reqSec?.classList.contains('active')) loadAndRenderRequests('all');
    });
  }
})();
