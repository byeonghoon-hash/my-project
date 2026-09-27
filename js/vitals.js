// 생체신호 연계 지점. 앱의 나머지 부분은 getNightVitals 하나만 부른다.
// 대상자 기본 정보 ⑤의 데이터 출처가 '기기'면 링 실측(data.ringNights), 아니면 시드가 만든 모의 데이터(data.vitals)를 돌려준다.
//
// 링 데이터 불러오기: CSV 파일 (블루투스·Wi-Fi 연동은 아직 만들지 않음)
//   timestamp,hr,spo2,sqi,worn
//   2026-10-01T23:00:00,62,95,0.91,1
// 원본 샘플은 저장하지 않는다(2주면 100만 줄 이상). 1분 단위로 묶은 값과 하룻밤 요약만 저장한다.
// 1분 단위 값은 시계·SpO2 보정을 바꿨을 때 파일을 다시 불러오지 않고 다시 계산하려고 남긴다.
//
// 나중에 실시간으로 연결하는 방법 (지금은 만들지 않음):
//  (나) Web Bluetooth — 표준 Heart Rate 서비스(0x180D), Pulse Oximeter 서비스(0x1822). 크롬만 가능.
//  (다) 기기가 Wi-Fi로 서버에 올리고 앱은 그 서버에서 가져오기
// 어느 방식이든 원자료를 아래 하룻밤 요약으로 줄이는 계산은 이 파일 안에서 한다.
//
// 해석 원칙: PPG 기반 SpO2는 의료기기급이 아니므로 절대값보다 개인 내 변화로 본다.
// 착용 4시간 미만이거나 평균 sqi < 설정값인 밤은 '무효한 밤'으로 저장만 하고 판정에 쓰지 않는다.

import { getData } from './store.js';
import { todayStr, nowStamp } from './metrics.js';

// 모의/실측 고르기 → { hrRest, spo2Min, spo2BelowMin, wearHours, sqi, steps, source } | null
// spo2BelowMin: 개인 SpO2 기준(기본 90%) 미만인 시간(분)
export function pickVitals(data, personId, date) {
  const p = data.people.find(x => x.id === personId);
  const real = p?.info?.device?.source === 'device';
  const v = (real ? data.ringNights || [] : data.vitals).find(x => x.personId === personId && x.date === date);
  if (!v) return null;
  const { hrRest, spo2Min, spo2BelowMin, wearHours, sqi } = v;
  return { hrRest, spo2Min, spo2BelowMin, wearHours, sqi, steps: v.steps ?? null, source: real ? 'real' : 'demo' };
}

// 대상자 한 명의 하룻밤 요약. 없으면 null.
export const getNightVitals = (personId, date) => pickVitals(getData(), personId, date);

// ---------- 링 CSV ----------
// CSV를 읽는 코드는 이 함수 하나에만 둔다. 펌웨어 출력이 바뀌면 여기만 고친다.
// timestamp: 로컬 ISO 시각 또는 초 단위 유닉스 시간(숫자). hr·spo2가 비었거나 0이면 결측.
export function parseRingCsv(text, clockOffsetMin = 0) {
  const lines = text.split(/\r?\n/);
  const n = lines.length;
  const t = new Float64Array(n), hr = new Float32Array(n), spo2 = new Float32Array(n), sqi = new Float32Array(n), worn = new Uint8Array(n);
  let k = 0, missing = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || /^timestamp/i.test(line)) continue;
    const [ts, h, o, q, w] = line.split(',').map(x => (x ?? '').trim());
    const time = /^\d+(\.\d+)?$/.test(ts) ? +ts * 1000 : new Date(ts).getTime();
    if (!Number.isFinite(time)) continue;
    t[k] = time + clockOffsetMin * 60000;
    hr[k] = +h || 0;
    spo2[k] = +o || 0;
    sqi[k] = +q || 0;
    worn[k] = +w ? 1 : 0;
    if (!hr[k] || !spo2[k]) missing++;
    k++;
  }
  // 측정 간격 = 타임스탬프 차이의 중앙값 (고정하지 않는다)
  const diffs = new Float64Array(Math.max(0, k - 1));
  for (let i = 1; i < k; i++) diffs[i - 1] = t[i] - t[i - 1];
  diffs.sort();
  const intervalSec = k > 1 ? diffs[Math.floor(diffs.length / 2)] / 1000 : 1;
  return { t: t.subarray(0, k), hr: hr.subarray(0, k), spo2: spo2.subarray(0, k), sqi: sqi.subarray(0, k), worn: worn.subarray(0, k), count: k, intervalSec, missing };
}

const median = a => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

// 1분 단위로 묶기: [분(시계 보정 전), 샘플 수, 착용 샘플 수, 착용 중 sqi 합, SpO2 1분 중앙값, 심박 1분 평균]
// 쓸 샘플 = 착용 중이고 sqi ≥ 설정값
export function toMinutes(parsed, sqiMin) {
  const map = new Map();
  for (let i = 0; i < parsed.count; i++) {
    const m = Math.floor(parsed.t[i] / 60000);
    let b = map.get(m);
    if (!b) map.set(m, (b = { n: 0, w: 0, q: 0, o: [], h: [] }));
    b.n++;
    if (!parsed.worn[i]) continue;
    b.w++;
    b.q += parsed.sqi[i];
    if (parsed.sqi[i] < sqiMin) continue;
    if (parsed.spo2[i] > 0) b.o.push(parsed.spo2[i]);
    if (parsed.hr[i] > 0) b.h.push(parsed.hr[i]);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([m, b]) => [
    m, b.n, b.w, round(b.q, 2), b.o.length ? median(b.o) : null, b.h.length ? round(b.h.reduce((x, y) => x + y, 0) / b.h.length) : null
  ]);
}

// 하룻밤 요약. 하룻밤 = 22:00~다음 날 07:00, 날짜는 깬 날 기준.
// opts: { clockOffsetMin, spo2OffsetPct, threshold(개인 SpO2 기준), sqiMin }
export function nightsFromMinutes(rows, intervalSec, opts) {
  const { clockOffsetMin = 0, spo2OffsetPct = 0, threshold = 90, sqiMin = 0.6 } = opts || {};
  const nights = new Map();
  for (const r of rows) {
    const m = r[0] + clockOffsetMin;
    const d = new Date(m * 60000);
    const h = d.getHours();
    if (h >= 7 && h < 22) continue;
    const date = h >= 22 ? todayStr(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) : todayStr(d);
    if (!nights.has(date)) nights.set(date, []);
    nights.get(date).push([m, ...r.slice(1)]);
  }
  return [...nights.entries()].sort().map(([date, rs]) => {
    const wornN = rs.reduce((t, r) => t + r[2], 0);
    const wearHours = (wornN * intervalSec) / 3600;
    const sqi = wornN ? rs.reduce((t, r) => t + r[3], 0) / wornN : 0;
    // 야간 최저 SpO2 = 1분 중앙값들의 최저값 (한 샘플짜리 튐을 피한다), 보정값을 더한다
    const o = rs.filter(r => r[4] != null).map(r => r[4] + spo2OffsetPct);
    // 안정 시 심박 = 1분 평균들 중 가장 낮은 연속 5분 구간의 평균
    const hrBy = new Map(rs.filter(r => r[5] != null).map(r => [r[0], r[5]]));
    let hrRest = null;
    for (const m of hrBy.keys()) {
      const win = [0, 1, 2, 3, 4].map(k => hrBy.get(m + k));
      if (win.every(v => v != null)) {
        const avg = win.reduce((a, b) => a + b, 0) / 5;
        if (hrRest == null || avg < hrRest) hrRest = avg;
      }
    }
    const spo2Min = o.length ? round(Math.min(...o)) : null;
    const valid = wearHours >= 4 && sqi >= sqiMin && spo2Min != null;
    return {
      date, hrRest: hrRest == null ? null : round(hrRest), spo2Min,
      spo2BelowMin: o.filter(v => v < threshold).length, // 1분 중앙값이 개인 기준 미만인 분의 수
      wearHours: round(wearHours, 2), sqi: round(sqi, 2), steps: null, valid
    };
  });
}

const personOpts = (data, person) => ({
  clockOffsetMin: +person.info?.device?.clockOffsetMin || 0,
  spo2OffsetPct: +person.info?.device?.spo2OffsetPct || 0,
  threshold: person.info?.call?.spo2Threshold ?? 90,
  sqiMin: data.settings.sqiMin
});

// 파일 하나 불러오기 → 불러오기 기록. 같은 밤이 이미 있으면 새 값으로 바꾼다.
export function importRing(data, personId, fileName, text) {
  const parsed = parseRingCsv(text); // 시계 보정은 분 단위 값에 나중에 더한다 (보정을 바꾸면 다시 계산)
  if (!parsed.count) throw new Error('읽을 수 있는 측정 줄이 없습니다. 첫 줄은 timestamp,hr,spo2,sqi,worn 이어야 합니다.');
  data.ringImports ??= [];
  const rec = {
    id: 'ri' + Date.now().toString(36), personId, fileName, importedAt: nowStamp(),
    samples: parsed.count, intervalSec: round(parsed.intervalSec, 2), missingPct: round((parsed.missing / parsed.count) * 100),
    firstMin: Math.floor(parsed.t[0] / 60000), lastMin: Math.floor(parsed.t[parsed.count - 1] / 60000),
    minutes: toMinutes(parsed, data.settings.sqiMin)
  };
  data.ringImports.push(rec);
  recomputeRing(data, personId);
  return rec;
}

// 보정값·SpO2 기준이 바뀌었을 때도 부른다. 나중에 불러온 파일이 같은 밤을 덮어쓴다.
export function recomputeRing(data, personId) {
  const person = data.people.find(p => p.id === personId);
  if (!person) return;
  const opts = personOpts(data, person);
  const merged = new Map();
  for (const imp of (data.ringImports || []).filter(i => i.personId === personId)) {
    const nights = nightsFromMinutes(imp.minutes, imp.intervalSec, opts);
    imp.validNights = nights.filter(n => n.valid).length;
    imp.invalidNights = nights.length - imp.validNights;
    const stamp = m => nowStamp(new Date((m + opts.clockOffsetMin) * 60000));
    imp.from = stamp(imp.firstMin);
    imp.to = stamp(imp.lastMin);
    for (const n of nights) merged.set(n.date, { personId, importId: imp.id, ...n });
  }
  data.ringNights = [...(data.ringNights || []).filter(n => n.personId !== personId), ...merged.values()];
}

export function deleteRingImport(data, importId) {
  const imp = (data.ringImports || []).find(i => i.id === importId);
  if (!imp) return;
  data.ringImports = data.ringImports.filter(i => i.id !== importId);
  recomputeRing(data, imp.personId);
}
