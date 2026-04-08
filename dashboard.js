/* ═══════════════════════════════════════════
   BloodLink TN — Patient Dashboard v4.0
   Features:
   1. Sidebar + mobile menu
   2. Section navigation (search / alerts / requests / compat / sos / profile)
   3. Live blood search → real API
   4. Request modal
   5. Alert subscriptions
   6. Blood compatibility checker
   7. Emergency SOS broadcast
   8. My profile
   9. Socket.io real-time stock updates
═══════════════════════════════════════════ */

/* ─── Sidebar ──────────────────────────── */
const sidebar        = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');

document.getElementById('menuBtn').addEventListener('click', () => {
  sidebar.classList.add('open'); sidebarOverlay.classList.add('open');
});
document.getElementById('sidebarClose').addEventListener('click', closeSidebar);
function closeSidebar() { sidebar.classList.remove('open'); sidebarOverlay.classList.remove('open'); }

/* ─── Section map ──────────────────────── */
const SECTIONS = {
  search:   { id:'sectionSearch',   title:'Search blood'         },
  alerts:   { id:'sectionAlerts',   title:'My alerts'            },
  requests: { id:'sectionRequests', title:'My requests'          },
  compat:   { id:'sectionCompat',   title:'Blood compatibility'  },
  sos:      { id:'sectionSos',      title:'Emergency SOS'        },
  profile:  { id:'sectionProfile',  title:'My profile'           },
};

function showSection(key) {
  const m = SECTIONS[key]; if (!m) return;
  document.querySelectorAll('.dash-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(m.id).classList.add('active');
  document.getElementById('topbarTitle').textContent = m.title;
  const nav = document.querySelector('.nav-item[data-section="' + key + '"]');
  if (nav) nav.classList.add('active');
  closeSidebar();
  if (key === 'alerts')   renderAlerts();
  if (key === 'requests') renderRequests();
  if (key === 'profile')  renderProfile();
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => { e.preventDefault(); showSection(item.getAttribute('data-section')); });
});

/* ─── Blood group buttons ──────────────── */
let selectedGroup = null;

document.querySelectorAll('.bg-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.bg-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedGroup = btn.getAttribute('data-group');
  });
});

/* ═══════════════════════════════════════════
   1. BLOOD SEARCH
═══════════════════════════════════════════ */
let currentResults = [];

async function runSearch() {
  if (!selectedGroup) {
    flashEl('bloodGroupGrid');
    return;
  }

  const district = document.getElementById('searchDistrict').value;
  const btn      = document.getElementById('searchBtn');

  btn.disabled   = true;
  btn.textContent = 'Searching...';

  clearSearchError();

  try {
    const data = await api.blood.search(selectedGroup, district);
    currentResults = data.results || [];
    renderResults(currentResults, selectedGroup, district);

    // Join socket room for live updates
    if (typeof socketJoinSearch === 'function') {
      socketJoinSearch(selectedGroup, district);
    }
  } catch(err) {
    showSearchError(err.message);
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Search now';
  }
}

function flashEl(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.outline = '2px solid var(--red)';
  el.style.borderRadius = '8px';
  setTimeout(() => { el.style.outline = 'none'; }, 1500);
}

function showSearchError(msg) {
  const area = document.getElementById('sectionSearch');
  let errEl  = document.getElementById('searchErrBox');
  if (!errEl) {
    errEl = document.createElement('div');
    errEl.id = 'searchErrBox';
    errEl.className = 'form-alert error';
    errEl.style.margin = '0 0 16px';
    area.insertBefore(errEl, area.querySelector('.bg-selector-wrap') || area.firstChild.nextSibling);
  }
  errEl.textContent  = '⚠ ' + msg;
  errEl.style.display = 'block';
}

function clearSearchError() {
  const el = document.getElementById('searchErrBox');
  if (el) el.style.display = 'none';
}

/* ── Render results ── */
function renderResults(results, group, district) {
  const emptyState  = document.getElementById('emptyState');
  const resultsArea = document.getElementById('resultsArea');
  const noResults   = document.getElementById('noResults');
  const alertOption = document.getElementById('alertOption');

  emptyState.style.display = 'none';

  if (!results || results.length === 0) {
    resultsArea.style.display = 'none';
    noResults.style.display   = 'flex';
    if (document.getElementById('noResultsGroup'))    document.getElementById('noResultsGroup').textContent    = group;
    if (document.getElementById('noResultsDistrict')) document.getElementById('noResultsDistrict').textContent = district || 'all districts';
    if (alertOption) alertOption.style.display = 'block';
    updateAlertHint(group, district);
    return;
  }

  noResults.style.display   = 'none';
  resultsArea.style.display = 'block';
  if (alertOption) alertOption.style.display = 'block';
  updateAlertHint(group, district);

  const countEl = document.getElementById('resultsCount');
  if (countEl) countEl.textContent = results.length + ' blood bank' + (results.length > 1 ? 's' : '') + ' found';
  const queryEl = document.getElementById('resultsQuery');
  if (queryEl) queryEl.textContent = group + ' · ' + (district || 'All districts');

  const grid = document.getElementById('resultsGrid');
  grid.innerHTML = '';
  results.forEach((bank, i) => grid.appendChild(buildCard(bank, group, bank.units, i)));
}

function updateAlertHint(group, district) {
  const g = document.getElementById('alertGroupName');
  const d = document.getElementById('alertDistrictName');
  if (g) g.textContent = group;
  if (d) d.textContent = district || 'all districts';
}

/* ── Build result card ── */
function buildCard(bank, group, units, index) {
  let statusClass, statusLabel;
  if (units === 0)     { statusClass='unavailable'; statusLabel='Not available'; }
  else if (units <= 3) { statusClass='critical';    statusLabel='Critical';      }
  else if (units <= 8) { statusClass='low';         statusLabel='Low stock';     }
  else                 { statusClass='available';   statusLabel='Available';     }

  const badgeCls = { available:'status-available', low:'status-low', critical:'status-critical', unavailable:'status-unavailable' }[statusClass];

  const card = document.createElement('div');
  card.className = 'result-card ' + statusClass;
  card.setAttribute('data-bank-id', bank.id);
  card.style.animationDelay = (index * 0.05) + 's';

  const phone = bank.phone || '';
  card.innerHTML = [
    '<div class="card-top">',
    '  <div>',
    '    <div class="card-bank-name">' + (bank.name || '—') + '</div>',
    '    <div class="card-district">' + (bank.district || '—') + '</div>',
    '  </div>',
    '  <span class="card-status-badge ' + badgeCls + '">' + statusLabel + '</span>',
    '</div>',
    '<div class="card-units-row">',
    '  <span class="card-units-num">' + units + '</span>',
    '  <span class="card-units-label">unit' + (units !== 1 ? 's' : '') + '<br>available</span>',
    '  <div class="card-group-tag">' + group + '</div>',
    '</div>',
    '<div class="card-meta">',
    '  <div class="card-meta-row">',
    '    <svg viewBox="0 0 16 16" fill="none"><path d="M8 1.5A4.5 4.5 0 0112.5 6c0 3-4.5 8.5-4.5 8.5S3.5 9 3.5 6A4.5 4.5 0 018 1.5z" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="6" r="1.4" stroke="currentColor" stroke-width="1.3"/></svg>',
    '    ' + (bank.address || 'Address not available'),
    '  </div>',
    '  <div class="card-meta-row">',
    '    <svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.3"/><path d="M8 5v3l2 1.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
    '    <span class="updated-time">Updated ' + (bank.lastUpdated || 'recently') + '</span>',
    '  </div>',
    '  <div class="card-meta-row">',
    '    <svg viewBox="0 0 16 16" fill="none"><rect x="2" y="4" width="12" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/></svg>',
    '    ' + (bank.hours || 'Hours not listed'),
    '  </div>',
    '</div>',
    '<div class="card-actions">',
    '  <button class="card-btn-primary" ' + (units === 0 ? 'disabled' : '') +
      ' onclick="openRequestModal(\'' + bank.id + '\',\'' + bank.name + '\',\'' + group + '\',' + units + ')">' +
      (units === 0 ? 'Not available' : 'Request blood') + '</button>',
    '  <button class="card-btn-secondary" onclick="callBank(\'' + phone + '\')" ' + (!phone ? 'disabled title="No phone available"' : '') + '>',
    '    <svg viewBox="0 0 16 16" fill="none" width="12" height="12"><path d="M2 3.5A1.5 1.5 0 013.5 2h1.1a1 1 0 01.95.69l.73 2.22a1 1 0 01-.23 1.02L5 7.02c.84 1.4 1.95 2.5 3.34 3.34l1.09-1.09a1 1 0 011.02-.23l2.22.74A1 1 0 0113.5 11v1A1.5 1.5 0 0112 13.5C6.48 13.5 2 9.02 2 3.5z" stroke="currentColor" stroke-width="1.3"/></svg>',
    '    Call',
    '  </button>',
    '</div>',
  ].join('');
  return card;
}

function callBank(phone) {
  if (!phone || phone === 'undefined' || phone.trim() === '') {
    alert('Phone number not available for this blood bank.');
    return;
  }
  const cleaned = phone.replace(/[\s\-().]/g, '');
  const withCC  = cleaned.startsWith('+') ? cleaned : (cleaned.startsWith('91') && cleaned.length === 12 ? '+' + cleaned : '+91' + cleaned);
  window.location.href = 'tel:' + withCC;
}

/* ── Sort ── */
function sortResults(method) {
  const sorted = [...currentResults].sort((a, b) =>
    method === 'name' ? a.name.localeCompare(b.name) : b.units - a.units
  );
  const grid = document.getElementById('resultsGrid');
  grid.innerHTML = '';
  sorted.forEach((bank, i) => grid.appendChild(buildCard(bank, selectedGroup, bank.units, i)));
}

/* ── Live card update (from socket) ── */
function updateResultCard(data) {
  const card = document.querySelector('[data-bank-id="' + data.bankId + '"]');
  if (!card) return;

  const numEl = card.querySelector('.card-units-num');
  if (numEl) {
    numEl.style.color = '#F59E0B';
    numEl.textContent = data.units;
    setTimeout(() => { numEl.style.color = ''; }, 1500);
  }

  const badge = card.querySelector('.card-status-badge');
  if (badge) {
    const u = data.units;
    let cls, lbl;
    if (u === 0)  { cls='status-unavailable'; lbl='Not available'; }
    else if (u<=3){ cls='status-critical';    lbl='Critical';      }
    else if (u<=8){ cls='status-low';         lbl='Low stock';     }
    else          { cls='status-available';   lbl='Available';     }
    badge.className = 'card-status-badge ' + cls;
    badge.textContent = lbl;
  }

  const timeEl = card.querySelector('.updated-time');
  if (timeEl) timeEl.textContent = 'Updated just now';
}

/* ═══════════════════════════════════════════
   2. ALERTS
═══════════════════════════════════════════ */
let savedAlerts = [];

async function renderAlerts() {
  const list = document.getElementById('alertsList');
  list.innerHTML = '<div style="padding:24px;color:var(--muted);font-size:.85rem">Loading alerts...</div>';
  try {
    const data = await api.alerts.get();
    savedAlerts = data.alerts || [];
    updateAlertBadge();

    if (!savedAlerts.length) {
      list.innerHTML = '<div class="empty-state"><div class="empty-icon"><svg viewBox="0 0 48 48" fill="none" width="36" height="36"><path d="M24 6a14 14 0 0114 14c0 8-3.5 11.5-3.5 11.5H9.5S6 28 6 20A14 14 0 0124 6z" stroke="currentColor" stroke-width="2"/></svg></div><h3>No alerts set</h3><p>Search for blood and tap "Set alert" to get notified.</p></div>';
      return;
    }

    list.innerHTML = savedAlerts.map(a => `
      <div class="alert-item" id="alertItem-${a._id}">
        <div class="alert-group">${a.bloodGroup}</div>
        <div class="alert-info">
          <div class="alert-title">${a.bloodGroup} in ${a.district || 'All districts'}</div>
          <div class="alert-sub">SMS + push when available · ${a.active ? 'Active' : 'Paused'}</div>
        </div>
        <button class="alert-toggle ${a.active ? '' : 'off'}" onclick="toggleAlert('${a._id}')"></button>
        <button class="alert-delete" onclick="deleteAlert('${a._id}')">✕</button>
      </div>
    `).join('');
  } catch(err) {
    list.innerHTML = '<div class="form-alert error">Could not load alerts: ' + err.message + '</div>';
  }
}

// Called from Search section checkbox
document.getElementById('setAlertCheck') && document.getElementById('setAlertCheck').addEventListener('change', async function() {
  if (!this.checked || !selectedGroup) return;
  const district = document.getElementById('searchDistrict').value;
  try {
    const data = await api.alerts.create(selectedGroup, district);
    savedAlerts.push(data.alert);
    updateAlertBadge();
    this.parentElement.innerHTML = '<span style="font-size:.85rem;color:#15803D;font-weight:600">✓ Alert set for ' + selectedGroup + ' in ' + (district || 'all districts') + '</span>';
  } catch(err) {
    this.checked = false;
    showSearchError(err.message);
  }
});

async function toggleAlert(id) {
  const a = savedAlerts.find(x => x._id === id);
  if (!a) return;
  try {
    await api.alerts.toggle(id, !a.active);
    a.active = !a.active;
    renderAlerts();
  } catch(err) { console.error(err); }
}

async function deleteAlert(id) {
  try {
    await api.alerts.delete(id);
    savedAlerts = savedAlerts.filter(a => a._id !== id);
    renderAlerts();
  } catch(err) { console.error(err); }
}

function updateAlertBadge() {
  const el = document.getElementById('alertBadge');
  if (el) el.textContent = savedAlerts.filter(a => a.active).length;
}

/* ═══════════════════════════════════════════
   3. REQUEST MODAL
═══════════════════════════════════════════ */
let activeModalBank = null;

function openRequestModal(bankId, bankName, group, units) {
  activeModalBank = { bankId, bankName, group, units };
  const nameEl  = document.getElementById('modalBankName');
  const grpEl   = document.getElementById('modalGroup');
  const unitsEl = document.getElementById('modalUnits');
  const alertEl = document.getElementById('modalAlert');
  const noteEl  = document.getElementById('modalNote');
  const selEl   = document.getElementById('modalUnitsReq');

  if (nameEl)  nameEl.textContent  = bankName;
  if (grpEl)   grpEl.textContent   = group;
  if (unitsEl) unitsEl.textContent = units + ' unit' + (units !== 1 ? 's' : '');
  if (alertEl) alertEl.style.display = 'none';
  if (noteEl)  noteEl.value = '';

  if (selEl) {
    selEl.innerHTML = '';
    for (let i = 1; i <= Math.min(units, 5); i++) {
      selEl.innerHTML += '<option value="' + i + '">' + i + '</option>';
    }
  }

  const modal = document.getElementById('requestModal');
  if (modal) { modal.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
}

function closeModal() {
  const modal = document.getElementById('requestModal');
  if (modal) { modal.style.display = 'none'; document.body.style.overflow = ''; }
  activeModalBank = null;
}

async function submitRequest() {
  if (!activeModalBank) return;
  const units   = parseInt(document.getElementById('modalUnitsReq')?.value || 1);
  const urgency = document.getElementById('modalUrgency')?.value || 'normal';
  const note    = document.getElementById('modalNote')?.value.trim() || '';
  const alertEl = document.getElementById('modalAlert');

  try {
    await api.requests.create(activeModalBank.bankId, activeModalBank.group, units, urgency, note);
    if (alertEl) {
      alertEl.className   = 'form-alert success';
      alertEl.textContent = '✓ Request sent to ' + activeModalBank.bankName;
      alertEl.style.display = 'block';
    }
    setTimeout(closeModal, 1800);
  } catch(err) {
    if (alertEl) {
      alertEl.className   = 'form-alert error';
      alertEl.textContent = err.message;
      alertEl.style.display = 'block';
    }
  }
}

// Close modal on overlay click
const reqModal = document.getElementById('requestModal');
if (reqModal) reqModal.addEventListener('click', e => { if (e.target === reqModal) closeModal(); });

/* ═══════════════════════════════════════════
   4. MY REQUESTS
═══════════════════════════════════════════ */
async function renderRequests() {
  const list = document.getElementById('requestsList');
  if (!list) return;
  list.innerHTML = '<div style="padding:24px;color:var(--muted);font-size:.85rem">Loading requests...</div>';

  try {
    const data = await api.requests.mine();
    const reqs = data.requests || [];

    if (!reqs.length) {
      list.innerHTML = '<div class="empty-state"><div class="empty-icon"><svg viewBox="0 0 48 48" fill="none" width="36" height="36"><rect x="8" y="10" width="32" height="28" rx="4" stroke="currentColor" stroke-width="2"/></svg></div><h3>No requests yet</h3><p>Search for blood and send your first request.</p></div>';
      return;
    }

    const stClass = { pending:'req-pending', approved:'req-approved', rejected:'req-rejected' };
    const stLabel = { pending:'Pending', approved:'Approved', rejected:'Rejected' };

    list.innerHTML = reqs.map(r => `
      <div class="request-item">
        <div class="request-group">${r.bloodGroup}</div>
        <div class="request-info">
          <div class="request-bank">${r.bank ? r.bank.orgName : '—'}</div>
          <div class="request-meta">${r.units} unit${r.units>1?'s':''} · ${r.urgency} · ${new Date(r.createdAt).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</div>
          ${r.note ? '<div class="request-meta" style="margin-top:2px;color:var(--muted);">"' + r.note + '"</div>' : ''}
        </div>
        <span class="request-status ${stClass[r.status]||''}">${stLabel[r.status]||r.status}</span>
      </div>
    `).join('');
  } catch(err) {
    list.innerHTML = '<div class="form-alert error">Could not load requests: ' + err.message + '</div>';
  }
}

/* ═══════════════════════════════════════════
   5. BLOOD COMPATIBILITY
═══════════════════════════════════════════ */
async function loadCompat(group, btn) {
  document.querySelectorAll('#compatGroupBtns .bg-btn').forEach(b => b.classList.remove('selected'));
  if (btn) btn.classList.add('selected');

  const wrap = document.getElementById('compatResult');
  if (!wrap) return;
  wrap.innerHTML = '<div style="padding:24px;color:var(--muted);font-size:.85rem">Loading...</div>';

  try {
    const data = await api.features.compatibility(group);
    const { canDonateTo, canReceiveFrom } = data;

    wrap.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div class="compat-card compat-donate">
          <div class="compat-card-title">
            <svg viewBox="0 0 16 16" fill="none" width="14" height="14"><path d="M8 1.5C5.5 6 2 8.5 2 12a6 6 0 0012 0c0-3.5-3.5-6.5-6-10.5z" stroke="currentColor" stroke-width="1.4"/></svg>
            ${group} can donate to
          </div>
          <div class="compat-groups">${canDonateTo.map(g=>'<span class="compat-group-pill donate">'+g+'</span>').join('')}</div>
          <div class="compat-note">${canDonateTo.length} compatible group${canDonateTo.length!==1?'s':''}</div>
        </div>
        <div class="compat-card compat-receive">
          <div class="compat-card-title">
            <svg viewBox="0 0 16 16" fill="none" width="14" height="14"><path d="M8 14l-5-5h3V3h4v6h3L8 14z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
            ${group} can receive from
          </div>
          <div class="compat-groups">${canReceiveFrom.map(g=>'<span class="compat-group-pill receive">'+g+'</span>').join('')}</div>
          <div class="compat-note">${canReceiveFrom.length} compatible group${canReceiveFrom.length!==1?'s':''}</div>
        </div>
      </div>
      ${group==='O-'  ? '<div class="compat-universal">🌟 <strong>O−</strong> is the Universal Donor — can give to any blood group</div>' : ''}
      ${group==='AB+' ? '<div class="compat-universal">🌟 <strong>AB+</strong> is the Universal Recipient — can receive from any blood group</div>' : ''}
    `;
  } catch(err) {
    wrap.innerHTML = '<div class="form-alert error">Could not load: ' + err.message + '</div>';
  }
}

/* ═══════════════════════════════════════════
   6. EMERGENCY SOS
═══════════════════════════════════════════ */
async function sendSOS() {
  const group    = document.getElementById('sosGroup')?.value;
  const district = document.getElementById('sosDistrict')?.value;
  const name     = document.getElementById('sosName')?.value.trim();
  const phone    = document.getElementById('sosPhone')?.value.trim();
  const msg      = document.getElementById('sosMsg')?.value.trim();
  const alertEl  = document.getElementById('sosAlert');
  const btn      = document.querySelector('.btn-sos');

  if (alertEl) alertEl.style.display = 'none';

  if (!group || !district) {
    if (alertEl) { alertEl.className='form-alert error'; alertEl.textContent='Please select blood group and district'; alertEl.style.display='block'; }
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Sending SOS...'; }

  try {
    const data = await api.features.sos({ bloodGroup:group, district, patientName:name, patientPhone:phone, message:msg });
    if (alertEl) {
      alertEl.className   = 'form-alert success';
      alertEl.textContent = '✓ ' + data.msg;
      alertEl.style.display = 'block';
    }
    if (btn) btn.textContent = '✓ SOS Sent!';
    setTimeout(() => {
      if (btn) { btn.disabled=false; btn.textContent='Send Emergency SOS'; }
    }, 6000);
  } catch(err) {
    if (alertEl) { alertEl.className='form-alert error'; alertEl.textContent='SOS failed: '+err.message; alertEl.style.display='block'; }
    if (btn) { btn.disabled=false; btn.textContent='Send Emergency SOS'; }
  }
}

/* ═══════════════════════════════════════════
   7. MY PROFILE
═══════════════════════════════════════════ */
async function renderProfile() {
  let user = api.auth.getUser ? api.auth.getUser() : null;
  if (!user) { window.location.href = '../pages/register.html?tab=login'; return; }

  // Always fetch fresh profile from server
  try {
    const meData = await api.auth.me();
    if (meData.user) {
      user = meData.user;
      localStorage.setItem('bl_user', JSON.stringify(user));
      // Also update sidebar with fresh data
      updateSidebar(user);
    }
  } catch(e) { /* use cached */ }

  const isOrg    = user.role === 'bloodbank' || user.role === 'hospital';
  const fullName = isOrg && user.orgName
    ? user.orgName
    : ((user.firstName||'') + ' ' + (user.lastName||'')).trim() || 'User';

  const roleLabel = {patient:'Patient', bloodbank:'Blood Bank', hospital:'Hospital', admin:'Administrator'}[user.role] || user.role;
  const initials  = fullName.trim().split(/\s+/).slice(0,2).map(function(w){return w[0];}).join('').toUpperCase() || '??';

  // Format member since date
  const memberSince = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-IN',{month:'long',year:'numeric'})
    : 'Unknown';

  const rows = [
    !isOrg ? profileRow('Blood group', user.bloodGroup ? '<span class="blood-badge">'+user.bloodGroup+'</span>' : 'Not set', '#FFF0EF') : '',
    profileRow('Phone',    user.phone    || 'Not set', ''),
    profileRow('District', user.district || 'Not set', ''),
    isOrg ? profileRow('Organisation',  user.orgName       || '—', '#EEF6FF') : '',
    isOrg ? profileRow('License no.',   user.licenseNumber || '—', '') : '',
    profileRow('Member since', memberSince, ''),
    profileRow('Status', user.isVerified ? '✓ Active' : '⏳ Pending', user.isVerified?'#DCFCE7':'#FEF9C3'),
  ].filter(Boolean).join('');

  const html =
    '<div class="profile-card-wrap">' +
      '<div class="profile-card">' +
        '<div class="profile-card-header">' +
          '<div class="profile-avatar-lg">' + initials + '</div>' +
          '<div class="profile-name-wrap">' +
            '<div class="profile-fullname">' + fullName + '</div>' +
            '<div class="profile-email">' + (user.email||'') + '</div>' +
            '<div class="profile-role-tag">' + roleLabel + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="profile-rows">' + rows + '</div>' +
        '<button class="btn-primary profile-edit-btn" onclick="openEditProfile()">Edit profile</button>' +
      '</div>' +
    '</div>' +
    // Edit modal
    '<div id="editProfileModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000;display:none;align-items:center;justify-content:center;padding:20px">' +
      '<div style="background:#fff;border-radius:20px;padding:28px;width:100%;max-width:420px;max-height:85vh;overflow-y:auto">' +
        '<h3 style="font-size:1rem;font-weight:700;margin-bottom:20px">Edit profile</h3>' +
        '<div class="form-group"><label>Phone</label><input type="tel" id="editPhone" value="' + (user.phone||'') + '" placeholder="+91 98765 43210"/></div>' +
        (!isOrg ? '<div class="form-group"><label>Blood group</label><select id="editBloodGroup"><option value="">Select</option>' + ['A+','A-','B+','B-','O+','O-','AB+','AB-'].map(g=>'<option value="'+g+'"'+(user.bloodGroup===g?' selected':'')+'>'+g+'</option>').join('') + '</select></div>' : '') +
        '<div class="form-group"><label>District</label><select id="editDistrict">' + ['Salem','Chennai','Coimbatore','Madurai','Tiruchirappalli','Tirunelveli','Erode','Vellore','Thoothukudi','Thanjavur','Dharmapuri','Namakkal','Tiruppur'].map(d=>'<option value="'+d+'"'+(user.district===d?' selected':'')+'>'+d+'</option>').join('') + '</select></div>' +
        (isOrg ? '<div class="form-group"><label>Address</label><input type="text" id="editAddress" value="'+(user.address||'')+'" placeholder="Hospital/Bank address"/></div>' : '') +
        (isOrg ? '<div class="form-group"><label>Working hours</label><input type="text" id="editHours" value="'+(user.workingHours||'')+'" placeholder="Open 24 hours"/></div>' : '') +
        '<div id="editProfileAlert" class="form-alert" style="display:none"></div>' +
        '<div style="display:flex;gap:10px;margin-top:16px">' +
          '<button class="btn-ghost" onclick="closeEditProfile()" style="flex:1">Cancel</button>' +
          '<button class="btn-primary" onclick="saveProfile()" style="flex:1">Save changes</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  const sec = document.getElementById('sectionProfile');
  let contentEl = sec.querySelector('#profileContent');
  if (!contentEl) { contentEl = document.createElement('div'); contentEl.id = 'profileContent'; sec.appendChild(contentEl); }
  contentEl.innerHTML = html;
}

function profileRow(label, value, bg) {
  return '<div class="profile-row" style="background:' + (bg||'var(--bg)') + '">' +
    '<span class="profile-row-label">' + label + '</span>' +
    '<span class="profile-row-value">' + value + '</span>' +
  '</div>';
}

function openEditProfile() {
  const modal = document.getElementById('editProfileModal');
  if (modal) { modal.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
}
function closeEditProfile() {
  const modal = document.getElementById('editProfileModal');
  if (modal) { modal.style.display = 'none'; document.body.style.overflow = ''; }
}

async function saveProfile() {
  const alertEl = document.getElementById('editProfileAlert');
  if (alertEl) alertEl.style.display = 'none';
  const updates = {};
  const phoneEl = document.getElementById('editPhone');
  const bgEl    = document.getElementById('editBloodGroup');
  const distEl  = document.getElementById('editDistrict');
  const addrEl  = document.getElementById('editAddress');
  const hoursEl = document.getElementById('editHours');
  if (phoneEl) updates.phone        = phoneEl.value.trim();
  if (bgEl)    updates.bloodGroup   = bgEl.value;
  if (distEl)  updates.district     = distEl.value;
  if (addrEl)  updates.address      = addrEl.value.trim();
  if (hoursEl) updates.workingHours = hoursEl.value.trim();
  try {
    const data = await api.auth.updateProfile(updates);
    if (data.user) localStorage.setItem('bl_user', JSON.stringify(data.user));
    closeEditProfile();
    renderProfile(); // refresh
  } catch(err) {
    if (alertEl) { alertEl.className='form-alert error'; alertEl.textContent=err.message; alertEl.style.display='block'; }
  }
}

/* ═══════════════════════════════════════════
   INIT
═══════════════════════════════════════════ */
/* ── Update sidebar with user data ── */
function updateSidebar(user) {
  if (!user) return;
  const isOrg   = user.role === 'bloodbank' || user.role === 'hospital';
  const name    = isOrg && user.orgName
    ? user.orgName
    : ((user.firstName||'') + ' ' + (user.lastName||'')).trim() || 'User';
  const roleMap = {patient:'Patient', bloodbank:'Blood Bank', hospital:'Hospital', admin:'Admin'};
  const initials = name.trim().split(/\s+/).slice(0,2).map(function(w){return w[0];}).join('').toUpperCase() || '??';

  const nameEl   = document.getElementById('sidebarName')   || document.querySelector('.user-name');
  const avatarEl = document.getElementById('sidebarAvatar') || document.querySelector('.user-avatar');
  const roleEl   = document.getElementById('sidebarRole')   || document.querySelector('.user-role');
  if (nameEl)   nameEl.textContent   = name;
  if (avatarEl) avatarEl.textContent = initials;
  if (roleEl)   roleEl.textContent   = roleMap[user.role] || user.role;
}

(function init() {
  // Connect socket
  if (typeof socketConnect === 'function') socketConnect();

  // Listen for live stock updates
  if (typeof socket !== 'undefined') {
    socket.on('stock:updated', data => {
      updateResultCard(data);
      if (typeof showLiveToast === 'function') {
        showLiveToast(data.bankName + ': ' + data.group + ' → ' + data.units + ' units');
      }
    });
  }

  // Load user info from localStorage (set by api.auth.login / register)
  const user = api.auth.getUser ? api.auth.getUser() : null;
  if (user) {
    // Set sidebar immediately from cache
    updateSidebar(user);

    // Then fetch fresh from server and update again
    api.auth.me().then(function(meData) {
      if (meData && meData.user) {
        localStorage.setItem('bl_user', JSON.stringify(meData.user));
        updateSidebar(meData.user);
      }
    }).catch(function(){});

    // Pre-fill SOS from profile
    const sosName = document.getElementById('sosName');
    const sosDist = document.getElementById('sosDistrict');
    const sosGrp  = document.getElementById('sosGroup');
    if (sosName && user.firstName) sosName.value = user.firstName + ' ' + (user.lastName||'');
    if (sosDist && user.district)  sosDist.value = user.district;
    if (sosGrp  && user.bloodGroup) sosGrp.value = user.bloodGroup;

    // Auto-select user's blood group in search
    if (user.bloodGroup) {
      const gbtn = document.querySelector('.bg-btn[data-group="' + user.bloodGroup + '"]');
      if (gbtn) { gbtn.classList.add('selected'); selectedGroup = user.bloodGroup; }

      // Auto-select in compat too
      setTimeout(() => {
        const cbtn = document.querySelector('#compatGroupBtns .bg-btn[data-group="' + user.bloodGroup + '"]');
        if (cbtn) loadCompat(user.bloodGroup, cbtn);
      }, 400);
    }
  }
})();
