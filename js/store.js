// localStorage 읽기/쓰기, IndexedDB 녹음 저장·삭제, 검사 기록 서버 저장(저장소가 연결돼 있을 때만)

const KEY = 'cogcare-v1';
let data = null;

// 저장된 데이터가 없으면 null
export function getData() {
  if (!data) {
    const raw = localStorage.getItem(KEY);
    data = raw ? ensureBaseAccount(JSON.parse(raw)) : null;
  }
  return data;
}

// 다른 탭(어르신 화면)이 저장하면 다시 읽는다
export function reloadData() { data = null; return getData(); }

export function setData(d) {
  data = ensureBaseAccount(d);
  save();
}

export function save() {
  localStorage.setItem(KEY, JSON.stringify(data));
  if (sync.on) schedulePush();
}

// ---------- 검사 기록 서버 저장 (Vercel에 Upstash Redis를 연결했을 때만) ----------
// 직접 한 통화·정기 검사·활동·적립·응급 알림·요청·건강정보를 서버에 올리고, 앱을 열 때 받아 합친다.
// 그래서 다른 기기·브라우저에서 열어도 같은 기록이 보인다. 대상자 이름·주소·전화와 녹음·그림 파일은 올리지 않는다.
// 저장소가 없으면(로컬 실행, 연결 전) 지금처럼 이 브라우저에만 저장한다.
const SYNC_KEY = 'cogcare-sync'; // 기록별로 마지막에 서버와 맞춘 내용의 지문
const SYNC_KINDS = {
  calls: x => x.source === 'real',
  cistSessions: (x, real) => real.has(x.callId),
  activities: x => x.source === 'real',
  points: x => x.source === 'real',
  alerts: x => x.type === 'emergency',
  requests: (x, real) => real.has(x.callId),
  healthNotices: x => x.source !== 'demo' || !!x.updatedAt
};
const sync = { on: false, timer: null, busy: false, sent: {} };
try { sync.sent = JSON.parse(localStorage.getItem(SYNC_KEY)) || {}; } catch { sync.sent = {}; }

// 짧은 지문 (FNV-1a). 내용이 바뀌었는지만 본다
export function fingerprint(rec) {
  const t = JSON.stringify(rec);
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36) + t.length.toString(36);
}
// 서버에 올릴 기록: [{ kind, rec }]
export function syncable(d) {
  const real = new Set((d.calls || []).filter(c => c.source === 'real').map(c => c.id));
  return Object.entries(SYNC_KINDS).flatMap(([kind, ok]) => (d[kind] || []).filter(x => x?.id && ok(x, real)).map(rec => ({ kind, rec })));
}
// 서버 기록을 합친다. 이 기기에서 고치고 아직 못 올린 기록은 이 기기 것을 둔다. 바뀐 게 있으면 true.
export function mergeRecords(d, remote, sent) {
  let changed = false;
  for (const kind of Object.keys(SYNC_KINDS)) {
    const list = (d[kind] ??= []);
    for (const rec of remote?.[kind] || []) {
      if (!rec?.id) continue;
      const key = kind + ':' + rec.id, h = fingerprint(rec);
      const i = list.findIndex(x => x.id === rec.id);
      if (i < 0) { list.push(rec); changed = true; sent[key] = h; continue; }
      const lh = fingerprint(list[i]);
      if (lh === h) { sent[key] = h; continue; }
      if (sent[key] !== lh) continue; // 이 기기에서 바꾼 뒤 아직 못 올림 → 이 기기 것이 다음에 올라간다
      list[i] = rec; sent[key] = h; changed = true;
    }
    // 화면은 사람별로 날짜 순서를 기대한다 (같은 날은 원래 순서 유지)
    if (changed) list.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.at || a.startedAt || a.time || '').localeCompare(String(b.at || b.startedAt || b.time || '')));
  }
  return changed;
}

async function records(body) {
  const r = await fetch('/api/records', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}
const saveSent = () => { try { localStorage.setItem(SYNC_KEY, JSON.stringify(sync.sent)); } catch { /* 저장 공간 부족이면 다음에 다시 올린다 */ } };

// 앱을 열 때 한 번: 서버 기록을 받아 합치고, 이 기기에만 있는 기록을 올린다. 합쳐서 바뀌었으면 true.
export async function startSync() {
  let remote;
  try { remote = await records({ get: true }); } catch { return false; } // 저장소 없음·서버 꺼짐 → 이 브라우저에만 저장
  sync.on = true;
  const d = getData();
  const changed = d ? mergeRecords(d, remote, sync.sent) : false;
  saveSent();
  if (changed) localStorage.setItem(KEY, JSON.stringify(data));
  schedulePush(0);
  return changed;
}

function schedulePush(ms = 1500) {
  clearTimeout(sync.timer);
  sync.timer = setTimeout(push, ms);
}
async function push() {
  if (!data) return;
  if (sync.busy) return schedulePush();
  const todo = syncable(data).map(x => ({ ...x, h: fingerprint(x.rec) })).filter(x => sync.sent[x.kind + ':' + x.rec.id] !== x.h);
  if (!todo.length) return;
  sync.busy = true;
  try {
    // 한 번에 너무 크지 않게 나눠 올린다
    for (let i = 0, size = 0, batch = []; i <= todo.length; i++) {
      const x = todo[i], len = x ? JSON.stringify(x.rec).length : 0;
      if (batch.length && (!x || size + len > 400_000 || batch.length >= 100)) {
        await records({ put: batch.map(({ kind, rec }) => ({ kind, rec })) });
        for (const b of batch) sync.sent[b.kind + ':' + b.rec.id] = b.h;
        saveSent();
        batch = []; size = 0;
      }
      if (x) { batch.push(x); size += len; }
    }
  } catch {
    schedulePush(30_000); // 연결이 끊겼으면 30초 뒤 다시
  } finally {
    sync.busy = false;
  }
}

// 지운 기록을 서버에서도 지운다 (건강정보 삭제처럼 사용자가 직접 지운 경우만)
export function removeRecord(kind, id) {
  delete sync.sent[kind + ':' + id];
  saveSent();
  if (sync.on) records({ remove: [{ kind, id }] }).catch(() => {});
}

// ---------- 녹음 파일 (IndexedDB) ----------
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('cogcare-audio', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('audio');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('audio', mode);
    const req = fn(tx.objectStore('audio'));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
  });
}

export const saveAudio = (id, blob) => run('readwrite', st => st.put(blob, id));
export const getAudio = id => run('readonly', st => st.get(id));
export const deleteAudio = id => run('readwrite', st => st.delete(id));
export const clearAudio = () => run('readwrite', st => st.clear());

// ---------- 회원 계정 (시연용: 서버 없이 이 브라우저에만 저장) ----------
// 비밀번호는 원문으로 저장하지 않는다: 계정마다 무작위 salt + SHA-256(salt + 비밀번호)
const LOGIN_KEY = 'cogcare-login'; // 로그인한 계정 id

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
export const makeSalt = () => hex(crypto.getRandomValues(new Uint8Array(16)));
export async function hashPassword(salt, password) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + password)));
}
export async function verifyPassword(account, password) {
  return (await hashPassword(account.salt, password)) === account.hash;
}
export const displayName = a => `${a.name} ${a.job}`;

// 기본 계정 (회원가입 없이 바로 로그인): 아이디 dbsqudgns · 윤병훈 간호사 · 춘해보건대학교
// 비밀번호는 원문 대신 salt와 해시만 둔다. 데이터를 처음 만들거나 다시 만들거나 초기화해도 없으면 다시 넣는다.
export const BASE_ACCOUNT = {
  id: 'acc-base', username: 'dbsqudgns', name: '윤병훈', job: '간호사', org: '춘해보건대학교',
  salt: 'b55c34bf4acf051c90f1d7814b83d1db', hash: 'd0c37e49164ebc20b27b4b5e010d214d4690e57dcbcfcbd44d87e23a5d6ba8cd', createdAt: '2026-10-08T09:00'
};
export function ensureBaseAccount(d) {
  if (!d) return d;
  d.accounts ??= [];
  if (!d.accounts.some(a => a.username === BASE_ACCOUNT.username)) d.accounts.unshift({ ...BASE_ACCOUNT });
  return d;
}

export function currentAccount() {
  const id = localStorage.getItem(LOGIN_KEY);
  return id ? (getData()?.accounts || []).find(a => a.id === id) || null : null;
}
export const setLogin = id => (id ? localStorage.setItem(LOGIN_KEY, id) : localStorage.removeItem(LOGIN_KEY));
