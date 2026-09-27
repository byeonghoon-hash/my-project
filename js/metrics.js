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

// =========================================================
// 위험도 · 종합 케어 스코어 · AI 종합 분석
// 실제로 측정하는 것만 쓴다: 통화 인지검사, 통화 응답, 야간 SpO2, 안정 시 심박(맥박)
// =========================================================

// 최근 7일 통화 완료율. 대상일은 dashboard와 같은 방식(어제까지 + 오늘 기록이 있으면 오늘).
export function completion7(person, calls, today) {
  const start = addDays(today, -6);
  const from = start > person.enrolledAt ? start : person.enrolledAt;
  const mine = calls.filter(c => c.personId === person.id && c.date >= from && c.date <= today);
  const end = mine.some(c => c.date === today) ? today : addDays(today, -1);
  let days = 0, done = 0;
  for (let d = from; d <= end; d = addDays(d, 1)) {
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
  const bad = recent.filter(v => v.spo2Below90Min >= s.spo2Below90Alert);
  const hrNow = recent.length ? mean(recent.map(v => v.hrRest)) : null;
  const hrBase = before.length >= 7 ? mean(before.map(v => v.hrRest)) : null;
  return {
    validNights: recent.length,
    badNights: bad.length,
    spo2Min: recent.length ? Math.min(...recent.map(v => v.spo2Min)) : null,
    below90Max: recent.length ? Math.max(...recent.map(v => v.spo2Below90Min)) : null,
    hrNow,
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
  const signals = {
    cognition: openLevel('cognition'),
    spo2: !!openLevel('spo2'),
    hearing: !!openLevel('hearing'),
    missedRun: missedRun(calls),
    hrChange: night.hrDelta != null && Math.abs(night.hrDelta) >= 8,
    status: st, completion: comp, night, parts
  };

  const high = (score != null && score < 55) || signals.cognition === 'refer'
    || signals.missedRun >= s.missedEscalateDays || signals.spo2;
  const mid = (score != null && score < 75) || signals.cognition === 'watch' || signals.cognition === 'caution'
    || signals.missedRun >= 2 || signals.hearing;

  const reasons = [];
  if (signals.cognition === 'refer') reasons.push('인지 기저선 이탈 · 연계 검토');
  if (signals.cognition === 'caution') reasons.push('인지 저하 신호 · 연속 이탈');
  if (signals.cognition === 'watch') reasons.push('인지 경미한 저하');
  if (signals.missedRun >= 2) reasons.push(`최근 ${signals.missedRun}일 미응답`);
  if (signals.spo2) reasons.push('야간 저산소 반복');
  if (signals.hearing) reasons.push('난청 의심 · 재질문 잦음');
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

// 권장 조치 (우선 확인 목록과 AI 종합 분석이 같은 문구를 쓴다)
export function recommendAction(risk) {
  const base = { high: '48시간 내 방문 확인', mid: '이번 주 내 전화 상담, 1주 후 재평가', low: '현 관리 유지' }[risk.level];
  const add = [];
  if (risk.signals.cognition === 'refer') add.push('치매안심센터 2단계 검사 연계 검토');
  if (risk.signals.spo2) add.push('수면무호흡 검사 의뢰 검토');
  if (risk.signals.hearing) add.push('청력검사 연계 검토');
  return [base, ...add].join(' · ');
}

// ponytail: 규칙 기반 문장. 실제 LLM 연동 시 이 함수만 교체
// 저장된 측정값을 읽어 '측정값 · 기준 대비 해석' 문장을 만든다. 기준을 벗어난 항목을 먼저, 최대 7줄.
export function aiSummary(person, data, today, getV) {
  const s = data.settings;
  const risk = riskOf(person, data, today, getV);
  const { status: st, completion: comp, night } = risk.signals;
  const calls = data.calls.filter(c => c.personId === person.id).sort(byTime);
  const items = []; // { text, off }
  const f1 = v => (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, '');

  // 통화 인지검사
  if (st.lastScore == null) items.push({ text: '통화 인지검사 · 완료된 검사 없음', off: true });
  else if (!st.base.ready) items.push({ text: `인지검사 점수 ${f1(st.lastScore)}% · 기저선 형성 중 (${st.base.n}/${s.baselineDays}회)`, off: false });
  else {
    const scored = calls.filter(c => c.status === 'completed' && c.scorePct != null && c.date >= addDays(today, -13));
    const pts = scored.map(c => [daysBetween(today, c.date), c.scorePct]);
    let slope = null;
    if (pts.length >= 3) {
      const mx = mean(pts.map(p => p[0])), my = mean(pts.map(p => p[1]));
      const sxx = pts.reduce((t, p) => t + (p[0] - mx) ** 2, 0);
      slope = sxx ? pts.reduce((t, p) => t + (p[0] - mx) * (p[1] - my), 0) / sxx : null;
    }
    const trend = slope == null ? '' : slope <= -0.3 ? ', 2주간 하락 추세' : slope >= 0.3 ? ', 2주간 상승 추세' : ', 2주간 안정';
    const z = st.lastZ;
    const read = z <= s.zWatch ? `개인 기저선 대비 z ${f1(z)}` : `개인 기저선 범위 (z ${f1(z)})`;
    items.push({ text: `인지검사 점수 ${f1(st.lastScore)}% · ${read}${trend}`, off: z <= s.zWatch || (slope != null && slope <= -0.3) });
  }

  // 야간 SpO2
  if (!night.validNights) items.push({ text: '야간 SpO₂ · 최근 7일 유효 측정 없음 (착용·신호 확인 필요)', off: true });
  else if (night.badNights) {
    items.push({ text: `야간 최저 SpO₂ ${night.spo2Min}% · 90% 미만 ${night.below90Max}분 (최근 7일 중 ${night.badNights}밤)`, off: night.badNights >= s.spo2AlertNights || risk.signals.spo2 });
  } else items.push({ text: `야간 최저 SpO₂ ${night.spo2Min}% · 90% 미만 기준 초과 없음`, off: false });

  // 안정 시 심박: 평소 대비 변화가 있을 때만
  if (night.hrDelta != null && Math.abs(night.hrDelta) >= 5) {
    items.push({ text: `안정 시 심박 ${Math.round(night.hrNow)}bpm · 평소 대비 ${night.hrDelta > 0 ? '+' : ''}${Math.round(night.hrDelta)}bpm`, off: Math.abs(night.hrDelta) >= 8 });
  }

  // 통화 응답
  const run = risk.signals.missedRun;
  items.push({
    text: `최근 7일 통화 완료 ${comp.done}/${comp.days}` + (run >= 2 ? ` · ${run}일 연속 미응답` : comp.rate != null && comp.rate < 80 ? ' · 목표 80% 미달' : ' · 응답 양호'),
    off: run >= 2 || (comp.rate != null && comp.rate < 80)
  });

  // 재질문 (난청 의심 지표)
  const answered = calls.filter(c => c.status !== 'missed').slice(-5);
  if (answered.length) {
    const avg = mean(answered.map(c => c.items.reduce((t, i) => t + (i.repeatAsks || 0), 0)));
    items.push({ text: `통화당 재질문 ${f1(avg)}회 · ${risk.signals.hearing ? '난청 의심' : avg >= 1 ? '가끔 되물음' : '정상 범위'}`, off: risk.signals.hearing });
  }

  // 야간 착용
  let worn = 0;
  for (let k = 0; k < 7; k++) { const v = getV(person.id, addDays(today, -k)); if (v && v.wearHours >= 4) worn++; }
  items.push({ text: `야간 착용 ${worn}/7밤 · ${worn >= 5 ? '측정 양호' : '착용 권장 필요'}`, off: worn < 5 });

  const bullets = [...items.filter(i => i.off), ...items.filter(i => !i.off)].slice(0, 7);
  return { bullets, action: recommendAction(risk), risk };
}
