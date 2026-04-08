/* ═══════════════════════════════════════════
   BloodLink TN — auth.js v5
   Fixes:
   • Always clears old localStorage before login/register
   • Fetches full /me profile after login/register
   • Hospital → dashboard-patient.html (correct)
   • Blood bank → dashboard-bank.html
   • Pending → pending-approval.html
═══════════════════════════════════════════ */

/* ─── 1. TAB SWITCHING ─────────────────── */
function showTab(tab) {
  const fL = document.getElementById('formLogin');
  const fR = document.getElementById('formRegister');
  const tL = document.getElementById('tabLogin');
  const tR = document.getElementById('tabRegister');
  if (tab === 'login') {
    fL.style.display='block'; fR.style.display='none';
    tL.classList.add('active'); tR.classList.remove('active');
  } else {
    fL.style.display='none'; fR.style.display='block';
    tL.classList.remove('active'); tR.classList.add('active');
  }
}
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('tab') === 'login') showTab('login');

const roleParam = urlParams.get('role');
if (roleParam) {
  showTab('register');
  const ri = document.querySelector('input[name="role"][value="' + roleParam + '"]');
  if (ri) { ri.checked = true; handleRoleChange(roleParam); }
}

/* ─── 2. ROLE SELECTION ────────────────── */
function handleRoleChange(role) {
  const orgGroup     = document.getElementById('orgNameGroup');
  const licenseGroup = document.getElementById('licenseGroup');
  const needsOrg     = role === 'bloodbank' || role === 'hospital';
  orgGroup.style.display     = needsOrg ? 'block' : 'none';
  licenseGroup.style.display = needsOrg ? 'block' : 'none';
  if (needsOrg) {
    document.getElementById('regOrgName').placeholder =
      role === 'bloodbank' ? 'Salem Government Blood Bank' : 'Apollo Hospitals Salem';
    document.getElementById('regLicense').placeholder =
      role === 'bloodbank' ? 'e.g. TN/BB/2024/045' : 'e.g. TN/HOS/2024/112';
  }
}
document.querySelectorAll('input[name="role"]').forEach(r => {
  r.addEventListener('change', () => handleRoleChange(r.value));
});

/* ─── 3. PASSWORD SHOW/HIDE ─────────────── */
function togglePassword(id, btn) {
  const inp = document.getElementById(id);
  inp.type = inp.type === 'password' ? 'text' : 'password';
  btn.textContent = inp.type === 'password' ? 'Show' : 'Hide';
}

/* ─── 4. PASSWORD STRENGTH ──────────────── */
const regPw = document.getElementById('regPassword');
if (regPw) {
  regPw.addEventListener('input', () => {
    const v = regPw.value;
    const meter = document.getElementById('pwStrength');
    const fill  = document.getElementById('strengthFill');
    const label = document.getElementById('strengthLabel');
    if (!v) { meter.style.display = 'none'; return; }
    meter.style.display = 'flex';
    let score = 0;
    if (v.length >= 8) score++;
    if (/[A-Z]/.test(v)) score++;
    if (/[0-9]/.test(v)) score++;
    if (/[^A-Za-z0-9]/.test(v)) score++;
    const lvls = [
      { w:'25%', c:'#EF4444', t:'Weak'   },
      { w:'50%', c:'#F97316', t:'Fair'   },
      { w:'75%', c:'#EAB308', t:'Good'   },
      { w:'100%',c:'#22C55E', t:'Strong' },
    ];
    const l = lvls[score - 1] || lvls[0];
    fill.style.width = l.w; fill.style.background = l.c;
    label.textContent = l.t; label.style.color = l.c;
  });
}

/* ─── 5. VALIDATION HELPERS ─────────────── */
function showError(fId, eId, msg) {
  const f = document.getElementById(fId); const e = document.getElementById(eId);
  if (f) f.classList.add('error'); if (e) e.textContent = msg;
  return false;
}
function clearError(fId, eId) {
  const f = document.getElementById(fId); const e = document.getElementById(eId);
  if (f) f.classList.remove('error'); if (e) e.textContent = '';
}
function clearAll(ids) { ids.forEach(([f,e]) => clearError(f,e)); }
function isEmail(v)  { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function isPhone(v)  { return /^\d{10}$/.test(v.replace(/\s/g,'')); }

/* ─── CLEAR OLD SESSION ─────────────────── */
// Always clear any previously logged-in user before new login/register
function clearPreviousSession() {
  localStorage.removeItem('bl_token');
  localStorage.removeItem('bl_user');
}

/* ─── 6a. LOGIN ──────────────────────────── */
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAll([['loginEmail','loginEmailErr'],['loginPassword','loginPasswordErr']]);

  const email = document.getElementById('loginEmail').value.trim();
  const pw    = document.getElementById('loginPassword').value;
  let ok = true;
  if (!email)          ok = showError('loginEmail','loginEmailErr','Email is required');
  else if (!isEmail(email)) ok = showError('loginEmail','loginEmailErr','Enter a valid email');
  if (!pw)             ok = showError('loginPassword','loginPasswordErr','Password is required');
  else if (pw.length<6) ok = showError('loginPassword','loginPasswordErr','Min 6 characters');
  if (!ok) return;

  setLoading('loginBtn', true);

  try {
    // ★ Clear old session first — prevents wrong profile showing
    clearPreviousSession();

    const data = await api.auth.login(email, pw);
    let user = data.user;

    // ★ Always fetch full profile from DB to get all fields
    try {
      const meData = await api.auth.me();
      if (meData.user) {
        user = meData.user;
        localStorage.setItem('bl_user', JSON.stringify(user));
      }
    } catch(meErr) {
      // Use login response data if /me fails
      console.warn('Could not fetch /me:', meErr.message);
    }

    // Redirect based on role + verification
    if ((user.role === 'bloodbank' || user.role === 'hospital') && !user.isVerified) {
      window.location.href = '../pages/pending-approval.html';
    } else {
      window.location.href = getDashboardUrl(user.role);
    }

  } catch (err) {
    showFormAlert('loginAlert', 'error', err.message);
    setLoading('loginBtn', false);
  }
});

/* ─── 6b. REGISTER ───────────────────────── */
document.getElementById('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAll([
    ['regFirstName','regFirstNameErr'],['regLastName','regLastNameErr'],
    ['regOrgName','regOrgNameErr'],['regLicense','regLicenseErr'],
    ['regEmail','regEmailErr'],['regPhone','regPhoneErr'],
    ['regDistrict','regDistrictErr'],['regPassword','regPasswordErr'],
  ]);

  const role      = document.querySelector('input[name="role"]:checked').value;
  const firstName = document.getElementById('regFirstName').value.trim();
  const lastName  = document.getElementById('regLastName').value.trim();
  const orgName   = document.getElementById('regOrgName').value.trim();
  const license   = document.getElementById('regLicense').value.trim();
  const email     = document.getElementById('regEmail').value.trim();
  const phone     = document.getElementById('regPhone').value.trim();
  const district  = document.getElementById('regDistrict').value;
  const password  = document.getElementById('regPassword').value;
  const terms     = document.getElementById('regTerms').checked;
  const needsOrg  = role === 'bloodbank' || role === 'hospital';
  let ok = true;

  if (!firstName) ok = showError('regFirstName','regFirstNameErr','First name is required');
  if (!lastName)  ok = showError('regLastName','regLastNameErr','Last name is required');
  if (needsOrg && !orgName)  ok = showError('regOrgName','regOrgNameErr','Organisation name is required');
  if (needsOrg && !license)  ok = showError('regLicense','regLicenseErr','Government license number is required');
  else if (needsOrg && license.length < 4) ok = showError('regLicense','regLicenseErr','Enter a valid license number (min 4 chars)');
  if (!email)          ok = showError('regEmail','regEmailErr','Email is required');
  else if (!isEmail(email)) ok = showError('regEmail','regEmailErr','Enter a valid email');
  if (!phone)          ok = showError('regPhone','regPhoneErr','Phone is required');
  else if (!isPhone(phone)) ok = showError('regPhone','regPhoneErr','Enter a valid 10-digit number');
  if (!district)  ok = showError('regDistrict','regDistrictErr','Please select district');
  if (!password)  ok = showError('regPassword','regPasswordErr','Password is required');
  else if (password.length < 8) ok = showError('regPassword','regPasswordErr','Min 8 characters');
  if (!terms) { document.getElementById('regTermsErr').textContent = 'You must accept the terms'; ok = false; }
  if (!ok) return;

  setLoading('registerBtn', true);

  try {
    // ★ Clear old session first
    clearPreviousSession();

    const data = await api.auth.register({
      firstName, lastName, orgName, licenseNumber: license,
      email, phone, district, password, role,
    });
    let user = data.user;

    // ★ Fetch full profile from DB
    try {
      const meData = await api.auth.me();
      if (meData.user) {
        user = meData.user;
        localStorage.setItem('bl_user', JSON.stringify(user));
      }
    } catch(meErr) {
      console.warn('Could not fetch /me:', meErr.message);
    }

    // Redirect
    if ((user.role === 'bloodbank' || user.role === 'hospital') && !user.isVerified) {
      window.location.href = '../pages/pending-approval.html';
    } else {
      window.location.href = getDashboardUrl(user.role);
    }

  } catch (err) {
    showFormAlert('registerAlert', 'error', err.message);
    setLoading('registerBtn', false);
  }
});

/* ─── HELPERS ──────────────────────────── */
function setLoading(id, on) {
  const b = document.getElementById(id);
  if (!b) return;
  b.disabled = on;
  const text   = b.querySelector('.btn-text');
  const loader = b.querySelector('.btn-loader');
  if (text)   text.style.display   = on ? 'none'   : 'inline';
  if (loader) loader.style.display = on ? 'inline' : 'none';
}

function showFormAlert(id, type, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = 'form-alert ' + type;
  el.textContent = msg;
  el.style.display = 'block';
  el.scrollIntoView({ behavior:'smooth', block:'nearest' });
}

function getDashboardUrl(role) {
  // ★ Hospital uses PATIENT dashboard (they search + request blood, not manage stock)
  const map = {
    patient:   '../pages/dashboard-patient.html',
    bloodbank: '../pages/dashboard-bank.html',
    hospital:  '../pages/dashboard-patient.html', // same UI as patient
    admin:     '../pages/dashboard-admin.html',
  };
  return map[role] || '../index.html';
}
