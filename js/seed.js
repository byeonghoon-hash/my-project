// 시연용 대상자 10명과 61일치(오늘 포함) 가상 기록 생성. 날짜는 오늘 기준으로 거꾸로 만든다.
// 사람마다 원하는 성향(위험도 높음 2 · 주의 3 · 낮음 5)이 나올 때까지 난수 시드를 바꿔 가며 만든다.

import { DEFAULT_SETTINGS, addDays, todayStr, nowStamp, personStatus, updateAlerts, riskOf } from './metrics.js';
import { planForDate, scorePct } from './items.js';

// 시드 버전. 올리면 저장된 시연 데이터를 새로 만든다 (회원 계정은 유지).
export const SEED_VERSION = 2;

// 좌표 안내: 개발 환경에서 Nominatim이 막혀 리별 중심 좌표를 조회하지 못했다.
// 아래 좌표는 웅촌면 경계(js/ungchon.js) 안에서 각 리의 대략적인 위치로 잡은 추정값이다.
// 틀리면 대상자 상세 > 정보 수정에서 위도·경도를 고치면 된다.
const PEOPLE = [
  { name: '김순자', sex: '여', age: 78, kind: 'stable', time: '09:30', ri: '초천리', lat: 35.4603, lng: 129.1812, manager: '박지연 간호사' },
  { name: '이영수', sex: '남', age: 81, kind: 'stable', time: '10:00', ri: '석천리', lat: 35.4706, lng: 129.2008, manager: '김민수 사회복지사' },
  { name: '박영자', sex: '여', age: 74, kind: 'stable', time: '10:30', ri: '검단리', lat: 35.4541, lng: 129.2296, manager: '윤병훈 간호사' },
  { name: '최말순', sex: '여', age: 83, kind: 'stable', time: '11:00', ri: '은현리', lat: 35.4566, lng: 129.2127, manager: '박지연 간호사' },
  { name: '정옥자', sex: '여', age: 79, kind: 'decline', time: '09:00', ri: '고연리', lat: 35.4986, lng: 129.2047, manager: '윤병훈 간호사' },
  { name: '강만복', sex: '남', age: 76, kind: 'hypoxia', time: '14:00', ri: '대대리', lat: 35.4762, lng: 129.2344, manager: '김민수 사회복지사' },
  { name: '조복례', sex: '여', age: 85, kind: 'hearing', time: '15:00', ri: '통천리', lat: 35.4788, lng: 129.2473, manager: '박지연 간호사' },
  { name: '윤칠성', sex: '남', age: 80, kind: 'noAnswer', time: '16:00', ri: '대복리', lat: 35.4877, lng: 129.2206, manager: '윤병훈 간호사' },
  { name: '한정순', sex: '여', age: 77, kind: 'stable', time: '13:30', ri: '곡천리', lat: 35.4648, lng: 129.2231, manager: '김민수 사회복지사' },
  // 대학길 27 (곡천리, 춘해보건대학교 옆). 좌표는 곡천리 중심 부근의 추정값 — 실제 위치 확인 필요.
  { name: '윤병훈', sex: '남', age: 78, kind: 'mild', time: '10:00', address: '울산광역시 울주군 웅촌면 대학길 27', lat: 35.4661, lng: 129.2263, manager: '박지연 간호사', livesAlone: true }
];

// 성향별로 나와야 하는 판정
const WANT = {
  stable: r => r.level === 'low',
  decline: r => r.level === 'high' && r.signals.cognition === 'refer',
  hypoxia: r => r.level === 'high' && r.signals.spo2 && !r.signals.cognition,
  hearing: r => r.level === 'mid' && r.signals.hearing && !r.signals.cognition,
  noAnswer: r => r.level === 'mid' && r.signals.missedRun === 2 && !r.signals.cognition,
  mild: r => r.level === 'mid' && r.signals.cognition === 'watch' && r.signals.missedRun < 2
    && r.signals.status.lastZ <= -1.5 && r.signals.status.lastZ >= -1.85
};

export function makeSeed(settings = DEFAULT_SETTINGS, today = todayStr()) {
  const start = addDays(today, -60);
  const data = { seedVersion: SEED_VERSION, settings: { ...settings }, people: [], calls: [], vitals: [], alerts: [], visits: [] };

  PEOPLE.forEach((pf, i) => {
    const person = {
      id: 'p' + (i + 1), name: pf.name, sex: pf.sex, age: pf.age,
      phone: `010-0000-${1001 + i}`, guardianPhone: `010-0000-${2001 + i}`,
      preferredTime: pf.time, enrolledAt: start, active: true,
      address: pf.address || `울산광역시 울주군 웅촌면 ${pf.ri} (시연용)`, lat: pf.lat, lng: pf.lng,
      manager: pf.manager, livesAlone: pf.livesAlone ?? i % 2 === 0
    };
    let made;
    for (let attempt = 0; attempt < 400; attempt++) {
      made = generate(person, pf.kind, i, attempt, start, settings);
      const trial = { settings, people: [person], calls: made.calls, vitals: made.vitals, alerts: [] };
      const getV = (pid, d) => made.vitals.find(v => v.date === d) || null;
      updateAlerts(trial.alerts, person.id, personStatus(person, made.calls, settings, today, getV).levels, nowStamp());
      if (WANT[pf.kind](riskOf(person, trial, today, getV))) break;
    }
    data.people.push(person);
    data.calls.push(...made.calls);
    data.vitals.push(...made.vitals);
  });

  // ---- 과거 알림 (연계·수검 결과가 있어 PPV·오경보율이 계산되게) ----
  const past = (personId, daysAgo, referredAfter, outcome, checklist) => {
    const created = addDays(today, -daysAgo);
    data.alerts.push({
      id: `al-past-${personId}-${daysAgo}`, personId, createdAt: `${created}T09:00`,
      type: 'cognition', level: 'refer', status: 'closed',
      referredAt: referredAfter == null ? null : `${addDays(created, referredAfter)}T10:00`,
      notifiedAt: `${created}T11:00`, outcome, checklist, note: '시연용 과거 기록'
    });
  };
  past('p2', 42, 2, 'confirmed', { acute: false, sleep: false, meds: false, mood: false, hearing: false });
  past('p3', 30, 3, 'normal', { acute: true, sleep: true, meds: false, mood: false, hearing: false });
  past('p4', 25, null, null, { acute: false, sleep: false, meds: true, mood: false, hearing: false });

  // ---- 현재 상태로 알림 만들기 ----
  const getV = (pid, d) => data.vitals.find(v => v.personId === pid && v.date === d) || null;
  for (const p of data.people) {
    updateAlerts(data.alerts, p.id, personStatus(p, data.calls, data.settings, today, getV).levels, nowStamp());
  }

  // ---- 방문 예정 (앞으로 7일 안, 위험도 높음 2명 포함) ----
  [['p5', 1, '인지 기저선 이탈 확인 방문'], ['p6', 2, '야간 저산소 확인 · 수면 상태 점검'],
    ['p8', 3, '연속 미응답 안부 확인'], ['p10', 5, '인지 변화 확인 방문']]
    .forEach(([personId, after, reason], k) => data.visits.push({ id: 'v' + (k + 1), personId, date: addDays(today, after), reason, status: 'planned' }));

  return data;
}

// 한 사람의 통화·생체신호 기록 (k = 0..60, 마지막 날이 오늘)
function generate(person, kind, i, attempt, start, settings) {
  let x = 20260927 + i * 7919 + attempt * 104729;
  const rand = () => { // mulberry32
    x = (x + 0x6d2b79f5) | 0;
    let t = Math.imul(x ^ (x >>> 15), 1 | x);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  const r1 = v => Math.round(v * 10) / 10;
  const calls = [], vitals = [];
  const id = person.id, time = person.preferredTime;

  for (let k = 0; k <= 60; k++) {
    const date = addDays(start, k);
    const dayNo = k + 1;
    const fromEnd = 60 - k; // 0 = 오늘

    // ---- 통화 ----
    const missed = kind === 'noAnswer' ? fromEnd <= 1 || (fromEnd > 2 && rand() < 0.15)
      : kind === 'mild' || kind === 'hearing' ? fromEnd > 2 && rand() < 0.06
      : rand() < 0.06 && fromEnd > 0;
    if (missed) {
      calls.push({
        id: `c${i}-${k}`, personId: id, date, status: 'missed', startedAt: `${date}T${time}`,
        durationSec: 0, rotationDomain: null, setIndex: null, items: [], scorePct: null, audioId: null
      });
    } else {
      const plan = planForDate(date, settings.parallelSets);
      let mean = 80, sd = 6;
      if (kind === 'decline') { mean = 80 - 0.6 * Math.max(0, dayNo - 35); sd = 4; }
      if (kind === 'hypoxia' || kind === 'hearing') mean = 78;
      if (kind === 'mild') { mean = 82 - Math.max(0, fromEnd <= 14 ? 14 - fromEnd : 0) * 0.6; sd = fromEnd <= 14 ? 2 : 3; } // 최근 2주 서서히 하락
      const target = Math.max(0, Math.min(100, mean + gauss() * sd));
      const items = plan.items.map(it => ({
        key: it.key, question: it.question, transcript: '', score: it.maxScore, maxScore: it.maxScore,
        latencyMs: Math.round(1200 + rand() * 2500), repeatAsks: 0
      }));
      // 목표 점수에 맞게 만점에서 점수를 무작위로 깎는다
      const scorable = items.filter(it => it.maxScore > 0);
      const max = scorable.reduce((s, it) => s + it.maxScore, 0);
      let remove = max - Math.round((target / 100) * max);
      while (remove > 0) {
        const it = scorable[Math.floor(rand() * scorable.length)];
        if (it.score > 0) { it.score--; remove--; }
      }
      const asks = kind === 'hearing' ? 2 + Math.floor(rand() * 2) : rand() < 0.04 ? 1 : 0;
      for (let a = 0; a < asks; a++) items[Math.floor(rand() * items.length)].repeatAsks++;

      calls.push({
        id: `c${i}-${k}`, personId: id, date, status: 'completed', startedAt: `${date}T${time}`,
        durationSec: Math.round(110 + rand() * 40 + (plan.rotationDomain === 'fluency' ? 25 : 0)),
        rotationDomain: plan.rotationDomain, setIndex: plan.setIndex, items, scorePct: scorePct(items), audioId: null
      });
    }

    // ---- 야간 생체신호 (그날 아침 기준 날짜) ----
    const hypoxic = kind === 'hypoxia' && (fromEnd <= 6 || rand() < 0.6);
    const lowWear = kind === 'noAnswer' && rand() < 0.45;
    vitals.push({
      personId: id, date,
      hrRest: Math.round(60 + i * 1.5 + gauss() * 2),
      spo2Min: hypoxic ? 84 + Math.floor(rand() * 5) : 91 + Math.floor(rand() * 5),
      spo2Below90Min: hypoxic ? 15 + Math.floor(rand() * 26) : rand() < 0.15 ? Math.floor(rand() * 5) : 0,
      wearHours: r1(lowWear ? rand() * 3.5 : 6 + rand() * 2.5),
      sqi: Math.round((rand() < 0.1 ? 0.3 + rand() * 0.25 : 0.65 + rand() * 0.3) * 100) / 100,
      steps: Math.round(2500 + rand() * 4000)
    });
  }
  return { calls, vitals };
}

// 시연 데이터 다시 만들기: 회원 계정과 설정은 그대로 둔다
export function reseed(old) {
  const d = makeSeed(old?.settings ? { ...DEFAULT_SETTINGS, ...old.settings } : DEFAULT_SETTINGS);
  d.accounts = old?.accounts || [];
  return d;
}

