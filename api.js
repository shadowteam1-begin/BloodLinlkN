/* ═══════════════════════════════════════════
   BloodLink TN — api.js v4.0
   Port: 8000 (local dev) | Railway (prod)
   All endpoints. All errors handled.
═══════════════════════════════════════════ */

// Auto-detect: localhost:8000 in dev, Railway URL in production
const PROD_URL  = 'https://bloodlink-tn-backend.up.railway.app';
const BASE_URL  = (window.location.hostname === 'localhost' ||
                   window.location.hostname === '127.0.0.1')
  ? 'http://localhost:8000/api'
  : PROD_URL + '/api';

function getToken() {
  return localStorage.getItem('bl_token') || '';
}

function getUser() {
  try { return JSON.parse(localStorage.getItem('bl_user') || 'null'); }
  catch(e) { return null; }
}

async function apiFetch(path, opts = {}) {
  const token = getToken();
  try {
    const res = await fetch(BASE_URL + path, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': 'Bearer ' + token } : {}),
        ...(opts.headers || {}),
      },
      ...opts,
    });

    let data;
    try { data = await res.json(); }
    catch(e) { throw new Error('Server returned invalid response (status ' + res.status + ')'); }

    if (!res.ok) throw new Error(data.msg || 'Request failed (' + res.status + ')');
    return data;

  } catch(err) {
    // Network error — server not running
    if (err.name === 'TypeError' && (err.message.includes('fetch') || err.message.includes('Failed'))) {
      throw new Error(
        'Cannot connect to server.\n\n' +
        '▶ Make sure backend is running:\n' +
        '  cd blood-alert-backend\n' +
        '  npm install\n' +
        '  npm run dev\n\n' +
        '▶ Server should be at: http://localhost:8000'
      );
    }
    throw err;
  }
}

// ── API Object ────────────────────────────
const api = {

  /* AUTH */
  auth: {
    register: (body) => apiFetch('/auth/register', { method:'POST', body:JSON.stringify(body) }),

    login: async (email, password) => {
      const data = await apiFetch('/auth/login', { method:'POST', body:JSON.stringify({ email, password }) });
      if (data.token) {
        localStorage.setItem('bl_token', data.token);
        localStorage.setItem('bl_user',  JSON.stringify(data.user));
      }
      return data;
    },

    me:     () => apiFetch('/auth/me'),
    status: () => apiFetch('/auth/status'),

    updateProfile: (body) => apiFetch('/auth/me', { method:'PUT', body:JSON.stringify(body) }),

    logout: () => {
      localStorage.removeItem('bl_token');
      localStorage.removeItem('bl_user');
      // Works from any page depth
      const path = window.location.pathname;
      const depth = (path.match(/\//g) || []).length;
      const prefix = depth > 2 ? '../' : '';
      window.location.href = prefix + 'pages/register.html?tab=login';
    },

    isLoggedIn: () => !!getToken(),
    getUser,
  },

  /* BLOOD */
  blood: {
    search: (group, district) => {
      const p = new URLSearchParams({ group });
      if (district) p.append('district', district);
      return apiFetch('/blood/search?' + p);
    },
    banks:       (district) => apiFetch('/blood/banks' + (district ? '?district=' + district : '')),
    getStock:    ()          => apiFetch('/blood/stock'),
    updateStock: (obj)       => apiFetch('/blood/stock',  { method:'PUT', body:JSON.stringify(obj) }),
    setStatus:   (open)      => apiFetch('/blood/status', { method:'PUT', body:JSON.stringify({ open }) }),
  },

  /* REQUESTS */
  requests: {
    create: (bankId, bloodGroup, units, urgency, note) =>
      apiFetch('/requests', { method:'POST', body:JSON.stringify({ bankId, bloodGroup, units, urgency, note }) }),
    mine:     ()       => apiFetch('/requests/mine'),
    incoming: (status) => apiFetch('/requests/incoming' + (status ? '?status=' + status : '')),
    respond:  (id, status) =>
      apiFetch('/requests/' + id + '/respond', { method:'PUT', body:JSON.stringify({ status }) }),
  },

  /* ALERTS */
  alerts: {
    get:    ()                      => apiFetch('/alerts'),
    create: (bloodGroup, district)  => apiFetch('/alerts', { method:'POST', body:JSON.stringify({ bloodGroup, district }) }),
    toggle: (id, active)            => apiFetch('/alerts/' + id, { method:'PUT', body:JSON.stringify({ active }) }),
    delete: (id)                    => apiFetch('/alerts/' + id, { method:'DELETE' }),
  },

  /* DONATIONS */
  donations: {
    log: (bloodGroup, units, donorName, donorPhone, donorAge, notes) =>
      apiFetch('/donations', { method:'POST', body:JSON.stringify({ bloodGroup, units, donorName, donorPhone, donorAge, notes }) }),
    mine:  () => apiFetch('/donations/mine'),
    stats: () => apiFetch('/donations/stats'),
  },

  /* PAYMENTS */
  payments: {
    createOrder: (amount, name, email, phone, message) =>
      apiFetch('/payments/create-order', { method:'POST', body:JSON.stringify({ amount, name, email, phone, message }) }),
    verify: (razorpayOrderId, razorpayPaymentId, razorpaySignature, paymentId) =>
      apiFetch('/payments/verify', { method:'POST', body:JSON.stringify({ razorpayOrderId, razorpayPaymentId, razorpaySignature, paymentId }) }),
    total:  () => apiFetch('/payments/total'),
    recent: () => apiFetch('/payments/recent'),
  },

  /* ADMIN */
  admin: {
    stats: () => apiFetch('/admin/stats'),

    users: (role, verified) => {
      const q = [];
      if (role     != null) q.push('role='     + role);
      if (verified != null) q.push('verified=' + verified);
      return apiFetch('/admin/users' + (q.length ? '?' + q.join('&') : ''));
    },

    verify:     (id)   => apiFetch('/admin/users/' + id + '/verify', { method:'PUT' }),
    block:      (id)   => apiFetch('/admin/users/' + id + '/block',  { method:'PUT' }),
    deleteUser: (id)   => apiFetch('/admin/users/' + id,             { method:'DELETE' }),
    banks:      ()     => apiFetch('/admin/banks'),
    requests:   (st)   => apiFetch('/admin/requests'  + (st ? '?status=' + st : '')),
    donations:  ()     => apiFetch('/admin/donations'),
    payments:   ()     => apiFetch('/admin/payments'),
    broadcast:  (body) => apiFetch('/admin/broadcast', { method:'POST', body:JSON.stringify(body) }),
  },

  /* FEATURES */
  features: {
    compatibility: (group) => apiFetch('/features/compatibility' + (group ? '?group=' + encodeURIComponent(group) : '')),
    sos:           (body)  => apiFetch('/features/sos',          { method:'POST', body:JSON.stringify(body) }),
    publicStats:   ()      => apiFetch('/features/stats/public'),
  },
};

// Global exports — available to all scripts on same page
window.api      = api;
window.apiFetch = apiFetch;
window.getUser  = getUser;
window.BASE_URL = BASE_URL;
