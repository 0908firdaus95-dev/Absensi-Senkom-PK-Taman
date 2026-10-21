/**
 * SENKOM PK TAMAN — Google Apps Script backend
 * Spreadsheet tabs created automatically: Users, Attendance, Settings.
 *
 * Setup:
 * 1) Create a Google Spreadsheet.
 * 2) Extensions > Apps Script, paste this file into Code.gs.
 * 3) Set SPREADSHEET_ID below to the ID between /d/ and /edit in the sheet URL.
 * 4) Run setup() once from the Apps Script editor and approve permissions.
 * 5) Deploy > New deployment > Web app; Execute as: Me; Who has access: Anyone.
 * 6) Copy the /exec URL into API_URL in app.js.
 *
 * SECURITY: This is a starter for a small group. Anyone who gets the public API URL
 * can reach the login endpoint. Use strong passwords, limit sharing, and review access.
 * Passwords are salted SHA-256 hashes; sessions are short-lived and held in ScriptCache.
 */
const SPREADSHEET_ID = 'PASTE_SPREADSHEET_ID_HERE';
const SESSION_TTL_SECONDS = 21600; // 6 hours
const USERS_SHEET = 'Users';
const ATTENDANCE_SHEET = 'Attendance';
const SETTINGS_SHEET = 'Settings';

function doGet() {
  return ContentService.createTextOutput('SENKOM PK TAMAN API aktif. Gunakan aplikasi untuk mengakses data.')
    .setMimeType(ContentService.MimeType.TEXT);
}
function doPost(e) {
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = String(req.action || '');
    let data;
    if (action === 'login') data = login_(req.username, req.password);
    else {
      const user = verifySession_(req.token);
      if (action === 'attendance') data = submitAttendance_(user, req);
      else if (action === 'myRecords') data = myRecords_(user);
      else if (action === 'adminData') { requireAdmin_(user); data = adminData_(req.from, req.to); }
      else if (action === 'addMember') { requireAdmin_(user); data = addMember_(req); }
      else throw new Error('Perintah tidak dikenal.');
    }
    return json_({ok:true,data:data});
  } catch (err) {
    return json_({ok:false,error:String(err && err.message || err)});
  }
}
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function ss_() {
  if (SPREADSHEET_ID.indexOf('PASTE_') === 0) throw new Error('SPREADSHEET_ID belum diatur pada Code.gs.');
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}
function setup() {
  const ss=ss_();
  let sh=ss.getSheetByName(USERS_SHEET);
  if(!sh) sh=ss.insertSheet(USERS_SHEET);
  if(sh.getLastRow()===0) sh.appendRow(['userId','name','username','salt','passwordHash','role','active','createdAt']);
  sh.setFrozenRows(1);
  let at=ss.getSheetByName(ATTENDANCE_SHEET);
  if(!at) at=ss.insertSheet(ATTENDANCE_SHEET);
  if(at.getLastRow()===0) at.appendRow(['recordId','timestamp','date','time','userId','name','username','status','area','reason','qrCode']);
  at.setFrozenRows(1);
  let settings=ss.getSheetByName(SETTINGS_SHEET);
  if(!settings) settings=ss.insertSheet(SETTINGS_SHEET);
  if(settings.getLastRow()===0) settings.appendRow(['key','value']);
  settings.setFrozenRows(1);
  // Create initial accounts only if Users sheet contains header only.
  if(sh.getLastRow()===1) {
    const ownerPassword=Utilities.getUuid()+'A9!';
    const adminSalt=Utilities.getUuid();
    sh.appendRow([Utilities.getUuid(),'Pengurus SENKOM','admin',adminSalt,hash_(ownerPassword,adminSalt),'admin',true,new Date()]);
    settings.appendRow(['INITIAL_ADMIN_PASSWORD',ownerPassword]);
    settings.appendRow(['SETUP_NOTE','Ganti kata sandi awal admin setelah login. Hapus baris INITIAL_ADMIN_PASSWORD setelah dicatat dengan aman.']);
  }
  return 'Setup selesai. Username admin awal: admin. Kata sandi awal ada di tab Settings pada INITIAL_ADMIN_PASSWORD. Catat lalu hapus baris tersebut.';
}
function login_(username,password) {
  if(!username||!password) throw new Error('Username dan kata sandi wajib diisi.');
  const sh=ss_().getSheetByName(USERS_SHEET), rows=sh.getDataRange().getValues();
  const u=String(username).trim().toLowerCase();
  for(let i=1;i<rows.length;i++){
    const r=rows[i];
    if(String(r[2]).toLowerCase()===u && String(r[6]).toLowerCase()!=='false' && r[6]!==false){
      if(hash_(String(password),String(r[3]))!==String(r[4])) break;
      const token=Utilities.getUuid()+Utilities.getUuid();
      CacheService.getScriptCache().put('session_'+token,JSON.stringify({userId:String(r[0]),name:String(r[1]),username:String(r[2]),role:String(r[5])}),SESSION_TTL_SECONDS);
      return {token:token,name:String(r[1]),username:String(r[2]),role:String(r[5])};
    }
  }
  throw new Error('Username atau kata sandi salah, atau akun tidak aktif.');
}
function verifySession_(token) {
  if(!token) throw new Error('Sesi tidak ditemukan. Silakan masuk kembali.');
  const raw=CacheService.getScriptCache().get('session_'+token);
  if(!raw) throw new Error('Sesi berakhir. Silakan masuk kembali.');
  return JSON.parse(raw);
}
function requireAdmin_(user){if(user.role!=='admin')throw new Error('Akses ditolak. Fitur ini khusus pengurus/sekretaris.');}
function submitAttendance_(user,req) {
  const status=String(req.status||'');
  if(!['Hadir','Ijin'].includes(status))throw new Error('Status tidak valid.');
  const area=String(req.area||'');
  if(!['PAM Jaga','Area Amal Sholeh','Lokasi pengganti (scan QR)'].includes(area))throw new Error('Area tugas tidak valid.');
  const reason=String(req.reason||'').trim(), qr=String(req.qrCode||'').trim();
  if(status==='Ijin'&&!reason)throw new Error('Alasan ijin wajib diisi.');
  if(area==='Lokasi pengganti (scan QR)'&&!qr)throw new Error('Kode QR lokasi wajib diisi.');
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    const sh=ss_().getSheetByName(ATTENDANCE_SHEET);
    const now=new Date(), tz=Session.getScriptTimeZone()||'Asia/Jakarta';
    const date=Utilities.formatDate(now,tz,'yyyy-MM-dd'), time=Utilities.formatDate(now,tz,'HH:mm:ss');
    const rows=sh.getDataRange().getValues();
    for(let i=1;i<rows.length;i++){
      if(String(rows[i][4])===user.userId && String(rows[i][2])===date) throw new Error('Absensi hari ini sudah tercatat. Hubungi pengurus jika perlu koreksi.');
    }
    sh.appendRow([Utilities.getUuid(),now,date,time,user.userId,user.name,user.username,status,area,reason,qr]);
    return {date:date,time:time,status:status};
  } finally {lock.releaseLock();}
}
function myRecords_(user) {
  const rows=ss_().getSheetByName(ATTENDANCE_SHEET).getDataRange().getValues(), out=[];
  for(let i=rows.length-1;i>=1;i--){const r=rows[i];if(String(r[4])===user.userId)out.push(rowRecord_(r));}
  return {records:out.slice(0,100)};
}
function adminData_(from,to) {
  const ss=ss_(), userRows=ss.getSheetByName(USERS_SHEET).getDataRange().getValues(), attendance=ss.getSheetByName(ATTENDANCE_SHEET).getDataRange().getValues();
  const members=[];
  for(let i=1;i<userRows.length;i++){const r=userRows[i];if(String(r[5])==='member')members.push({name:String(r[1]),username:String(r[2]),active:r[6]===true||String(r[6]).toLowerCase()==='true'});}
  const records=[];
  for(let i=1;i<attendance.length;i++){const r=attendance[i],d=String(r[2]);if((!from||d>=from)&&(!to||d<=to))records.push(rowRecord_(r));}
  records.sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time));
  return {members:members,records:records};
}
function rowRecord_(r){return {date:String(r[2]),time:String(r[3]),userId:String(r[4]),name:String(r[5]),username:String(r[6]),status:String(r[7]),area:String(r[8]),reason:String(r[9]||''),qrCode:String(r[10]||'')};}
function addMember_(req) {
  const name=String(req.name||'').trim(), username=String(req.username||'').trim(), password=String(req.password||'');
  if(name.length<2)throw new Error('Nama lengkap minimal 2 karakter.');
  if(!/^[A-Za-z0-9._-]{3,30}$/.test(username))throw new Error('Username harus 3–30 karakter: huruf, angka, titik, _ atau -.');
  if(password.length<8)throw new Error('Kata sandi minimal 8 karakter.');
  const sh=ss_().getSheetByName(USERS_SHEET), rows=sh.getDataRange().getValues();
  if(rows.slice(1).some(r=>String(r[2]).toLowerCase()===username.toLowerCase()))throw new Error('Username sudah digunakan.');
  const salt=Utilities.getUuid();
  sh.appendRow([Utilities.getUuid(),name,username,salt,hash_(password,salt),'member',true,new Date()]);
  return {name:name,username:username};
}
function hash_(password,salt) {
  const bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,salt+'|'+password,Utilities.Charset.UTF_8);
  return bytes.map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');
}
