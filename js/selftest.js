// 채점·지표 계산 검사. 실행: node js/selftest.js
import assert from 'node:assert/strict';
import { planForDate, scoreItem, countAnimals, isRepeatAsk, scorePct } from './items.js';
import { DEFAULT_SETTINGS as S, baseline, zScore, cognitionLevel, dashboard, addDays, riskOf, filterPeople, aiSummary } from './metrics.js';
import { makeSalt, hashPassword, verifyPassword } from './store.js';
import { completion7, autoChecklist, validPhone, personStatus, trendAll, trendCsv, journalDraft } from './metrics.js';
import { parseRingCsv, toMinutes, nightsFromMinutes, pickVitals, importRing, recomputeRing } from './vitals.js';
import { planForDate as plan2 } from './items.js';
import { readFileSync } from 'node:fs';
import ungchon from './ungchon.js';
import { makeSeed } from './seed.js';

const DATE = '2026-09-27'; // 일요일
const item = key => planForDate(DATE, 6).items.find(i => i.key === key)
  || [...Array(3)].map((_, k) => planForDate(addDays(DATE, k), 6)).flatMap(p => p.items).find(i => i.key === key);

// ---- 채점: 지남력 ----
const ori = item('orientation');
assert.equal(scoreItem(ori, '9월 27일 일요일이요'), 3);
assert.equal(scoreItem(ori, '구월 이십칠일 일요일'), 3);
assert.equal(scoreItem(ori, '8월 27일 월요일'), 1);
assert.equal(scoreItem({ ...ori, date: '2026-12-07' }, '이월 칠일'), 1); // 일만 맞음 ('이월'은 12월이 아님)
assert.equal(scoreItem({ ...ori, date: '2026-12-07' }, '십이월 칠일 월요일'), 3);

// ---- 채점: 단어 따라 말하기·회상 ----
const reg = item('register');
assert.equal(scoreItem(reg, reg.words.join(' ')), 3);
assert.equal(scoreItem(reg, `음 ${reg.words[0]}하고 ${reg.words[2]}`), 2);

// ---- 채점: 숫자 거꾸로 ----
const b3 = item('backward3');
const rev = [...b3.digits].reverse().join('');
assert.equal(scoreItem(b3, rev.split('').join(' ')), 1);
assert.equal(scoreItem(b3, [...rev].map(d => '공일이삼사오육칠팔구'[d]).join(' ')), 1);
assert.equal(scoreItem(b3, b3.digits), 0);

// ---- 채점: 동물 이름 ----
assert.equal(countAnimals('개 고양이 호랑이요 사자랑 개 소나무'), 4);
assert.equal(scoreItem(item('fluency'), '개 고양이 호랑이 사자'), 1.3);
assert.equal(scoreItem(item('fluency'), '개 고양이 소 말 돼지 닭 오리 양 염소 토끼 쥐 곰 여우 늑대 사슴 기린'), 5);

// ---- 채점: 공통점 ----
const sim = item('similarity1');
assert.equal(scoreItem(sim, `둘 다 ${sim.keys[0]}이에요`), 1);
assert.equal(scoreItem(sim, '잘 모르겠어요'), 0);

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
  const items = plan2(c.date, S.parallelSets).items;
  for (const it of c.items) {
    const pi = items.find(x => x.key === it.key);
    assert.equal(scoreItem(pi, it.answer), it.score, `${c.id} ${it.key}: ${it.answer}`);
    if (it.key === 'recall') assert.equal(pi.words.filter(w => it.answer.replace(/\s+/g, '').includes(w)).length, it.score); // 지연 회상 점수 = 대답에 나온 정답 단어 수
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

console.log('selftest 통과');
