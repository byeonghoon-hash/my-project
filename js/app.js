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

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const mmss = sec => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
const pctText = v => (v == null ? '—' : `${v.toFixed(1)}%`);
const stamp = s => (s ? s.replace('T', ' ') : '—');

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
  else app.innerHTML = `<a class="btn" href="#/user">대상자 화면</a><a class="btn" href="#/admin">관리자 화면</a>`;
}

// ---------- 대상자 화면 ----------
function userSelect() {
  const people = getData().people.filter(p => p.active);
  app.innerHTML = `
    <h1>누구세요?</h1>
    <div class="stack">${people.map(p => `<button data-act="pick" data-id="${p.id}">${esc(p.name)}</button>`).join('')}</div>
    <a class="btn ghost" href="#/">처음으로</a>`;
  actions.pick = el => ringing(people.find(p => p.id === el.dataset.id));
}

function ringing(p) {
  app.innerHTML = `
    <div class="phone ringing">
      <h1>안부 전화가 왔습니다</h1>
      <div class="answer">
        <button class="green" data-act="accept">받기</button>
        <button class="red" data-act="reject">거절</button>
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
      <p class="timer" id="time">00:00</p>
      <p class="question" id="q">연결 중…</p>
      <div class="meter"><div id="lv"></div></div>
      <button class="ghost btn" data-act="next">다음</button>
    </div>`;
  const $ = id => document.getElementById(id) || {}; // 화면을 떠난 뒤에도 오류가 나지 않게
  const ui = {
    time: s => { $('time').textContent = mmss(s); },
    question: t => { $('q').textContent = t; },
    level: v => { ($('lv').style || {}).width = Math.min(100, v * 600) + '%'; }
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
  app.innerHTML = `<h1>오늘도 통화해 주셔서 감사합니다.</h1><a class="btn" href="#/">처음으로</a>`;
}

// ---------- 관리자 화면 ----------
function adminHome() {
  const d = getData(), s = d.settings, today = todayStr();
  const m = dashboard(d, period, today, getNightVitals);
  const goal = (v, ok) => (v == null ? null : ok(v));
  const cards = [
    ['통화 완료율', pctText(m.completionRate), '목표 ≥ 80%', goal(m.completionRate, v => v >= 80)],
    ['무응답률', pctText(m.missedRate)],
    ['평균 통화 시간', m.avgDurationSec == null ? '—' : mmss(m.avgDurationSec), '목표 ≤ 3분', goal(m.avgDurationSec, v => v <= 180)],
    ['유효 측정일 비율', pctText(m.validDayRate), '목표 ≥ 70%', goal(m.validDayRate, v => v >= 70)],
    ['웨어러블 착용 순응도', pctText(m.wearRate), '목표 ≥ 75%', goal(m.wearRate, v => v >= 75)],
    ['8주 유지율', pctText(m.retention8w), '목표 ≥ 70%', goal(m.retention8w, v => v >= 70)],
    ['기저선 이탈 탐지율', pctText(m.detectionRate)],
    ['의뢰 연계율', pctText(m.referralRate)],
    ['연계 후 확진율 (PPV)', pctText(m.ppv)],
    ['오경보율', pctText(m.falseAlarmRate)],
    ['수면무호흡 의심 / 난청 의심', `${m.spo2Alerts}건 / ${m.hearingAlerts}건`]
  ];

  // 케이스 큐: 알림 단계(의뢰 > 주의 > 관찰 > 없음) → 최근 z 낮은 순
  const rows = d.people.filter(p => p.active).map(p => {
    const st = personStatus(p, d.calls, s, today, getNightVitals);
    const open = d.alerts.filter(a => a.personId === p.id && a.status !== 'closed');
    let spo2 = null;
    for (let k = 0; k < 14 && spo2 == null; k++) {
      const v = getNightVitals(p.id, addDays(today, -k));
      if (isValidNight(v, s)) spo2 = v.spo2Min;
    }
    return { p, st, open, spo2, rank: Math.max(0, ...open.map(a => LEVEL_RANK[a.level])) };
  }).sort((a, b) => b.rank - a.rank || (a.st.lastZ ?? Infinity) - (b.st.lastZ ?? Infinity));

  app.innerHTML = `
    <div class="top"><h1>관리자 화면</h1><a href="#/">처음으로</a></div>

    <section>
      <div class="top"><h2>지표</h2>
        <div class="row">${[[7, '최근 7일'], [30, '30일'], [null, '전체']].map(([v, t]) =>
          `<button data-act="period" data-v="${v}" class="${period === v ? 'on' : ''}">${t}</button>`).join('')}</div>
      </div>
      <div class="cards">${cards.map(([label, v, g, ok]) => `
        <div class="card ${ok == null ? '' : ok ? 'ok' : 'bad'}">
          <div class="muted">${label}</div><div class="v">${v}</div>
          ${g ? `<div class="goal">${g} · ${ok == null ? '—' : ok ? '달성' : '미달'}</div>` : ''}
        </div>`).join('')}</div>
      <p class="muted">알림 관련 지표(탐지율·연계율·PPV·오경보율·알림 수)는 기간과 관계없이 전체 기록으로 계산합니다.</p>
    </section>

    <section>
      <h2>통화 현황 (최근 30일)</h2>
      <div class="chartbox"><canvas id="callChart"></canvas></div>
    </section>

    <section>
      <h2>케이스 큐 (위험도 순)</h2>
      <table class="rtable">
        <thead><tr><th>이름</th><th>나이</th><th>최근 통화일</th><th>최근 점수</th><th>최근 z</th><th>30일 기울기</th><th>최근 SpO2 최저</th><th>열린 알림</th><th></th></tr></thead>
        <tbody>${rows.map(({ p, st, open, spo2 }) => `
          <tr>
            <td data-label="이름"><b>${esc(p.name)}</b></td>
            <td data-label="나이">${p.age}</td>
            <td data-label="최근 통화일">${st.lastCallDate ?? '—'}</td>
            <td data-label="최근 점수">${pctText(st.lastScore)}</td>
            <td data-label="최근 z">${st.base.ready ? (st.lastZ?.toFixed(2) ?? '—') : '기저선 형성 중'}</td>
            <td data-label="30일 기울기">${st.slope == null ? '—' : `${st.slope >= 0 ? '+' : ''}${st.slope.toFixed(2)}%p/일`}</td>
            <td data-label="최근 SpO2 최저">${spo2 == null ? '—' : spo2 + '%'}</td>
            <td data-label="열린 알림">${open.map(a => `<span class="badge lv-${a.level}">${LEVEL[a.level]} · ${TYPE_SHORT[a.type]}</span>`).join('') || '—'}</td>
            <td><a class="btn" href="#/admin/p/${p.id}">상세</a></td>
          </tr>`).join('')}</tbody>
      </table>
    </section>

    <section>
      <h2>대상자 관리</h2>
      <table class="rtable">
        <thead><tr><th>이름</th><th>나이</th><th>연락처</th><th>보호자 연락처</th><th>선호 통화 시간</th><th>등록일</th><th></th></tr></thead>
        <tbody>${d.people.map(p => `
          <tr>
            <td data-label="이름">${esc(p.name)}</td><td data-label="나이">${p.age}</td>
            <td data-label="연락처">${esc(p.phone)}</td><td data-label="보호자 연락처">${esc(p.guardianPhone)}</td>
            <td data-label="선호 통화 시간">${esc(p.preferredTime)}</td><td data-label="등록일">${p.enrolledAt}</td>
            <td>${p.active ? `<button data-act="deactivate" data-id="${p.id}">비활성화</button>` : '<span class="muted">비활성</span>'}</td>
          </tr>`).join('')}</tbody>
      </table>
      <h3>대상자 추가</h3>
      <div class="form">
        <label>이름<input id="np-name"></label>
        <label>나이<input id="np-age" type="number" min="0"></label>
        <label>연락처<input id="np-phone" type="tel"></label>
        <label>보호자 연락처<input id="np-guardian" type="tel"></label>
        <label>선호 통화 시간<input id="np-time" type="time" value="10:00"></label>
        <button data-act="addPerson">추가</button>
      </div>
    </section>

    <section>
      <h2>설정</h2>
      <div class="form">${Object.keys(DEFAULT_SETTINGS).map(k => `
        <label>${SETTING_LABEL[k]}<input id="set-${k}" type="number" step="any" value="${s[k]}"></label>`).join('')}
        <button data-act="saveSettings">저장</button>
      </div>
      <p class="row" style="margin-top:16px">
        <button data-act="reseed">시연 데이터 다시 만들기</button>
        <button data-act="wipe">전체 초기화</button>
      </p>
      <p class="muted">시연용이라 로그인이 없습니다. 실제 운영하려면 인증과 서버 저장이 필요합니다.</p>
    </section>`;

  if (window.Chart) {
    const days = [...Array(30)].map((_, i) => addDays(today, i - 29));
    const count = status => days.map(dt => d.calls.filter(c => c.date === dt && c.status === status).length);
    charts.push(new Chart(document.getElementById('callChart'), {
      type: 'bar',
      data: {
        labels: days.map(dt => dt.slice(5)),
        datasets: [
          { label: '완료', data: count('completed'), backgroundColor: '#2e7d32' },
          { label: '무응답', data: count('missed'), backgroundColor: '#d32020' }
        ]
      },
      options: { maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } } }
    }));
  }

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
    app.innerHTML = `<p>대상자를 찾을 수 없습니다.</p><a href="#/admin">관리자 화면으로</a>`;
    return;
  }
  const st = personStatus(p, d.calls, s, today, getNightVitals);
  const alerts = d.alerts.filter(a => a.personId === id)
    .sort((a, b) => (a.status === 'closed') - (b.status === 'closed') || b.createdAt.localeCompare(a.createdAt));
  const calls = d.calls.filter(c => c.personId === id)
    .sort((a, b) => (b.date + b.startedAt).localeCompare(a.date + a.startedAt));

  app.innerHTML = `
    <div class="top"><h1>${esc(p.name)} <span class="muted">(${p.age}세)</span></h1><a href="#/admin">← 관리자 화면</a></div>
    <section>
      <p>연락처 ${esc(p.phone)} · 보호자 ${esc(p.guardianPhone)} · 선호 통화 시간 ${esc(p.preferredTime)} · 등록 ${p.enrolledAt}${p.active ? '' : ' · <b>비활성</b>'}</p>
      <p>기저선: ${st.base.ready
        ? `평균 ${st.base.mean.toFixed(1)}% · 표준편차 ${st.base.sd.toFixed(1)} (${st.baseStart} ~ ${st.baseEnd})`
        : `기저선 형성 중 (${st.base.n}/${s.baselineDays}회)`}
        · 30일 추세 기울기: ${st.slope == null ? '—' : `${st.slope >= 0 ? '+' : ''}${st.slope.toFixed(2)}%p/일`}</p>
    </section>

    <section>
      <div class="top"><h2>인지 z-score · 야간 SpO2 · 안정 시 심박</h2>
        <div class="row">${[30, 90].map(n => `<button data-act="range" data-v="${n}" class="${range === n ? 'on' : ''}">${n}일</button>`).join('')}</div>
      </div>
      <div class="chartbox"><canvas id="personChart"></canvas></div>
      <p class="muted">파란 음영 = 기저선 구간 · 점선 = 관찰 기준 · 빈칸 = 통화 없음 또는 무효 측정일 (신호품질 &lt; ${s.sqiMin} 또는 착용 4시간 미만)</p>
    </section>

    <section>
      <h2>알림</h2>
      ${alerts.map(alertCard).join('') || '<p class="muted">알림 없음</p>'}
    </section>

    <section>
      <h2>통화 기록</h2>
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
    <div class="alert-card ${closed ? 'closed' : ''}">
      <div><b>${TYPE[a.type]}</b> <span class="badge lv-${a.level}">${LEVEL[a.level]}</span> · ${STATUS[a.status]} · 생성 ${stamp(a.createdAt)}</div>
      <div class="muted">보호자 통보: ${stamp(a.notifiedAt)} · 연계: ${stamp(a.referredAt)}</div>
      <div class="row">
        <button data-act="notify" data-id="${a.id}" ${a.notifiedAt || closed ? 'disabled' : ''}>보호자 통보함</button>
        <button data-act="refer" data-id="${a.id}" ${a.status !== 'open' ? 'disabled' : ''}>치매안심센터 연계함</button>
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
        <div><b>감별 체크리스트</b> <span class="muted">— 점수 하락이 다른 원인 때문일 수 있는지 확인</span>
          <div class="checks">${Object.entries(CHECKS).map(([k, t]) => `
            <label><input type="checkbox" data-change="check" data-id="${a.id}" data-k="${k}" ${a.checklist?.[k] ? 'checked' : ''}> ${t}</label>`).join('')}</div>
        </div>` : ''}
      <label>메모 <textarea data-change="note" data-id="${a.id}">${esc(a.note)}</textarea></label>
    </div>`;
}

function callRow(c) {
  const t = ms => (ms == null ? '' : mmss(ms / 1000));
  return `
    <div class="call">
      <div class="call-head">
        <b>${c.date}</b>
        <span class="st-${c.status}">${CALL_STATUS[c.status]}</span>
        ${c.status === 'missed' ? '' : `
          <span>점수 <b data-pct="${c.id}">${pctText(c.scorePct)}</b></span>
          <span>${mmss(c.durationSec)}</span>
          ${c.rotationDomain ? `<span class="muted">${DOMAIN_LABEL[c.rotationDomain]}</span>` : ''}
          ${c.audioId
            ? `<button data-act="play" data-id="${c.id}">녹음 듣기</button><button data-act="delAudio" data-id="${c.id}">녹음 삭제</button>`
            : '<span class="muted">녹음 없음</span>'}`}
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
      ctx.fillStyle = 'rgba(11, 79, 168, 0.1)';
      ctx.fillRect(x.getPixelForValue(i0) - half, area.top, x.getPixelForValue(i1) - x.getPixelForValue(i0) + 2 * half, area.bottom - area.top);
      ctx.restore();
    }
  };

  charts.push(new Chart(document.getElementById('personChart'), {
    type: 'line',
    data: {
      labels: labels.map(dt => dt.slice(5)),
      datasets: [
        { label: '인지 z-score', data: labels.map(dt => zByDate[dt] ?? null), yAxisID: 'y', borderColor: '#0b4fa8', backgroundColor: '#0b4fa8', pointRadius: 2 },
        { label: `관찰 기준 (z ${s.zWatch})`, data: labels.map(() => s.zWatch), yAxisID: 'y', borderColor: '#e65100', borderDash: [6, 4], borderWidth: 1.5, pointRadius: 0 },
        { label: '야간 최저 SpO2 (%)', data: nights.map(v => v?.spo2Min ?? null), yAxisID: 'y1', borderColor: '#7b1fa2', backgroundColor: '#7b1fa2', pointRadius: 2 },
        { label: '안정 시 심박 (bpm)', data: nights.map(v => v?.hrRest ?? null), yAxisID: 'y2', borderColor: '#c62828', backgroundColor: '#c62828', pointRadius: 2 }
      ]
    },
    options: {
      maintainAspectRatio: false,
      spanGaps: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        y: { title: { display: true, text: 'z' } },
        y1: { position: 'right', title: { display: true, text: 'SpO2 %' }, grid: { drawOnChartArea: false } },
        y2: { position: 'right', title: { display: true, text: '심박' }, grid: { drawOnChartArea: false } }
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
