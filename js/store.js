// localStorage 읽기/쓰기, IndexedDB 녹음 저장·삭제

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
