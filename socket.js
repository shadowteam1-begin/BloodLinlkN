/* ═══════════════════════════════════════════
   BLOODLINK TN — FRONTEND SOCKET CLIENT
   js/socket.js

   This file connects your HTML frontend to
   the Socket.io server running on port 8000.

   HOW IT WORKS:
   1. Browser connects to ws://localhost:8000
   2. Patient runs a search → joins a "room"
      e.g.  "search:B+:Salem"
   3. Blood bank saves stock → server emits
      event to that room
   4. Patient's browser receives the event
      and updates the results card instantly
      — no page refresh needed!

   INCLUDE THIS FILE:
   Add to dashboard-patient.html BEFORE dashboard.js:
   <script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>
   <script src="../js/socket.js"></script>
   <script src="../js/dashboard.js"></script>
═══════════════════════════════════════════ */

// ── Server URL (auto-detects dev vs production) ──
const SOCKET_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:8000'
  : 'https://bloodlink-tn-backend.up.railway.app'; // update after Step 8

// ── Create socket connection ──────────────
// io() is provided by the Socket.io CDN script
// autoConnect:false means we connect manually
// after the user logs in
const socket = io(SOCKET_URL, {
  autoConnect:       false,
  reconnection:      true,       // auto-reconnect if server restarts
  reconnectionDelay: 1500,       // wait 1.5s before retry
  reconnectionAttempts: 10,      // try 10 times max
});

// ── Track current search room ─────────────
let currentSearchRoom = null;

// ══════════════════════════════════════════
// CONNECT / DISCONNECT EVENTS
// ══════════════════════════════════════════
socket.on('connect', () => {
  console.log('⚡ Socket connected:', socket.id);
  updateSocketStatus('connected');

  // Re-join search room if page was refreshed
  if (currentSearchRoom) {
    socket.emit('join:search', currentSearchRoom);
  }
});

socket.on('disconnect', (reason) => {
  console.log('❌ Socket disconnected:', reason);
  updateSocketStatus('disconnected');
});

socket.on('connect_error', (err) => {
  console.warn('⚠ Socket connection error:', err.message);
  updateSocketStatus('error');
});

socket.on('reconnect', (attempt) => {
  console.log('🔄 Socket reconnected after', attempt, 'attempts');
  updateSocketStatus('connected');
});

// ══════════════════════════════════════════
// REAL-TIME EVENTS FROM SERVER
// ══════════════════════════════════════════

// ── stock:updated ─────────────────────────
// Fires when a blood bank saves new stock
// for the group + district you're viewing
socket.on('stock:updated', (data) => {
  /*
   data = {
     bankId:    "64abc...",
     bankName:  "Salem Govt Blood Bank",
     district:  "Salem",
     group:     "B+",
     units:     18,
     updatedAt: "2024-01-15T10:30:00.000Z"
   }
  */
  console.log('📦 Stock update received:', data);

  // Find the result card for this bank and update it live
  updateResultCard(data);

  // Show a live notification toast
  showLiveToast(
    data.bankName + ' updated ' + data.group + ' stock: ' + data.units + ' units'
  );
});

// ── bank:status ───────────────────────────
// Fires when a bank opens or closes
socket.on('bank:status', (data) => {
  console.log('🏥 Bank status change:', data);
  // If a bank closes while patient is viewing results,
  // grey out their card
  updateBankStatusCard(data);
});

// ── request:updated ───────────────────────
// Fires when the bank approves/declines a patient's request
socket.on('request:updated', (data) => {
  console.log('📋 Request status update:', data);
  showLiveToast('Your request has been ' + data.status + '!');
  // Refresh the requests section
  if (typeof renderRequests === 'function') {
    // re-fetch from API
    fetchAndRenderRequests();
  }
});

// ══════════════════════════════════════════
// EXPORTED FUNCTIONS
// Called from dashboard.js
// ══════════════════════════════════════════

// Call this after the user logs in
function socketConnect() {
  if (!socket.connected) {
    socket.connect();
  }
}

// Call this when patient runs a search
// Joins the correct room to receive stock updates
function socketJoinSearch(group, district) {
  if (!socket.connected) {
    socket.connect();
    socket.once('connect', () => doJoin(group, district));
  } else {
    doJoin(group, district);
  }
}

function doJoin(group, district) {
  // Leave old room first
  if (currentSearchRoom) {
    socket.emit('leave:search', currentSearchRoom);
  }
  currentSearchRoom = { group, district: district || 'all' };
  socket.emit('join:search', currentSearchRoom);
  console.log('🔍 Joined search room: search:' + group + ':' + (district || 'all'));
}

// Call this for blood bank dashboard
function socketJoinBank(bankId) {
  if (!socket.connected) {
    socket.connect();
    socket.once('connect', () => socket.emit('join:bank', { bankId }));
  } else {
    socket.emit('join:bank', { bankId });
  }
}

// ══════════════════════════════════════════
// DOM UPDATE HELPERS
// These update the UI when socket events arrive
// ══════════════════════════════════════════

// Update a result card's unit count live
function updateResultCard(data) {
  // Find card by bank ID (we set data-bank-id on each card)
  const card = document.querySelector('[data-bank-id="' + data.bankId + '"]');
  if (!card) return; // card not visible (different page)

  // Update units number
  const unitsEl = card.querySelector('.card-units-num');
  if (unitsEl) {
    // Flash animation to draw attention
    unitsEl.style.transition = 'color .3s';
    unitsEl.style.color = '#F59E0B'; // amber flash
    unitsEl.textContent = data.units;
    setTimeout(() => { unitsEl.style.color = ''; }, 1200);
  }

  // Update status badge
  const badge = card.querySelector('.card-status-badge');
  if (badge) {
    let cls, label;
    if      (data.units === 0) { cls = 'status-unavailable'; label = 'Not available'; }
    else if (data.units <= 3)  { cls = 'status-critical';    label = 'Critical';      }
    else if (data.units <= 8)  { cls = 'status-low';         label = 'Low stock';     }
    else                       { cls = 'status-available';   label = 'Available';     }
    badge.className = 'card-status-badge ' + cls;
    badge.textContent = label;
  }

  // Update card border colour
  card.className = card.className.replace(/\b(available|low|critical|unavailable)\b/g, '');
  if      (data.units === 0) card.classList.add('unavailable');
  else if (data.units <= 3)  card.classList.add('critical');
  else if (data.units <= 8)  card.classList.add('low');
  else                       card.classList.add('available');

  // Update "Updated X min ago"
  const timeEl = card.querySelector('.updated-time');
  if (timeEl) timeEl.textContent = 'Updated just now';

  // Update request button
  const reqBtn = card.querySelector('.card-btn-primary');
  if (reqBtn) {
    reqBtn.disabled = data.units === 0;
    reqBtn.textContent = data.units === 0 ? 'Not available' : 'Request blood';
  }
}

// Update bank open/closed badge on result cards
function updateBankStatusCard(data) {
  const card = document.querySelector('[data-bank-id="' + data.bankId + '"]');
  if (!card) return;
  if (!data.isOpen) {
    card.style.opacity = '0.5';
    const badge = card.querySelector('.card-status-badge');
    if (badge) { badge.className = 'card-status-badge status-unavailable'; badge.textContent = 'Closed'; }
  } else {
    card.style.opacity = '1';
  }
}

// Show a small toast notification at the bottom of screen
function showLiveToast(message) {
  // Remove existing toast
  const existing = document.getElementById('liveToast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'liveToast';
  toast.innerHTML = '<span style="font-size:14px">⚡</span> ' + message;
  toast.style.cssText = [
    'position:fixed', 'bottom:24px', 'left:50%',
    'transform:translateX(-50%)',
    'background:#0E0E0E', 'color:#fff',
    'padding:12px 20px', 'border-radius:999px',
    'font-size:0.82rem', 'font-weight:500',
    'font-family:Sora,sans-serif',
    'box-shadow:0 4px 20px rgba(0,0,0,0.25)',
    'z-index:9999',
    'display:flex', 'align-items:center', 'gap:8px',
    'animation:toastIn .3s ease',
    'white-space:nowrap',
  ].join(';');

  // Add animation keyframe once
  if (!document.getElementById('toastStyle')) {
    const style = document.createElement('style');
    style.id = 'toastStyle';
    style.textContent = '@keyframes toastIn{from{opacity:0;transform:translate(-50%,12px)}to{opacity:1;transform:translateX(-50%)}}';
    document.head.appendChild(style);
  }

  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = 'opacity .4s';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 400);
  }, 3500);
}

// Show a small dot indicator in topbar
function updateSocketStatus(status) {
  const dot = document.querySelector('.notif-dot');
  if (!dot) return;
  const colors = { connected: '#22C55E', disconnected: '#EF4444', error: '#F59E0B' };
  dot.style.background = colors[status] || '#EF4444';
  dot.title = 'Socket: ' + status;
}

// Make all functions available globally
window.socketConnect    = socketConnect;
window.socketJoinSearch = socketJoinSearch;
window.socketJoinBank   = socketJoinBank;
window.showLiveToast    = showLiveToast;
