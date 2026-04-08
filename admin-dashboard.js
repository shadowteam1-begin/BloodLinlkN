/* ═══════════════════════════════════════════
   BLOODLINK TN — ADMIN DASHBOARD JS v3
   Full details: patients, blood banks,
   hospitals, requests, donations, payments.
   Auto-approve countdown for pending banks.
   Manual approve + socket notification.
═══════════════════════════════════════════ */

/* ── State ── */
let allPatients  = [];
let allBanks     = [];
let allHospitals = [];

/* ── Clock ── */
function updateClock() {
  const el = document.getElementById('topbarTime');
  if (el) el.textContent = new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true});
}
updateClock(); setInterval(updateClock, 30000);

/* ── Sidebar ── */
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
document.getElementById('menuBtn').addEventListener('click',()=>{sidebar.classList.add('open');sidebarOverlay.classList.add('open');});
document.getElementById('sidebarClose').addEventListener('click',closeSidebar);
function closeSidebar(){sidebar.classList.remove('open');sidebarOverlay.classList.remove('open');}

/* ── Navigation ── */
const NAV = {
  overview:  {id:'sectionOverview',  title:'Overview'      },
  banks:     {id:'sectionBanks',     title:'Blood banks'   },
  hospitals: {id:'sectionHospitals', title:'Hospitals'     },
  patients:  {id:'sectionPatients',  title:'Patients'      },
  requests:  {id:'sectionRequests',  title:'Requests'      },
  donations: {id:'sectionDonations', title:'Donations'     },
  payments:  {id:'sectionPayments',  title:'Payments'      },
  broadcast: {id:'sectionBroadcast', title:'Broadcast SMS' },
};

function showSection(key) {
  document.querySelectorAll('.dash-section').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const m=NAV[key]; if(!m) return;
  document.getElementById(m.id).classList.add('active');
  document.getElementById('topbarTitle').textContent=m.title;
  const nav=document.querySelector('.nav-item[data-section="'+key+'"]');
  if(nav) nav.classList.add('active');
  closeSidebar();
  if(key==='overview')  loadOverview();
  if(key==='banks')     loadBanks('all',null);
  if(key==='hospitals') loadHospitals();
  if(key==='patients')  loadPatients();
  if(key==='requests')  loadRequests('',null);
  if(key==='donations') loadDonations();
  if(key==='payments')  loadPayments();
}
document.querySelectorAll('.nav-item').forEach(item=>{
  item.addEventListener('click',e=>{e.preventDefault();showSection(item.getAttribute('data-section'));});
});

/* ── Helpers ── */
function fmt(n){return(n||0).toLocaleString('en-IN');}
function inr(n){return '₹'+fmt(n);}
function ago(iso){
  if(!iso) return '—';
  const d=Math.floor((Date.now()-new Date(iso))/60000);
  if(d<1)return'Just now';if(d<60)return d+'m ago';
  if(d<1440)return Math.floor(d/60)+'h ago';return Math.floor(d/1440)+'d ago';
}
function fmtDate(iso){
  if(!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
}
function badge(text,cls){return '<span class="tbl-badge badge-'+cls+'">'+(text||'—')+'</span>';}
function tblWrap(headers,rows){
  return '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>'+
    headers.map(h=>'<th>'+h+'</th>').join('')+
    '</tr></thead><tbody>'+rows.join('')+'</tbody></table></div>';
}
function tblLoading(id){document.getElementById(id).innerHTML='<div class="tbl-loading">Loading...</div>';}
function tblEmpty(id,msg){document.getElementById(id).innerHTML='<div class="tbl-empty"><h3>'+msg+'</h3><p>No records found.</p></div>';}
function tblError(id,msg){document.getElementById(id).innerHTML='<div class="tbl-empty"><h3>Could not load</h3><p>'+msg+'</p><p style="margin-top:6px;font-size:.72rem;color:var(--muted)">Is backend running? (npm run dev)</p></div>';}

/* ── Countdown to auto-approve ── */
function autoApproveCountdown(autoApproveAt) {
  if (!autoApproveAt) return '<span style="color:var(--muted);font-size:.75rem">—</span>';
  const ms = new Date(autoApproveAt) - Date.now();
  if (ms <= 0) return badge('Auto-approved','approved');
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return '<span style="font-size:.75rem;color:#F59E0B;font-weight:600">⏱ ' + h + 'h ' + m + 'm</span>';
}

/* ─────────────────────────────────────────
   OVERVIEW
───────────────────────────────────────── */
async function loadOverview() {
  try {
    // Load stats + hospitals count
    const [statsData, hospData] = await Promise.all([
      api.admin.stats(),
      api.admin.users('hospital').catch(()=>({users:[]})),
    ]);
    const s = statsData.stats;
    const hospitalCount = (hospData.users||[]).length;

    setNum('s-patients',  s.users.patients);
    setNum('s-banks',     s.users.banks);
    setNum('s-hospitals', hospitalCount);
    setNum('s-pending',   s.users.pendingApproval);
    setNum('s-units',     s.blood.totalUnits);
    setNum('s-requests',  s.requests.total);
    setNum('s-alerts',    s.alerts.active);
    document.getElementById('s-raised').textContent = inr(s.payments.totalRaised);

    const pb = document.getElementById('pendingBadge');
    if (s.users.pendingApproval > 0) { pb.textContent=s.users.pendingApproval; pb.style.display='flex'; }
    else pb.style.display='none';

    await loadPendingPreview();
    await loadRecentPreview();
  } catch(err) { showTopError(err.message); }
}

function setNum(id,val){
  const el=document.getElementById(id); if(!el)return;
  let cur=0; const target=parseInt(val)||0;
  const step=Math.max(1,Math.ceil(target/40));
  const t=setInterval(()=>{cur=Math.min(cur+step,target);el.textContent=fmt(cur);if(cur>=target)clearInterval(t);},18);
}

async function loadPendingPreview(){
  const wrap=document.getElementById('pendingPreview');
  try{
    const data=await api.admin.users('bloodbank',false);
    const banks=(data.users||[]);
    if(!banks.length){wrap.innerHTML='<p class="pending-empty">✓ No pending approvals</p>';return;}
    wrap.innerHTML=banks.slice(0,4).map(b=>`
      <div class="pending-bank-card">
        <div class="pending-avatar">${initials(b.orgName||b.firstName)}</div>
        <div class="pending-info">
          <div class="pending-name">${b.orgName||b.firstName+' '+b.lastName}</div>
          <div class="pending-sub">${b.district||'—'} · ${b.licenseNumber||'No license'} · ${ago(b.createdAt)} · Auto: ${autoApproveCountdown(b.autoApproveAt)}</div>
        </div>
        <div class="tbl-actions">
          <button class="tbl-action approve" onclick="quickApprove('${b._id}',this)">Approve now</button>
          <button class="tbl-action delete"  onclick="quickDelete('${b._id}','${(b.orgName||b.firstName).replace(/'/g,'')}',this)">Reject</button>
        </div>
      </div>`).join('');
  }catch(err){wrap.innerHTML='<p class="pending-empty" style="color:var(--red)">'+err.message+'</p>';}
}

async function loadRecentPreview(){
  const wrap=document.getElementById('recentRequestsPreview');
  try{
    const data=await api.admin.requests('');
    const list=(data.requests||[]).slice(0,5);
    if(!list.length){wrap.innerHTML='<p class="pending-empty">No requests yet.</p>';return;}
    const stCls={pending:'pending',approved:'approved',rejected:'rejected'};
    wrap.innerHTML=tblWrap(
      ['Patient','Blood bank','Group','Units','Status','Time'],
      list.map(r=>`<tr>
        <td><div class="tbl-name">${r.patient?r.patient.firstName+' '+r.patient.lastName:'—'}</div><div class="tbl-sub">${r.patient?.district||''}</div></td>
        <td>${r.bank?.orgName||'—'}</td>
        <td>${badge(r.bloodGroup,'verified')}</td>
        <td class="tbl-num">${r.units}</td>
        <td>${badge(r.status,stCls[r.status]||'pending')}</td>
        <td>${ago(r.createdAt)}</td>
      </tr>`)
    );
  }catch(err){wrap.innerHTML='<p class="pending-empty" style="color:var(--red)">'+err.message+'</p>';}
}

/* ─────────────────────────────────────────
   BLOOD BANKS — FULL DETAILS
───────────────────────────────────────── */
async function loadBanks(filter,btn){
  if(btn){
    document.querySelectorAll('#sectionBanks .req-tab').forEach(t=>t.classList.remove('active'));
    btn.classList.add('active');
  }
  tblLoading('banksList');
  try{
    let data;
    if(filter==='pending')      data=await api.admin.users('bloodbank',false);
    else if(filter==='verified')data=await api.admin.users('bloodbank',true);
    else                        data=await api.admin.banks();

    const banks=(data.banks||data.users||[]);
    allBanks=banks;
    if(!banks.length){tblEmpty('banksList','No blood banks found');return;}

    const rows=banks.map(b=>{
      const stock=b.stock;
      const chips=stock
        ? ['A+','B+','O+','AB+'].map(g=>{const u=stock[g]||0;return '<span class="stock-chip '+(u>8?'chip-ok':u>0?'chip-low':'chip-zero')+'">'+g+':'+u+'</span>';}).join('')
        : '<span style="color:var(--muted);font-size:.72rem">No stock data</span>';
      const blockLbl=b.isVerified?'Block':'Unblock';
      const blockCls=b.isVerified?'block':'unblock';
      const approvalStatus = b.isVerified
        ? badge('Verified '+(b.approvedBy==='auto'?'(auto)':'(admin)'),'verified')
        : badge('Pending','pending') + ' ' + autoApproveCountdown(b.autoApproveAt);

      return `<tr>
        <td>
          <div class="tbl-name">${b.orgName||b.firstName}</div>
          <div class="tbl-sub">${b.email}</div>
        </td>
        <td>${b.district||'—'}</td>
        <td>
          <div style="font-size:.8rem">${b.address||'—'}</div>
          <div class="tbl-sub">${b.phone||'—'} · ${b.workingHours||'—'}</div>
        </td>
        <td>
          <div class="tbl-sub" style="font-family:var(--font-mono);font-size:.75rem">${b.licenseNumber||'—'}</div>
        </td>
        <td>${approvalStatus} ${badge(b.isOpen?'Open':'Closed',b.isOpen?'open':'closed')}</td>
        <td><div class="stock-mini">${chips}</div></td>
        <td>${ago(b.createdAt)}</td>
        <td>
          <div class="tbl-actions">
            ${!b.isVerified?'<button class="tbl-action approve" onclick="adminVerify(\''+b._id+'\',this)">Approve</button>':''}
            <button class="tbl-action ${blockCls}" onclick="adminBlock('${b._id}',this)">${blockLbl}</button>
            <button class="tbl-action delete" onclick="adminDelete('${b._id}','bank',this)">Delete</button>
          </div>
        </td>
      </tr>`;
    });
    document.getElementById('banksList').innerHTML=tblWrap(
      ['Name / Email','District','Address / Phone','License No.','Status','Stock','Registered','Actions'],
      rows
    );
  }catch(err){tblError('banksList',err.message);}
}

/* ─────────────────────────────────────────
   HOSPITALS — FULL DETAILS
───────────────────────────────────────── */
async function loadHospitals(){
  tblLoading('hospitalsList');
  try{
    const data=await api.admin.users('hospital');
    const hosts=(data.users||[]);
    allHospitals=hosts;
    if(!hosts.length){tblEmpty('hospitalsList','No hospitals registered');return;}

    const rows=hosts.map(h=>{
      const blockLbl=h.isVerified?'Block':'Unblock';
      const blockCls=h.isVerified?'block':'unblock';
      const approvalStatus=h.isVerified
        ? badge('Active '+(h.approvedBy==='auto'?'(auto)':'(admin)'),'verified')
        : badge('Pending','pending')+' '+autoApproveCountdown(h.autoApproveAt);
      return `<tr>
        <td>
          <div class="tbl-name">${h.orgName||(h.firstName+' '+h.lastName)}</div>
          <div class="tbl-sub">${h.email}</div>
        </td>
        <td>${h.district||'—'}</td>
        <td>
          <div style="font-size:.8rem">${h.address||'—'}</div>
          <div class="tbl-sub">${h.phone||'—'}</div>
        </td>
        <td>
          <div style="font-family:var(--font-mono);font-size:.75rem">${h.licenseNumber||'—'}</div>
        </td>
        <td>${approvalStatus}</td>
        <td>${ago(h.createdAt)}</td>
        <td>
          <div class="tbl-actions">
            ${!h.isVerified?'<button class="tbl-action approve" onclick="adminVerify(\''+h._id+'\',this)">Approve</button>':''}
            <button class="tbl-action ${blockCls}" onclick="adminBlock('${h._id}',this)">${blockLbl}</button>
            <button class="tbl-action delete" onclick="adminDelete('${h._id}','hospital',this)">Delete</button>
          </div>
        </td>
      </tr>`;
    });
    document.getElementById('hospitalsList').innerHTML=tblWrap(
      ['Organisation / Email','District','Address / Phone','License No.','Status','Joined','Actions'],
      rows
    );
  }catch(err){tblError('hospitalsList',err.message);}
}

/* ─────────────────────────────────────────
   PATIENTS — FULL DETAILS
───────────────────────────────────────── */
async function loadPatients(){
  tblLoading('patientsList');
  try{
    const data=await api.admin.users('patient');
    allPatients=data.users||[];
    renderPatients(allPatients);
  }catch(err){tblError('patientsList',err.message);}
}

function renderPatients(list){
  if(!list.length){tblEmpty('patientsList','No patients found');return;}
  const rows=list.map(p=>{
    const blockLbl=p.isVerified?'Block':'Unblock';
    const blockCls=p.isVerified?'block':'unblock';
    return `<tr>
      <td>
        <div class="tbl-name">${p.firstName} ${p.lastName}</div>
        <div class="tbl-sub">${p.email}</div>
      </td>
      <td>${p.phone||'—'}</td>
      <td>${p.district||'—'}</td>
      <td>${p.bloodGroup?badge(p.bloodGroup,'verified'):'<span style="color:var(--muted)">—</span>'}</td>
      <td>${badge(p.isVerified?'Active':'Blocked',p.isVerified?'verified':'blocked')}</td>
      <td>${fmtDate(p.createdAt)}</td>
      <td>
        <div class="tbl-actions">
          <button class="tbl-action ${blockCls}" onclick="adminBlock('${p._id}',this)">${blockLbl}</button>
          <button class="tbl-action delete" onclick="adminDelete('${p._id}','patient',this)">Delete</button>
        </div>
      </td>
    </tr>`;
  });
  document.getElementById('patientsList').innerHTML=tblWrap(
    ['Name / Email','Phone','District','Blood group','Status','Joined','Actions'],
    rows
  );
}

function filterPatients(q){
  const ql=q.toLowerCase();
  renderPatients(allPatients.filter(p=>
    (p.firstName+' '+p.lastName).toLowerCase().includes(ql)||
    (p.email||'').toLowerCase().includes(ql)||
    (p.district||'').toLowerCase().includes(ql)||
    (p.bloodGroup||'').toLowerCase().includes(ql)||
    (p.phone||'').includes(ql)
  ));
}

/* ─────────────────────────────────────────
   REQUESTS — FULL DETAILS
───────────────────────────────────────── */
async function loadRequests(status,btn){
  if(btn){
    document.querySelectorAll('#sectionRequests .req-tab').forEach(t=>t.classList.remove('active'));
    btn.classList.add('active');
  }
  tblLoading('requestsList');
  try{
    const data=await api.admin.requests(status);
    const list=data.requests||[];
    if(!list.length){tblEmpty('requestsList','No requests found');return;}

    const uCls={normal:'',urgent:'badge-pending',critical:'badge-blocked'};
    const sCls={pending:'pending',approved:'approved',rejected:'rejected'};
    const rows=list.map(r=>`<tr>
      <td>
        <div class="tbl-name">${r.patient?r.patient.firstName+' '+r.patient.lastName:'—'}</div>
        <div class="tbl-sub">${r.patient?.phone||''} · ${r.patient?.district||''}</div>
      </td>
      <td>
        <div class="tbl-name">${r.bank?.orgName||'—'}</div>
        <div class="tbl-sub">${r.bank?.district||''} · ${r.bank?.phone||''}</div>
      </td>
      <td>${badge(r.bloodGroup,'verified')}</td>
      <td class="tbl-num">${r.units}</td>
      <td>${r.urgency!=='normal'?badge(r.urgency,uCls[r.urgency]):'<span style="color:var(--muted);font-size:.72rem">Normal</span>'}</td>
      <td>${badge(r.status,sCls[r.status]||'pending')}</td>
      <td style="font-size:.75rem;color:var(--muted);max-width:180px">${r.note?r.note.slice(0,60)+(r.note.length>60?'…':''):'—'}</td>
      <td>${fmtDate(r.createdAt)}</td>
    </tr>`);
    document.getElementById('requestsList').innerHTML=tblWrap(
      ['Patient / Phone','Blood bank / Phone','Group','Units','Urgency','Status','Note','Date'],
      rows
    );
  }catch(err){tblError('requestsList',err.message);}
}

/* ─────────────────────────────────────────
   DONATIONS
───────────────────────────────────────── */
async function loadDonations(){
  tblLoading('donationsList');
  try{
    const data=await api.admin.donations();
    const list=data.donations||[];
    if(!list.length){tblEmpty('donationsList','No blood donations yet');return;}
    const rows=list.map(d=>`<tr>
      <td>
        <div class="tbl-name">${d.bank?.orgName||'—'}</div>
        <div class="tbl-sub">${d.bank?.district||''}</div>
      </td>
      <td>${badge(d.bloodGroup,'verified')}</td>
      <td class="tbl-num">${d.units}</td>
      <td>${d.donorName||'Anonymous'}</td>
      <td>${d.donorPhone||'—'}</td>
      <td>${d.donorAge?d.donorAge+' yrs':'—'}</td>
      <td style="font-size:.75rem;color:var(--muted)">${d.notes||'—'}</td>
      <td>${fmtDate(d.donatedAt)}</td>
    </tr>`);
    document.getElementById('donationsList').innerHTML=tblWrap(
      ['Blood bank','Group','Units','Donor name','Phone','Age','Notes','Date'],
      rows
    );
  }catch(err){tblError('donationsList',err.message);}
}

/* ─────────────────────────────────────────
   PAYMENTS
───────────────────────────────────────── */
async function loadPayments(){
  tblLoading('paymentsList');
  try{
    const data=await api.admin.payments();
    document.getElementById('raisedAmount').textContent=inr(data.totalRaised||0);
    document.getElementById('raisedCount').textContent=data.count||0;
    const list=data.payments||[];
    if(!list.length){tblEmpty('paymentsList','No payments yet');return;}
    const rows=list.map(p=>`<tr>
      <td>
        <div class="tbl-name">${p.donor.name}</div>
        <div class="tbl-sub">${p.donor.email}</div>
      </td>
      <td>${p.donor.phone||'—'}</td>
      <td class="tbl-num" style="color:#15803D;font-weight:700">${inr(p.amount)}</td>
      <td style="font-size:.78rem;color:var(--muted)">${p.message||'—'}</td>
      <td>${badge(p.status,p.status==='paid'?'approved':'pending')}</td>
      <td>${fmtDate(p.paidAt||p.createdAt)}</td>
    </tr>`);
    document.getElementById('paymentsList').innerHTML=tblWrap(
      ['Donor / Email','Phone','Amount','Message','Status','Date'],
      rows
    );
  }catch(err){tblError('paymentsList',err.message);}
}

/* ─────────────────────────────────────────
   BROADCAST SMS
───────────────────────────────────────── */
document.getElementById('bcMessage').addEventListener('input',function(){
  document.getElementById('charCount').textContent=this.value.length;
});
async function sendBroadcast(){
  const message=document.getElementById('bcMessage').value.trim();
  const district=document.getElementById('bcDistrict').value;
  const bloodGroup=document.getElementById('bcBloodGroup').value;
  const alertEl=document.getElementById('broadcastAlert');
  alertEl.style.display='none';
  if(!message){alertEl.className='form-alert error';alertEl.textContent='Please enter a message.';alertEl.style.display='block';return;}
  try{
    const data=await api.admin.broadcast({message,district:district||undefined,bloodGroup:bloodGroup||undefined});
    alertEl.className='form-alert success';
    alertEl.textContent='✓ Sent to '+data.sent+' patient(s)'+(data.sent<data.total?' ('+( data.total-data.sent)+' no phone)':'');
    alertEl.style.display='block';
    document.getElementById('bcMessage').value='';
    document.getElementById('charCount').textContent='0';
  }catch(err){alertEl.className='form-alert error';alertEl.textContent=err.message;alertEl.style.display='block';}
}

/* ─────────────────────────────────────────
   SHARED ACTIONS
───────────────────────────────────────── */
async function adminVerify(id,btn){
  btn.disabled=true;btn.textContent='...';
  try{
    await api.admin.verify(id);
    btn.textContent='✓ Approved';btn.className='tbl-action';btn.disabled=false;
    loadPendingPreview();
    const pb=document.getElementById('pendingBadge');
    const cur=parseInt(pb.textContent)||0;
    if(cur<=1)pb.style.display='none'; else pb.textContent=cur-1;
    setTimeout(()=>loadBanks('all',null),400);
  }catch(err){btn.textContent='Approve';btn.disabled=false;alert(err.message);}
}
async function quickApprove(id,btn){await adminVerify(id,btn);}

async function adminBlock(id,btn){
  if(!confirm('Toggle block status for this user?'))return;
  btn.disabled=true;
  try{
    const data=await api.admin.block(id);
    const active=data.isVerified;
    btn.textContent=active?'Block':'Unblock';
    btn.className='tbl-action '+(active?'block':'unblock');
  }catch(err){alert(err.message);}
  btn.disabled=false;
}
async function adminDelete(id,type,btn){
  if(!confirm('Delete this '+type+'? Cannot be undone.'))return;
  btn.disabled=true;btn.textContent='...';
  try{
    await api.admin.deleteUser(id);
    const row=btn.closest('tr')||btn.closest('.pending-bank-card');
    if(row){row.style.opacity='0.3';row.style.pointerEvents='none';}
    btn.textContent='Deleted';
  }catch(err){btn.disabled=false;btn.textContent='Delete';alert(err.message);}
}
async function quickDelete(id,name,btn){
  if(!confirm('Reject and delete '+name+'?'))return;
  btn.disabled=true;btn.textContent='...';
  try{await api.admin.deleteUser(id);btn.closest('.pending-bank-card').remove();}
  catch(err){btn.disabled=false;btn.textContent='Reject';alert(err.message);}
}

function showTopError(msg){
  const sec=document.getElementById('sectionOverview');
  let el=document.getElementById('adminTopErr');
  if(!el){el=document.createElement('div');el.id='adminTopErr';el.className='form-alert error';el.style.marginBottom='16px';sec.insertBefore(el,sec.firstChild);}
  el.textContent='⚠ Backend unreachable: '+msg+' — run: npm run dev';
  el.style.display='block';
  setTimeout(()=>el.style.display='none',10000);
}
function initials(name){return(name||'BB').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();}

/* ─────────────────────────────────────────
   INIT
───────────────────────────────────────── */
(function init(){
  if(typeof socketConnect==='function') socketConnect();
  if(typeof socket!=='undefined'){
    socket.on('connect',()=>socket.emit('join:admin'));

    // Live notification when admin approves an account
    socket.on('account:approved',(data)=>{
      if(typeof showLiveToast==='function')
        showLiveToast((data.orgName||'Account')+' auto-approved ✓');
      loadPendingPreview();
      const pb=document.getElementById('pendingBadge');
      const cur=parseInt(pb.textContent)||0;
      if(cur<=1)pb.style.display='none'; else pb.textContent=cur-1;
    });
  }
  const user = api.auth.getUser ? api.auth.getUser() : null;
  if (user) {
    const fullName = ((user.firstName||'') + ' ' + (user.lastName||'')).trim() || 'Admin';
    const initials = ((user.firstName||'A')[0] + (user.lastName||'D')[0]).toUpperCase();

    const nameEl   = document.getElementById('sidebarName')   || document.getElementById('adminName') || document.querySelector('.user-name');
    const avatarEl = document.getElementById('sidebarAvatar') || document.querySelector('.user-avatar');
    const roleEl   = document.getElementById('sidebarRole')   || document.querySelector('.user-role');

    if (nameEl)   nameEl.textContent   = fullName;
    if (avatarEl) avatarEl.textContent = initials;
    if (roleEl)   roleEl.textContent   = 'Super Admin';
  }
  loadOverview();
})();
