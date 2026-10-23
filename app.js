/* SENKOM PK TAMAN — client
   Set API_URL to the deployed Google Apps Script Web App URL ending in /exec.
   This starter sends JSON POST requests. Test browser CORS after deployment. */
const API_URL = "https://script.google.com/macros/s/AKfycbzRqHkHCZJCmTPYymPEegwFWomwv07EL8KdlWDu4pid9iUfYaCTtb8G24diZLcLhOWhqA/exec";
const $ = (id) => document.getElementById(id);
let session = null;
let cachedRecords = [];
let cachedMembers = [];

const todayISO = () => {
  const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
const dateLabel = (iso=todayISO()) => new Date(`${iso}T12:00:00`).toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
const escapeHTML = (s='') => String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function message(id,text,ok=false){const el=$(id);el.textContent=text;el.className='message'+(ok?' success':'');}
function toast(text){const el=$('toast');el.textContent=text;el.classList.remove('hidden');setTimeout(()=>el.classList.add('hidden'),3200);}
function showView(view){['loginView','memberView','adminView'].forEach(id=>$(id).classList.toggle('hidden',id!==view));}
async function api(action,data={}){
  if(!API_URL || API_URL.includes('PASTE_GOOGLE')) throw new Error('URL Google Apps Script belum dipasang di app.js.');
  const response=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,token:session?.token||'',...data})});
  if(!response.ok) throw new Error(`Server merespons HTTP ${response.status}.`);
  const result=await response.json();
  if(!result.ok) throw new Error(result.error||'Permintaan gagal.');
  return result.data;
}
$('loginForm').addEventListener('submit',async e=>{
  e.preventDefault();message('loginMessage','Memeriksa akun…');
  const btn=e.submitter; if(btn)btn.disabled=true;
  try{
    const result=await api('login',{username:$('username').value.trim(),password:$('password').value});
    session=result; $('password').value='';
    if(result.role==='admin'){showView('adminView');setDefaultDates();await loadAdmin();}
    else{showView('memberView');$('memberGreeting').textContent=`Halo, ${result.name}`;$('todayLabel').textContent=dateLabel();await loadMemberHistory();}
  }catch(err){message('loginMessage',err.message);}
  finally{if(btn)btn.disabled=false;}
});
document.querySelectorAll('[data-logout]').forEach(b=>b.addEventListener('click',()=>{session=null;showView('loginView');message('loginMessage','Anda telah keluar.',true);}));
$('attendanceStatus').addEventListener('change',()=>{
  const isIjin=$('attendanceStatus').value==='Ijin';
  $('reasonWrap').classList.toggle('hidden',!isIjin);
  $('reason').required=isIjin;
});
$('dutyArea').addEventListener('change',()=> $('qrWrap').classList.toggle('hidden',$('dutyArea').value!=='Lokasi pengganti (scan QR)'));
$('submitAttendance').addEventListener('click',async()=>{
  if(!session)return;
  const status=$('attendanceStatus').value,area=$('dutyArea').value,reason=$('reason').value.trim(),qr=$('qrCode').value.trim();
  if(status==='Ijin'&&!reason){message('attendanceMessage','Alasan ijin wajib diisi.');return;}
  if(area==='Lokasi pengganti (scan QR)'&&!qr){message('attendanceMessage','Masukkan kode lokasi dari QR/barcode.');return;}
  const btn=$('submitAttendance');btn.disabled=true;message('attendanceMessage','Mengirim absensi ke server…');
  try{
    const result=await api('attendance',{status,area,reason,qrCode:qr});
    message('attendanceMessage',`Absensi tersimpan pada pukul ${result.time}.`,true);
    toast('Absensi berhasil disimpan.');
    await loadMemberHistory();
  }catch(err){message('attendanceMessage',err.message);}
  finally{btn.disabled=false;}
});
$('refreshMember').addEventListener('click',loadMemberHistory);
$('refreshAdmin').addEventListener('click',loadAdmin);
$('filterReport').addEventListener('click',loadAdmin);
$('addMemberForm').addEventListener('submit',async e=>{
  e.preventDefault();message('addMemberMessage','Menyimpan anggota…');
  try{
    await api('addMember',{
      name:$('newName').value.trim(),
      username:$('newUsername').value.trim(),
      password:$('newPassword').value,
      phone:$('newPhone').value.trim(),
      addressGroup:$('newAddressGroup').value.trim()
    });
    e.target.reset();message('addMemberMessage','Anggota berhasil ditambahkan ke database.',true);await loadAdmin();toast('Akun anggota baru dibuat.');
  }catch(err){message('addMemberMessage',err.message);}
});
function setDefaultDates(){
  $('reportTo').value=todayISO();
  const d=new Date();d.setDate(1);$('reportFrom').value=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
}
async function loadMemberHistory(){
  try{
    const data=await api('myRecords');const rows=data.records||[];
    $('memberHistory').innerHTML=rows.length?tableHTML(['Tanggal','Pukul','Status','Area','Keterangan'],rows.map(r=>[r.date,r.time,r.status,r.area,r.reason||'—'])):'<p class="muted">Belum ada riwayat absensi.</p>';
  }catch(err){$('memberHistory').innerHTML=`<p class="muted">${escapeHTML(err.message)}</p>`;}
}
async function loadAdmin(){
  try{
    const data=await api('adminData',{from:$('reportFrom').value||'',to:$('reportTo').value||''});
    cachedRecords=data.records||[];cachedMembers=data.members||[];
    const today=cachedRecords.filter(r=>r.date===todayISO());
    const present=today.filter(r=>r.status==='Hadir').length,excused=today.filter(r=>r.status==='Ijin').length;
    $('statMembers').textContent=cachedMembers.length;
    $('statPresent').textContent=present;
    $('statExcused').textContent=excused;
    $('statPercent').textContent=(cachedMembers.length?Math.round(present/cachedMembers.length*100):0)+'%';
    $('adminSummary').innerHTML=`<span class="summary-chip">Total catatan: <b>${cachedRecords.length}</b></span><span class="summary-chip">Hadir: <b>${cachedRecords.filter(r=>r.status==='Hadir').length}</b></span><span class="summary-chip">Ijin: <b>${cachedRecords.filter(r=>r.status==='Ijin').length}</b></span>`;
    $('adminRecords').innerHTML=tableHTML(['Tanggal','Pukul','Nama','Username','Status','Area','Alasan / Kode lokasi'],cachedRecords.map(r=>[r.date,r.time,r.name,r.username,r.status,r.area,[r.reason,r.qrCode?`QR: ${r.qrCode}`:''].filter(Boolean).join(' · ')||'—']));
   
$('membersList').innerHTML=tableHTML(
  [
    'Nama anggota',
    'Username',
    'Nomor HP',
    'Alamat / Kelompok',
    'Total hadir',
    'Total izin',
    'Status'
  ],
  cachedMembers.map(m=>[
    m.name,
    m.username,
    m.phone||'—',
    m.addressGroup||'—',
    `${Number(m.presentCount)||0} kali`,
    `${Number(m.permissionCount)||0} kali`,
    m.active?'Aktif':'Nonaktif'
  ])
);
     
  }catch(err){$('adminRecords').innerHTML=`<p class="muted">${escapeHTML(err.message)}</p>`;}
}
function tableHTML(headers,rows){
  return `<table><thead><tr>${headers.map(h=>`<th>${escapeHTML(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(v=>`<td>${escapeHTML(v??'—')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
$('exportCsv').addEventListener('click',()=>{
  if(!cachedRecords.length){toast('Tidak ada data untuk diekspor.');return;}
  const cols=['date','time','name','username','status','area','reason','qrCode'];
  const csv=[cols.join(','),...cachedRecords.map(r=>cols.map(k=>`"${String(r[k]??'').replace(/"/g,'""')}"`).join(','))].join('\r\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'}));a.download=`rekap-senkom-${todayISO()}.csv`;a.click();URL.revokeObjectURL(a.href);
});
if('serviceWorker' in navigator && location.protocol.startsWith('http')) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.warn));
