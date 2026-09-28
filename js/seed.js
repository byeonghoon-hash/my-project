// 시연용 대상자 10명과 61일치(오늘 포함) 가상 기록 생성. 날짜는 오늘 기준으로 거꾸로 만든다.
// 사람마다 원하는 성향(위험도 높음 2 · 주의 3 · 낮음 5)이 나올 때까지 난수 시드를 바꿔 가며 만든다.
// 통화 대화록은 점수와 맞게 만든다: 대답을 먼저 만들고 점수는 그 대답을 자동 채점한 값이다.

import {
  DEFAULT_SETTINGS, addDays, todayStr, nowStamp, personStatus, updateAlerts, riskOf, refreshZ, journalDraft
} from './metrics.js';
import {
  planForDate, scorePct, scoreItem, korNum, WEEKDAYS, SELF_QUESTIONS, CHAT_QUESTION, classifySleep, classifyMood, findRequests, ANIMALS
} from './items.js';
import { pickVitals, recomputeRing } from './vitals.js';

// 시드 버전. 올리면 저장된 시연 데이터를 새로 만든다 (회원 계정·링 실측 데이터는 유지).
export const SEED_VERSION = 4;

// 전화번호는 모두 가짜(010-0000-), 보호자 이름은 지어낸 것, 의료기관명은 '○○내과의원'.
const phone = n => `010-0000-${n}`;
export const baseInfo = (o = {}) => ({
  conditions: [], acute: [], meds: [],
  devices: [], hearing: '정상', vision: '정상', speech: '정상', mobility: '독립', living: '독거', bodyMemo: '',
  call: { title: '', days: [0, 1, 2, 3, 4, 5, 6], rate: 0.9, rereads: 1, retry: { count: 1, interval: 30 }, selfReport: true, pause: null, spo2Threshold: 90 },
  contacts: [], clinic: { name: '○○내과의원', phone: phone('5000') },
  agencies: { center: { name: '웅촌면 보건지소', phone: phone('5100') }, dementia: { name: '울주군 치매안심센터', phone: phone('5200') } },
  consent: { service: true, recording: true, guardianShare: true, privacy: true, method: '본인', proxy: null, date: '', renewDate: '' },
  tests: [],
  device: { name: '손목 밴드 (모의)', source: 'mock', clockOffsetMin: 0, spo2OffsetPct: 0 },
  edited: {}, ...o
});

// 좌표: 윤병훈은 실제 위치, 나머지 9명은 임의 좌표 (주소는 리까지만, 지번을 지어내지 않는다)
const PEOPLE = [
  { name: '한복남', sex: '남', age: 78, kind: 'stable', time: '09:30', manager: '박지연 간호사', tone: 1,
    address: '울주군 웅촌면 석천리', lat: 35.4388, lng: 129.2029, // 임의 좌표
    info: t => baseInfo({
      conditions: [{ name: '고혈압', year: 2012 }, { name: '관절염', year: 2018 }],
      acute: [{ name: '감기', start: addDays(t, -5), end: '', hospitalized: false, memo: '기침·콧물, 보건지소 약 처방' }],
      meds: [{ name: '암로디핀 5mg', dose: '1일 1회 아침', start: '2012-04-01', changed: '', reason: '' }],
      devices: ['지팡이'], living: '부부',
      contacts: [{ name: '한미경', relation: '딸', phone: phone('3001'), priority: 1, consent: true }]
    }) },
  { name: '이옥분', sex: '여', age: 81, kind: 'stable', time: '10:00', manager: '김민수 사회복지사', tone: 0,
    address: '울주군 웅촌면 곡천리', lat: 35.4602, lng: 129.2013, // 임의 좌표
    info: () => baseInfo({
      conditions: [{ name: '당뇨병', year: 2010 }, { name: '골다공증', year: 2020 }],
      meds: [{ name: '메트포르민 500mg', dose: '1일 2회 식후', start: '2010-09-01', changed: '', reason: '' }],
      devices: ['안경·돋보기', '틀니'],
      contacts: [{ name: '이정훈', relation: '아들', phone: phone('3002'), priority: 1, consent: true }]
    }) },
  { name: '박순자', sex: '여', age: 74, kind: 'stable', time: '10:30', manager: '윤병훈 간호사', tone: 2,
    // 표의 좌표(35.4435, 129.2186)는 웅촌면 경계 밖이라, 경계에서 약 300m 안쪽인 가장 가까운 점(약 660m 북서)으로 옮김
    address: '울주군 웅촌면 검단리', lat: 35.4485, lng: 129.2146, // 임의 좌표
    info: () => baseInfo({
      conditions: [{ name: '이상지질혈증', year: 2016 }],
      meds: [{ name: '아토르바스타틴 10mg', dose: '1일 1회 저녁', start: '2016-05-01', changed: '', reason: '' }],
      living: '자녀 동거',
      contacts: [{ name: '박지훈', relation: '아들', phone: phone('3003'), priority: 1, consent: true }]
    }) },
  { name: '최영희', sex: '여', age: 83, kind: 'stable', time: '11:00', manager: '박지연 간호사', tone: 0,
    address: '울주군 웅촌면 초천리', lat: 35.4783, lng: 129.1968, // 임의 좌표
    info: () => baseInfo({
      conditions: [{ name: '고혈압', year: 2008 }, { name: '관절염', year: 2015 }, { name: '갑상선질환', year: 2019 }],
      meds: [{ name: '로사르탄 50mg', dose: '1일 1회 아침', start: '2008-03-01', changed: '', reason: '' }],
      devices: ['지팡이', '안경·돋보기'], mobility: '부분 도움',
      contacts: [{ name: '최은주', relation: '딸', phone: phone('3004'), priority: 1, consent: true }]
    }) },
  { name: '이상철', sex: '남', age: 79, kind: 'decline', time: '09:00', manager: '윤병훈 간호사', tone: 1,
    address: '울주군 웅촌면 대복리', lat: 35.4718, lng: 129.2104, // 임의 좌표
    info: t => baseInfo({
      conditions: [{ name: '고혈압', year: 2011 }, { name: '당뇨병', year: 2014 }],
      meds: [
        { name: '메트포르민 500mg', dose: '1일 2회 식후', start: '2014-02-01', changed: addDays(t, -9), reason: '용량 조정 (1회 → 2회)' },
        { name: '암로디핀 5mg', dose: '1일 1회 아침', start: '2011-07-01', changed: '', reason: '' }
      ],
      contacts: [{ name: '이수진', relation: '며느리', phone: phone('3005'), priority: 1, consent: true },
        { name: '이성민', relation: '아들', phone: phone('3105'), priority: 2, consent: false }]
    }) },
  { name: '서정길', sex: '남', age: 76, kind: 'hypoxia', time: '14:00', manager: '김민수 사회복지사', tone: 2,
    address: '울주군 웅촌면 대대리', lat: 35.4671, lng: 129.2231, // 임의 좌표
    info: () => baseInfo({
      conditions: [{ name: '만성폐쇄성폐질환(COPD)', year: 2012 }, { name: '고혈압', year: 2015 }],
      meds: [{ name: '흡입기 (티오트로피움)', dose: '1일 1회', start: '2012-10-01', changed: '', reason: '' }],
      living: '부부',
      call: { ...baseInfo().call, spo2Threshold: 88 }, // COPD: 평소 산소포화도가 낮아 개인 기준을 낮춤
      contacts: [{ name: '서영숙', relation: '배우자', phone: phone('3006'), priority: 1, consent: true }]
    }) },
  { name: '김말순', sex: '여', age: 85, kind: 'hearing', time: '15:00', manager: '박지연 간호사', tone: 2,
    address: '울주군 웅촌면 은현리', lat: 35.4651, lng: 129.1847, // 임의 좌표
    info: () => baseInfo({
      conditions: [{ name: '고혈압', year: 2005 }, { name: '관절염', year: 2012 }],
      meds: [{ name: '로사르탄 50mg', dose: '1일 1회 아침', start: '2005-06-01', changed: '', reason: '' }],
      devices: ['보청기 우측', '보행기'], hearing: '중등도 이상', mobility: '대부분 도움',
      call: { ...baseInfo().call, rate: 0.8, rereads: 2 },
      contacts: [{ name: '김현숙', relation: '딸', phone: phone('3007'), priority: 1, consent: true }]
    }) },
  { name: '정두만', sex: '남', age: 80, kind: 'noAnswer', time: '16:00', manager: '윤병훈 간호사', tone: 1,
    address: '울주군 웅촌면 통천리', lat: 35.4497, lng: 129.1872, // 임의 좌표
    info: () => baseInfo({
      conditions: [{ name: '우울증', year: 2021 }],
      meds: [{ name: '에스시탈로프람 10mg', dose: '1일 1회 아침', start: '2021-11-01', changed: '', reason: '' }],
      call: { ...baseInfo().call, retry: { count: 2, interval: 60 } },
      contacts: [{ name: '정미영', relation: '딸', phone: phone('3008'), priority: 1, consent: true },
        { name: '박상호', relation: '이웃', phone: phone('3108'), priority: 2, consent: false }]
    }) },
  { name: '오금례', sex: '여', age: 77, kind: 'stable', time: '13:30', manager: '김민수 사회복지사', tone: 0,
    address: '울주군 웅촌면 고연리', lat: 35.4529, lng: 129.2257, // 임의 좌표
    info: () => baseInfo({
      conditions: [{ name: '고혈압', year: 2017 }],
      meds: [{ name: '암로디핀 5mg', dose: '1일 1회 아침', start: '2017-01-01', changed: '', reason: '' }],
      devices: ['안경·돋보기'],
      contacts: [{ name: '오세훈', relation: '아들', phone: phone('3009'), priority: 1, consent: true }]
    }) },
  { name: '윤병훈', sex: '남', age: 78, kind: 'mild', time: '14:00', manager: '박지연 간호사', tone: 1,
    address: '울주군 웅촌면 대학길 27', lat: 35.456938, lng: 129.195938, // 실제 위치 (구글 플러스 코드 F54W+Q9)
    info: () => baseInfo({
      conditions: [{ name: '고혈압', year: 2015 }, { name: '이상지질혈증', year: 2019 }],
      meds: [
        { name: '암로디핀 5mg', dose: '1일 1회 아침', start: '2015-05-01', changed: '', reason: '' },
        { name: '로수바스타틴 10mg', dose: '1일 1회 저녁', start: '2019-03-01', changed: '', reason: '' }
      ],
      devices: ['안경·돋보기'],
      call: { ...baseInfo().call, title: '윤병훈 어르신', rate: 0.9 },
      contacts: [{ name: '윤재석', relation: '아들', phone: phone('3010'), priority: 1, consent: true },
        { name: '김태식', relation: '마을 이장', phone: phone('3110'), priority: 2, consent: false }],
      device: { name: 'I-ME 링 (자작)', source: 'device', clockOffsetMin: 0, spo2OffsetPct: 0 }
    }) }
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
  const data = {
    seedVersion: SEED_VERSION, settings: { ...settings }, people: [], calls: [], vitals: [], alerts: [], visits: [],
    requests: [], journals: [], ringImports: [], ringNights: []
  };

  PEOPLE.forEach((pf, i) => {
    const info = pf.info(today);
    info.call.title ||= `${pf.name} 어르신`;
    info.consent = { ...info.consent, date: start, renewDate: addDays(start, 365) };
    if (i % 2 === 0) info.tests = [{ kind: 'CIST', score: 20 + (i % 7), date: start, examiner: pf.manager }];
    const birth = `${+today.slice(0, 4) - pf.age - 1}-${String(3 + i).padStart(2, '0')}-${String(10 + i).padStart(2, '0')}`;
    const person = {
      id: 'p' + (i + 1), name: pf.name, sex: pf.sex, birth, age: pf.age,
      phone: phone(String(1001 + i)), phoneType: '휴대폰', education: null, canRead: null,
      guardianPhone: info.contacts[0]?.phone || '',
      preferredTime: pf.time, enrolledAt: start, active: true, closed: null,
      referral: ['보건소 의뢰', '방문간호 연계', '본인 신청', '보호자 신청'][i % 4], dementiaCenter: i === 4 ? '예' : '아니요',
      address: pf.address, lat: pf.lat, lng: pf.lng, manager: pf.manager, info
    };
    let made;
    for (let attempt = 0; attempt < 400; attempt++) {
      made = generate(person, pf, i, attempt, start, settings);
      const trial = { settings, people: [person], calls: made.calls, vitals: made.vitals, alerts: [], ringNights: [] };
      const getV = (pid, d) => pickVitals(trial, pid, d);
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
      notifiedAt: `${created}T11:00`, notifiedTo: null, outcome, checklist, note: '과거 기록'
    });
  };
  past('p2', 42, 2, 'confirmed', { acute: false, sleep: false, meds: false, mood: false, hearing: false });
  past('p3', 30, 3, 'normal', { acute: true, sleep: true, meds: false, mood: false, hearing: false });
  past('p4', 25, null, null, { acute: false, sleep: false, meds: true, mood: false, hearing: false });

  // ---- 현재 상태로 알림 만들기, 통화별 z 저장 ----
  const getV = (pid, d) => pickVitals(data, pid, d);
  for (const p of data.people) {
    updateAlerts(data.alerts, p.id, personStatus(p, data.calls, data.settings, today, getV).levels, nowStamp());
    refreshZ(data, p, today);
  }

  // ---- 방문 예정 (앞으로 7일 안, 위험도 높음 2명 포함) ----
  // [대상자, 며칠 뒤, 시각, 분, 유형, 목적, 상태]
  [['p5', 1, '10:00', 60, '인지 재평가', '인지 기저선 이탈 확인', 'planned'],
    ['p6', 2, '14:00', 60, '건강 확인', '야간 저산소 확인, 수면 상태 점검', 'planned'],
    ['p8', 3, '11:00', 30, '정기 방문', '연속 미응답 안부 확인', 'planned'],
    ['p10', 5, '15:00', 60, '인지 재평가', '인지 변화 확인', 'planned'],
    ['p7', 1, '14:00', 60, '보호자 면담', '보청기 착용 확인, 보호자 면담', 'planned'],
    ['p1', -4, '10:00', 60, '건강 확인', '감기 증상 확인', 'done'],
    ['p3', -2, '15:00', 30, '정기 방문', '정기 안부 방문', 'canceled']]
    .forEach(([personId, after, startTime, durationMin, type, purpose, status], k) => {
      const date = addDays(today, after);
      const visitor = data.people.find(p => p.id === personId).manager;
      data.visits.push({
        id: 'v' + (k + 1), personId, date, startTime, durationMin, type, visitor, purpose, status,
        resultNote: status === 'done' ? '기침 줄어듦, 식사 양호' : '', cancelReason: status === 'canceled' ? '대상자 외출' : '',
        createdBy: visitor, createdAt: `${addDays(date, -3)}T09:00`
      });
    });

  // ---- 어르신 요청사항: 최근 10일 대화에서 찾은 요청을 등록 (한 건은 처리 완료) ----
  let rq = 0;
  for (const c of data.calls.filter(c => c.requests?.length && c.date >= addDays(today, -10)).sort((a, b) => a.date.localeCompare(b.date))) {
    for (const text of c.requests) {
      rq++;
      data.requests.push({ id: 'rq' + rq, personId: c.personId, callId: c.id, date: c.date, text, status: rq === 1 ? 'done' : 'open', createdAt: `${c.date}T17:00`, by: data.people.find(p => p.id === c.personId).manager });
    }
  }

  // ---- 돌봄일지: 대상자마다 확정 1~3건 (첫 건은 자동 초안을 다듬은 모양) ----
  data.people.forEach((p, i) => {
    const dates = [[-8], [-20, -8], [-30, -18, -6]][i % 3].map(k => addDays(today, k));
    dates.forEach((d, k) => {
      const draft = journalDraft(p, data, d, getV);
      const polished = k === 0;
      data.journals.push({
        id: `j${i}-${k}`, personId: p.id, date: d, type: k === dates.length - 1 && i % 2 ? '방문' : '전화 상담',
        author: p.manager, status: 'final', auto: false, createdAt: `${d}T16:30`, history: [],
        S: draft.S, O: draft.O,
        A: draft.A,
        P: polished ? `${draft.P}\n- 1순위 보호자와 통화하여 최근 상태 공유함` : draft.P
      });
    });
  });

  return data;
}

// 대화록 만들기 --------------------------------------------------------
const pick = (rand, a) => a[Math.floor(rand() * a.length)];
const DISTRACT = ['포도', '바나나', '구두', '달력', '수박', '주전자'];
const COMMON_ANIMALS = ANIMALS.slice(0, 60);

function answerFor(item, score, rand, tone) {
  const sfx = ['요', '예', '다'][tone];
  switch (item.key) {
    case 'orientation': {
      const m = +item.date.slice(5, 7), d = +item.date.slice(8, 10);
      const wdi = new Date(Date.UTC(+item.date.slice(0, 4), m - 1, d)).getUTCDay();
      if (score === 0 && rand() < 0.4) return '아이고… 날짜는 잘 모르겠다.';
      // 맞힐 부분을 무작위로 고른다
      const parts = ['m', 'd', 'w'].sort(() => rand() - 0.5).slice(0, score);
      const mm = parts.includes('m') ? m : (m % 12) + 1;
      const dd = parts.includes('d') ? d : d > 2 ? d - 1 - Math.floor(rand() * 2) : d + 1;
      const ww = WEEKDAYS[parts.includes('w') ? wdi : (wdi + 1 + Math.floor(rand() * 2)) % 7];
      const kor = rand() < 0.35;
      const M = kor ? (mm === 6 ? '유' : mm === 10 ? '시' : korNum(mm)) : mm, D = kor ? korNum(dd) : dd;
      return pick(rand, [
        `오늘이… ${M}월 ${D}일 아이가. 요일은… ${ww}요일이제?`,
        `${M}월 ${D}일인가? ${ww}요일.`,
        `음… ${M}월 ${D}일, ${ww}요일입니더.`
      ]);
    }
    case 'register':
    case 'recall': {
      const ws = [...item.words].sort(() => rand() - 0.5).slice(0, score);
      const miss = rand() < 0.5 ? pick(rand, DISTRACT.filter(x => !item.words.includes(x))) : null;
      if (score === 3) return pick(rand, [`${ws[0]}, ${ws[1]}, ${ws[2]}.`, `${ws[0]}… ${ws[1]}… ${ws[2]} 아이가.`, `${ws[0]}, ${ws[1]}, ${ws[2]}${sfx === '다' ? '.' : sfx + '.'}`]);
      if (score === 2) return `${ws[0]}하고… ${ws[1]}. ${miss ? `${miss}였나?` : '하나는 생각이 안 나네.'}`;
      if (score === 1) return `${ws[0]}… 그라고… 아이고 뭐였더라, 모르겠다.`;
      return miss ? `${miss}… 였나? 잘 모르겠다.` : '모르겠다… 다 까먹었다.';
    }
    case 'backward3':
    case 'backward4': {
      const rev = [...item.digits].reverse();
      if (score) return `음… ${rev.join(' ')}.`;
      if (rand() < 0.3) return '거꾸로는 잘 모르겠다.';
      const w = [...rev];
      [w[0], w[1]] = [w[1], w[0]];
      return `${w.join(' ')}… 맞나?`;
    }
    case 'fluency': {
      const n = score >= 5 ? 15 + Math.floor(rand() * 3) : Math.round(score * 3);
      const as = [...COMMON_ANIMALS].sort(() => rand() - 0.5).slice(0, n);
      let out = '';
      as.forEach((a, k) => { out += a + (k % 4 === 3 ? '… 음… 또 ' : ', '); });
      return (out || '음… 동물이… 잘 안 떠오르네 ').replace(/[, ]+$/, '') + '.';
    }
    default: { // 공통점
      if (score) return pick(rand, [`둘 다 ${item.keys[0]} 아이가.`, `${item.keys[0]}이제.`, `그거는 ${item.keys[0]}지${sfx}.`]);
      return pick(rand, ['글쎄… 잘 모르겠네.', '같은 기 뭐 있노… 모르겠다.']);
    }
  }
}

const SLEEP = { good: ['잘 잤다.', '푹 잤지예.', '그럭저럭 잤다.'], poor: ['어젯밤엔 잠을 좀 설쳤다.', '새벽에 자꾸 깼다 아이가.', '잠이 안 와가 뒤척였다.'] };
const MOOD = { good: ['기분 좋다.', '오늘은 괜찮다, 기분 좋네.'], normal: ['그냥 그렇다.', '뭐 별일 없다.'], bad: ['좀 적적하다.', '기분이 안 좋다.'] };
const CHAT = ['별일 없다. 텃밭에 나가 있었다.', '경로당 댕겨왔다.', '아들이 전화 왔더라.', '날이 좀 선선해졌네.'];
const CHAT_REQ = ['허리가 좀 쑤시고… 반찬 좀 갖다주면 좋겠다 카이.', '무릎이 아파가 병원 좀 데려다 줬으면 싶다.', '보일러가 고장 나서 좀 도와주면 좋겠다.'];

// 한 사람의 통화·생체신호 기록 (k = 0..60, 마지막 날이 오늘)
function generate(person, pf, i, attempt, start, settings) {
  let x = 20260927 + i * 7919 + attempt * 104729;
  const rand = () => { // mulberry32
    x = (x + 0x6d2b79f5) | 0;
    let t = Math.imul(x ^ (x >>> 15), 1 | x);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  const r1 = v => Math.round(v * 10) / 10;
  const kind = pf.kind;
  const calls = [], vitals = [];
  const id = person.id, time = person.preferredTime;
  const thr = person.info.call.spo2Threshold;

  for (let k = 0; k <= 60; k++) {
    const date = addDays(start, k);
    const dayNo = k + 1;
    const fromEnd = 60 - k; // 0 = 오늘
    const base = { id: `c${i}-${k}`, personId: id, date, time, startedAt: `${date}T${time}`, source: 'demo', audioId: null };

    // ---- 통화 ----
    const missed = kind === 'noAnswer' ? fromEnd <= 1 || (fromEnd > 2 && rand() < 0.15)
      : kind === 'mild' || kind === 'hearing' ? fromEnd > 2 && rand() < 0.06
      : rand() < 0.06 && fromEnd > 0;
    if (missed) {
      calls.push({ ...base, status: 'missed', durationSec: 0, scorePct: null, z: null, rotationDomain: null, setIndex: null, items: [], selfReport: null, chat: null, requests: [] });
    } else {
      const plan = planForDate(date, settings.parallelSets);
      let mean = 80, sd = 6;
      if (kind === 'decline') { mean = 80 - 0.6 * Math.max(0, dayNo - 35); sd = 4; }
      if (kind === 'hypoxia' || kind === 'hearing') mean = 78;
      if (kind === 'mild') { mean = 82 - Math.max(0, fromEnd <= 14 ? 14 - fromEnd : 0) * 0.6; sd = fromEnd <= 14 ? 2 : 3; } // 최근 2주 서서히 하락
      const target = Math.max(0, Math.min(100, mean + gauss() * sd));
      const pts = plan.items.map(it => it.maxScore);
      // 목표 점수에 맞게 만점에서 점수를 깎는다. 저하 대상자는 지연 회상·지남력에서, 윤병훈은 최근 2주 지연 회상에서 먼저 깎는다.
      const favor = kind === 'decline' && dayNo > 35 ? ['recall', 'orientation'] : kind === 'mild' && fromEnd <= 14 ? ['recall'] : [];
      const max = pts.reduce((a, b) => a + b, 0);
      let remove = max - Math.round((target / 100) * max);
      while (remove > 0) {
        const cand = plan.items.map((it, j) => j).filter(j => pts[j] > 0);
        const fav = cand.filter(j => favor.includes(plan.items[j].key));
        const j = fav.length && rand() < 0.7 ? pick(rand, fav) : pick(rand, cand);
        pts[j]--; remove--;
      }
      const asks = kind === 'hearing' ? 2 + Math.floor(rand() * 2) : rand() < 0.04 ? 1 : 0;
      const askAt = new Set([...Array(asks)].map(() => Math.floor(rand() * plan.items.length)));
      const slow = (kind === 'decline' && dayNo > 35 ? 1.2 : 0) + (kind === 'mild' && fromEnd <= 14 ? 0.6 : 0);
      const items = plan.items.map((it, j) => {
        let answer = answerFor(it, pts[j], rand, pf.tone);
        const repeatAsked = askAt.has(j) ? (kind === 'hearing' && rand() < 0.4 ? 2 : 1) : 0;
        if (repeatAsked) answer = (kind === 'hearing' ? '네? 뭐라꼬예? ' : '예? 다시 한번 말해 주이소. ') + answer;
        return {
          key: it.key, domain: it.domain, question: it.question, answer, expected: it.expected,
          score: scoreItem(it, answer), maxScore: it.maxScore,
          latencySec: r1(1.2 + rand() * 2.2 + slow), repeatAsked
        };
      });
      const sleepV = rand() < (kind === 'hypoxia' ? 0.45 : 0.15) ? 'poor' : 'good';
      const moodV = rand() < (kind === 'noAnswer' ? 0.35 : 0.08) ? 'bad' : rand() < 0.5 ? 'good' : 'normal';
      const selfReport = person.info.call.selfReport ? {
        sleep: { answer: pick(rand, SLEEP[sleepV]), value: null },
        mood: { answer: pick(rand, MOOD[moodV]), value: null }
      } : null;
      if (selfReport) {
        selfReport.sleep.value = classifySleep(selfReport.sleep.answer);
        selfReport.mood.value = classifyMood(selfReport.mood.answer);
      }
      const chatAnswer = rand() < 0.08 ? pick(rand, CHAT_REQ) : pick(rand, CHAT);
      const chat = { question: CHAT_QUESTION, answer: chatAnswer };
      const requests = [chat.answer, selfReport?.sleep.answer, selfReport?.mood.answer].flatMap(findRequests);
      calls.push({
        ...base, status: 'completed',
        durationSec: Math.round(120 + rand() * 40 + (plan.rotationDomain === 'fluency' ? 25 : 0)),
        rotationDomain: plan.rotationDomain, setIndex: plan.setIndex, items, scorePct: scorePct(items), z: null,
        selfReport, chat, requests
      });
    }

    // ---- 야간 생체신호 (그날 아침 기준 날짜). 데이터 출처가 '기기'인 사람은 만들지 않는다 ----
    if (person.info.device.source === 'device') continue;
    const hypoxic = kind === 'hypoxia' && (fromEnd <= 6 || rand() < 0.6);
    const lowWear = kind === 'noAnswer' && rand() < 0.45;
    vitals.push({
      personId: id, date,
      hrRest: Math.round(60 + i * 1.5 + gauss() * 2),
      spo2Min: hypoxic ? thr - 4 + Math.floor(rand() * 4) : thr + 1 + Math.floor(rand() * 5),
      spo2BelowMin: hypoxic ? 15 + Math.floor(rand() * 26) : rand() < 0.15 ? Math.floor(rand() * 5) : 0, // 개인 기준 미만 분
      wearHours: r1(lowWear ? rand() * 3.5 : 6 + rand() * 2.5),
      sqi: Math.round((rand() < 0.1 ? 0.3 + rand() * 0.25 : 0.65 + rand() * 0.3) * 100) / 100,
      steps: Math.round(2500 + rand() * 4000)
    });
  }
  return { calls, vitals };
}

// 시연 데이터 다시 만들기: 회원 계정·설정·링 실측 데이터는 그대로 둔다
export function reseed(old) {
  const d = makeSeed(old?.settings ? { ...DEFAULT_SETTINGS, ...old.settings } : DEFAULT_SETTINGS);
  d.accounts = old?.accounts || [];
  d.ringImports = (old?.ringImports || []).filter(r => d.people.some(p => p.id === r.personId));
  for (const pid of new Set(d.ringImports.map(r => r.personId))) recomputeRing(d, pid);
  return d;
}
