// 지표, 개인 기저선, z-score, 알림 단계, 위험도, AI 분석, 변화 추이, 돌봄일지 초안 계산.
// 순수 함수만 둔다 (DOM 사용 금지).
import { CIST_DOMAINS, CIST, DEFAULT_CIST_MODES as CIST_DEFAULTS } from './items.js';
const CIST_MODE_LABEL = Object.fromEntries(Object.entries(CIST.modes).map(([k, m]) => [k, m.label]));
const CIST_OPTION_LABEL = Object.fromEntries(Object.entries(CIST.modes).map(([k, m]) => [k, Object.fromEntries(m.options.map(o => [o.id, o.label]))]));

// 판정 파라미터 기본값. 관리자 화면 '판정 설정'에서 모두 바꿀 수 있다.
export const DEFAULT_SETTINGS = {
  baselineDays: 14,        // 기저선 = 등록 후 처음 14회 완료 통화 점수의 평균·표준편차
  zWatch: -1.5,            // 관찰: 하루라도 z ≤ -1.5
  cautionRun: 3,           // 주의: 최근 완료 통화 3회 연속 z ≤ zWatch
  referRun: 5,             // 의뢰: 5회 연속 z ≤ zWatch, 또는 최근 7회 평균 z ≤ zRefer
  zRefer: -2.0,
  missedEscalateDays: 3,   // 3일 연속 무응답 → 안부확인 알림
  sqiMin: 0.6,
  spo2Below90Alert: 10,    // SpO2 기준(기본 90%, 개인 기준이 있으면 그 값) 미만 10분 이상인 밤이
  spo2AlertNights: 3,      //   최근 7일 중 3밤 이상 → 수면무호흡 의심 알림
  hearingRepeatAsks: 2,    // 통화당 재질문 2회 이상이
  hearingCalls: 3,         //   최근 5통화 중 3회 이상 → 난청 의심 알림
  maxCallSec: 240,         // 인사·최근 문제·6개 영역·자기보고·안부 대화가 들어가는 4분
  sdMinScore: 5,           // 변화 추이: 표준편차 최솟값 (점수 %p)
  sdMinSpo2: 1,            //   SpO2 %p
  sdMinHr: 3,              //   심박 bpm
  sdMinLatency: 0.3,       //   응답 지연 초
  visitBufferMin: 20,      // 방문 사이 이동 여유 시간(분). 웅촌면은 마을 간 이동 시간이 있다
  visitDailyLimit: 4,      // 방문자 하루 방문 한도(건)
  cistIntervalWeeks: 4,    // 정기 인지검사(전화형) 주기: 2 / 4 / 8주
  cistDropAlert: 3,        //   원형 유지 점수가 직전 확정 회차보다 3점 이상 하락 → 주의
  cistMaxSec: 900          //   정기 검사 통화 상한 15분
};

export const LEVEL_RANK = { watch: 1, caution: 2, refer: 3 };
export const RISK_LABEL = { high: '높음', mid: '주의', low: '낮음' };
export const ALERT_LEVEL_LABEL = { watch: '관찰', caution: '주의', refer: '의뢰' };

// ---------- 날짜 ('YYYY-MM-DD' 문자열로 다룬다) ----------
const pad = n => String(n).padStart(2, '0');
const utc = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));

export const todayStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const nowStamp = (d = new Date()) => `${todayStr(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const addDays = (s, n) => new Date(utc(s) + n * 864e5).toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((utc(b) - utc(a)) / 864e5);
export const mmdd = s => (s ? `${s.slice(5, 7)}.${s.slice(8, 10)}` : '');

const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const sdOf = a => (a.length > 1 ? Math.sqrt(a.reduce((t, x) => t + (x - mean(a)) ** 2, 0) / (a.length - 1)) : 0);
const byTime = (a, b) => (a.date + (a.startedAt || '')).localeCompare(b.date + (b.startedAt || ''));
const r1 = v => (v == null ? null : Math.round(v * 10) / 10);
const f1 = v => (v == null ? '-' : String(r1(v)));

// ---------- 기본 정보에서 읽는 값 ----------
// 통화 대상일인지: 통화 일시중지 기간이나 통화 요일이 아닌 날은 발신 대상일에서 뺀다
export function isCallDay(person, date) {
  const c = person.info?.call;
  if (!c) return true;
  if (c.firstCall && date < c.firstCall) return false; // 첫 통화일 전
  const p = c.pause;
  if (p?.from && date >= p.from && (!p.to || date <= p.to)) return false;
  if (Array.isArray(c.days) && c.days.length && c.days.length < 7) {
    if (!c.days.includes(new Date(utc(date)).getUTCDay())) return false;
  }
  return true;
}
export const isPausedOn = (person, date) => {
  const p = person.info?.call?.pause;
  return !!(p?.from && date >= p.from && (!p.to || date <= p.to));
};
export const spo2Threshold = person => person.info?.call?.spo2Threshold ?? 90;
// 청력 저하 기록 (보청기 착용 또는 청력 '경도 저하' 이상)
export const hearingKnown = person => {
  const i = person.info || {};
  return (i.devices || []).some(d => d.startsWith('보청기')) || ['경도 저하', '중등도 이상'].includes(i.hearing);
};
export const mobilityLimited = person => ['대부분 도움', '와상'].includes(person.info?.mobility);
// 진행 중이거나 최근 14일 안에 끝난 급성질환
export function recentAcute(person, today) {
  return (person.info?.acute || []).find(a => a.start && a.start <= today && (!a.end || a.end >= addDays(today, -14))) || null;
}
// 최근 변경일이 14일 안인 복용약
export function recentMedChange(person, today) {
  return (person.info?.meds || []).find(m => m.changed && m.changed <= today && m.changed >= addDays(today, -13)) || null;
}
// 감별 체크리스트 자동 체크
export function autoChecklist(person, today) {
  return { acute: !!recentAcute(person, today), meds: !!recentMedChange(person, today) };
}
// 전화번호 형식: 숫자와 하이픈만, 숫자 10~11자리
// 전화번호 형식: 숫자와 하이픈만. 비상연락처는 10~11자리, 대상자 통화 번호(집전화 포함)는 9~11자리
export const validPhone = (v, min = 10) => /^[0-9-]+$/.test(v || '') && new RegExp(`^\\d{${min},11}$`).test((v || '').replace(/-/g, ''));

// 만 나이
export function ageFrom(birth, today) {
  if (!birth) return null;
  let a = +today.slice(0, 4) - +birth.slice(0, 4);
  if (today.slice(5) < birth.slice(5)) a--;
  return a;
}

// 중복 의심: 이름+생년월일이 같거나 통화 전화번호가 같은 대상자
export function findDuplicates(people, cand) {
  const digits = v => (v || '').replace(/\D/g, '');
  return people.filter(p => p.id !== cand.id && (
    (cand.name && cand.birth && p.name === cand.name && p.birth === cand.birth) ||
    (digits(cand.phone) && digits(p.phone) === digits(cand.phone))));
}

// 점이 경계(GeoJSON Polygon) 안에 있는지
export function insideBoundary(geo, lat, lng) {
  const r = geo.geometry.coordinates[0];
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

// ---------- 방문 일정 ----------
export const VISIT_TYPES = ['정기 방문', '건강 확인', '인지 재평가', '보호자 면담', '기관 연계 동행', '기타'];
const toMin = t => +t.slice(0, 2) * 60 + +t.slice(3, 5);
export const visitStart = v => toMin(v.startTime || '10:00');
export const visitEnd = v => visitStart(v) + (v.durationMin || 60);
export const minToTime = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

// 겹침: 같은 방문자·같은 날, 새 시작 < 기존 끝 + 여유 그리고 기존 시작 < 새 끝 + 여유
export function visitConflicts(visits, cand, bufferMin) {
  return visits.filter(v => v.id !== cand.id && v.status !== 'canceled' && v.visitor === cand.visitor && v.date === cand.date
    && visitStart(cand) < visitEnd(v) + bufferMin && visitStart(v) < visitEnd(cand) + bufferMin);
}

// 등록 전 검사 → { errors, conflicts, warnings, notes }. now: 'YYYY-MM-DDTHH:MM'
export function visitChecks(data, cand, now) {
  const s = data.settings;
  const out = { errors: [], conflicts: [], warnings: [], notes: [] };
  if (!cand.date || !cand.startTime) { out.errors.push('날짜·시각 필요'); return out; }
  if (`${cand.date}T${cand.startTime}` < now) out.errors.push('지난 날짜·시각은 등록 불가');
  out.conflicts = visitConflicts(data.visits, cand, s.visitBufferMin);
  const sameDay = data.visits.filter(v => v.id !== cand.id && v.status !== 'canceled' && v.visitor === cand.visitor && v.date === cand.date);
  if (sameDay.length >= s.visitDailyLimit) out.warnings.push(`${cand.visitor} 그날 방문 ${sameDay.length}건 (하루 한도 ${s.visitDailyLimit}건)`);
  const person = data.people.find(p => p.id === cand.personId);
  if (person && isPausedOn(person, cand.date)) out.warnings.push(`통화 일시중지 기간 (${person.info.call.pause.reason || '사유 없음'})`);
  if (visitStart(cand) < 8 * 60 || visitEnd(cand) > 18 * 60) out.warnings.push('업무 시간(08:00~18:00) 밖');
  const near = data.visits.filter(v => v.id !== cand.id && v.status !== 'canceled' && v.personId === cand.personId
    && Math.abs(daysBetween(v.date, cand.date)) <= 3);
  for (const v of near) out.notes.push(`앞뒤 3일 안에 방문 있음 · ${mmdd(v.date)} ${v.startTime} ${v.type}`);
  return out;
}
// 1순위 비상연락처
export const primaryContact = person => [...(person.info?.contacts || [])].sort((a, b) => a.priority - b.priority)[0] || null;

// ---------- 기저선과 z-score ----------

// scores: 완료 통화 점수(%)를 시간 순서대로
export function baseline(scores, s) {
  const first = scores.slice(0, s.baselineDays);
  const n = first.length;
  if (n === 0) return { ready: false, n, mean: null, sd: null };
  let sd = sdOf(first);
  if (sd < 5) sd = 5; // 표준편차가 너무 작으면(0 포함) 5로 둔다 (0으로 나누기·과민 판정 방지)
  return { ready: n >= s.baselineDays, n, mean: mean(first), sd };
}

export const zScore = (score, base) => (score - base.mean) / base.sd;

// zs: 기저선 기간 이후 완료 통화의 z (시간 순서). 결과: null | 'watch' | 'caution' | 'refer'
export function cognitionLevel(zs, s) {
  if (!zs.length) return null;
  let run = 0;
  for (let i = zs.length - 1; i >= 0 && zs[i] <= s.zWatch; i--) run++;
  const last7 = zs.slice(-7);
  if (run >= s.referRun || (last7.length === 7 && mean(last7) <= s.zRefer)) return 'refer';
  if (run >= s.cautionRun) return 'caution';
  if (run >= 1) return 'watch';
  return null;
}

// 최근 30일 추세 기울기 (최소제곱 회귀, 하루당 점수 변화 %p)
export function slope30(scored, today) {
  const from = addDays(today, -29);
  const pts = scored.filter(c => c.date >= from && c.date <= today)
    .map(c => [daysBetween(from, c.date), c.scorePct]);
  if (pts.length < 2) return null;
  const mx = mean(pts.map(p => p[0])), my = mean(pts.map(p => p[1]));
  const sxx = pts.reduce((t, p) => t + (p[0] - mx) ** 2, 0);
  if (sxx === 0) return null;
  return pts.reduce((t, p) => t + (p[0] - mx) * (p[1] - my), 0) / sxx;
}

// ---------- 그 밖의 알림 조건 ----------

export const isValidNight = (v, s) => !!v && v.spo2Min != null && v.sqi >= s.sqiMin && v.wearHours >= 4;

// 가장 최근부터 거꾸로 센 연속 무응답 수 (통화 대상일이 아닌 날의 기록은 뺀다)
export function missedRun(calls, person = null) {
  const sorted = [...calls].filter(c => !person || isCallDay(person, c.date)).sort(byTime);
  let run = 0;
  for (let i = sorted.length - 1; i >= 0 && sorted[i].status === 'missed'; i--) run++;
  return run;
}

// 최근 5통화(받은 통화) 중 재질문이 기준 이상인 통화 수
export function hearingCount(calls, s) {
  return [...calls].sort(byTime).filter(c => c.status !== 'missed').slice(-5)
    .filter(c => c.items.reduce((t, i) => t + (i.repeatAsked || 0), 0) >= s.hearingRepeatAsks).length;
}

// 최근 7일 중 SpO2 기준 미만이 기준 시간 이상인 (유효한) 밤 수
export function spo2Nights(personId, today, s, getV) {
  let n = 0;
  for (let k = 0; k < 7; k++) {
    const v = getV(personId, addDays(today, -k));
    if (isValidNight(v, s) && v.spo2BelowMin >= s.spo2Below90Alert) n++;
  }
  return n;
}

// ---------- 대상자 한 명의 현재 상태 ----------
export function personStatus(person, allCalls, s, today, getV) {
  const calls = allCalls.filter(c => c.personId === person.id && c.date <= today).sort(byTime);
  const scored = calls.filter(c => c.status === 'completed' && c.scorePct != null);
  const base = baseline(scored.map(c => c.scorePct), s);
  const zs = base.ready ? scored.map(c => ({ date: c.date, callId: c.id, z: zScore(c.scorePct, base) })) : [];
  const lastScored = scored.at(-1);
  const hearingFlag = hearingCount(calls, s) >= s.hearingCalls;
  return {
    base,
    zs,
    baseStart: scored[0]?.date ?? null,
    baseEnd: base.ready ? scored[s.baselineDays - 1].date : null,
    lastCallDate: calls.at(-1)?.date ?? null,
    lastScore: lastScored?.scorePct ?? null,
    lastZ: zs.at(-1)?.z ?? null,
    slope: slope30(scored, today),
    hearingFlag,
    levels: {
      cognition: base.ready ? cognitionLevel(zs.slice(s.baselineDays).map(x => x.z), s) : null,
      noAnswer: missedRun(calls, person) >= s.missedEscalateDays ? 'caution' : null,
      spo2: spo2Nights(person.id, today, s, getV) >= s.spo2AlertNights ? 'caution' : null,
      // 청력 저하 기록이 있는 사람은 난청 의심 알림 대신 '보청기 착용·배터리 확인'으로 안내한다
      hearing: hearingFlag && !hearingKnown(person) ? 'watch' : null
    }
  };
}

// 통화 기록의 z를 현재 기저선으로 다시 계산해 저장한다 (통화 저장·점수 수정 뒤)
export function refreshZ(data, person, today) {
  const st = personStatus(person, data.calls, data.settings, today, () => null);
  const byId = new Map(st.zs.map(x => [x.callId, x.z]));
  for (const c of data.calls) if (c.personId === person.id) c.z = byId.has(c.id) ? Math.round(byId.get(c.id) * 100) / 100 : null;
}

// 같은 사람·같은 종류의 열린(종결 전) 알림이 있으면 단계만 올리고, 없으면 새로 만든다.
export function updateAlerts(alerts, personId, levels, now) {
  for (const [type, level] of Object.entries(levels)) {
    if (!level) continue;
    const open = alerts.find(a => a.personId === personId && a.type === type && a.status !== 'closed');
    if (open) {
      if (LEVEL_RANK[level] > LEVEL_RANK[open.level]) open.level = level;
    } else {
      alerts.push({
        id: 'al' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        personId, createdAt: now, type, level, status: 'open',
        referredAt: null, notifiedAt: null, notifiedTo: null, outcome: null, checklist: {}, note: ''
      });
    }
  }
  return alerts;
}

// ---------- 관리자 운영 지표 ----------
// periodDays: 7 | 30 | null(전체). 비율은 0~100, 분모가 0이면 null.
// 발신 대상일: 활성 대상자별로 등록일(또는 기간 시작일)부터 어제까지 + 오늘 통화 기록이 있으면 오늘.
// 통화 일시중지·통화 요일이 아닌 날은 뺀다.
export function dashboard(data, periodDays, today, getV) {
  const s = data.settings;
  const pct = (a, b) => (b ? (a / b) * 100 : null);
  const start = periodDays ? addDays(today, -(periodDays - 1)) : null;
  let target = 0, done = 0, missed = 0, durSum = 0, durN = 0, vDays = 0, valid = 0, worn = 0;

  const active = data.people.filter(p => p.active);
  for (const p of active) {
    const from = start && start > p.enrolledAt ? start : p.enrolledAt;
    const calls = data.calls.filter(c => c.personId === p.id && c.date >= from && c.date <= today && isCallDay(p, c.date));
    const end = calls.some(c => c.date === today) ? today : addDays(today, -1);
    for (let d = from; d <= end; d = addDays(d, 1)) {
      if (!isCallDay(p, d)) continue;
      target++;
      const dayCalls = calls.filter(c => c.date === d);
      if (dayCalls.some(c => c.status === 'completed')) done++;
      else if (dayCalls.some(c => c.status === 'missed')) missed++;
      const v = getV(p.id, d);
      if (v) {
        vDays++;
        if (v.sqi >= s.sqiMin) valid++;
        if (v.wearHours >= 4) worn++;
      }
    }
    for (const c of calls) if (c.status === 'completed' && c.kind !== 'cist') { durSum += c.durationSec; durN++; } // 정기 검사 통화(최대 15분)는 빼고
  }

  const eligible = active.filter(p => daysBetween(p.enrolledAt, today) >= 56);
  const recent = addDays(today, -6);
  const retained = eligible.filter(p =>
    data.calls.some(c => c.personId === p.id && c.status === 'completed' && c.date >= recent && c.date <= today));

  const cogPeople = new Set(data.alerts.filter(a => a.type === 'cognition').map(a => a.personId));
  const refers = data.alerts.filter(a => a.type === 'cognition' && a.level === 'refer');
  const linked = refers.filter(a => a.referredAt && daysBetween(a.createdAt.slice(0, 10), a.referredAt.slice(0, 10)) <= 30);
  const withOutcome = data.alerts.filter(a => a.outcome);

  return {
    completionRate: pct(done, target),
    missedRate: pct(missed, target),
    avgDurationSec: durN ? durSum / durN : null,
    validDayRate: pct(valid, vDays),
    wearRate: pct(worn, target),
    retention8w: pct(retained.length, eligible.length),
    detectionRate: pct(cogPeople.size, data.people.length),
    referralRate: pct(linked.length, refers.length),
    ppv: pct(withOutcome.filter(a => a.outcome === 'confirmed').length, withOutcome.length),
    falseAlarmRate: pct(withOutcome.filter(a => a.outcome === 'normal').length, withOutcome.length),
    spo2Alerts: data.alerts.filter(a => a.type === 'spo2').length,
    hearingAlerts: data.alerts.filter(a => a.type === 'hearing').length
  };
}

// =========================================================
// 위험도 · 종합 케어 스코어 · AI 종합 분석
// 실제로 측정하는 것만 쓴다: 통화 인지검사, 통화 응답, 야간 SpO2, 안정 시 심박(맥박)
// =========================================================

// ---------- 표시 형식: 모든 화면이 이 함수들만 쓴다 ----------
const WD = '일월화수목금토';
export const fmtDate = s => (s ? s.slice(0, 10).replace(/-/g, '.') : '-');                       // 상세: YYYY.MM.DD
export const fmtMD = s => (s ? `${s.slice(5, 7)}.${s.slice(8, 10)}` : '-');                       // 목록: MM.DD
export const fmtMDW = s => (s ? `${fmtMD(s)}(${WD[new Date(utc(s)).getUTCDay()]})` : '-');         // 09.28(월)
export const fmtTime = s => (s ? (s.length > 5 ? s.slice(11, 16) : s.slice(0, 5)) : '-');         // HH:MM
export const fmtStamp = s => (s ? `${fmtDate(s)}${s.length > 10 ? ' ' + fmtTime(s) : ''}` : '-');  // YYYY.MM.DD HH:MM
export const fmtDur = sec => (sec == null ? '-' : sec < 60 ? `${Math.round(sec)}초` : `${Math.floor(sec / 60)}분 ${Math.round(sec % 60)}초`);
export const fmtNum = (v, digits = 0) => (v == null || !Number.isFinite(+v) ? '-'
  : Number(v).toLocaleString('ko-KR', { minimumFractionDigits: digits, maximumFractionDigits: digits }));
// 숫자와 단위: '%'만 붙이고 나머지는 띄운다 (84%, 62 bpm, 3 건)
export const fmtUnit = (v, unit, digits = 0) => (v == null || !Number.isFinite(+v) ? '-' : unit === '%' ? `${fmtNum(v, digits)}%` : `${fmtNum(v, digits)} ${unit}`);

// ---------- 오늘 시간표 ----------
// 가로축 범위(분): 기본 08:00~18:00. 벗어나는 일정이 있으면 그 시각을 포함하는 정시까지 넓힌다.
export function timelineRange(minutes) {
  let a = 8 * 60, b = 18 * 60;
  for (const m of minutes) { a = Math.min(a, Math.floor(m / 60) * 60); b = Math.max(b, Math.ceil(m / 60) * 60); }
  return [a, b];
}
// 이름 배치: x 순서대로 위·아래를 번갈아 붙이고, 같은 쪽 보이는 이름과 minGap보다 가까우면 숨긴다 (aria-label은 그대로 둔다)
export function layoutLabels(items, minGap = 40) {
  const last = { top: -Infinity, bottom: -Infinity };
  return [...items].sort((a, b) => a.x - b.x).map((it, k) => {
    const side = k % 2 ? 'bottom' : 'top';
    const hidden = it.x - last[side] < minGap;
    if (!hidden) last[side] = it.x;
    return { ...it, side, hidden };
  });
}

// 최근 7일 통화 완료율. 대상일은 dashboard와 같은 방식.
export function completion7(person, calls, today) {
  const start = addDays(today, -6);
  const from = start > person.enrolledAt ? start : person.enrolledAt;
  const mine = calls.filter(c => c.personId === person.id && c.date >= from && c.date <= today);
  const end = mine.some(c => c.date === today) ? today : addDays(today, -1);
  let days = 0, done = 0;
  for (let d = from; d <= end; d = addDays(d, 1)) {
    if (!isCallDay(person, d)) continue;
    days++;
    if (mine.some(c => c.date === d && c.status === 'completed')) done++;
  }
  return { done, days, rate: days ? (done / days) * 100 : null };
}

// 야간 생체신호 요약 (유효한 밤만)
function nightSummary(personId, today, s, getV) {
  const valid = k => {
    const v = getV(personId, addDays(today, -k));
    return isValidNight(v, s) ? v : null;
  };
  const recent = [...Array(7)].map((_, k) => valid(k)).filter(Boolean);
  const before = [...Array(30)].map((_, k) => valid(k + 7)).filter(Boolean);
  const hrNow = recent.length ? mean(recent.map(v => v.hrRest)) : null;
  const hrBase = before.length >= 7 ? mean(before.map(v => v.hrRest)) : null;
  return {
    validNights: recent.length,
    badNights: recent.filter(v => v.spo2BelowMin >= s.spo2Below90Alert).length,
    hrDelta: hrNow != null && hrBase != null ? hrNow - hrBase : null
  };
}

// 종합 케어 스코어 (0~100, 높을수록 양호). 항목 가중치: 인지 40 · 통화 응답 25 · 야간 SpO2 20 · 안정 시 심박 15
// 측정값이 없는 항목은 빼고 나머지 가중치로 계산한다.
const CARE_WEIGHTS = { cognition: 40, response: 25, spo2: 20, heart: 15 };
function careParts(st, comp, night) {
  const clamp = v => Math.max(0, Math.min(100, v));
  return {
    cognition: st.base.ready && st.lastZ != null ? clamp(100 + 20 * st.lastZ) : st.lastScore,
    response: comp.rate,
    spo2: night.validNights ? 100 * (1 - night.badNights / night.validNights) : null,
    heart: night.hrDelta == null ? null : clamp(100 - Math.max(0, Math.abs(night.hrDelta) - 5) * 10)
  };
}

// 위험도 판정 — 앱 전체(지도·분포·우선 확인·목록·상세 칩)가 이 함수 하나만 쓴다.
// → { level: 'low'|'mid'|'high', score, reasons: [...], signals }
export function riskOf(person, data, today, getV) {
  const s = data.settings;
  const calls = data.calls.filter(c => c.personId === person.id);
  const st = personStatus(person, calls, s, today, getV);
  const comp = completion7(person, calls, today);
  const night = nightSummary(person.id, today, s, getV);
  const parts = careParts(st, comp, night);
  let wsum = 0, sum = 0;
  for (const [k, w] of Object.entries(CARE_WEIGHTS)) if (parts[k] != null) { wsum += w; sum += w * parts[k]; }
  const score = wsum ? Math.round(sum / wsum) : null;

  const open = data.alerts.filter(a => a.personId === person.id && a.status !== 'closed');
  const openLevel = type => open.filter(a => a.type === type).map(a => a.level)
    .sort((a, b) => LEVEL_RANK[b] - LEVEL_RANK[a])[0] ?? null;
  const knownHearing = hearingKnown(person);
  const signals = {
    emergency: !!openLevel('emergency'), // 통화 중 응급 표현 (열린 알림)
    cognition: openLevel('cognition'),
    spo2: !!openLevel('spo2'),
    // 난청 의심: 열린 난청 알림, 또는 청력 저하 기록이 있는 사람의 재질문 잦음
    hearing: !!openLevel('hearing') || (knownHearing && st.hearingFlag),
    hearingKnown: knownHearing,
    missedRun: missedRun(calls, person),
    hrChange: night.hrDelta != null && Math.abs(night.hrDelta) >= 8,
    mobilityLimited: mobilityLimited(person),
    status: st, completion: comp, night, parts
  };

  // 정기 인지검사: 확정 회차의 원형 유지 점수 변화 (같은 방식끼리만)
  const cst = cistStatus(person, data, today);
  const cr = cistRisk(cst, s);
  signals.cist = { status: cst, risk: cr };
  const high = signals.emergency || cr?.level === 'high' || (score != null && score < 55) || signals.cognition === 'refer'
    || signals.missedRun >= s.missedEscalateDays || signals.spo2;
  const mid = (score != null && score < 75) || signals.cognition === 'watch' || signals.cognition === 'caution'
    || signals.missedRun >= 2 || signals.hearing || cr?.level === 'mid';

  const reasons = [];
  if (signals.emergency) reasons.push('응급 표현 · 즉시 확인');
  if (signals.cognition === 'refer') reasons.push('인지 기저선 이탈 · 연계 검토');
  if (cr) reasons.push(cr.reason);
  if (signals.cognition === 'caution') reasons.push('인지 저하 신호 · 연속 이탈');
  if (signals.cognition === 'watch') reasons.push('인지 경미한 저하');
  if (signals.missedRun >= 2) reasons.push(`최근 ${signals.missedRun}일 미응답`);
  if (signals.spo2) reasons.push('야간 저산소 반복');
  if (signals.hearing) reasons.push(knownHearing ? '청력 저하 기록 · 보청기 착용·배터리 확인' : '난청 의심 · 재질문 잦음');
  if (signals.hrChange) reasons.push('안정 시 심박 변화');
  if (score != null && score < 75) reasons.push(`종합 케어 스코어 ${score}점`);

  return { level: high ? 'high' : mid ? 'mid' : 'low', score, reasons, signals };
}

// 이름 또는 담당자 검색 (공백 무시, 부분 일치). mine이 있으면 그 담당자만.
export function filterPeople(people, query, mine = null) {
  const q = (query || '').replace(/\s+/g, '');
  return people.filter(p => {
    if (mine && p.manager !== mine) return false;
    if (!q) return true;
    return (p.name || '').replace(/\s+/g, '').includes(q) || (p.manager || '').replace(/\s+/g, '').includes(q);
  });
}

// 활성 대상자 7일 통화 완료율 평균과 지난 7일 대비 변화(%p)
export function completionAvg(data, today) {
  const rates = data.people.filter(p => p.active).map(p => completion7(p, data.calls, today).rate).filter(v => v != null);
  return rates.length ? mean(rates) : null;
}
export function completionDelta(data, today) {
  const now = completionAvg(data, today), prev = completionAvg(data, addDays(today, -7));
  return { now, prev, delta: now != null && prev != null ? now - prev : null };
}

// 권장 조치 (우선 확인 목록·AI 종합 분석·돌봄일지 초안이 같은 문구를 쓴다)
export function recommendAction(risk) {
  const base = { high: '48시간 내 방문 확인', mid: '이번 주 내 전화 상담, 1주 후 재평가', low: '현 관리 유지' }[risk.level];
  const add = [];
  if (risk.signals.emergency) add.unshift('응급 표현 즉시 전화 확인');
  if (risk.signals.cognition === 'refer') add.push('치매안심센터 2단계 검사 연계 검토');
  if (risk.signals.spo2) add.push('수면무호흡 검사 의뢰 검토');
  if (risk.signals.hearing) add.push(risk.signals.hearingKnown ? '보청기 착용·배터리 확인' : '청력검사 연계 검토');
  return [base, ...add].join(' · ');
}
const nextReview = (level, today) => addDays(today, { high: 2, mid: 7, low: 14 }[level]);

// =========================================================
// 지표별 변화 추이 — 표·큰 그래프·CSV·AI 분석·일지 초안이 모두 이 계산을 쓴다
// =========================================================
export const TREND_METRICS = [
  { key: 'score', group: '인지 (통화)', label: '인지검사 점수', unit: '%', dir: 1, sdMin: s => s.sdMinScore, kind: 'call' },
  { key: 'z', group: '인지 (통화)', label: '기저선 대비 z', unit: '', dir: 1, sdMin: () => 0.5, kind: 'call' },
  { key: 'd_orientation', group: '인지 (통화)', label: '지남력', unit: '%', dir: 1, sdMin: s => s.sdMinScore, kind: 'call', domain: '지남력' },
  { key: 'd_register', group: '인지 (통화)', label: '기억 등록', unit: '%', dir: 1, sdMin: s => s.sdMinScore, kind: 'call', domain: '기억 등록' },
  { key: 'd_recall', group: '인지 (통화)', label: '지연 회상', unit: '%', dir: 1, sdMin: s => s.sdMinScore, kind: 'call', domain: '지연 회상' },
  { key: 'd_attention', group: '인지 (통화)', label: '주의력', unit: '%', dir: 1, sdMin: s => s.sdMinScore, kind: 'call', domain: '주의력' },
  { key: 'd_language', group: '인지 (통화)', label: '언어기능', unit: '%', dir: 1, sdMin: s => s.sdMinScore, kind: 'call', domain: '언어기능' },
  { key: 'd_executive', group: '인지 (통화)', label: '집행기능', unit: '%', dir: 1, sdMin: s => s.sdMinScore, kind: 'call', domain: '집행기능' },
  { key: 'latency', group: '통화 반응', label: '응답 지연', unit: '초', dir: -1, sdMin: s => s.sdMinLatency, kind: 'call' },
  { key: 'repeats', group: '통화 반응', label: '재질문', unit: '회/통화', dir: -1, sdMin: () => 0.3, kind: 'call' },
  { key: 'completion', group: '통화 반응', label: '통화 완료율', unit: '%', dir: 1, sdMin: () => 10, kind: 'call' },
  { key: 'duration', group: '통화 반응', label: '통화 시간', unit: '분', dir: 0, sdMin: () => 0.3, kind: 'call' },
  { key: 'sleepPoor', group: '자기보고', label: '잠을 설쳤다고 답한 비율', unit: '%', dir: -1, sdMin: () => 10, kind: 'call' },
  { key: 'moodBad', group: '자기보고', label: "기분 '나쁨' 비율", unit: '%', dir: -1, sdMin: () => 10, kind: 'call' },
  { key: 'c_original', group: '정기검사', label: '원형 유지 점수', unit: '점', dir: 1, sdMin: () => 2, kind: 'cist' },
  { key: 'c_scaled', group: '정기검사', label: '30점 환산', unit: '점', dir: 1, sdMin: () => 2, kind: 'cist' },
  ...CIST_DOMAINS.map(([k, label]) => ({ key: 'c_' + k, group: '정기검사', label, unit: '%', dir: 1, sdMin: () => 10, kind: 'cist', fold: true, cdomain: k })),
  { key: 'spo2Min', group: '링 (야간)', label: '야간 최저 SpO₂', unit: '%', dir: 1, sdMin: s => s.sdMinSpo2, kind: 'ring' },
  { key: 'spo2Below', group: '링 (야간)', label: 'SpO₂ 기준 미만 시간', unit: '분', dir: -1, sdMin: () => 3, kind: 'ring' },
  { key: 'hrRest', group: '링 (야간)', label: '안정 시 심박', unit: 'bpm', dir: 0, sdMin: s => s.sdMinHr, kind: 'ring' },
  { key: 'wear', group: '링 (야간)', label: '착용 시간', unit: '시간', dir: 1, sdMin: () => 0.5, kind: 'ring' },
  { key: 'validRate', group: '링 (야간)', label: '유효한 밤 비율', unit: '%', dir: 1, sdMin: () => 10, kind: 'ring' }
];
export const METRIC = Object.fromEntries(TREND_METRICS.map(m => [m.key, m]));

// 날짜별 값 [{ date, value, source, callId }] (값이 없는 날은 빠진다)
function dailyValues(data, person, m, today, getV, st) {
  const out = [];
  if (m.kind === 'ring') {
    const src = person.info?.device?.source === 'device' ? 'real' : 'demo';
    for (let d = person.enrolledAt; d <= today; d = addDays(d, 1)) {
      const v = getV(person.id, d);
      if (!v) continue;
      const ok = isValidNight(v, data.settings);
      const value = m.key === 'wear' ? v.wearHours : m.key === 'validRate' ? (ok ? 100 : 0)
        : !ok ? null : m.key === 'spo2Min' ? v.spo2Min : m.key === 'spo2Below' ? v.spo2BelowMin : v.hrRest;
      if (value != null) out.push({ date: d, value, source: src });
    }
    return out;
  }
  if (m.kind === 'cist') { // 확정 회차만. 영역은 가장 최근 회차와 방식이 같은 회차만 (방식 다름은 비교하지 않는다)
    const conf = confirmedCist(data, person.id).filter(x => x.date <= today);
    const last = conf.at(-1);
    for (const x of conf) {
      const sc = cistScore(x);
      let value;
      if (m.key === 'c_original') value = sc.original.score;
      else if (m.key === 'c_scaled') value = sc.scaled30;
      else {
        if (CIST_DOMAIN_MODES[m.cdomain].some(k => x.modes?.[k] !== last.modes?.[k])) continue;
        const b = sc.byDomain[m.cdomain];
        value = b && b.max ? (b.score / b.max) * 100 : null;
      }
      if (value != null) out.push({ date: x.date, value, source: 'demo', sessionId: x.id });
    }
    return out;
  }
  const calls = data.calls.filter(c => c.personId === person.id && c.date <= today).sort(byTime);
  if (m.key === 'completion') {
    for (let d = person.enrolledAt; d <= today; d = addDays(d, 1)) {
      if (!isCallDay(person, d)) continue;
      const day = calls.filter(c => c.date === d);
      if (d === today && !day.length) continue;
      out.push({ date: d, value: day.some(c => c.status === 'completed') ? 100 : 0, source: day[0]?.source || 'demo' });
    }
    return out;
  }
  const zBy = new Map(st.zs.map(x => [x.callId, x.z]));
  const byDate = new Map();
  for (const c of calls) {
    if (c.status === 'missed' || c.kind === 'cist') continue; // 정기 검사 통화는 '정기검사' 지표로만
    let value = null;
    const done = c.status === 'completed';
    if (m.key === 'score' && done) value = c.scorePct;
    else if (m.key === 'z' && done) value = zBy.get(c.id) ?? null;
    else if (m.domain && done) {
      const its = c.items.filter(i => i.domain === m.domain && i.score != null);
      if (its.length) value = (its.reduce((t, i) => t + i.score, 0) / its.reduce((t, i) => t + i.maxScore, 0)) * 100;
    } else if (m.key === 'latency') {
      const l = c.items.map(i => i.latencySec).filter(v => v != null);
      if (l.length) value = mean(l);
    } else if (m.key === 'repeats') value = c.items.reduce((t, i) => t + (i.repeatAsked || 0), 0);
    else if (m.key === 'duration' && done) value = c.durationSec / 60;
    else if (m.key === 'sleepPoor' && c.selfReport?.sleep?.value) value = c.selfReport.sleep.value === 'poor' ? 100 : 0;
    else if (m.key === 'moodBad' && c.selfReport?.mood?.value) value = c.selfReport.mood.value === 'bad' ? 100 : 0;
    if (value != null && Number.isFinite(value)) byDate.set(c.date, { date: c.date, value, source: c.source || 'demo', callId: c.id });
  }
  return [...byDate.values()];
}

// 한 사람의 모든 지표 추이. opts: { days: 14|30|90, weekly }
export function trendAll(data, person, opts, today, getV) {
  const s = data.settings;
  const { days = 30, weekly = false } = opts || {};
  const st = personStatus(person, data.calls, s, today, getV);
  const openCog = data.alerts.filter(a => a.personId === person.id && a.type === 'cognition' && a.status !== 'closed')
    .map(a => a.level).sort((a, b) => LEVEL_RANK[b] - LEVEL_RANK[a])[0] || null;
  const out = {};
  for (const m of TREND_METRICS) {
    const daily = dailyValues(data, person, m, today, getV, st);
    if (m.kind === 'cist') { // 정기검사: 최근 회차 · 직전 회차 · 기저선 = 처음 2회 확정 회차 평균
      const vals = daily.map(x => x.value);
      const base = vals.length >= 2 ? { mean: mean(vals.slice(0, 2)), sd: sdOf(vals.slice(0, 2)), n: 2 } : null;
      const sdEff = base ? Math.max(base.sd, m.sdMin(s)) : null;
      const recent = vals.length ? vals.at(-1) : null;
      const delta = base && vals.length >= 3 ? recent - base.mean : null;
      out[m.key] = {
        key: m.key, recent7: recent, recentN: vals.length, prev7: vals.length >= 2 ? vals.at(-2) : null, baseline: base, sdEff, delta,
        status: delta == null ? '데이터 부족' : Math.abs(delta) >= sdEff ? (delta > 0 ? '개선' : '악화') : '유지',
        series: daily, daily, alertLevel: null, real: false, cist: true, score: delta != null && sdEff ? Math.abs(delta) / sdEff : 0
      };
      continue;
    }
    const inRange = (a, b) => daily.filter(x => x.date >= addDays(today, a) && x.date <= addDays(today, b)).map(x => x.value);
    const rec = inRange(-6, 0), prev = inRange(-13, -7);
    // 기저선: 인지·통화 지표는 처음 14회 통화, 링 지표는 처음 유효한 7밤
    let baseVals = [];
    if (m.kind === 'ring') {
      const validDates = dailyValues(data, person, METRIC.spo2Min, today, getV, st).map(x => x.date).slice(0, 7);
      if (validDates.length === 7) baseVals = daily.filter(x => x.date <= validDates[6]).map(x => x.value);
    } else {
      baseVals = daily.slice(0, s.baselineDays).map(x => x.value);
      if (baseVals.length < s.baselineDays) baseVals = [];
    }
    const base = baseVals.length ? { mean: mean(baseVals), sd: sdOf(baseVals), n: baseVals.length } : null;
    const sdEff = base ? Math.max(base.sd, m.sdMin(s)) : null;
    const recent7 = rec.length ? mean(rec) : null;
    const delta = base && recent7 != null ? recent7 - base.mean : null;
    let status = '데이터 부족';
    if (base && rec.length >= 4) {
      if (Math.abs(delta) >= sdEff) status = m.dir === 0 ? '변화' : delta * m.dir > 0 ? '개선' : '악화';
      else status = '유지';
    }
    // 인지 z는 기존 알림 단계와 어긋나지 않게: 열린 인지 알림이 있으면 '악화'
    if (m.key === 'z' && openCog) status = '악화';
    // 스파크라인 시리즈 (기간 버튼·일별/주별에 따라)
    const from = addDays(today, -(days - 1));
    let series = daily.filter(x => x.date >= from);
    if (weekly) {
      const weeks = new Map();
      for (const x of series) {
        const k = Math.floor(daysBetween(from, x.date) / 7);
        if (!weeks.has(k)) weeks.set(k, []);
        weeks.get(k).push(x);
      }
      series = [...weeks.entries()].map(([k, xs]) => ({ date: addDays(from, k * 7), value: mean(xs.map(x => x.value)), source: xs.at(-1).source }));
    }
    out[m.key] = {
      key: m.key, recent7, recentN: rec.length, prev7: prev.length ? mean(prev) : null,
      baseline: base, sdEff, delta, status, series, daily,
      alertLevel: m.key === 'z' ? openCog : null,
      real: daily.some(x => x.source === 'real' && x.date >= addDays(today, -6)),
      score: delta != null && sdEff ? Math.abs(delta) / sdEff : 0
    };
  }
  return out;
}
// 지표 하나: trendSummary(data, person, metricKey, { days, weekly }, today, getV)
export const trendSummary = (data, person, key, opts, today, getV) => trendAll(data, person, opts, today, getV)[key];

// 사건 (큰 그래프·CSV): 급성질환 기간, 약물 변경일, 통화 일시중지, 방문일
export function personEvents(person, data) {
  const i = person.info || {};
  return [
    ...(i.acute || []).map(a => ({ type: '급성질환', start: a.start, end: a.end || '', label: a.name })),
    ...(i.meds || []).filter(m => m.changed).map(m => ({ type: '약물 변경', start: m.changed, end: '', label: m.name })),
    ...(i.call?.pause?.from ? [{ type: '통화 일시중지', start: i.call.pause.from, end: i.call.pause.to || '', label: i.call.pause.reason || '' }] : []),
    ...(data.visits || []).filter(v => v.personId === person.id && v.status !== 'canceled').map(v => ({ type: '방문', start: v.date, end: '', label: v.purpose || v.type }))
  ];
}

// 한 줄 요약 (큰 그래프 아래)
export function trendSentence(m, t, today) {
  if (!t.baseline || t.recent7 == null) return `${m.label} · 데이터 부족`;
  const unit = m.unit === '%' ? '%' : m.unit ? m.unit : '';
  let text = `최근 7일 ${m.label} ${f1(t.recent7)}${unit} · 기저선 ${f1(t.baseline.mean)}${unit} ± ${f1(t.baseline.sd)} 대비 ${f1(t.score)} 표준편차 ${t.delta >= 0 ? '상승' : '하락'}`;
  const lo = t.baseline.mean - t.sdEff, hi = t.baseline.mean + t.sdEff;
  // 기저선 범위를 벗어나 지금까지 이어진 첫 날
  let since = null;
  for (let k = t.daily.length - 1; k >= 0; k--) {
    const x = t.daily[k];
    if (x.value >= lo && x.value <= hi) break;
    since = x.date;
  }
  if (since && t.status !== '유지') text += ` · ${mmdd(since)}부터 기저선 범위 이탈`;
  return text;
}

// CSV 내보내기: 날짜 × 지표 (결측은 빈칸) + 사건 목록. 엑셀 한글 깨짐 방지로 UTF-8 BOM.
export function trendCsv(data, person, today, getV) {
  const t = trendAll(data, person, { days: 9999 }, today, getV);
  const cell = v => { const x = String(v ?? ''); return /[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; };
  const rows = [['date', 'source', ...TREND_METRICS.map(m => `${m.kind === 'cist' ? '정기검사 ' : ''}${m.label}${m.unit ? ` (${m.unit})` : ''}`)]];
  for (let d = person.enrolledAt; d <= today; d = addDays(d, 1)) {
    const vals = TREND_METRICS.map(m => t[m.key].daily.find(x => x.date === d));
    const srcs = [...new Set(vals.filter(Boolean).map(x => x.source))];
    rows.push([d, srcs.includes('real') ? (srcs.length > 1 ? 'demo+real' : 'real') : srcs.length ? 'demo' : '',
      ...vals.map(x => (x ? r1(x.value) : ''))]);
  }
  rows.push([], ['사건 유형', '시작', '끝', '내용']);
  for (const e of personEvents(person, data)) rows.push([e.type, e.start, e.end, e.label]);
  return '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n');
}

// ponytail: 규칙 기반 문장. 실제 LLM 연동 시 이 함수만 교체
// 저장된 측정값을 읽어 '측정값 · 기준 대비 해석' 문장을 만든다. 기준을 벗어난 항목을 먼저, 최대 7줄.
export function aiSummary(person, data, today, getV) {
  const s = data.settings;
  const risk = riskOf(person, data, today, getV);
  const { status: st, completion: comp } = risk.signals;
  const t = trendAll(data, person, { days: 30 }, today, getV);
  const items = []; // { text, off }
  const device = person.info?.device?.source === 'device';
  const noDevice = person.info?.device?.source === 'none';

  // 급성질환·약물 변경 (점수가 일시적으로 흔들릴 수 있는 인지 외 원인)
  const acute = recentAcute(person, today);
  if (acute) items.push({ label: '급성 질환', text: `최근 급성 질환(${acute.name}, ${mmdd(acute.start)}~${acute.end ? mmdd(acute.end) : ''}), 일시 하락 가능성`, off: true });
  const med = recentMedChange(person, today);
  if (med) items.push({ label: '약물 변경', text: `최근 약물 변경(${med.name}, ${mmdd(med.changed)}), 일시 변화 가능성`, off: true });

  // 통화 인지검사
  const sc = t.score;
  if (sc.recent7 == null && st.lastScore == null) items.push({ label: '통화 인지검사', text: `인지검사 · 기저선 형성 중 (0/${s.baselineDays}회)`, off: false });
  else if (!st.base.ready) items.push({ label: '통화 인지검사', text: `인지검사 점수 ${f1(sc.recent7 ?? st.lastScore)}% · 기저선 형성 중 (${st.base.n}/${s.baselineDays}회)`, off: false });
  else {
    const z = st.lastZ;
    const trend = sc.prev7 == null || sc.recent7 == null ? '' : sc.recent7 - sc.prev7 <= -3 ? ', 2주간 하락 추세' : sc.recent7 - sc.prev7 >= 3 ? ', 2주간 상승 추세' : ', 2주간 안정';
    const read = z <= s.zWatch ? `개인 기저선 대비 z ${f1(z)}` : `개인 기저선 범위 (z ${f1(z)})`;
    items.push({ label: '통화 인지검사', text: `인지검사 점수 ${f1(sc.recent7 ?? st.lastScore)}% · ${read}${trend}`, off: z <= s.zWatch || trend === ', 2주간 하락 추세' });
    // 가장 떨어진 영역
    const worst = TREND_METRICS.filter(m => m.domain).map(m => [m, t[m.key]])
      .filter(([, x]) => x.status === '악화').sort((a, b) => b[1].score - a[1].score)[0];
    if (worst) items.push({ label: '인지 영역', text: `${worst[0].label} ${f1(worst[1].recent7)}${worst[0].unit} · 기저선 ${f1(worst[1].baseline.mean)} 대비 하락`, off: true });
  }

  // 야간 SpO2 · 안정 시 심박
  const tag = device ? ' (링 실측)' : '';
  const ringNights = t.validRate.daily.filter(x => x.date >= addDays(today, -6));
  if (noDevice) { /* 웨어러블 없음: 생체신호 줄을 쓰지 않는다 */ }
  else if (device && !t.validRate.daily.length) items.push({ label: '야간 생체신호', text: '야간 SpO₂·심박 · 링 데이터 없음', off: false });
  else if (!t.spo2Min.recentN) items.push({ label: '야간 SpO₂', text: `야간 SpO₂ · 최근 7일 유효 측정 없음 (착용·신호 확인 필요)${tag}`, off: true });
  else {
    const thr = spo2Threshold(person);
    const bad = t.spo2Below.daily.filter(x => x.date >= addDays(today, -6) && x.value >= s.spo2Below90Alert).length;
    items.push({
      label: '야간 SpO₂', text: `야간 최저 SpO₂ ${f1(t.spo2Min.recent7)}% · ${thr}% 미만 ${f1(t.spo2Below.recent7)}분 (최근 7일 중 ${bad}밤)${thr !== 90 ? ' · 개인 기준' : ''}${tag}`,
      off: bad >= s.spo2AlertNights || risk.signals.spo2
    });
    const hr = t.hrRest;
    if (hr.delta != null && Math.abs(hr.delta) >= 5) items.push({ label: '안정 시 심박', text: `안정 시 심박 ${f1(hr.recent7)} bpm · 평소 대비 ${hr.delta > 0 ? '+' : ''}${f1(hr.delta)} bpm${tag}`, off: Math.abs(hr.delta) >= 8 });
  }

  // 정기 인지검사(전화형): 확정 회차만
  const cs = risk.signals.cist.status;
  if (cs.latest) {
    const o = cs.score.original, ch = cs.change;
    const worst = ch && Object.entries(ch.byDomain).filter(([, v]) => v?.diff < 0).sort((a, b) => a[1].diff - b[1].diff)[0];
    const label = worst ? CIST_DOMAINS.find(([k]) => k === worst[0])[1] : null;
    items.push({ label: '정기 인지검사', text: `정기검사 원형 유지 ${o.score}/${o.max}`
      + (ch?.original.comparable ? ` · 직전 대비 ${ch.original.diff > 0 ? '+' : ch.original.diff < 0 ? '−' : '±'}${Math.abs(ch.original.diff)}` : ch ? ' · 직전과 방식 다름' : ' · 첫 회차')
      + (label ? ` · ${label} 하락` : ''), off: !!risk.signals.cist.risk });
  } else if (cs.draft) items.push({ label: '정기 인지검사', text: '정기검사 채점 확인 대기', off: false });

  // 통화 응답
  const run = risk.signals.missedRun;
  if (!comp.days) items.push({ label: '통화 응답', text: '통화 기록 없음', off: false });
  else items.push({
    label: '통화 응답', text: `최근 7일 통화 완료 ${comp.done}/${comp.days}` + (run >= 2 ? ` · ${run}일 연속 미응답` : comp.rate != null && comp.rate < 80 ? ' · 목표 80% 미달' : ' · 응답 양호'),
    off: run >= 2 || (comp.rate != null && comp.rate < 80)
  });

  // 재질문
  if (t.repeats.recent7 != null) {
    const avg = t.repeats.recent7;
    const read = risk.signals.hearing ? (risk.signals.hearingKnown ? '청력 저하 기록 · 보청기 착용·배터리 확인' : '난청 의심') : avg >= 1 ? '가끔 되물음' : '정상 범위';
    items.push({ label: '재질문', text: `통화당 재질문 ${f1(avg)}회 · ${read}`, off: risk.signals.hearing });
  }

  // 자기보고 수면
  if (t.sleepPoor.recentN) items.push({ label: '수면 자기보고', text: `잠을 설쳤다고 답함 ${f1(t.sleepPoor.recent7)}% · ${t.sleepPoor.status === '악화' ? '평소보다 늘어남' : '평소 수준'}`, off: t.sleepPoor.status === '악화' });

  // 야간 착용
  if (!noDevice && (ringNights.length || !device)) {
    const worn = t.wear.daily.filter(x => x.date >= addDays(today, -6) && x.value >= 4).length;
    items.push({ label: '야간 착용', text: `야간 착용 ${worn}/7밤 · ${worn >= 5 ? '측정 양호' : '착용 권장 필요'}${tag}`, off: worn < 5 });
  }

  const bullets = [...items.filter(i => i.off), ...items.filter(i => !i.off)].slice(0, 7);
  return { bullets, action: recommendAction(risk), risk };
}

// =========================================================
// 돌봄일지 초안 (SOAP)
// =========================================================
// 규칙 기반 초안. LLM 연동 시 이 함수만 교체 (API 키는 브라우저에 두면 안 되니 서버 필요)
export function journalDraft(person, data, today, getV) {
  const lastFinal = (data.journals || []).filter(j => j.personId === person.id && j.status === 'final' && j.date <= today)
    .map(j => j.date).sort().at(-1);
  const from = lastFinal ? addDays(lastFinal, 1) : addDays(today, -6);
  const calls = data.calls.filter(c => c.personId === person.id && c.date >= from && c.date <= today).sort(byTime);
  const t = trendAll(data, person, { days: 30 }, today, getV);
  const risk = riskOf(person, data, today, getV);
  const st = risk.signals.status;
  const device = person.info?.device?.source === 'device';

  // S: 대상자가 실제로 한 말을 따옴표로 그대로 인용 (요청·수면 불편·기분 나쁨을 먼저)
  const quotes = [];
  for (const c of [...calls].reverse()) {
    const add = (text, tag, prio) => { if (text && text.trim()) quotes.push({ date: c.date, text: text.trim(), tag, prio }); };
    if (c.selfReport?.sleep) add(c.selfReport.sleep.answer, '수면', c.selfReport.sleep.value === 'poor' ? 1 : 3);
    if (c.selfReport?.mood) add(c.selfReport.mood.answer, '기분', c.selfReport.mood.value === 'bad' ? 1 : 3);
    if (c.chat) add(c.chat.answer, c.requests?.length ? '요청' : '안부 대화', c.requests?.length ? 0 : 2);
  }
  // AI 통화 후 정리: 인용 검사를 통과한 요청·관찰 메모의 말을 같은 방식으로 인용
  for (const c of calls) for (const x of [...(c.aiSummary?.requests || []), ...(c.aiSummary?.concerns || [])]) {
    if (!quotes.some(q => q.text.includes(x.quote))) quotes.push({ date: c.date, text: x.quote, tag: x.text, prio: 0 });
  }
  const S = quotes.sort((a, b) => a.prio - b.prio || b.date.localeCompare(a.date)).slice(0, 5)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(q => `- ${mmdd(q.date)} "${q.text}" (${q.tag})`).join('\n') || '- 통화 기록 없음';

  // O: trendSummary 결과
  const done = calls.filter(c => c.status === 'completed').length;
  const target = [...new Set(calls.map(c => c.date))].length;
  const worst = TREND_METRICS.filter(m => m.domain).map(m => [m, t[m.key]]).filter(([, x]) => x.delta != null)
    .sort((a, b) => a[1].delta / a[1].sdEff - b[1].delta / b[1].sdEff)[0];
  const cs = risk.signals.cist.status, csc = cs.score;
  const O = [
    `- 통화 완료 ${done}/${target} (${mmdd(from)}~${mmdd(today)})`,
    cs.latest ? `- 정기 인지검사(전화형) ${mmdd(cs.latest.date)}: 원형 유지 ${csc.original.score}/${csc.original.max} · 30점 환산 ${f1(csc.scaled30)}점${cs.change?.original.comparable ? ` · 직전 대비 ${cs.change.original.diff > 0 ? '+' : ''}${cs.change.original.diff}` : ''}` : null,
    `- 인지검사 점수 최근 7일 ${f1(t.score.recent7)}%` + (st.base.ready ? ` · 최근 z ${f1(st.lastZ)} (기저선 ${f1(st.base.mean)}% ± ${f1(st.base.sd)})` : ` · 기저선 형성 중 (${st.base.n}/${data.settings.baselineDays}회)`),
    worst ? `- 가장 떨어진 영역: ${worst[0].label} 최근 7일 ${f1(worst[1].recent7)}${worst[0].unit} (기저선 ${f1(worst[1].baseline.mean)}${worst[0].unit})` : null,
    `- 응답 지연 ${f1(t.latency.recent7)}초 · 재질문 ${f1(t.repeats.recent7)}회/통화`,
    device && !t.validRate.daily.length ? '- 링 데이터 없음'
      : t.spo2Min.recentN ? `- 야간 최저 SpO₂ ${f1(t.spo2Min.recent7)}% · 기준(${spo2Threshold(person)}%) 미만 ${f1(t.spo2Below.recent7)}분 · 안정 시 심박 ${f1(t.hrRest.recent7)} bpm${device ? ' (링 실측)' : ''}`
      : '- 야간 생체신호: 최근 7일 유효 측정 없음'
  ].filter(Boolean).join('\n');

  // A: 위험도와 사유, 감별 체크리스트, 인지 외 원인
  const auto = autoChecklist(person, today);
  const cogAlert = data.alerts.find(a => a.personId === person.id && a.type === 'cognition' && a.status !== 'closed');
  const checks = { ...(cogAlert?.checklist || {}), ...Object.fromEntries(Object.entries(auto).filter(([, v]) => v)) };
  const CHECK_NAMES = { acute: '최근 급성 질환', sleep: '수면 부족', meds: '약물 변경', mood: '우울감', hearing: '청력 저하' };
  const checked = Object.entries(checks).filter(([, v]) => v).map(([k]) => CHECK_NAMES[k]);
  const other = [];
  const acute = recentAcute(person, today);
  if (acute) other.push(`급성 질환(${acute.name}, ${mmdd(acute.start)}~${acute.end ? mmdd(acute.end) : ''})`);
  const med = recentMedChange(person, today);
  if (med) other.push(`약물 변경(${med.name}, ${mmdd(med.changed)})`);
  if (t.sleepPoor.recent7 >= 50) other.push(`수면 불편 자기보고 ${f1(t.sleepPoor.recent7)}%`);
  const aiNotes = calls.filter(c => c.aiSummary).flatMap(c => [
    c.aiSummary.summary ? `${mmdd(c.date)} ${c.aiSummary.summary}` : null,
    ...(c.aiSummary.concerns || []).map(x => `${mmdd(c.date)} 관찰 메모: ${x.text}`)
  ]).filter(Boolean).slice(-4);
  const A = [
    `- 위험도 ${RISK_LABEL[risk.level]}${risk.reasons.length ? `: ${risk.reasons.join(', ')}` : ''}`,
    `- 감별 체크리스트: ${checked.length ? checked.join(', ') + ' 해당' : '해당 항목 없음'}`,
    other.length ? `- 인지 외 원인 가능성: ${other.join(', ')}` : '- 확인된 인지 외 원인 없음',
    ...aiNotes.map(t => `- 통화 정리(AI 참고): ${t}`),
    ...(cs.latest ? cistModeNotes(cs.latest).map(t => `- 정기검사 ${t}`) : [])
  ].join('\n');

  // P: 권장 조치와 다음 재평가 날짜
  const P = `- ${recommendAction(risk)}\n- 다음 재평가: ${nextReview(risk.level, today)}`;

  return { personId: person.id, date: today, type: '전화 상담', status: 'draft', auto: true, from, S, O, A, P };
}

// =========================================================
// 정기 인지검사(전화형) — 점수는 cistScore·cistChange 두 함수만 계산한다. 모든 화면이 이것만 부른다.
// 초안(draft)은 어디에도 점수로 쓰지 않는다: 회차 비교·위험도·변화 추이·AI 분석·일지 초안은 확정 회차만.
// =========================================================
// 영역마다 점수에 영향을 주는 방식 (이 방식이 두 회차에서 같아야 영역 점수를 비교한다)
export const CIST_DOMAIN_MODES = { orientation: ['place'], memory: [], attention: ['reverseWord'], visuospatial: ['visuospatial'], executive: ['fluency', 'visualReasoning'], language: ['comprehension'] };
const sumOf = items => ({ score: items.reduce((t, i) => t + (i.score ?? 0), 0), max: items.reduce((t, i) => t + i.maxScore, 0) });

// → { total, scaled30, original, byDomain, pending, omitted }
export function cistScore(session) {
  const done = (session?.items || []).filter(i => i.status !== 'omitted');
  const total = sumOf(done);
  const original = sumOf(done.filter(i => i.fidelity === 'original'));
  const byDomain = Object.fromEntries(CIST_DOMAINS.map(([k]) => {
    const its = done.filter(i => i.domain === k);
    return [k, its.length ? sumOf(its) : null]; // 시행 안 한 영역은 null ('미시행', 0점 아님)
  }));
  return {
    total, original, byDomain,
    scaled30: total.max ? Math.round((total.score / total.max) * 300) / 10 : null,
    pending: done.filter(i => i.status === 'needs_review').length,
    omitted: (session?.items || []).filter(i => i.status === 'omitted').map(i => i.domain)
  };
}

// 회차 비교: 원형 유지 점수는 두 회차에 모두 있는 원형 문항만으로, 영역은 방식이 같을 때만.
// → { original: { diff, comparable }, byDomain: { key: { diff } | { modeDiff: true } | null } }
export function cistChange(prev, curr) {
  if (!prev || !curr || prev.status !== 'confirmed' || curr.status !== 'confirmed') return null;
  const ids = s => new Set(s.items.filter(i => i.fidelity === 'original' && i.status !== 'omitted').map(i => i.id));
  const a = ids(prev), b = ids(curr);
  const both = [...a].filter(x => b.has(x));
  const part = s => s.items.filter(i => both.includes(i.id)).reduce((t, i) => t + (i.score ?? 0), 0);
  const P = cistScore(prev), C = cistScore(curr);
  const byDomain = Object.fromEntries(CIST_DOMAINS.map(([k]) => {
    if (CIST_DOMAIN_MODES[k].some(m => prev.modes?.[m] !== curr.modes?.[m])) return [k, { modeDiff: true }];
    if (!P.byDomain[k] || !C.byDomain[k]) return [k, null];
    return [k, { diff: C.byDomain[k].score - P.byDomain[k].score }];
  }));
  return { original: { diff: part(curr) - part(prev), comparable: a.size === b.size && both.length === a.size }, byDomain };
}

export const cistSessionsOf = (data, personId) => (data.cistSessions || []).filter(x => x.personId === personId).sort((a, b) => a.date.localeCompare(b.date));
export const confirmedCist = (data, personId) => cistSessionsOf(data, personId).filter(x => x.status === 'confirmed');

// 다음 정기 검사일: 담당자가 정한 날(info.call.cistNext) → 없으면 등록일(첫 검사) 또는 마지막 회차 + 주기
export function cistDue(person, data) {
  if (person.info?.call?.cistNext) return person.info.call.cistNext;
  const last = cistSessionsOf(data, person.id).at(-1);
  return last ? addDays(last.date, (data.settings.cistIntervalWeeks || 4) * 7) : person.enrolledAt;
}
// 한 사람의 정기 검사 상태 (대시보드·목록·상세·알림·위험도가 같이 쓴다)
export function cistStatus(person, data, today) {
  const all = cistSessionsOf(data, person.id);
  const conf = all.filter(x => x.status === 'confirmed');
  const latest = conf.at(-1) || null, prev = conf.at(-2) || null, prev2 = conf.at(-3) || null;
  const due = cistDue(person, data);
  return {
    latest, prev, draft: all.filter(x => x.status === 'draft').at(-1) || null, count: all.length,
    score: latest ? cistScore(latest) : null,
    change: cistChange(prev, latest), change2: cistChange(prev2, prev),
    due, doneToday: all.some(x => x.date === today),
    isDueToday: person.active && due <= today && !all.some(x => x.date === today),
    delayed: person.active && daysBetween(due, today) >= 7 && !all.some(x => x.date >= due)
  };
}
// 위험도 규칙: 확정 회차끼리, 원형 문항이 같은 비교만. 절단점(점수 자체로 정상·이상)은 쓰지 않는다.
export function cistRisk(st, s) {
  const d1 = st.change?.original.comparable ? -st.change.original.diff : null; // 하락하면 양수
  const d2 = st.change2?.original.comparable ? -st.change2.original.diff : null;
  if (d1 > 0 && d2 > 0 && d1 + d2 >= 4) return { level: 'high', reason: '정기검사 연속 하락', drop: d1 };
  if (d1 != null && d1 >= (s.cistDropAlert ?? 3)) return { level: 'mid', reason: `정기검사 원형 유지 ${d1}점 하락`, drop: d1 };
  return null;
}
// 알림 맞추기: '채점 확인 대기'(초안이 있으면 관찰, 확정하면 닫힘) · '정기검사 지연'(예정일 +7일, 시행하면 닫힘)
export function syncCistAlerts(data, today, now) {
  for (const p of data.people) {
    const st = cistStatus(p, data, today);
    const want = { cistReview: !!st.draft && p.active, cistOverdue: st.delayed };
    for (const [type, on] of Object.entries(want)) {
      const open = data.alerts.find(a => a.personId === p.id && a.type === type && a.status !== 'closed');
      if (on && !open) data.alerts.push({ id: 'al' + type + p.id + now.replace(/\D/g, ''), personId: p.id, createdAt: now, type, level: 'watch', status: 'open',
        referredAt: null, notifiedAt: null, notifiedTo: null, outcome: null, checklist: {}, note: type === 'cistOverdue' ? `예정일 ${st.due}` : '' });
      if (!on && open) { open.status = 'closed'; open.note = (open.note ? open.note + ' · ' : '') + (type === 'cistReview' ? '채점 확정' : '검사 시행'); }
    }
  }
}
// 운영 지표: 이행률(예정일 ±3일 안에 시행) · 채점 확정까지 평균 일수
export function cistOps(data, today, periodDays) {
  const start = periodDays ? addDays(today, -(periodDays - 1)) : '0000-00-00';
  const ses = (data.cistSessions || []).filter(x => x.date >= start && x.date <= today);
  const onTime = ses.filter(x => x.dueDate && Math.abs(daysBetween(x.dueDate, x.date)) <= 3).length;
  const late = data.people.filter(p => { const st = cistStatus(p, data, today); return p.active && st.due >= start && daysBetween(st.due, today) > 3 && !st.doneToday && !(data.cistSessions || []).some(x => x.personId === p.id && x.date >= st.due); }).length;
  const conf = ses.filter(x => x.status === 'confirmed' && x.confirmedAt);
  return {
    onTimeRate: ses.length + late ? (onTime / (ses.length + late)) * 100 : null,
    avgConfirmDays: conf.length ? mean(conf.map(x => daysBetween(x.date, x.confirmedAt.slice(0, 10)))) : null,
    pending: (data.cistSessions || []).filter(x => x.status === 'draft').length
  };
}

// 기본 방식과 다르게 한 영역·미시행 영역 (일지 초안 A, 상세 표의 칩)
export function cistModeNotes(session) {
  const out = [];
  const changed = Object.entries(session.modes || {}).filter(([k, v]) => v !== CIST_DEFAULTS[k]).map(([k, v]) => `${CIST_MODE_LABEL[k]}(${CIST_OPTION_LABEL[k][v]})`);
  if (changed.length) out.push(`방식 변경: ${changed.join(', ')}`);
  const omitted = [...new Set((session.items || []).filter(i => i.status === 'omitted').map(i => (i.note || i.domain).replace(/\s*미시행$/, '')))];
  if (omitted.length) out.push(`미시행: ${omitted.join(', ')}`);
  if (session.autoSwitch) out.push(`자동 전환: ${session.autoSwitch}`);
  return out;
}
