// 라우팅과 화면 그리기
// #/ 첫 화면 · #/user 대상자 화면 · #/admin 관리자 화면 · #/admin/p/<id> 대상자 상세

import { getData, setData, save, saveAudio, getAudio, deleteAudio, clearAudio } from './store.js';
import { makeSeed } from './seed.js';
import { DEFAULT_SETTINGS, LEVEL_RANK, todayStr, nowStamp, addDays, personStatus, updateAlerts, dashboard, isValidNight } from './metrics.js';
import { getNightVitals } from './vitals.js';
import { startRing, runCall, nextItem, stopCall } from './call.js';
import { scorePct, DOMAIN_LABEL } from './items.js';

const app = document.getElementById('app');

const LEVEL = { watch: '관찰', caution: '주의', refer: '의뢰' };
const TYPE = { cognition: '인지 기저선 이탈', spo2: '야간 저산소 (수면무호흡 의심)', hearing: '재질문 잦음 (난청 의심)', noAnswer: '연속 무응답 (안부 확인)' };
const TYPE_SHORT = { cognition: '인지', spo2: '저산소', hearing: '난청 의심', noAnswer: '무응답' };
const STATUS = { open: '처리 전', referred: '연계됨', closed: '종결' };
const CALL_STATUS = { completed: '완료', missed: '무응답', partial: '일부 (시간 초과)' };
const CHECKS = { acute: '최근 급성 질환', sleep: '수면 부족', meds: '약물 변경', mood: '우울감', hearing: '청력 저하' };
const SETTING_LABEL = {
  baselineDays: '기저선 통화 수 (회)',
  zWatch: '관찰 기준 z',
  cautionRun: '주의: 연속 이탈 횟수',
  referRun: '의뢰: 연속 이탈 횟수',
  zRefer: '의뢰: 최근 7회 평균 z',
  missedEscalateDays: '안부확인: 연속 무응답 (일)',
  sqiMin: '유효 측정 최소 신호품질 (0~1)',
  spo2Below90Alert: 'SpO2 90% 미만 기준 (분)',
  spo2AlertNights: '최근 7일 중 해당 밤 수',
  hearingRepeatAsks: '통화당 재질문 기준 (회)',
  hearingCalls: '최근 5통화 중 해당 통화 수',
  parallelSets: '평행형 문항 세트 수 N (최대 10)',
  maxCallSec: '통화 상한 (초)'
};

// 차트 색 (색각 이상 구분 검사를 통과한 조합)
const C = { green: '#00754A', blue: '#2F6FDE', orange: '#C4691E', gray: '#8B908D', grid: '#EEEAE3' };

// 아이콘 (선 그림)
const PATHS = {
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  heart: '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z"/>',
  chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
  chev: '<path d="m9 18 6-6-6-6"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  alert: '<path d="M12 8v5"/><path d="M12 17h.01"/><circle cx="12" cy="12" r="9"/>',
  next: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/>'
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`;

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const mmss = sec => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
const pctText = v => (v == null ? '—' : `${v.toFixed(1)}%`);
const slopeText = v => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%p/일`);
const stamp = s => (s ? s.replace('T', ' ') : '—');
const initial = name => esc((name || '?').slice(0, 1));
const longDate = s => {
  const d = new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${'일월화수목금토'[d.getDay()]}요일`;
};

let actions = {};   // 지금 화면의 버튼 동작 (data-act / data-change)
let cleanup = null; // 화면을 떠날 때 멈출 것 (벨소리·통화)
let charts = [];
let period = 7;     // 지표 카드 기간
let range = 30;     // 상세 그래프 기간

app.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (el && actions[el.dataset.act]) actions[el.dataset.act](el);
});
app.addEventListener('change', e => {
  const el = e.target.closest('[data-change]');
  if (el && actions[el.dataset.change]) actions[el.dataset.change](el);
});

if (window.Chart) {
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.color = '#5A5F5C';
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.boxHeight = 8;
}

// 판정 규칙으로 알림을 만들거나 단계를 올린다 (통화 저장·점수 수정·설정 변경 뒤에 부른다)
function evaluate(ids) {
  const d = getData();
  for (const p of d.people) {
    if (!p.active || (ids && !ids.includes(p.id))) continue;
    updateAlerts(d.alerts, p.id, personStatus(p, d.calls, d.settings, todayStr(), getNightVitals).levels, nowStamp());
  }
  save();
}

// ---------- 라우팅 ----------
function route() {
  cleanup?.();
  cleanup = null;
  window.scrollTo(0, 0);
  render();
}

function render() {
  actions = {};
  charts.forEach(c => c.destroy());
  charts = [];
  const h = location.hash;
  document.body.className = h.startsWith('#/admin') ? '' : 'big';
  if (h === '#/user') userSelect();
  else if (h === '#/admin') adminHome();
  else if (h.startsWith('#/admin/p/')) adminPerson(decodeURIComponent(h.slice(10)));
  else home();
}

function home() {
  app.innerHTML = `
    <div class="brand"><div class="brand-mark">${icon('heart')}</div><div class="brand-name">안부 전화</div></div>
    <div class="stack">
      <a class="btn tile" href="#/user"><span class="ic">${icon('phone')}</span>대상자 화면<span class="chev">${icon('chev')}</span></a>
      <a class="btn tile dark" href="#/admin"><span class="ic">${icon('chart')}</span>관리자 화면<span class="chev">${icon('chev')}</span></a>
    </div>`;
}

// ---------- 대상자 화면 ----------
function userSelect() {
  const people = getData().people.filter(p => p.active);
  app.innerHTML = `
    <h1>누구세요?</h1>
    <div class="stack">${people.map(p => `
      <button class="tile" data-act="pick" data-id="${p.id}"><span class="avatar">${initial(p.name)}</span>${esc(p.name)}<span class="chev">${icon('chev')}</span></button>`).join('')}
    </div>
    <a class="btn ghost" href="#/">처음으로</a>`;
  actions.pick = el => ringing(people.find(p => p.id === el.dataset.id));
}

function ringing(p) {
  app.innerHTML = `
    <div class="phone">
      <p class="caller-label">보건소 안부전화</p>
      <div class="pulse"><div class="avatar">${icon('heart')}</div></div>
      <h1>안부 전화가 왔습니다</h1>
      <div class="answer">
        <label><button class="round green" data-act="accept">${icon('phone')}</button>받기</label>
        <label><button class="round red" data-act="reject">${icon('phone')}</button>거절</label>
      </div>
    </div>`;
  const stopRing = startRing();
  const timer = setTimeout(missed, 30000); // 30초 동안 응답 없음 → 무응답
  cleanup = () => { stopRing(); clearTimeout(timer); };

  function missed() {
    cleanup();
    cleanup = null;
    const d = getData();
    d.calls.push({
      id: 'c' + Date.now(), personId: p.id, date: todayStr(), status: 'missed', startedAt: nowStamp(),
      durationSec: 0, rotationDomain: null, setIndex: null, items: [], scorePct: null, audioId: null
    });
    evaluate([p.id]);
    app.innerHTML = `<h1>전화를 받지 않으셨어요.</h1><a class="btn" href="#/">처음으로</a>`;
  }
  actions.reject = missed;
  actions.accept = () => { cleanup(); inCall(p); };
}

async function inCall(p) {
  app.innerHTML = `
    <div class="phone">
      <div class="call-top"><span class="live">통화 중</span><span class="timer" id="time">00:00</span></div>
      <div class="question" id="q">연결 중…</div>
      <div class="voice" id="lv">${'<span></span>'.repeat(7)}</div>
      <button class="ghost" data-act="next">다음 ${icon('next')}</button>
    </div>`;
  const $ = id => document.getElementById(id); // 화면을 떠난 뒤에는 null
  const weights = [0.45, 0.7, 0.9, 1, 0.9, 0.7, 0.45];
  const ui = {
    time: s => { const el = $('time'); if (el) el.textContent = mmss(s); },
    question: t => { const el = $('q'); if (el) el.textContent = t; },
    level: v => {
      const bars = $('lv')?.children || [];
      [...bars].forEach((b, i) => { b.style.height = 12 + Math.min(60, v * 900 * weights[i] * (0.7 + Math.random() * 0.6)) + 'px'; });
    }
  };
  actions.next = nextItem;
  cleanup = stopCall;

  let res;
  try {
    res = await runCall(getData().settings, ui);
  } catch {
    cleanup = null;
    app.innerHTML = `<h1>마이크를 쓸 수 없습니다.</h1>
      <p>크롬에서 http://localhost:8000 으로 열고 마이크를 허용해 주세요.</p>
      <a class="btn" href="#/">처음으로</a>`;
    return;
  }
  cleanup = null;
  if (!res) return; // 통화 도중 화면을 떠남

  const d = getData();
  const id = Date.now().toString(36);
  const audioId = res.blob.size ? 'a' + id : null;
  if (audioId) await saveAudio(audioId, res.blob);
  d.calls.push({ id: 'c' + id, personId: p.id, ...res.call, audioId });
  evaluate([p.id]);
  // 점수나 위험도는 대상자에게 보여주지 않는다
  app.innerHTML = `
    <div class="done-mark">${icon('check')}</div>
    <h1>오늘도 통화해 주셔서 감사합니다.</h1>
    <a class="btn" href="#/">처음으로</a>`;
}

// ---------- 관리자 화면 공통 ----------
const appbar = (right = `<a class="btn" href="#/">처음으로</a>`) => `
  <header class="appbar">
    <a class="logo" href="#/admin"><i>${icon('heart')}</i>안부 관리자</a>
    ${right}
  </header>`;

const levelBadge = a => `<span class="badge lv-${a.level}">${LEVEL[a.level]} · ${TYPE_SHORT[a.type]}</span>`;

// ---------- 관리자 화면 ----------
function adminHome() {
  const d = getData(), s = d.settings, today = todayStr();
  const m = dashboard(d, period, today, getNightVitals);
  const goal = (v, ok) => (v == null ? null : ok(v));
  // [이름, 값 글자, 목표 글자, 달성 여부, 막대 채움(%)]
  const cards = [
    ['통화 완료율', pctText(m.completionRate), '목표 80% 이상', goal(m.completionRate, v => v >= 80), m.completionRate],
    ['무응답률', pctText(m.missedRate)],
    ['평균 통화 시간', m.avgDurationSec == null ? '—' : mmss(m.avgDurationSec), '목표 3분 이하', goal(m.avgDurationSec, v => v <= 180), m.avgDurationSec == null ? null : (m.avgDurationSec / 180) * 100],
    ['유효 측정일 비율', pctText(m.validDayRate), '목표 70% 이상', goal(m.validDayRate, v => v >= 70), m.validDayRate],
    ['웨어러블 착용 순응도', pctText(m.wearRate), '목표 75% 이상', goal(m.wearRate, v => v >= 75), m.wearRate],
    ['8주 유지율', pctText(m.retention8w), '목표 70% 이상', goal(m.retention8w, v => v >= 70), m.retention8w],
    ['기저선 이탈 탐지율', pctText(m.detectionRate)],
    ['의뢰 연계율', pctText(m.referralRate)],
    ['연계 후 확진율 (PPV)', pctText(m.ppv)],
    ['오경보율', pctText(m.falseAlarmRate)],
    ['수면무호흡 의심 / 난청 의심', `${m.spo2Alerts}건 / ${m.hearingAlerts}건`]
  ];

  // 케이스 큐: 알림 단계(의뢰 > 주의 > 관찰 > 없음) → 최근 z 낮은 순
  const rows = d.people.filter(p => p.active).map(p => {
    const st = personStatus(p, d.calls, s, today, getNightVitals);
    const open = d.alerts.filter(a => a.personId === p.id && a.status !== 'closed')
      .sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level]);
    let spo2 = null;
    for (let k = 0; k < 14 && spo2 == null; k++) {
      const v = getNightVitals(p.id, addDays(today, -k));
      if (isValidNight(v, s)) spo2 = v.spo2Min;
    }
    return { p, st, open, spo2, rank: Math.max(0, ...open.map(a => LEVEL_RANK[a.level])) };
  }).sort((a, b) => b.rank - a.rank || (a.st.lastZ ?? Infinity) - (b.st.lastZ ?? Infinity));

  const countRank = r => rows.filter(x => x.rank === r).length;
  const needCheck = rows.filter(x => x.rank >= LEVEL_RANK.caution);
  const forming = rows.filter(x => !x.st.base.ready).length;

  app.innerHTML = `
    ${appbar()}
    <nav class="tabs">${[['sec-kpi', '지표'], ['sec-calls', '통화 현황'], ['sec-queue', '케이스 큐'], ['sec-people', '대상자 관리'], ['sec-settings', '설정']]
      .map(([id, t]) => `<button data-act="jump" data-to="${id}">${t}</button>`).join('')}</nav>

    <div class="page-title"><h1>오늘의 안부 현황</h1><p>${longDate(today)}</p></div>

    <div class="hero">
      <div class="eyebrow">주의 이상 알림이 열린 대상자</div>
      <div class="big-num">${needCheck.length}명</div>
      <div>${needCheck.map(x => esc(x.p.name)).join(' · ') || '지금은 없습니다'}</div>
      <div class="hero-stats">
        <span>의뢰 ${countRank(3)}명</span><span>주의 ${countRank(2)}명</span><span>관찰 ${countRank(1)}명</span>
        <span>기저선 형성 중 ${forming}명</span>
      </div>
    </div>

    <section id="sec-kpi">
      <div class="sec-head"><h2>지표</h2>
        <div class="seg">${[[7, '최근 7일'], [30, '30일'], [null, '전체']].map(([v, t]) =>
          `<button data-act="period" data-v="${v}" class="${period === v ? 'on' : ''}">${t}</button>`).join('')}</div>
      </div>
      <div class="cards">${cards.map(([label, v, g, ok, fill]) => `
        <div class="card ${ok == null ? '' : ok ? 'ok' : 'bad'}">
          <div class="label">${label}</div>
          <div class="v">${v}</div>
          ${g ? `
            <div class="bar"><i style="width:${Math.max(0, Math.min(100, fill ?? 0))}%"></i></div>
            <div class="goal"><span>${g}</span>${ok == null ? '' : ok
              ? `<span class="pill ok">${icon('check')}달성</span>`
              : `<span class="pill bad">${icon('alert')}미달</span>`}</div>` : ''}
        </div>`).join('')}</div>
      <p class="muted small">알림 관련 지표(탐지율·연계율·PPV·오경보율·알림 수)는 기간과 관계없이 전체 기록으로 계산합니다.</p>
    </section>

    <section id="sec-calls">
      <div class="sec-head"><h2>통화 현황</h2><span class="muted small">최근 30일 · 일별 완료·무응답</span></div>
      <div class="chartbox"><canvas id="callChart"></canvas></div>
    </section>

    <section id="sec-queue">
      <div class="sec-head"><h2>케이스 큐</h2><span class="muted small">위험도 높은 순</span></div>
      <table class="rtable">
        <thead><tr><th>이름</th><th>나이</th><th>최근 통화일</th><th>최근 점수</th><th>최근 z</th><th>30일 기울기</th><th>최근 SpO2 최저</th><th>열린 알림</th><th></th></tr></thead>
        <tbody>${rows.map(({ p, st, open, spo2 }) => `
          <tr>
            <td class="first"><div class="who"><span class="avatar">${initial(p.name)}</span><b>${esc(p.name)}</b></div></td>
            <td data-label="나이">${p.age ?? '—'}세</td>
            <td data-label="최근 통화일">${st.lastCallDate ?? '—'}</td>
            <td data-label="최근 점수">${pctText(st.lastScore)}</td>
            <td data-label="최근 z">${st.base.ready ? (st.lastZ?.toFixed(2) ?? '—') : '<span class="tag">기저선 형성 중</span>'}</td>
            <td data-label="30일 기울기">${slopeText(st.slope)}</td>
            <td data-label="최근 SpO2 최저">${spo2 == null ? '—' : spo2 + '%'}</td>
            <td data-label="열린 알림">${open.map(levelBadge).join('') || '<span class="muted">없음</span>'}</td>
            <td class="end"><a class="btn go" href="#/admin/p/${p.id}" aria-label="${esc(p.name)} 상세">${icon('chev')}</a></td>
          </tr>`).join('')}</tbody>
      </table>
    </section>

    <section id="sec-people">
      <div class="sec-head"><h2>대상자 관리</h2><span class="muted small">총 ${d.people.length}명 · 활성 ${d.people.filter(p => p.active).length}명</span></div>
      <table class="rtable">
        <thead><tr><th>이름</th><th>나이</th><th>연락처</th><th>보호자 연락처</th><th>선호 통화 시간</th><th>등록일</th><th></th></tr></thead>
        <tbody>${d.people.map(p => `
          <tr>
            <td class="first"><div class="who"><span class="avatar">${initial(p.name)}</span><b>${esc(p.name)}</b></div></td>
            <td data-label="나이">${p.age ?? '—'}세</td>
            <td data-label="연락처">${esc(p.phone)}</td><td data-label="보호자 연락처">${esc(p.guardianPhone)}</td>
            <td data-label="선호 통화 시간">${esc(p.preferredTime)}</td><td data-label="등록일">${p.enrolledAt}</td>
            <td class="end">${p.active ? `<button data-act="deactivate" data-id="${p.id}">비활성화</button>` : '<span class="tag">비활성</span>'}</td>
          </tr>`).join('')}</tbody>
      </table>
      <h3>대상자 추가</h3>
      <div class="form">
        <label>이름<input id="np-name" placeholder="홍길동"></label>
        <label>나이<input id="np-age" type="number" min="0" placeholder="78"></label>
        <label>연락처<input id="np-phone" type="tel" placeholder="010-0000-0000"></label>
        <label>보호자 연락처<input id="np-guardian" type="tel" placeholder="010-0000-0000"></label>
        <label>선호 통화 시간<input id="np-time" type="time" value="10:00"></label>
        <button class="primary" data-act="addPerson">추가</button>
      </div>
    </section>

    <section id="sec-settings">
      <div class="sec-head"><h2>설정</h2><span class="muted small">판정 파라미터</span></div>
      <div class="form">${Object.keys(DEFAULT_SETTINGS).map(k => `
        <label>${SETTING_LABEL[k]}<input id="set-${k}" type="number" step="any" value="${s[k]}"></label>`).join('')}
        <button class="primary" data-act="saveSettings">저장</button>
      </div>
      <div class="row" style="margin-top:20px">
        <button data-act="reseed">시연 데이터 다시 만들기</button>
        <button data-act="wipe">전체 초기화</button>
      </div>
      <p class="note">시연용이라 로그인이 없습니다. 실제 운영하려면 인증과 서버 저장이 필요합니다.</p>
    </section>`;

  if (window.Chart) {
    const days = [...Array(30)].map((_, i) => addDays(today, i - 29));
    const count = status => days.map(dt => d.calls.filter(c => c.date === dt && c.status === status).length);
    const bar = { borderRadius: 4, borderSkipped: false, borderWidth: { top: 2 }, borderColor: '#fff', maxBarThickness: 18 };
    charts.push(new Chart(document.getElementById('callChart'), {
      type: 'bar',
      data: {
        labels: days.map(dt => dt.slice(5)),
        datasets: [
          { label: '완료', data: count('completed'), backgroundColor: C.green, ...bar },
          { label: '무응답', data: count('missed'), backgroundColor: C.orange, ...bar }
        ]
      },
      options: {
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'top', align: 'end' } },
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: { stacked: true, beginAtZero: true, ticks: { precision: 0 }, grid: { color: C.grid }, border: { display: false } }
        }
      }
    }));
  }

  actions.jump = el => document.getElementById(el.dataset.to).scrollIntoView({ behavior: 'smooth' });
  actions.period = el => { period = el.dataset.v === 'null' ? null : +el.dataset.v; render(); };
  actions.deactivate = el => {
    const p = d.people.find(x => x.id === el.dataset.id);
    if (!confirm(`${p.name} 님을 비활성화할까요? 통화 대상과 지표에서 빠집니다.`)) return;
    p.active = false;
    save();
    render();
  };
  actions.addPerson = () => {
    const v = id => document.getElementById(id).value.trim();
    if (!v('np-name')) return alert('이름을 입력해 주세요.');
    d.people.push({
      id: 'p' + Date.now().toString(36), name: v('np-name'), age: +v('np-age') || null, phone: v('np-phone'),
      guardianPhone: v('np-guardian'), preferredTime: v('np-time'), enrolledAt: today, active: true
    });
    save();
    render();
  };
  actions.saveSettings = () => {
    for (const k of Object.keys(DEFAULT_SETTINGS)) {
      const v = parseFloat(document.getElementById('set-' + k).value);
      if (!Number.isNaN(v)) s[k] = v;
    }
    evaluate();
    alert('저장했습니다.');
    render();
  };
  actions.reseed = async () => {
    if (!confirm('지금 기록과 녹음을 모두 지우고 시연 데이터를 다시 만들까요? (설정은 유지)')) return;
    await clearAudio();
    setData(makeSeed(s));
    render();
  };
  actions.wipe = async () => {
    if (!confirm('모든 대상자·기록·녹음·설정을 지울까요? 되돌릴 수 없습니다.')) return;
    await clearAudio();
    setData({ settings: { ...DEFAULT_SETTINGS }, people: [], calls: [], vitals: [], alerts: [] });
    render();
  };
}

// ---------- 대상자 상세 ----------
function adminPerson(id) {
  const d = getData(), s = d.settings, today = todayStr();
  const p = d.people.find(x => x.id === id);
  if (!p) {
    app.innerHTML = `${appbar()}<section><p>대상자를 찾을 수 없습니다.</p><a href="#/admin">관리자 화면으로</a></section>`;
    return;
  }
  const st = personStatus(p, d.calls, s, today, getNightVitals);
  const alerts = d.alerts.filter(a => a.personId === id)
    .sort((a, b) => (a.status === 'closed') - (b.status === 'closed') || b.createdAt.localeCompare(a.createdAt));
  const calls = d.calls.filter(c => c.personId === id)
    .sort((a, b) => (b.date + b.startedAt).localeCompare(a.date + a.startedAt));
  const openCount = alerts.filter(a => a.status !== 'closed').length;

  app.innerHTML = `
    ${appbar(`<a class="back" href="#/admin">${icon('back')}관리자 화면</a>`)}

    <div class="hero">
      <div class="profile">
        <span class="avatar">${initial(p.name)}</span>
        <div>
          <h1>${esc(p.name)} <span style="font-weight:500;font-size:18px">${p.age ?? '—'}세</span>${p.active ? '' : ' <span class="tag">비활성</span>'}</h1>
          <p>연락처 ${esc(p.phone)} · 보호자 ${esc(p.guardianPhone)} · 선호 ${esc(p.preferredTime)} · 등록 ${p.enrolledAt}</p>
        </div>
      </div>
      <div class="stat-row">
        <div><small>최근 점수</small><b>${pctText(st.lastScore)}</b></div>
        <div><small>최근 z</small><b>${st.base.ready ? (st.lastZ?.toFixed(2) ?? '—') : '—'}</b></div>
        <div><small>30일 추세 기울기</small><b>${slopeText(st.slope)}</b></div>
        <div><small>기저선</small><b>${st.base.ready
          ? `${st.base.mean.toFixed(1)}% ± ${st.base.sd.toFixed(1)}`
          : `형성 중 ${st.base.n}/${s.baselineDays}회`}</b></div>
      </div>
    </div>

    <section>
      <div class="sec-head"><h2>인지 z-score · 야간 SpO2 · 안정 시 심박</h2>
        <div class="seg">${[30, 90].map(n => `<button data-act="range" data-v="${n}" class="${range === n ? 'on' : ''}">${n}일</button>`).join('')}</div>
      </div>
      <div class="chartbox"><canvas id="personChart"></canvas></div>
      <p class="muted small">초록 음영 = 기저선 구간${st.baseEnd ? ` (${st.baseStart} ~ ${st.baseEnd})` : ''} · 회색 점선 = 관찰 기준 · 빈칸 = 통화 없음 또는 무효 측정일 (신호품질 &lt; ${s.sqiMin} 또는 착용 4시간 미만)</p>
    </section>

    <section>
      <div class="sec-head"><h2>알림</h2><span class="muted small">열린 알림 ${openCount}건</span></div>
      ${alerts.map(alertCard).join('') || '<p class="muted">알림 없음</p>'}
    </section>

    <section>
      <div class="sec-head"><h2>통화 기록</h2><span class="muted small">${calls.length}건</span></div>
      ${calls.map(callRow).join('') || '<p class="muted">통화 기록 없음</p>'}
    </section>`;

  drawPersonChart(p, st, s, today);

  const alertOf = el => d.alerts.find(a => a.id === el.dataset.id);
  const callOf = el => d.calls.find(c => c.id === el.dataset.id);
  const saveAndRender = () => { save(); render(); };

  actions.range = el => { range = +el.dataset.v; render(); };
  actions.notify = el => { alertOf(el).notifiedAt = nowStamp(); saveAndRender(); };
  actions.refer = el => { Object.assign(alertOf(el), { status: 'referred', referredAt: nowStamp() }); saveAndRender(); };
  actions.close = el => { alertOf(el).status = 'closed'; saveAndRender(); };
  actions.outcome = el => { alertOf(el).outcome = el.value || null; save(); };
  actions.note = el => { alertOf(el).note = el.value; save(); };
  actions.check = el => { alertOf(el).checklist[el.dataset.k] = el.checked; save(); };

  actions.play = async el => {
    const box = document.getElementById('pl-' + el.dataset.id);
    const blob = await getAudio(callOf(el).audioId);
    box.innerHTML = blob ? `<audio controls autoplay src="${URL.createObjectURL(blob)}"></audio>` : '녹음 파일을 찾을 수 없습니다.';
  };
  actions.delAudio = async el => {
    if (!confirm('녹음만 지우고 점수·받아쓰기는 남깁니다. 지울까요?')) return;
    const c = callOf(el);
    await deleteAudio(c.audioId);
    c.audioId = null;
    saveAndRender();
  };
  actions.score = el => {
    const c = callOf(el), it = c.items[+el.dataset.i];
    it.score = el.value === '' ? null : Math.max(0, Math.min(it.maxScore, +el.value));
    el.value = it.score ?? '';
    c.scorePct = scorePct(c.items);
    evaluate([p.id]);
    document.querySelector(`[data-pct="${c.id}"]`).textContent = pctText(c.scorePct);
  };
}

function alertCard(a) {
  const closed = a.status === 'closed';
  return `
    <div class="alert-card lvb-${a.level} ${closed ? 'closed' : ''}">
      <div class="row"><b>${TYPE[a.type]}</b><span class="badge lv-${a.level}">${LEVEL[a.level]}</span><span class="tag">${STATUS[a.status]}</span></div>
      <div class="muted small">생성 ${stamp(a.createdAt)} · 보호자 통보 ${stamp(a.notifiedAt)} · 연계 ${stamp(a.referredAt)}</div>
      <div class="row">
        <button data-act="notify" data-id="${a.id}" ${a.notifiedAt || closed ? 'disabled' : ''}>보호자 통보함</button>
        <button class="primary" data-act="refer" data-id="${a.id}" ${a.status !== 'open' ? 'disabled' : ''}>치매안심센터 연계함</button>
        <button data-act="close" data-id="${a.id}" ${closed ? 'disabled' : ''}>종결</button>
        <label>수검 결과
          <select data-change="outcome" data-id="${a.id}">
            <option value="">미입력</option>
            <option value="confirmed" ${a.outcome === 'confirmed' ? 'selected' : ''}>확진</option>
            <option value="normal" ${a.outcome === 'normal' ? 'selected' : ''}>정상</option>
          </select>
        </label>
      </div>
      ${a.type === 'cognition' ? `
        <div class="checklist"><b>감별 체크리스트</b> <span class="muted small">점수 하락이 다른 원인 때문일 수 있는지 확인</span>
          <div class="checks">${Object.entries(CHECKS).map(([k, t]) => `
            <label><input type="checkbox" data-change="check" data-id="${a.id}" data-k="${k}" ${a.checklist?.[k] ? 'checked' : ''}> ${t}</label>`).join('')}</div>
        </div>` : ''}
      <label>메모<textarea data-change="note" data-id="${a.id}" placeholder="처리 내용을 적어 두세요">${esc(a.note)}</textarea></label>
    </div>`;
}

function callRow(c) {
  const t = ms => (ms == null ? '' : mmss(ms / 1000));
  return `
    <div class="call">
      <div class="call-head">
        <span class="date">${c.date}</span>
        <span class="st st-${c.status}">${CALL_STATUS[c.status]}</span>
        ${c.status === 'missed' ? '' : `
          <span>점수 <b data-pct="${c.id}">${pctText(c.scorePct)}</b></span>
          <span class="muted">${mmss(c.durationSec)}</span>
          ${c.rotationDomain ? `<span class="tag">${DOMAIN_LABEL[c.rotationDomain]}</span>` : ''}
          ${c.audioId
            ? `<button data-act="play" data-id="${c.id}">${icon('play')}녹음 듣기</button><button data-act="delAudio" data-id="${c.id}">${icon('trash')}녹음 삭제</button>`
            : '<span class="muted small">녹음 없음</span>'}`}
      </div>
      <div id="pl-${c.id}"></div>
      ${c.items.length ? `
        <details><summary>문항별 받아쓰기·점수</summary>
          <table class="rtable">
            <thead><tr><th>질문</th><th>받아쓰기</th><th>점수</th><th>재질문</th><th>반응 시간</th><th>녹음 위치</th></tr></thead>
            <tbody>${c.items.map((it, i) => `
              <tr>
                <td data-label="질문">${esc(it.question)}</td>
                <td data-label="받아쓰기">${esc(it.transcript) || '<span class="muted">—</span>'}</td>
                <td data-label="점수">${it.maxScore === 0 ? '<span class="muted">채점 안 함</span>'
                  : `<input type="number" min="0" max="${it.maxScore}" step="any" value="${it.score ?? ''}" data-change="score" data-id="${c.id}" data-i="${i}"> / ${it.maxScore}`}</td>
                <td data-label="재질문">${it.repeatAsks}회</td>
                <td data-label="반응 시간">${it.latencyMs == null ? '—' : (it.latencyMs / 1000).toFixed(1) + '초'}</td>
                <td data-label="녹음 위치">${it.startMs == null ? '—' : `${t(it.startMs)} ~ ${t(it.endMs)}`}</td>
              </tr>`).join('')}</tbody>
          </table>
        </details>` : ''}
    </div>`;
}

function drawPersonChart(p, st, s, today) {
  if (!window.Chart) return;
  const labels = [...Array(range)].map((_, i) => addDays(today, i - range + 1));
  const zByDate = Object.fromEntries(st.zs.map(x => [x.date, x.z]));
  const nights = labels.map(dt => {
    const v = getNightVitals(p.id, dt);
    return isValidNight(v, s) ? v : null; // 무효 측정일은 빈칸
  });

  // 기저선 구간 음영
  const shade = {
    id: 'baselineShade',
    beforeDatasetsDraw(chart) {
      if (!st.baseEnd) return;
      const i0 = labels.findIndex(dt => dt >= st.baseStart);
      const i1 = labels.findLastIndex(dt => dt <= st.baseEnd);
      if (i0 < 0 || i1 < i0) return;
      const { ctx, chartArea: area, scales: { x } } = chart;
      const half = (x.getPixelForValue(1) - x.getPixelForValue(0)) / 2;
      ctx.save();
      ctx.fillStyle = 'rgba(0, 117, 74, 0.08)';
      ctx.fillRect(x.getPixelForValue(i0) - half, area.top, x.getPixelForValue(i1) - x.getPixelForValue(i0) + 2 * half, area.bottom - area.top);
      ctx.restore();
    }
  };

  const line = (label, data, color, axis) => ({
    label, data, yAxisID: axis, borderColor: color, backgroundColor: color,
    borderWidth: 2, pointRadius: 3, pointHoverRadius: 5, pointBorderColor: '#fff', pointBorderWidth: 1.5, cubicInterpolationMode: 'monotone'
  });

  charts.push(new Chart(document.getElementById('personChart'), {
    type: 'line',
    data: {
      labels: labels.map(dt => dt.slice(5)),
      datasets: [
        line('인지 z-score', labels.map(dt => zByDate[dt] ?? null), C.green, 'y'),
        { label: `관찰 기준 (z ${s.zWatch})`, data: labels.map(() => s.zWatch), yAxisID: 'y', borderColor: C.gray, borderDash: [6, 4], borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 0 },
        line('야간 최저 SpO2 (%)', nights.map(v => v?.spo2Min ?? null), C.blue, 'y1'),
        line('안정 시 심박 (bpm)', nights.map(v => v?.hrRest ?? null), C.orange, 'y2')
      ]
    },
    options: {
      maintainAspectRatio: false,
      spanGaps: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'top', align: 'start' } },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 12 } },
        y: { title: { display: true, text: 'z' }, grid: { color: C.grid }, border: { display: false } },
        y1: { position: 'right', title: { display: true, text: 'SpO2 %' }, grid: { drawOnChartArea: false }, border: { display: false } },
        y2: { position: 'right', title: { display: true, text: '심박' }, grid: { drawOnChartArea: false }, border: { display: false } }
      }
    },
    plugins: [shade]
  }));
}

// ---------- 시작 ----------
if (!getData()) setData(makeSeed()); // 처음 실행이면 시연 데이터 자동 생성
getData().settings = { ...DEFAULT_SETTINGS, ...getData().settings };
window.addEventListener('hashchange', route);
route();
