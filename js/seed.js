// 시연용 대상자 8명과 60일치 가상 기록 생성. 날짜는 오늘 기준으로 거꾸로 만든다 (어제까지).
// 같은 결과가 나오도록 고정 시드의 난수를 쓴다.

import { DEFAULT_SETTINGS, addDays, todayStr, nowStamp, personStatus, updateAlerts } from './metrics.js';
import { planForDate, scorePct } from './items.js';

const PEOPLE = [
  ['김순자', 78, 'stable', '09:30'],
  ['이영수', 81, 'stable', '10:00'],
  ['박영자', 74, 'stable', '10:30'],
  ['최말순', 83, 'stable', '11:00'],
  ['정옥자', 79, 'decline', '09:00'],  // 35일째부터 하루 −0.6%p
  ['강만복', 76, 'hypoxia', '14:00'],  // 야간 저산소 잦음
  ['조복례', 85, 'hearing', '15:00'],  // 재질문 잦음
  ['윤칠성', 80, 'noAnswer', '16:00']  // 무응답 잦음, 최근 4일 연속 무응답, 착용 순응도 낮음
];

export function makeSeed(settings = DEFAULT_SETTINGS, today = todayStr()) {
  let x = 20260927;
  const rand = () => { // mulberry32
    x = (x + 0x6d2b79f5) | 0;
    let t = Math.imul(x ^ (x >>> 15), 1 | x);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  const r1 = v => Math.round(v * 10) / 10;

  const start = addDays(today, -60);
  const data = { settings: { ...settings }, people: [], calls: [], vitals: [], alerts: [] };

  PEOPLE.forEach(([name, age, kind, time], i) => {
    const id = 'p' + (i + 1);
    data.people.push({
      id, name, age,
      phone: `010-0000-${String(1001 + i)}`,
      guardianPhone: `010-0000-${String(2001 + i)}`,
      preferredTime: time, enrolledAt: start, active: true
    });

    for (let k = 0; k < 60; k++) {
      const date = addDays(start, k);
      const dayNo = k + 1;

      // ---- 통화 ----
      const missed = kind === 'noAnswer' ? k >= 56 || rand() < 0.18 : rand() < 0.06;
      if (missed) {
        data.calls.push({
          id: `c${i}-${k}`, personId: id, date, status: 'missed', startedAt: `${date}T${time}`,
          durationSec: 0, rotationDomain: null, setIndex: null, items: [], scorePct: null, audioId: null
        });
      } else {
        const plan = planForDate(date, settings.parallelSets);
        const mean = kind === 'decline' ? 80 - 0.6 * Math.max(0, dayNo - 35) : kind === 'stable' ? 80 : 78;
        const sd = kind === 'decline' ? 4 : 6;
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
        // 재질문
        const asks = kind === 'hearing' ? 2 + Math.floor(rand() * 2) : rand() < 0.04 ? 1 : 0;
        for (let a = 0; a < asks; a++) items[Math.floor(rand() * items.length)].repeatAsks++;

        data.calls.push({
          id: `c${i}-${k}`, personId: id, date, status: 'completed', startedAt: `${date}T${time}`,
          durationSec: Math.round(110 + rand() * 40 + (plan.rotationDomain === 'fluency' ? 25 : 0)),
          rotationDomain: plan.rotationDomain, setIndex: plan.setIndex, items, scorePct: scorePct(items), audioId: null
        });
      }

      // ---- 야간 생체신호 (그날 아침 기준 날짜) ----
      const hypoxic = kind === 'hypoxia' && (k >= 53 || rand() < 0.6);
      const spo2Min = hypoxic ? 84 + Math.floor(rand() * 5) : 91 + Math.floor(rand() * 5);
      const lowWear = kind === 'noAnswer' && rand() < 0.55;
      data.vitals.push({
        personId: id, date,
        hrRest: Math.round(60 + i * 1.5 + gauss() * 2),
        spo2Min,
        spo2Below90Min: hypoxic ? 15 + Math.floor(rand() * 26) : rand() < 0.15 ? Math.floor(rand() * 5) : 0,
        wearHours: r1(lowWear ? rand() * 3.5 : 6 + rand() * 2.5),
        sqi: Math.round((rand() < 0.12 ? 0.3 + rand() * 0.25 : 0.65 + rand() * 0.3) * 100) / 100,
        steps: Math.round(2500 + rand() * 4000)
      });
    }
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
  return data;
}
