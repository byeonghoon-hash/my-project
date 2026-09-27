// 채점·지표 계산 검사. 실행: node js/selftest.js
import assert from 'node:assert/strict';
import { planForDate, scoreItem, countAnimals, isRepeatAsk, scorePct } from './items.js';
import { DEFAULT_SETTINGS as S, baseline, zScore, cognitionLevel, dashboard, addDays } from './metrics.js';

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

console.log('selftest 통과');
