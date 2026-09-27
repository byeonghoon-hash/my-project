// 지표, 개인 기저선, z-score, 알림 단계 계산. 순수 함수만 둔다 (DOM 사용 금지).

// 판정 파라미터 기본값. 관리자 화면 '설정'에서 모두 바꿀 수 있다.
export const DEFAULT_SETTINGS = {
  baselineDays: 14,        // 기저선 = 등록 후 처음 14회 완료 통화 점수의 평균·표준편차
  zWatch: -1.5,            // 관찰: 하루라도 z ≤ -1.5
  cautionRun: 3,           // 주의: 최근 완료 통화 3회 연속 z ≤ zWatch
  referRun: 5,             // 의뢰: 5회 연속 z ≤ zWatch, 또는 최근 7회 평균 z ≤ zRefer
  zRefer: -2.0,
  missedEscalateDays: 3,   // 3일 연속 무응답 → 안부확인 알림
  sqiMin: 0.6,
  spo2Below90Alert: 10,    // 90% 미만 10분 이상인 밤이
  spo2AlertNights: 3,      //   최근 7일 중 3밤 이상 → 수면무호흡 의심 알림
  hearingRepeatAsks: 2,    // 통화당 재질문 2회 이상이
  hearingCalls: 3,         //   최근 5통화 중 3회 이상 → 난청 의심 알림
  parallelSets: 6,         // 평행형 문항 세트 수 N
  maxCallSec: 180
};

export const LEVEL_RANK = { watch: 1, caution: 2, refer: 3 };

// ---------- 날짜 ('YYYY-MM-DD' 문자열로 다룬다) ----------
const pad = n => String(n).padStart(2, '0');
const utc = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));

export const todayStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const nowStamp = (d = new Date()) => `${todayStr(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const addDays = (s, n) => new Date(utc(s) + n * 864e5).toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((utc(b) - utc(a)) / 864e5);

const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const byTime = (a, b) => (a.date + (a.startedAt || '')).localeCompare(b.date + (b.startedAt || ''));

// ---------- 기저선과 z-score ----------

// scores: 완료 통화 점수(%)를 시간 순서대로
export function baseline(scores, s) {
  const first = scores.slice(0, s.baselineDays);
  const n = first.length;
  if (n === 0) return { ready: false, n, mean: null, sd: null };
  const m = mean(first);
  let sd = n > 1 ? Math.sqrt(first.reduce((t, x) => t + (x - m) ** 2, 0) / (n - 1)) : 0;
  if (sd < 5) sd = 5; // 표준편차가 너무 작으면(0 포함) 5로 둔다 (0으로 나누기·과민 판정 방지)
  return { ready: n >= s.baselineDays, n, mean: m, sd };
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

export const isValidNight = (v, s) => !!v && v.sqi >= s.sqiMin && v.wearHours >= 4;

// 가장 최근부터 거꾸로 센 연속 무응답 수
export function missedRun(calls) {
  const sorted = [...calls].sort(byTime);
  let run = 0;
  for (let i = sorted.length - 1; i >= 0 && sorted[i].status === 'missed'; i--) run++;
  return run;
}

// 최근 5통화(받은 통화) 중 재질문이 기준 이상인 통화 수
export function hearingCount(calls, s) {
  return [...calls].sort(byTime).filter(c => c.status !== 'missed').slice(-5)
    .filter(c => c.items.reduce((t, i) => t + (i.repeatAsks || 0), 0) >= s.hearingRepeatAsks).length;
}

// 최근 7일 중 SpO2 90% 미만이 기준 이상인 (유효한) 밤 수
export function spo2Nights(personId, today, s, getV) {
  let n = 0;
  for (let k = 0; k < 7; k++) {
    const v = getV(personId, addDays(today, -k));
    if (isValidNight(v, s) && v.spo2Below90Min >= s.spo2Below90Alert) n++;
  }
  return n;
}

// ---------- 대상자 한 명의 현재 상태 ----------
export function personStatus(person, allCalls, s, today, getV) {
  const calls = allCalls.filter(c => c.personId === person.id).sort(byTime);
  const scored = calls.filter(c => c.status === 'completed' && c.scorePct != null);
  const base = baseline(scored.map(c => c.scorePct), s);
  const zs = base.ready ? scored.map(c => ({ date: c.date, z: zScore(c.scorePct, base) })) : [];
  const lastScored = scored.at(-1);
  return {
    base,
    zs,
    baseStart: scored[0]?.date ?? null,
    baseEnd: base.ready ? scored[s.baselineDays - 1].date : null,
    lastCallDate: calls.at(-1)?.date ?? null,
    lastScore: lastScored?.scorePct ?? null,
    lastZ: zs.at(-1)?.z ?? null,
    slope: slope30(scored, today),
    levels: {
      cognition: base.ready ? cognitionLevel(zs.slice(s.baselineDays).map(x => x.z), s) : null,
      noAnswer: missedRun(calls) >= s.missedEscalateDays ? 'caution' : null,
      spo2: spo2Nights(person.id, today, s, getV) >= s.spo2AlertNights ? 'caution' : null,
      hearing: hearingCount(calls, s) >= s.hearingCalls ? 'watch' : null
    }
  };
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
        referredAt: null, notifiedAt: null, outcome: null, checklist: {}, note: ''
      });
    }
  }
  return alerts;
}

// ---------- 관리자 지표 카드 ----------
// periodDays: 7 | 30 | null(전체). 비율은 0~100, 분모가 0이면 null.
// 발신 대상일: 활성 대상자별로 등록일(또는 기간 시작일)부터 어제까지 + 오늘 통화 기록이 있으면 오늘.
export function dashboard(data, periodDays, today, getV) {
  const s = data.settings;
  const pct = (a, b) => (b ? (a / b) * 100 : null);
  const start = periodDays ? addDays(today, -(periodDays - 1)) : null;
  let target = 0, done = 0, missed = 0, durSum = 0, durN = 0, vDays = 0, valid = 0, worn = 0;

  const active = data.people.filter(p => p.active);
  for (const p of active) {
    const from = start && start > p.enrolledAt ? start : p.enrolledAt;
    const calls = data.calls.filter(c => c.personId === p.id && c.date >= from && c.date <= today);
    const end = calls.some(c => c.date === today) ? today : addDays(today, -1);
    for (let d = from; d <= end; d = addDays(d, 1)) {
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
    for (const c of calls) if (c.status === 'completed') { durSum += c.durationSec; durN++; }
  }

  const eligible = active.filter(p => daysBetween(p.enrolledAt, today) >= 56);
  const recent = addDays(today, -6);
  const retained = eligible.filter(p =>
    data.calls.some(c => c.personId === p.id && c.status === 'completed' && c.date >= recent && c.date <= today));

  const cogPeople = new Set(data.alerts.filter(a => a.type === 'cognition').map(a => a.personId));
  const refers = data.alerts.filter(a => a.level === 'refer');
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
