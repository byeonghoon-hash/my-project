// localStorage 읽기/쓰기, IndexedDB 녹음 저장·삭제

const KEY = 'cogcare-v1';
let data = null;

// 저장된 데이터가 없으면 null
export function getData() {
  if (!data) {
    const raw = localStorage.getItem(KEY);
    data = raw ? JSON.parse(raw) : null;
  }
  return data;
}

export function setData(d) {
  data = d;
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
