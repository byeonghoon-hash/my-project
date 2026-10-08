// 채점·지표 계산 검사. 실행: node js/selftest.js
import assert from 'node:assert/strict';
import { planForDate, scoreItem, isRepeatAsk, scorePct, DEFAULT_BANK, normalizeBank, isDecline } from './items.js';
import { DEFAULT_SETTINGS as S, baseline, zScore, cognitionLevel, dashboard, addDays, riskOf, filterPeople, aiSummary } from './metrics.js';
import { makeSalt, hashPassword, verifyPassword } from './store.js';
import { completion7, autoChecklist, validPhone, personStatus, trendAll, trendCsv, journalDraft } from './metrics.js';
import { parseRingCsv, toMinutes, nightsFromMinutes, pickVitals, importRing, recomputeRing } from './vitals.js';
import { readFileSync } from 'node:fs';
import ungchon from './ungchon.js';
import { visitConflicts, visitChecks, ageFrom, findDuplicates, dashboard as dash2, aiSummary as ai2, trendAll as tall2, journalDraft as jd2 } from './metrics.js';
import { makeSeed } from './seed.js';
import { detectEmergency, checkChatReply, keepQuoted, checkSummary, fillTitle, useAiVoice, useAiChat, ttsOutcome, isOffTopic, SCRIPT } from './items.js';
import { fmtDate, fmtMD, fmtMDW, fmtTime, fmtStamp, fmtDur, fmtNum, fmtUnit, timelineRange, layoutLabels, completionDelta, completionAvg } from './metrics.js';

const DATE = '2026-09-27'; // 일요일

// ---- 문항 뱅크: 영역마다 한 문항, 다음 날은 다른 문항 (학습 방지) ----
const p1 = planForDate(DATE), p2 = planForDate('2026-09-28');
assert.deepEqual(p1.items.map(i => i.domain), ['지남력', '기억 등록', '주의력', '언어기능', '지연 회상', '집행기능']);
assert.equal(p1.items.reduce((t, i) => t + i.maxScore, 0), 10);
for (const k of [0, 2, 3, 5]) assert.notEqual(p1.items[k].qid, p2.items[k].qid);                 // 이어지는 날 같은 문항 없음
assert.ok(!p1.items[1].words.some(w => p2.items[1].words.includes(w)));                           // 단어도 전날과 겹치지 않음
assert.deepEqual(p1.items[1].words, p1.items[4].words);                                           // 등록 = 회상 단어
assert.ok(DEFAULT_BANK.memory.words.length >= 25 && new Set(DEFAULT_BANK.memory.words).size === DEFAULT_BANK.memory.words.length);
{ // n일 동안 지남력 문항 5개가 모두 한 번씩
  const qs = [...Array(5)].map((_, k) => planForDate(addDays(DATE, k)).items[0].qid);
  assert.equal(new Set(qs).size, 5);
}
assert.ok(!p1.script.greeting.includes('보건소') && p1.script.greeting.includes('통화 가능'));     // 첫마디에 '보건소 안부전화' 없음
// 뱅크를 고치면 그 문항만 나오고, 켜진 문항이 없으면 기본값
const custom = { ...DEFAULT_BANK, executive: [{ id: 'x1', on: true, q: '연필과 볼펜은 어떤 점이 비슷한가요?', answers: ['쓰는', '필기'] }] };
assert.equal(planForDate(DATE, custom).items[5].qid, 'x1');
assert.equal(normalizeBank({ executive: [{ id: 'x', on: false, q: '끔', answers: ['a'] }] }).executive, DEFAULT_BANK.executive);
assert.equal(normalizeBank({ memory: { words: ['가', '나'] } }).memory.words, DEFAULT_BANK.memory.words); // 단어 6개 미만이면 기본값

// ---- 채점: 지남력 (한 가지씩) ----
const ori = part => ({ key: 'orientation', part, date: DATE });
assert.equal(scoreItem(ori('year'), '2026년이요'), 1);
assert.equal(scoreItem(ori('year'), '이천이십육년'), 1);
assert.equal(scoreItem(ori('year'), '2025년'), 0);
assert.equal(scoreItem(ori('month'), '구월이요'), 1);
assert.equal(scoreItem(ori('month'), '팔월'), 0);
assert.equal(scoreItem(ori('day'), '이십칠일'), 1);
assert.equal(scoreItem(ori('weekday'), '일요일이제'), 1);
assert.equal(scoreItem(ori('season'), '가을 아이가'), 1);
assert.equal(scoreItem(ori('season'), '여름'), 0);
assert.equal(scoreItem({ key: 'orientation', part: 'month', date: '2026-12-07' }, '이월'), 0); // '이월'은 12월이 아님
assert.equal(scoreItem({ key: 'orientation', date: DATE }, '9월 27일 일요일이요'), 3);           // 예전 기록 (월·일·요일)

// ---- 채점: 단어 따라 말하기·회상 ----
const reg = p1.items[1];
assert.equal(scoreItem(reg, reg.words.join(' ')), 3);
assert.equal(scoreItem(reg, `음 ${reg.words[0]}하고 ${reg.words[2]}`), 2);

// ---- 채점: 주의력 ----
assert.equal(scoreItem({ key: 'forward', digits: '6472' }, '육 사 칠 이'), 1);
assert.equal(scoreItem({ key: 'forward', digits: '6472' }, '2 7 4 6'), 0);
assert.equal(scoreItem({ key: 'backward', digits: '831' }, '일 삼 팔'), 1);
assert.equal(scoreItem({ key: 'backward', digits: '831' }, '8 3 1'), 0);
assert.equal(scoreItem({ key: 'wordBackward', word: '고양이' }, '이양고'), 1);
assert.equal(scoreItem({ key: 'wordBackward', word: '고양이' }, '이 양 고.'), 1);
assert.equal(scoreItem({ key: 'wordBackward', word: '고양이' }, '고양이'), 0);
assert.equal(scoreItem({ key: 'backward3', digits: '382' }, '이 팔 삼'), 1);                       // 예전 기록

// ---- 채점: 언어기능 ----
assert.equal(scoreItem({ key: 'naming', answers: ['열쇠', '키', '쇳대'] }, '쇳대 아이가'), 1);
assert.equal(scoreItem({ key: 'naming', answers: ['시계'] }, '반지'), 0);
assert.equal(scoreItem({ key: 'repeat', sentence: '아침에 고양이가 세수합니다.' }, '아침에 고양이가 세수한다'), 1);  // 어미는 봐줌
assert.equal(scoreItem({ key: 'repeat', sentence: '아침에 고양이가 세수합니다.' }, '아침에 강아지가 세수한다'), 0);
assert.equal(scoreItem({ key: 'repeat', sentence: '덜컹덜컹 달려간다 시골버스야.' }, '덜컹덜컹 달려간다 시골버스'), 1);

// ---- 채점: 집행기능 (공통점) ----
assert.equal(scoreItem({ key: 'similarity', answers: ['악기', '소리'] }, '둘 다 악기 아이가'), 1);
assert.equal(scoreItem({ key: 'similarity', answers: ['악기', '소리'] }, '잘 모르겠어요'), 0);

// ---- 통화 어려움 ----
assert.ok(isDecline('지금은 좀 바쁘다') && isDecline('나중에 해라') && !isDecline('네 됩니다'));

// ---- 재질문 감지 ----
assert.ok(isRepeatAsk('네? 뭐라고요'));
assert.ok(isRepeatAsk('잘 안 들려요'));
assert.ok(!isRepeatAsk('사과 기차 모자'));

// ---- 하루 점수 ----
assert.equal(scorePct([{ score: 3, maxScore: 3 }, { score: 1, maxScore: 3 }, { score: 0, maxScore: 0 }]), 66.7);
assert.equal(scorePct([{ score: null, maxScore: 3 }]), null);

// ---- 기저선과 z-score ----
const base = baseline([70, 80, 90, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80], S);
assert.ok(base.ready);
assert.equal(base.mean, 80);
assert.equal(zScore(70, { mean: 80, sd: 5 }), -2);
assert.equal(baseline(Array(14).fill(80), S).sd, 5); // 표준편차 0 → 5
assert.ok(!baseline([80, 80], S).ready);

// ---- 연속 이탈 단계 판정 ----
assert.equal(cognitionLevel([0, 0, 0], S), null);
assert.equal(cognitionLevel([0, 0, -1.6], S), 'watch');
assert.equal(cognitionLevel([0, -1.6, -2, -1.5], S), 'caution');
assert.equal(cognitionLevel([-1.6, -1.6, -1.6, -1.6, -1.6], S), 'refer');
assert.equal(cognitionLevel([-3, -3, -3, -3, -3, -3, 0], S), 'refer'); // 최근 7회 평균 z ≤ -2

// ---- 완료율·8주 유지율 ----
const today = '2026-09-27';
const call = (personId, date, status) => ({ personId, date, status, durationSec: 150, items: [] });
const data = {
  settings: S,
  people: [
    { id: 'a', enrolledAt: '2026-07-01', active: true },  // 56일 이상
    { id: 'b', enrolledAt: '2026-07-01', active: true },  // 56일 이상, 최근 통화 없음
    { id: 'c', enrolledAt: '2026-09-25', active: true }   // 대상일 2일 (25, 26일)
  ],
  calls: [
    ...[20, 21, 22, 23, 24, 25, 26].map(d => call('a', `2026-09-${d}`, 'completed')),
    call('b', '2026-09-24', 'missed'),
    call('c', '2026-09-25', 'completed'), call('c', '2026-09-26', 'missed')
  ],
  alerts: []
};
const m = dashboard(data, 7, today, () => null);
// 대상일: a 6일(21~26) + b 6일 + c 2일 = 14, 완료 a 6 + c 1 = 7 → 50%
assert.equal(m.completionRate, 50);
assert.equal(m.missedRate, (2 / 14) * 100);
assert.equal(m.retention8w, 50); // a만 유지

// ---- 위험도 riskOf ----
const rp = { id: 'r1', enrolledAt: '2026-09-01', active: true };
const okCalls = [20, 21, 22, 23, 24, 25, 26].map(dd => ({ personId: 'r1', date: `2026-09-${dd}`, status: 'completed', scorePct: 80, items: [] }));
const rdata = (alerts = [], calls = okCalls) => ({ settings: S, people: [rp], calls, alerts });
assert.equal(riskOf(rp, rdata(), today, () => null).level, 'low'); // 아무 조건 없음 → 낮음
const spo2Alert = { personId: 'r1', type: 'spo2', level: 'caution', status: 'open' };
assert.equal(riskOf(rp, rdata([spo2Alert]), today, () => null).level, 'high'); // 야간 SpO2 알림 하나만 → 높음
const missed3 = [24, 25, 26].map(dd => ({ personId: 'r1', date: `2026-09-${dd}`, status: 'missed', items: [] }));
assert.equal(riskOf(rp, rdata([], [...okCalls.slice(0, 4), ...missed3]), today, () => null).level, 'high'); // 연속 무응답 3일 → 높음
assert.equal(riskOf(rp, rdata([{ ...spo2Alert, type: 'hearing', status: 'closed' }]), today, () => null).level, 'low'); // 종결된 알림은 안 셈

// ---- 검색 필터 ----
const ppl = [
  { name: '윤병훈', manager: '박지연 간호사' }, { name: '김순자', manager: '윤병훈 간호사' },
  { name: '이영수', manager: '김민수 사회복지사' }
];
assert.deepEqual(filterPeople(ppl, '윤 병훈').map(p => p.name), ['윤병훈', '김순자']);
assert.deepEqual(filterPeople(ppl, '', '김민수 사회복지사').map(p => p.name), ['이영수']);

// ---- 비밀번호 해시 ----
const s1 = makeSalt(), s2 = makeSalt();
assert.notEqual(s1, s2);
assert.notEqual(await hashPassword(s1, 'secret1'), await hashPassword(s2, 'secret1')); // salt가 다르면 해시도 다름
const acc = { salt: s1, hash: await hashPassword(s1, 'secret1') };
assert.ok(await verifyPassword(acc, 'secret1'));
assert.ok(!(await verifyPassword(acc, 'secret2')));

// ---- aiSummary: 시연 대상자 10명 모두 문장이 있고, 진단 표현이 없음 ----
const seed = makeSeed(S, today);
const getV = (pid, dd) => pickVitals(seed, pid, dd);
assert.equal(seed.people.length, 10);
for (const p of seed.people) {
  const ai = aiSummary(p, seed, today, getV);
  assert.ok(ai.bullets.length >= 1, p.name);
  const text = ai.bullets.map(b => b.text).join(' ') + ai.action + ai.risk.reasons.join(' ');
  assert.ok(!/치매|진단/.test(text.replace('치매안심센터', '')), p.name + ': ' + text);
}
const levels = seed.people.map(p => riskOf(p, seed, today, getV).level);
assert.deepEqual(['high', 'mid', 'low'].map(l => levels.filter(x => x === l).length), [2, 3, 5]);

// ======== 기본 정보 연결 ========
const bp = { id: 'b1', enrolledAt: '2026-09-01', active: true, info: { call: { pause: null } } };
const bcalls = [21, 22, 23, 24, 25, 26].map(dd => ({ personId: 'b1', date: `2026-09-${dd}`, status: 'completed', items: [] }));
assert.equal(completion7(bp, bcalls, today).days, 6);
bp.info.call.pause = { from: '2026-09-23', to: '2026-09-24', reason: '가족 방문' };
assert.equal(completion7(bp, bcalls, today).days, 4); // 통화 일시중지 이틀은 분모에서 빠짐
assert.deepEqual(autoChecklist({ info: { acute: [{ name: '감기', start: '2026-09-22', end: '' }], meds: [] } }, today), { acute: true, meds: false });
assert.deepEqual(autoChecklist({ info: { acute: [{ name: '감기', start: '2026-08-01', end: '2026-08-20' }], meds: [{ name: 'A', changed: '2026-09-20' }] } }, today), { acute: false, meds: true });
assert.ok(validPhone('010-0000-3010') && validPhone('0212345678'));
assert.ok(!validPhone('010-12') && !validPhone('010-0000-30100') && !validPhone('010 0000 3010'));

// 개인 SpO2 기준: 링 요약의 기준 미만 시간과 야간 SpO2 알림에 적용
const ringText = readFileSync(new URL('../sample/ring_sample.csv', import.meta.url), 'utf8');
const rp2 = { id: 'r2', enrolledAt: '2026-09-01', active: true, info: { call: { spo2Threshold: 90 }, device: { source: 'device', clockOffsetMin: 0, spo2OffsetPct: 0 } } };
const rd = { settings: { ...S, spo2Below90Alert: 3, spo2AlertNights: 1 }, people: [rp2], calls: [], vitals: [], alerts: [], ringImports: [], ringNights: [] };
importRing(rd, 'r2', 'ring_sample.csv', ringText);
const rgetV = (pid, dd) => pickVitals(rd, pid, dd);
assert.equal(rgetV('r2', '2026-09-27').spo2BelowMin, 3);
assert.equal(personStatus(rp2, [], rd.settings, today, rgetV).levels.spo2, 'caution');
rp2.info.call.spo2Threshold = 88; recomputeRing(rd, 'r2');
assert.equal(rgetV('r2', '2026-09-27').spo2BelowMin, 0);
assert.equal(personStatus(rp2, [], rd.settings, today, rgetV).levels.spo2, null);

// ======== 통화 기록: 10명 대화록과 점수가 맞는지 ========
for (const c of seed.calls.filter(c => c.status === 'completed')) {
  const plan = planForDate(c.date).items;
  for (const it of c.items) {
    assert.equal(scoreItem(it, it.answer), it.score, `${c.id} ${it.key}: ${it.answer}`);   // 기록에 저장된 정답 정보로 채점
    assert.equal(it.qid, plan.find(x => x.domain === it.domain).qid);                       // 그날 뱅크 문항과 같음
    if (it.key === 'recall') assert.equal(it.words.filter(w => it.answer.replace(/\s+/g, '').includes(w)).length, it.score); // 지연 회상 점수 = 대답에 나온 정답 단어 수
  }
}
assert.ok(seed.people.every(p => seed.calls.some(c => c.personId === p.id && c.date >= addDays(today, -13) && c.items.every(i => i.answer)))); // 최근 14일 대화록

// ======== 웨어러블 ========
const parsed = parseRingCsv(ringText);
assert.equal(parsed.intervalSec, 1);
const night = nightsFromMinutes(toMinutes(parsed, 0.6), parsed.intervalSec, { threshold: 90 })[0];
assert.equal(night.date, '2026-09-27');       // 깬 날 기준
assert.equal(night.wearHours, 7.25);          // 15분 벗은 구간 제외
assert.equal(night.spo2Min, 89);              // 잡음 구간(sqi 낮음)의 70%대 튐은 제외
assert.equal(night.spo2BelowMin, 3);          // 89%인 3분
assert.equal(night.hrRest, 56);               // 가장 낮은 5분 구간 평균
const cal = nightsFromMinutes(toMinutes(parsed, 0.6), 1, { threshold: 90, spo2OffsetPct: 1, clockOffsetMin: 120 })[0];
assert.equal(cal.spo2Min, 90);                // SpO2 보정 +1%p
assert.equal(cal.wearHours, 5.75);            // 시계 +2시간: 07:00 이후는 밤에서 빠짐
const mix = { people: [{ id: 'a', info: { device: { source: 'device' } } }, { id: 'b', info: { device: { source: 'mock' } } }],
  vitals: [{ personId: 'a', date: today, spo2Min: 80 }, { personId: 'b', date: today, spo2Min: 93 }], ringNights: [{ personId: 'a', date: today, spo2Min: 91 }] };
assert.equal(pickVitals(mix, 'a', today).spo2Min, 91); // 기기 → 실측
assert.equal(pickVitals(mix, 'b', today).spo2Min, 93); // 모의 → 모의
assert.equal(pickVitals(mix, 'a', '2026-09-01'), null);

// ======== 변화 추이 ========
const tp = { id: 't1', enrolledAt: '2026-08-10', active: true, info: { device: { source: 'device' }, call: {} } };
const tcalls = [];
for (let k = 0; k <= 48; k++) {
  const dd = addDays('2026-08-10', k), recent = dd >= addDays(today, -6);
  tcalls.push({ id: 'tc' + k, personId: 't1', date: dd, startedAt: dd + 'T10:00', status: 'completed', scorePct: 80, durationSec: 150,
    items: [{ domain: '지남력', score: 3, maxScore: 3, latencySec: recent ? 3.2 : 2.0, repeatAsked: 0 }],
    selfReport: recent && k % 2 ? { sleep: { answer: '잘 잤다.', value: 'good' } } : null });
}
const tnights = [];
for (let k = 0; k < 20; k++) tnights.push({ personId: 't1', date: addDays('2026-09-05', k), hrRest: 60, spo2Min: k < 3 ? 95 : 90 + (k % 3), spo2BelowMin: 0, wearHours: k < 3 ? 2 : 7, sqi: 0.9 });
const td = { settings: S, people: [tp], calls: tcalls, vitals: [], alerts: [], ringNights: tnights, visits: [] };
const T = trendAll(td, tp, { days: 30 }, today, (pid, dd) => pickVitals(td, pid, dd));
assert.equal(T.sleepPoor.recentN, 3);
assert.equal(T.sleepPoor.status, '데이터 부족');  // 유효값 3개
assert.equal(T.score.baseline.sd, 0);
assert.equal(T.score.sdEff, S.sdMinScore);         // 표준편차 0 → 최솟값
assert.equal(T.score.status, '유지');
assert.equal(T.latency.status, '악화');            // 응답 지연이 늘면 악화
assert.equal(T.spo2Min.baseline.n, 7);             // 링 기저선 = 처음 유효한 7밤 (앞의 무효 3밤은 제외)
assert.equal(T.spo2Min.baseline.mean, [3, 4, 5, 6, 7, 8, 9].map(k => 90 + (k % 3)).reduce((a, b) => a + b) / 7);
assert.ok(trendCsv(td, tp, today, (pid, dd) => pickVitals(td, pid, dd)).startsWith('﻿'));

// ======== 돌봄일지 초안: 인용 문장은 모두 실제 대화록에 있음 ========
for (const p of seed.people) {
  const dr = journalDraft(p, seed, today, getV);
  const said = seed.calls.filter(c => c.personId === p.id).flatMap(c => [c.chat?.answer, c.selfReport?.sleep?.answer, c.selfReport?.mood?.answer, ...c.items.map(i => i.answer)]).filter(Boolean);
  for (const [, q] of dr.S.matchAll(/"([^"]+)"/g)) assert.ok(said.includes(q), `${p.name}: ${q}`);
  assert.ok(!/치매|진단/.test((dr.S + dr.O + dr.A + dr.P).replace(/치매안심센터/g, '')), p.name);
}

// ======== 지도 좌표 ========
const inRange = p => p.lat >= 35.42 && p.lat <= 35.53 && p.lng >= 129.15 && p.lng <= 129.28; // 웅촌면 범위
assert.ok(seed.people.every(inRange));
const ring = ungchon.geometry.coordinates[0];
const inside = (y, x) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
for (const p of seed.people) assert.ok(inside(p.lat, p.lng), `${p.name} 좌표가 웅촌면 경계 밖`);
const ybh = seed.people.find(p => p.name === '윤병훈');
assert.equal(ybh.lat, 35.456938);
assert.equal(ybh.lng, 129.195938);

// ======== 방문 겹침·한도 ========
const vbase = { personId: 'x', visitor: '박지연 간호사', date: '2026-10-01', status: 'planned' };
const vA = { ...vbase, id: 'A', startTime: '10:00', durationMin: 60 };                 // 10:00~11:00
const at = (t, dur = 60, extra = {}) => ({ ...vbase, id: 'N', startTime: t, durationMin: dur, ...extra });
assert.equal(visitConflicts([vA], at('11:10'), 20).length, 1);                        // 이동 여유 20분 안 → 겹침
assert.equal(visitConflicts([vA], at('11:20'), 20).length, 0);                        // 경계: 기존 끝 = 새 시작 − 여유 → 안 겹침
assert.equal(visitConflicts([vA], at('08:40'), 20).length, 0);                        // 새 끝(09:40) = 기존 시작 − 여유 → 안 겹침
assert.equal(visitConflicts([vA], at('08:50'), 20).length, 1);
assert.equal(visitConflicts([vA], at('10:30', 60, { visitor: '김민수 사회복지사' }), 20).length, 0); // 다른 방문자
assert.equal(visitConflicts([{ ...vA, status: 'canceled' }], at('10:30'), 20).length, 0);           // 취소된 방문은 제외
const vd = { settings: S, people: [{ id: 'x', info: { call: {} } }], visits: ['08:00', '10:00', '13:00', '15:00'].map((t, k) => ({ ...vbase, id: 'v' + k, startTime: t, durationMin: 30 })) };
assert.ok(visitChecks(vd, at('17:00', 30), '2026-09-28T09:00').warnings.some(w => w.includes('하루 한도')));   // 하루 한도 4건
assert.ok(!visitChecks({ ...vd, visits: vd.visits.slice(0, 3) }, at('17:00', 30), '2026-09-28T09:00').warnings.some(w => w.includes('하루 한도')));
assert.ok(visitChecks(vd, at('17:00', 30), '2026-10-02T09:00').errors.length);          // 지난 날짜
assert.ok(visitChecks(vd, at('17:40', 30), '2026-09-28T09:00').warnings.some(w => w.includes('08:00~18:00'))); // 18:00 넘김

// ======== 나이·중복 ========
assert.equal(ageFrom('1950-09-28', '2026-09-28'), 76);
assert.equal(ageFrom('1950-09-29', '2026-09-28'), 75);
assert.ok(ageFrom('1970-01-01', today) < 60);                                            // 60세 미만 → 확인 창 대상
const pp = [{ id: 'a', name: '김새봄', birth: '1950-04-05', phone: '010-0000-7777' }];
assert.equal(findDuplicates(pp, { name: '김새봄', birth: '1950-04-05', phone: '010-0000-1234' }).length, 1); // 이름+생년월일
assert.equal(findDuplicates(pp, { name: '박가을', birth: '1940-01-01', phone: '01000007777' }).length, 1);   // 전화번호 (하이픈 무시)
assert.equal(findDuplicates(pp, { name: '김새봄', birth: '1951-04-05', phone: '010-0000-1234' }).length, 0);
assert.equal(findDuplicates(pp, { id: 'a', name: '김새봄', birth: '1950-04-05', phone: '010-0000-7777' }).length, 0); // 자기 자신

// ======== 새 대상자: 데이터가 없어도 빈 상태로 ========
const np = { id: 'n1', name: '새 대상자', enrolledAt: today, active: true, info: { device: { source: 'none' }, call: { firstCall: addDays(today, 1) }, contacts: [] } };
const nd = { settings: S, people: [np], calls: [], vitals: [], alerts: [], visits: [], journals: [], ringNights: [] };
const ngetV = (pid, dd) => pickVitals(nd, pid, dd);
const nai = ai2(np, nd, today, ngetV);
assert.equal(nai.risk.level, 'low');
assert.ok(nai.bullets.some(b => b.text.includes(`기저선 형성 중 (0/${S.baselineDays}회)`)));
assert.ok(Object.values(tall2(nd, np, { days: 30 }, today, ngetV)).every(t => t.status === '데이터 부족'));
assert.ok(jd2(np, nd, today, ngetV).S.includes('통화 기록 없음'));

// ======== 종결 대상자 제외 ========
const cd = makeSeed(S, today);
const cgetV = (pid, dd) => pickVitals(cd, pid, dd);
const before = dash2(cd, 7, today, cgetV);
const cp = cd.people[0];
cp.closed = { reason: '이사', date: today }; cp.active = false;
const after = dash2(cd, 7, today, cgetV);
assert.equal(cd.people.filter(p => p.active).length, 9);
// 분모(발신 대상일)에서 빠졌는지: 종결 전후 완료율 계산에 쓰인 대상일 수 비교
const targetDays = data => { let n = 0; for (const p of data.people.filter(p => p.active)) n += completion7(p, data.calls, today).days; return n; };
cp.active = true; const tBefore = targetDays(cd); cp.active = false; const tAfter = targetDays(cd);
assert.ok(tAfter < tBefore);
assert.notEqual(before.completionRate, undefined); assert.notEqual(after.completionRate, undefined);

// ======== 화면 문구: '시연', '데모', 긴 줄표, 이모지가 없음 (주석 제외) ========
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').split('\n').map(l => l.replace(/(^|[\s;{}(),])\/\/.*$/, '$1')).join('\n');
for (const f of ['app.js', 'metrics.js', 'call.js', 'items.js', 'vitals.js', 'store.js', 'seed.js', '../index.html']) {
  const code = strip(readFileSync(new URL(f, import.meta.url), 'utf8'));
  assert.ok(!/시연|데모|—|\p{Extended_Pictographic}/u.test(code), `${f}: ${code.match(/.{0,30}(시연|데모|—|\p{Extended_Pictographic}).{0,30}/u)?.[0]}`);
}

// ======== 표시 형식 ========
assert.equal(fmtDate('2026-09-28'), '2026.09.28');
assert.equal(fmtMD('2026-09-28'), '09.28');
assert.equal(fmtMDW('2026-09-28'), '09.28(월)');
assert.equal(fmtTime('2026-09-28 14:05:00'), '14:05');
assert.equal(fmtStamp('2026-09-28 14:05:00'), '2026.09.28 14:05');
assert.equal(fmtDur(151), '2분 31초');
assert.equal(fmtDur(42), '42초');
assert.equal(fmtNum(1234.5, 1), '1,234.5');
assert.equal(fmtUnit(84, '%'), '84%');        // %는 붙이고
assert.equal(fmtUnit(62, 'bpm'), '62 bpm');   // 나머지는 띄운다
assert.equal(fmtUnit(null, '건'), '-');

// ======== 오늘 시간표: 범위 · 이름 배치 ========
assert.deepEqual(timelineRange([9 * 60, 15 * 60]), [480, 1080]);          // 기본 08~18시
assert.deepEqual(timelineRange([18 * 60 + 30]), [480, 1140]);              // 18:30 → 19:00까지 넓힘
assert.deepEqual(timelineRange([7 * 60 + 10]), [420, 1080]);               // 07:10 → 07:00부터
const labs = layoutLabels([0, 10, 20, 30, 45, 60, 100, 130].map((x, i) => ({ x, name: 'n' + i, label: `n${i} 통화` })));
for (const side of ['top', 'bottom']) {
  const xs = labs.filter(l => l.side === side && !l.hidden).map(l => l.x);
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] - xs[i - 1] >= 40, `같은 쪽 보이는 이름 간격 40px 이상 (${side})`);
}
assert.ok(labs.some(l => l.hidden));
assert.ok(labs.every(l => l.label)); // 숨긴 이름도 aria-label 문구는 남는다
assert.equal(labs.length, 8);

// ======== 완료율 지난주 대비 ========
{
  const cd2 = makeSeed(S, today);
  const cdl = completionDelta(cd2, today);
  assert.equal(cdl.now, completionAvg(cd2, today));
  assert.equal(cdl.prev, completionAvg(cd2, addDays(today, -7)));
  assert.ok(Math.abs(cdl.delta - (cdl.now - cdl.prev)) < 1e-9);
}

// ======== 화면 코드: 브라우저 기본 창(alert·confirm·prompt) 없음, 색상 코드는 :root에만 ========
for (const f of ['app.js', 'call.js', 'icons.js']) {
  const code = strip(readFileSync(new URL(f, import.meta.url), 'utf8'));
  assert.ok(!/(^|[^.\w])(alert|confirm|prompt)\s*\(/m.test(code), `${f}: alert/confirm/prompt`);
  assert.ok(!/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/.test(code.replace(/#\/[\w/?=&.-]*/g, '')), `${f}: 색상 코드 ${code.match(/#[0-9a-fA-F]{3,6}\b/)?.[0]}`);
}
{
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const root = css.match(/:root\s*\{[\s\S]*?\n\}/)[0];
  const rest = css.replace(root, '');
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(rest), `style.css :root 밖 색상 코드: ${rest.match(/.{0,40}#[0-9a-fA-F]{3,8}\b/)?.[0]}`);
}

// ======== AI 통화: 응급 표현 · AI 답 검사 · 인용 검사 · 호칭 · 기본 음성 대체 ========
assert.deepEqual(detectEmergency('아이고 가슴이 답답해가 죽겠다'), { phrase: '가슴이 답답', severe: false });
assert.deepEqual(detectEmergency('요새는 마 살기 싫다'), { phrase: '살기 싫', severe: true });
assert.equal(detectEmergency('가슴이아파서').phrase, '가슴이 아파'); // 띄어쓰기 무시
assert.ok(detectEmergency('어제 넘어졌어요'));
assert.equal(detectEmergency('밥은 잘 묵었다'), null);

assert.deepEqual(checkChatReply('{"say":"{호칭}, 허리는 좀 어떠세요?","end":false}'), { say: '{호칭}, 허리는 좀 어떠세요?', end: false });
assert.equal(checkChatReply('허리는 좀 어떠세요?'), null);                                   // JSON 아님
assert.equal(checkChatReply({ say: '네', end: 'no' }), null);                                  // end 형식
assert.equal(checkChatReply({ say: '가'.repeat(81), end: false }), null);                      // 80자 초과
assert.ok(checkChatReply({ say: '가'.repeat(80), end: true }));
for (const w of ['치매', '진단', '점수', '검사 결과']) assert.equal(checkChatReply({ say: `${w} 얘기는요`, end: false }), null);

const elder = ['허리가 계속 쑤시고 밤에 잠을 못 자요', '반찬 좀 갖다주면 좋겠다'];
assert.deepEqual(keepQuoted([{ text: '반찬 지원', quote: '반찬 좀 갖다주면 좋겠다' }, { text: '외로움', quote: '혼자라서 외로워요' }], elder),
  [{ text: '반찬 지원', quote: '반찬 좀 갖다주면 좋겠다' }]);                                  // 지어낸 인용은 버린다
assert.equal(keepQuoted([{ text: '허리', quote: '허리가 계속 쑤시고' }], elder).length, 1);    // 일부 그대로 인용은 통과
const sum = checkSummary({ summary: '허리 통증과 반찬 요청', selfReport: { sleep: 'poor', mood: 'weird' },
  requests: [{ text: '반찬', quote: '반찬 좀 갖다주면' }], concerns: [{ text: '허리 통증', quote: '쑤시고 밤에' }, { text: '불안', quote: '없는 말' }] }, elder);
assert.equal(sum.selfReport.mood, 'unknown');
assert.equal(sum.requests.length, 1);
assert.deepEqual(sum.concerns.map(c => c.text), ['허리 통증']);
assert.equal(checkSummary({ summary: '치매 의심', requests: [], concerns: [] }, elder).summary, '');
assert.equal(checkSummary(null, elder), null);

assert.equal(fillTitle('{호칭}, 오늘은 좀 어떠세요?', '윤병훈 어르신'), '윤병훈 어르신, 오늘은 좀 어떠세요?');
assert.equal(fillTitle('{호칭}, 안녕하세요.', ''), '어르신, 안녕하세요.');
assert.ok(!fillTitle(DEFAULT_BANK.script.greeting, '김말순 어르신').includes('{'));

const agreed = { info: { consent: { ai: true } } }, refused = { info: { consent: { ai: false } } };
assert.equal(useAiVoice({ tts: true }, agreed), true);
assert.equal(useAiVoice({ tts: false }, agreed), false);       // 서버 꺼짐·키 없음·크레딧 부족 → health.tts false
assert.equal(useAiVoice({ tts: true }, refused), false);       // 미동의
assert.equal(useAiVoice({ tts: true }, { info: {} }), false);
assert.equal(useAiChat({ tts: true, llm: false }, agreed), false); // Typecast만 있음 → 고정 대본
assert.equal(ttsOutcome({ status: 200, elapsedMs: 900 }), 'ok');
assert.equal(ttsOutcome({ status: 200, elapsedMs: 8500 }), 'fallback'); // 시간 초과
assert.equal(ttsOutcome({ status: 0, elapsedMs: 8000 }), 'fallback');   // 연결 실패
assert.equal(ttsOutcome({ status: 502, elapsedMs: 300 }), 'fallback');
assert.equal(ttsOutcome({ status: 402, elapsedMs: 300 }), 'credits');   // 크레딧 부족 → 이후 기본 음성
const regItem = planForDate('2026-09-28').items.find(i => i.key === 'register');
assert.equal(isOffTopic(regItem, '아이고 요새 허리가 계속 쑤시가 밭에도 못 나가요'), true);
assert.equal(isOffTopic(regItem, '잘 모르겠는데 기억이 하나도 안 나요 미안해요'), false);


// ---- 정기 인지검사(전화형) ----
{
  const { korToDigits, fluencyWords, fluencyPoints, scoreCist, cistPlan, cistForm, rescoreCist, CIST, DEFAULT_CIST_MODES } = await import('./items.js');
  const { cistScore, cistChange, cistStatus, riskOf: risk2 } = await import('./metrics.js');
  // 한글 숫자
  assert.equal(korToDigits('이천이십육'), '2026');
  assert.equal(korToDigits('시월'), '10월');
  assert.equal(korToDigits('삼 일'), '3일');
  assert.equal(korToDigits('열한 시'), '11시');
  const tdate = '2026-10-03'; // 토요일
  const T = (part, answer) => scoreCist({ type: 'time', part, date: tdate, answer });
  assert.equal(T('year', '이천이십육년').score, 1);
  assert.equal(T('year', '이천이십육 아이가').score, 1);
  assert.equal(T('month', '시월이지').score, 1);
  assert.equal(T('day', '삼 일').score, 1);
  assert.equal(T('weekday', '토요일').score, 1);
  assert.equal(T('day', '음력으로 팔월 열이틀').status, 'needs_review');   // 음력 → 확인 필요
  assert.deepEqual([T('day', '').score, T('day', '').note], [0, '무응답']); // 제한 시간 초과 → 0점 '무응답'
  // 순서·읽기 횟수: 숫자는 한 번, 문장은 두 번, 회상은 등록 3분 뒤, 재인은 회상 다음
  const plan = cistPlan({ date: tdate, modes: {}, prevCount: 0, title: '윤병훈 어르신', name: '윤병훈' });
  const kinds = plan.steps.map(s => s.kind);
  assert.deepEqual(kinds.filter(k => k === 'digits').length, 2);
  assert.equal(plan.steps.find(s => s.kind === 'register').times, 2);
  assert.equal(plan.steps.find(s => s.kind === 'recall').gapSec, 180);
  // 검사지 순서: 기억등록 → 숫자 → … → 언어추론 → 기억회상 → 재인 → 이름대기 → 이해력 → 유창성(마지막)
  assert.ok(kinds.indexOf('register') < kinds.indexOf('digits') && kinds.indexOf('verbal') < kinds.indexOf('recall') && kinds.indexOf('recall') < kinds.indexOf('recognition'));
  assert.equal(kinds.at(-1), 'fluency');
  assert.deepEqual(plan.items.map(i => i.no).filter((v, n, a) => a.indexOf(v) === n),
    ['1-(1)', '1-(2)', '1-(3)', '1-(4)', '2', '4-(1)', '4-(2)', '5', '6', '7', '8', '9', '10', '11-(1)', '11-(2)', '11-(3)', '12', '13']);
  // 매뉴얼 채점: 마지막 대답, 두 자리 연도·육십갑자는 되묻고 그래도 그러면 오답, 순우리말 날짜 인정
  const { yearFollowUp, recogInEarlier, CIST_DOMAIN_MAX } = await import('./items.js');
  assert.equal(T('year', '26년').score, 0);
  assert.ok(yearFollowUp('26년').includes('네 자리'));
  assert.ok(yearFollowUp('병오년').includes('숫자로'));
  assert.equal(yearFollowUp('2026년'), null);
  assert.equal(T('year', '26년 이천이십육년').score, 1);
  assert.equal(T('day', '사 일, 아니 삼 일').score, 1);                 // 고친 대답으로
  assert.equal(T('day', '초사흘').score, 1);
  assert.equal(scoreCist({ type: 'time', part: 'month', date: '2026-11-03', answer: '동짓달' }).score, 1);
  assert.equal(scoreCist({ type: 'time', part: 'day', date: '2026-10-31', answer: '그믐' }).score, 1);
  assert.equal(T('weekday', '금요일 아니 토요일').score, 1);
  assert.equal(Object.values(CIST_DOMAIN_MAX).reduce((a, b) => a + b, 0), 30);
  // 거꾸로 말하기 연습은 대상자 이름으로, 다시 불러 주기는 한 번
  assert.ok(plan.steps.some(s => s.text?.includes('윤병훈님 이름을 거꾸로 하면 훈병윤')));
  assert.equal(plan.steps.find(s => s.id === 'a_reverse').rereads, 1);
  assert.equal(plan.steps.find(s => s.id === 'l_comp').rereads, 1);
  // 재인: 앞 재인 대답에서 말한 낱말은 재인으로 인정
  const pm = cistPlan({ date: tdate, modes: {}, prevCount: 0 });
  assert.ok(recogInEarlier(pm.items.find(i => i.id === 'm3'), ['민수, 공원 갔지']));
  assert.equal(recogInEarlier(pm.items.find(i => i.id === 'm5'), ['민수']), null);
  // 시각추론1은 말로, 시각추론2는 미시행
  assert.deepEqual(pm.items.filter(i => i.no === '7' || i.no === '8').map(i => i.status), ['auto', 'omitted']);
  // 유창성 '제외'(가공 음식·곡류·해조류)는 세지도 후보로도 넣지 않는다, 견과류·뿌리채소는 인정
  const fx = fluencyWords('곶감 콩 미역 호두 연근 옥수수');
  assert.deepEqual(fx.found, ['호두', '연근', '옥수수']);
  assert.deepEqual(fx.candidates, []);
  assert.deepEqual(fx.excluded, ['곶감', '콩', '미역']);
  // 이해력: 박수 두 번 + '다 했어요'면 1점 후보 (담당자 확정)
  assert.equal(scoreCist({ type: 'comp', variant: 'a', words: CIST.language.comprehension.a.words, answer: '다 했어요', segments: 3 }).score, 1);
  assert.equal(scoreCist({ type: 'comp', variant: 'a', words: CIST.language.comprehension.a.words, answer: '다 했어요', segments: 1 }).score, 0);
  // 대면 검사 의뢰 점수표 (만 나이 × 교육 연수, 90세 이상은 80~89세)
  const { cistReferralCut } = await import('./metrics.js');
  assert.equal(cistReferralCut(78, 6, true), 19);
  assert.equal(cistReferralCut(85, 0, false), 10);
  assert.equal(cistReferralCut(92, 12, true), 20);
  assert.equal(cistReferralCut(65, 0, false), null);
  assert.equal(cistReferralCut(55, 16, true), 27);
  // 문장 A·B 회차 교대
  assert.deepEqual([cistForm(0), cistForm(1), cistForm(2)], ['A', 'B', 'A']);
  assert.equal(cistPlan({ date: tdate, modes: {}, prevCount: 1 }).items.find(i => i.id === 'm1').word, '영희');
  // 지연 회상: 인정 낱말이면 2점, 못 떠올린 낱말만 재인 1점
  const m2 = plan.items.find(i => i.id === 'm2');
  assert.equal(rescoreCist({ ...m2, answer: '자전차 타고 갔다' }).score, 2);
  assert.equal(rescoreCist({ ...m2, answer: '버스', recog: { ...m2.recogSpec, response: '자전거' } }).score, 1);
  assert.equal(rescoreCist({ ...m2, answer: '버스', recog: { ...m2.recogSpec, response: '버스' } }).score, 0);
  assert.equal(rescoreCist({ ...m2, answer: '자전거', recog: { ...m2.recogSpec, response: '버스' } }).score, 2); // 회상하면 재인은 보지 않음
  // 의미 유창성: 중복 제외, 1분 15/9 · 30초 8/5
  const fw = fluencyWords('사과 사과 배 배를 포도 음 고등어');
  assert.deepEqual(fw.found, ['사과', '배', '포도']);
  assert.deepEqual(fw.candidates, ['고등어']);                    // 목록에 없는 말은 담당자 확인
  const A = CIST.executive.fluency.a, B = CIST.executive.fluency.b;
  assert.deepEqual([15, 14, 9, 8].map(n => fluencyPoints(n, A)), [2, 1, 1, 0]);
  assert.deepEqual([8, 7, 5, 4].map(n => fluencyPoints(n, B)), [2, 1, 1, 0]);
  // cistScore: 미시행은 만점에서 빼고, 30점 환산, 원형 유지는 원형 문항만
  const mk = (items, extra = {}) => ({ status: 'confirmed', modes: { ...DEFAULT_CIST_MODES }, items, ...extra });
  const it = (id, domain, fidelity, score, maxScore = 1, status = 'auto') => ({ id, domain, fidelity, score, maxScore, status });
  const sA = mk([it('o_year', 'orientation', 'original', 1), it('v_draw', 'visuospatial', 'adapted', 2, 2, 'reviewed'), it('e_visual', 'executive', 'omitted', null, 2, 'omitted'), it('m1', 'memory', 'original', 1, 2)]);
  const scA = cistScore(sA);
  assert.deepEqual(scA.total, { score: 4, max: 5 });
  assert.deepEqual(scA.original, { score: 2, max: 3 });
  assert.equal(scA.scaled30, 24);
  assert.equal(scA.byDomain.language, null);                        // 시행 안 한 영역은 '미시행'(null)
  assert.equal(cistScore(mk([it('v_draw', 'visuospatial', 'adapted', null, 2, 'needs_review')])).pending, 1);
  // cistChange: 확정 회차끼리만, 방식이 다른 영역은 비교 안 함
  const sB = mk([it('o_year', 'orientation', 'original', 0), it('v_clock', 'visuospatial', 'replaced', 1), it('v_direction', 'visuospatial', 'replaced', 1), it('e_visual', 'executive', 'omitted', null, 2, 'omitted'), it('m1', 'memory', 'original', 1, 2)],
    { modes: { ...DEFAULT_CIST_MODES, visuospatial: 'b' } });
  const ch = cistChange(sA, sB);
  assert.deepEqual(ch.original, { diff: -1, comparable: true });
  assert.equal(ch.byDomain.visuospatial.modeDiff, true);
  assert.equal(ch.byDomain.orientation.diff, -1);
  assert.equal(cistChange(sA, { ...sB, status: 'draft' }), null);   // 초안은 비교하지 않는다

  // riskOf: 같은 방식에서 3점 하락 → 주의, 두 번 연속 하락(합 4점 이상) → 높음, 초안은 무시
  const sd = makeSeed(undefined, tdate);
  const gv = (pid, d) => pickVitals(sd, pid, d);
  const yoon = sd.people.find(p => p.name === '윤병훈'), lee = sd.people.find(p => p.name === '이상철'), han = sd.people.find(p => p.name === '한복남');
  assert.ok(risk2(yoon, sd, tdate, gv).reasons.includes('정기검사 원형 유지 3점 하락'));
  const rl = risk2(lee, sd, tdate, gv);
  assert.equal(rl.level, 'high');
  assert.ok(rl.reasons.includes('정기검사 연속 하락'));
  const hanLast = sd.cistSessions.filter(x => x.personId === han.id).at(-1);
  const drop = (x, n) => { const y = structuredClone(x); let left = n; for (const i of y.items) if (i.fidelity === 'original' && left && i.score) { const k = Math.min(left, i.score); i.score -= k; left -= k; } return y; };
  sd.cistSessions.push({ ...drop(hanLast, 6), id: 'sx-draft', date: addDays(tdate, -1), status: 'draft', confirmedAt: null });
  assert.equal(risk2(han, sd, tdate, gv).level, 'low');            // 초안은 무시
  sd.cistSessions.pop();
  sd.cistSessions.push({ ...drop(hanLast, 3), id: 'sx-conf', date: addDays(tdate, -1) });
  const rh = risk2(han, sd, tdate, gv);
  assert.equal(rh.level, 'mid');
  assert.ok(rh.reasons.includes('정기검사 원형 유지 3점 하락'));
  sd.cistSessions.pop();
  // 방식을 바꿔도 지난 회차 점수는 그대로 (회차마다 방식과 문항을 함께 저장)
  const before = sd.cistSessions.map(x => cistScore(x).original.score).join();
  sd.cistModes = { ...DEFAULT_CIST_MODES, visuospatial: 'c', fluency: 'b', reverseWord: 'b' };
  assert.equal(sd.cistSessions.map(x => cistScore(x).original.score).join(), before);
  assert.equal(cistPlan({ date: tdate, modes: sd.cistModes, prevCount: 0 }).items.find(i => i.id === 'v_draw').status, 'omitted');
  // 시드: 10명 모두 2~3회, 초안 1명(확인 필요 2), 9일 지연 1명, 시공간 방식 바뀐 1명, 위험도 2·3·5 유지
  const per = sd.people.map(p => sd.cistSessions.filter(x => x.personId === p.id).length);
  assert.ok(per.every(n => n >= 2 && n <= 3));
  const drafts = sd.cistSessions.filter(x => x.status === 'draft');
  assert.equal(drafts.length, 1);
  assert.equal(cistScore(drafts[0]).pending, 2);
  assert.equal(sd.people.filter(p => cistStatus(p, sd, tdate).delayed).length, 1);
  assert.ok(sd.cistSessions.some((x, n, a) => n && x.personId === a[n - 1].personId && x.modes.visuospatial !== a[n - 1].modes.visuospatial));
  const lv = sd.people.map(p => risk2(p, sd, tdate, gv).level);
  assert.deepEqual(['high', 'mid', 'low'].map(l => lv.filter(x => x === l).length), [2, 3, 5]);
  assert.equal(sd.people.filter(p => (p.info.tests || []).length).length, 4);
  // 다음 정기 검사일 직접 지정
  yoon.info.call.cistNext = tdate;
  assert.equal(cistStatus(yoon, sd, tdate).isDueToday, true);
}


// ======== 대상자 앱: 복지포인트 · 미니게임 기록 ========
{
  const { callReward, gameReward, pointsBalance, pointsOn, activityStats, activityOps } = await import('./metrics.js');
  const { makeCalc, makeMatch, makeOrder, ACTIVITIES } = await import('./items.js');
  const day = '2026-10-08';
  const dd = { settings: { ...S }, people: [{ id: 'x', active: true }, { id: 'y', active: true }], points: [], activities: [] };
  const call = { personId: 'x', date: day, status: 'completed', declined: false, items: [{}] };
  assert.equal(callReward(dd, call), 1000);                                              // 인지검사를 마친 통화 → 1,000원
  assert.equal(callReward(dd, { ...call, status: 'partial' }), 0);                         // 끝까지 못 한 통화는 없음
  assert.equal(callReward(dd, { ...call, declined: true }), 0);
  assert.equal(callReward(dd, { ...call, items: [], kind: 'cist' }), 1000);                // 정기 검사 통화도 적립
  dd.points.push({ personId: 'x', date: day, at: day + 'T10:00', amount: 1000, reason: 'call' });
  assert.equal(callReward(dd, call), 0);                                                 // 하루 한 번
  for (let n = 0; n < 10; n++) { assert.equal(gameReward(dd, 'x', day), 100); dd.points.push({ personId: 'x', date: day, at: day + 'T11:00', amount: 100, reason: 'game' }); }
  assert.equal(gameReward(dd, 'x', day), 0);                                             // 하루 10판까지
  assert.equal(gameReward(dd, 'x', '2026-10-09'), 100);
  assert.equal(pointsBalance(dd, 'x'), 2000);
  assert.equal(pointsOn(dd, 'x', day), 2000);
  dd.activities.push({ personId: 'x', kind: 'game', key: 'calc', date: day, durationSec: 90 }, { personId: 'x', kind: 'game', key: 'match', date: '2026-09-30' },
    { personId: 'x', kind: 'exercise', key: 'exercise', date: day }, { personId: 'x', kind: 'game', key: 'order', date: '2026-09-01' });
  const as = activityStats(dd, 'x', day);
  assert.deepEqual([as.games7, as.games30, as.exercise7, as.prev7, as.days7], [1, 2, 1, 1, 1]);
  assert.equal(as.daily14.length, 14);
  assert.deepEqual(activityOps(dd, day, 7), { plays: 1, players: 1, people: 2, rate: 50 });
  // 내 기록: 출석 = 통화 완료 또는 활동이 있는 날, 연속 출석은 오늘(없으면 어제)부터 거꾸로
  const ad = { calls: [{ personId: 'x', date: '2026-10-06', status: 'completed', durationSec: 120 }, { personId: 'x', date: '2026-10-05', status: 'missed' }],
    activities: [{ personId: 'x', date: '2026-10-07', durationSec: 60 }, { personId: 'x', date: '2026-10-04', durationSec: 60 }] };
  const at = (await import('./metrics.js')).attendance(ad, 'x', day);
  assert.deepEqual([at.streak, at.total, at.calls, at.minutes], [2, 3, 1, 4]);
  assert.equal(at.week.length, 7);
  assert.equal(at.week[0].date, '2026-10-04');                                           // 일요일부터
  assert.deepEqual(at.week.map(w => w.done), [true, false, true, true, false, false, false]);
  // 게임 내용: 더 큰 쪽은 값이 다르고 답이 맞음 · 짝 4쌍 · 1~9 한 번씩
  let k = 1; const r = () => ((k = (k * 16807) % 2147483647) / 2147483647);
  for (const q of makeCalc(r, 30)) { assert.notEqual(q.left.value, q.right.value); assert.equal(q.answer, q.left.value > q.right.value ? 'left' : 'right'); }
  const mm = makeMatch(r);
  assert.equal(mm.length, 8);
  assert.ok(new Set(mm).size === 4 && [...new Set(mm)].every(x => mm.filter(y => y === x).length === 2));
  assert.deepEqual([...makeOrder(r)].sort(), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(ACTIVITIES.map(a => a.cat), ['focus', 'think', 'memory', 'body']);
  // 시드: 오늘 활동은 비워 두고, 앱 활동이 관리자 화면 숫자로 나옴
  const sd = makeSeed(S, day);
  assert.ok(!sd.activities.some(a => a.date === day));
  assert.ok(sd.people.every(p => pointsBalance(sd, p.id) > 0));
  assert.ok(activityOps(sd, day, 7).plays > 0);
}


// ======== 건강정보 공지 · 오늘 통화 ========
{
  const { healthToday, noticeState, checkNotice } = await import('./metrics.js');
  const day = '2026-10-08';
  const hd = { healthNotices: [
    { id: 'a', status: 'posted', from: '2026-10-01', to: '', createdAt: '2026-09-30T10:00' },
    { id: 'b', status: 'posted', from: '2026-10-08', to: '', createdAt: '2026-10-08T08:00' },
    { id: 'c', status: 'hidden', from: '2026-10-01', to: '' },
    { id: 'd', status: 'posted', from: '2026-10-10', to: '' },
    { id: 'e', status: 'posted', from: '2026-09-01', to: '2026-09-30' }] };
  assert.deepEqual(healthToday(hd, day).map(n => n.id), ['b', 'a']);                       // 게시 중만, 새것부터
  assert.deepEqual(hd.healthNotices.map(n => noticeState(n, day)), ['게시 중', '게시 중', '내림', '예약', '기간 끝남']);
  assert.deepEqual(Object.keys(checkNotice({ title: '', body: '', from: '' })), ['title', 'body', 'from']);
  assert.equal(checkNotice({ title: '가'.repeat(41), body: 'x', from: day }).title, '40자 이하');
  assert.equal(checkNotice({ title: '물', body: 'x', from: day, to: '2026-10-01' }).to, '시작일 이후로');
  assert.deepEqual(checkNotice({ title: '물', body: 'x', from: day }), {});
  // 시드: 오늘 통화는 아직 없음(어르신 화면에서 전화가 울림), 건강정보 4건 게시 중, 위험도 분포는 그대로
  const sd = makeSeed(S, day);
  assert.equal(sd.calls.filter(c => c.date === day).length, 0);
  assert.equal(healthToday(sd, day).length, 4);
  const lv = sd.people.map(p => riskOf(p, sd, day, (pid, dt) => pickVitals(sd, pid, dt)).level);
  assert.deepEqual(['high', 'mid', 'low'].map(l => lv.filter(x => x === l).length), [2, 3, 5]);
}


// ======== 기본 계정: 비밀번호 원문 없이 해시로 확인 ========
{
  const { BASE_ACCOUNT, ensureBaseAccount, verifyPassword: vp, displayName } = await import('./store.js');
  assert.equal(await vp(BASE_ACCOUNT, 'dbsqudgns'), true);
  assert.equal(await vp(BASE_ACCOUNT, 'wrong1'), false);
  const ed = ensureBaseAccount({ accounts: [] });
  assert.equal(ed.accounts[0].username, 'dbsqudgns');
  assert.equal(ensureBaseAccount(ed).accounts.length, 1);                  // 두 번 넣지 않음
  assert.equal(displayName(BASE_ACCOUNT), '윤병훈 간호사');
}

console.log('selftest 통과');
