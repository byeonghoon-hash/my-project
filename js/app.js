// 라우팅과 화면 그리기
// #/ 첫 화면 · #/user 어르신(대상자) 화면 · #/login · #/signup
// #/admin 전체 현황 · #/admin/people 대상자 관리 · #/admin/p/<id>[/<탭>] 대상자 상세

import {
  getData, setData, save, saveAudio, getAudio, deleteAudio, clearAudio,
  makeSalt, hashPassword, verifyPassword, displayName, currentAccount, setLogin
} from './store.js';
import { reseed, SEED_VERSION } from './seed.js';
import {
  DEFAULT_SETTINGS, todayStr, nowStamp, addDays, personStatus, updateAlerts, dashboard, isValidNight,
  riskOf, aiSummary, recommendAction, filterPeople, completion7
} from './metrics.js';
import { getNightVitals } from './vitals.js';
import { startRing, runCall, nextItem, stopCall } from './call.js';
import { scorePct, DOMAIN_LABEL } from './items.js';
import ungchon from './ungchon.js';

const app = document.getElementById('app');

const LEVEL = { watch: '관찰', caution: '주의', refer: '의뢰' };
const TYPE = { cognition: '인지 기저선 이탈', spo2: '야간 저산소 (수면무호흡 의심)', hearing: '재질문 잦음 (난청 의심)', noAnswer: '연속 무응답 (안부 확인)' };
const STATUS = { open: '처리 전', referred: '연계됨', closed: '종결' };
const CALL_STATUS = { completed: '완료', missed: '무응답', partial: '일부 (시간 초과)' };
const CHECKS = { acute: '최근 급성 질환', sleep: '수면 부족', meds: '약물 변경', mood: '우울감', hearing: '청력 저하' };
const RISK = { high: '높음', mid: '주의', low: '낮음' };
const RISK_RANK = { high: 3, mid: 2, low: 1 };
const JOBS = ['간호사', '사회복지사', '보건소 담당자', '기타'];
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
const CARE_LABEL = { cognition: ['통화 인지검사', 40], response: ['통화 응답', 25], spo2: ['야간 SpO₂', 20], heart: ['안정 시 심박', 15] };

// 차트 색 (색각 이상 구분 검사를 통과한 조합)
const C = { green: '#00754A', blue: '#2F6FDE', orange: '#C4691E', gray: '#8B908D', grid: '#EEEAE3' };
// 위험도 색은 style.css의 --risk-* 변수 한 곳에서 정한다
const riskColor = lv => getComputedStyle(document.documentElement).getPropertyValue(`--risk-${lv}`).trim();

// 아이콘 (선 그림)
const PATHS = {
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  heart: '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z"/>',
  chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14"/><path d="M15 6v14"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M16 4a4 4 0 0 1 0 8"/><path d="M22 21a7 7 0 0 0-4-6.3"/>',
  login: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="m10 17 5-5-5-5"/><path d="M15 12H3"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  menu: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  chev: '<path d="m9 18 6-6-6-6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  alert: '<path d="M12 8v5"/><path d="M12 17h.01"/><circle cx="12" cy="12" r="9"/>',
  next: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  sparkle: '<path d="M12 3v4"/><path d="M12 17v4"/><path d="M3 12h4"/><path d="M17 12h4"/><path d="m6 6 2.5 2.5"/><path d="m15.5 15.5 2.5 2.5"/><path d="m18 6-2.5 2.5"/><path d="m8.5 15.5-2.5 2.5"/>'
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`;

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const mmss = sec => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
const pctText = v => (v == null ? '—' : `${v.toFixed(1)}%`);
const slopeText = v => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%p/일`);
const stamp = s => (s ? s.replace('T', ' ') : '—');
const initial = name => esc((name || '?').slice(0, 1));
const mmdd = s => (s ? `${s.slice(5, 7)}/${s.slice(8, 10)}` : '—');
const shortAddr = a => esc((a || '—').replace('울산광역시 울주군 ', '').replace(' (시연용)', ''));
const longDate = s => {
  const d = new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${'일월화수목금토'[d.getDay()]}요일`;
};
const riskChip = lv => `<span class="risk risk-${lv}">위험도 ${RISK[lv]}</span>`;
const reasonChips = (reasons, n = 99) => reasons.slice(0, n).map(r => `<span class="chip">${esc(r)}</span>`).join('');

let actions = {};   // 지금 화면의 버튼 동작 (data-act / data-change / data-input / data-submit)
let cleanup = null; // 화면을 떠날 때 멈출 것 (벨소리·통화)
let charts = [];
let map = null;
let period = 7;     // 운영 지표 기간
let range = 30;     // 상세 그래프 기간
const list = { q: '', mine: false, risk: 'all', sort: 'risk', dir: -1 }; // 대상자 관리 목록 상태

for (const [type, key] of [['click', 'act'], ['change', 'change'], ['input', 'input']]) {
  app.addEventListener(type, e => {
    const el = e.target.closest(`[data-${key}]`);
    if (el && actions[el.dataset[key]]) actions[el.dataset[key]](el, e);
  });
}
app.addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target.closest('[data-submit]');
  if (f && actions[f.dataset.submit]) actions[f.dataset.submit](f);
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

const risk = p => riskOf(p, getData(), todayStr(), getNightVitals);
const nextVisit = id => getData().visits.filter(v => v.personId === id && v.status === 'planned' && v.date >= todayStr())
  .sort((a, b) => a.date.localeCompare(b.date))[0] || null;

// ---------- 라우팅 ----------
function route() {
  cleanup?.();
  cleanup = null;
  document.body.classList.remove('side-open');
  window.scrollTo(0, 0);
  render();
}

function render() {
  actions = {};
  charts.forEach(c => c.destroy());
  charts = [];
  map?.remove();
  map = null;
  const [path, qs] = location.hash.split('?');
  const params = new URLSearchParams(qs || '');
  const adminArea = path.startsWith('#/admin') || path === '#/login' || path === '#/signup';
  document.body.className = adminArea ? 'admin' : 'big';

  if (path === '#/user') return userSelect();
  if (!adminArea) return home();

  // 관리자 화면은 로그인해야 볼 수 있다
  const me = currentAccount();
  if (path.startsWith('#/admin') && !me) {
    location.replace('#/login?next=' + encodeURIComponent(location.hash));
    return;
  }
  if ((path === '#/login' || path === '#/signup') && me) {
    location.replace(params.get('next') || '#/admin');
    return;
  }

  let body;
  if (path === '#/login') body = loginPage(params);
  else if (path === '#/signup') body = signupPage(params);
  else if (path === '#/admin') body = dashboardPage();
  else if (path === '#/admin/people') body = peoplePage(params);
  else if (path.startsWith('#/admin/p/')) body = personPage(...path.slice(10).split('/').map(decodeURIComponent));
  else body = '<section><p>없는 화면입니다.</p></section>';

  app.innerHTML = shell(path, me, body.html);
  body.after?.();
}

// 사이드바(목록창) + 본문
function shell(path, me, html) {
  const item = (href, ic, label, on) => `<a class="nav ${on ? 'on' : ''}" href="${href}">${icon(ic)}<span>${label}</span></a>`;
  return `
    <aside class="side">
      <a class="side-logo" href="#/"><i>${icon('heart')}</i><span>I-ME<small>관리자 시스템</small></span></a>
      <nav>
        ${item('#/admin', 'map', '전체 현황', path === '#/admin')}
        ${item('#/admin/people', 'users', '대상자 관리', path.startsWith('#/admin/p') )}
        ${me ? `<button class="nav" data-act="logout">${icon('logout')}<span>로그아웃</span></button>`
             : item('#/login', 'login', '로그인', path === '#/login' || path === '#/signup')}
      </nav>
      <div class="side-foot">
        ${me ? `<small>담당 인력</small><b>${esc(displayName(me))}</b><span>${esc(me.org || '소속 미입력')}</span>`
             : `<small>로그인이 필요합니다</small><a class="btn primary" href="#/login">로그인</a>`}
      </div>
    </aside>
    <div class="scrim" data-act="closeSide"></div>
    <div class="content">
      <header class="topbar"><button class="menu" data-act="openSide" aria-label="메뉴 열기">${icon('menu')}</button><b>I-ME 관리자 시스템</b></header>
      <div class="page">${html}</div>
    </div>`;
}

const shellActions = {
  openSide: () => document.body.classList.add('side-open'),
  closeSide: () => document.body.classList.remove('side-open'),
  logout: () => { setLogin(null); location.hash = '#/login'; }
};

function home() {
  app.innerHTML = `
    <div class="brand"><div class="brand-mark">${icon('heart')}</div><div class="brand-name">I-ME</div></div>
    <div class="stack">
      <a class="btn tile" href="#/user"><span class="ic">${icon('phone')}</span>대상자 화면<span class="chev">${icon('chev')}</span></a>
      <a class="btn tile dark" href="#/admin"><span class="ic">${icon('chart')}</span>관리자 화면<span class="chev">${icon('chev')}</span></a>
    </div>`;
}

// ---------- 대상자(어르신) 화면 — 로그인 없이 쓴다 ----------
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

// ---------- 로그인·회원가입 ----------
const authNote = '<p class="note">시연용 로그인입니다. 계정 정보는 이 브라우저에만 저장됩니다. 실제 운영 시 서버 인증이 필요합니다.</p>';

function loginPage(params) {
  const next = params.get('next') || '#/admin';
  actions = { ...shellActions };
  actions.login = async f => {
    const acc = (getData().accounts || []).find(a => a.username === f.username.value.trim());
    const err = f.querySelector('[data-err]');
    if (!acc || !(await verifyPassword(acc, f.password.value))) { err.textContent = '아이디 또는 비밀번호가 맞지 않습니다.'; return; }
    setLogin(acc.id);
    location.hash = next;
  };
  return {
    html: `
      <div class="auth"><form class="auth-card" data-submit="login">
        <div class="auth-logo"><i>${icon('heart')}</i>I-ME</div>
        <h1>로그인</h1>
        ${params.get('joined') ? '<p class="ok-msg">가입이 완료되었습니다. 로그인해 주세요.</p>' : ''}
        <label>아이디<input name="username" autocomplete="username" value="${esc(params.get('id') || '')}" required></label>
        <label>비밀번호<input name="password" type="password" autocomplete="current-password" required></label>
        <small class="err" data-err></small>
        <button class="primary block" type="submit">로그인</button>
        <p class="muted small center">계정이 없으신가요? <a href="#/signup?next=${encodeURIComponent(next)}">회원가입</a></p>
        ${authNote}
      </form></div>`,
    after: () => app.querySelector(params.get('id') ? '[name=password]' : '[name=username]')?.focus()
  };
}

function signupPage(params) {
  const next = params.get('next') || '#/admin';
  actions = { ...shellActions };
  actions.signup = async f => {
    const v = n => f[n].value.trim();
    const errs = {};
    for (const n of ['name', 'org', 'username']) if (!v(n)) errs[n] = '입력해 주세요.';
    const accounts = getData().accounts || [];
    if (v('username') && accounts.some(a => a.username === v('username'))) errs.username = '이미 있는 아이디입니다.';
    if (f.password.value.length < 6) errs.password = '비밀번호는 6자 이상이어야 합니다.';
    if (f.password.value !== f.password2.value) errs.password2 = '비밀번호가 일치하지 않습니다.';
    f.querySelectorAll('[data-err]').forEach(el => { el.textContent = errs[el.dataset.err] || ''; });
    if (Object.keys(errs).length) return;
    const salt = makeSalt();
    const d = getData();
    d.accounts = [...accounts, {
      id: 'u' + Date.now().toString(36), username: v('username'), name: v('name'), job: f.job.value, org: v('org'),
      salt, hash: await hashPassword(salt, f.password.value), createdAt: nowStamp()
    }];
    save();
    location.hash = `#/login?joined=1&id=${encodeURIComponent(v('username'))}&next=${encodeURIComponent(next)}`;
  };
  const field = (label, input, key) => `<label>${label}${input}<small class="err" data-err="${key}"></small></label>`;
  return {
    html: `
      <div class="auth"><form class="auth-card" data-submit="signup" novalidate>
        <div class="auth-logo"><i>${icon('heart')}</i>I-ME</div>
        <h1>회원가입</h1>
        ${field('이름', '<input name="name" autocomplete="name">', 'name')}
        ${field('직종', `<select name="job">${JOBS.map(j => `<option>${j}</option>`).join('')}</select>`, 'job')}
        ${field('소속', '<input name="org" placeholder="웅촌면 보건지소">', 'org')}
        ${field('아이디', '<input name="username" autocomplete="username">', 'username')}
        ${field('비밀번호', '<input name="password" type="password" autocomplete="new-password" placeholder="6자 이상">', 'password')}
        ${field('비밀번호 확인', '<input name="password2" type="password" autocomplete="new-password">', 'password2')}
        <button class="primary block" type="submit">가입하기</button>
        <p class="muted small center">이미 계정이 있으신가요? <a href="#/login?next=${encodeURIComponent(next)}">로그인</a></p>
        ${authNote}
      </form></div>`,
    after: () => app.querySelector('[name=name]')?.focus()
  };
}

// ---------- 전체 현황 ----------
function dashboardPage() {
  const d = getData(), s = d.settings, today = todayStr();
  const people = d.people.filter(p => p.active);
  const R = new Map(people.map(p => [p.id, risk(p)]));
  const count = lv => people.filter(p => R.get(p.id).level === lv).length;

  // 요약 카드 (저장된 데이터에서 계산)
  const openAlerts = d.alerts.filter(a => a.status === 'open' && people.some(p => p.id === a.personId));
  const rates = people.map(p => completion7(p, d.calls, today).rate).filter(v => v != null);
  const avgRate = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null;
  const todayCalls = d.calls.filter(c => c.date === today && people.some(p => p.id === c.personId));
  const doneToday = new Set(todayCalls.filter(c => c.status === 'completed').map(c => c.personId)).size;
  const missedToday = new Set(todayCalls.filter(c => c.status === 'missed').map(c => c.personId)).size;
  const weekVisits = d.visits.filter(v => v.status === 'planned' && v.date >= today && v.date <= addDays(today, 6));
  const kpis = [
    ['#/admin/people', 'users', '전체 대상자', `${people.length}명`, `높음 ${count('high')} · 주의 ${count('mid')}`],
    ['#/admin/people?alerts=1', 'bell', '미조치 알림', `${openAlerts.length}건`, `그중 의뢰 단계 ${openAlerts.filter(a => a.level === 'refer').length}건`],
    ['#/admin/people?sort=rate', 'phone', '평균 통화 완료율', pctText(avgRate),
      avgRate == null ? '목표 80%' : `목표 80% · <b class="${avgRate >= 80 ? 'good' : 'bad'}">${avgRate >= 80 ? '달성' : '미달'}</b>`],
    ['#/admin/people', 'check', '오늘 통화', `${doneToday} / ${people.length}`, `완료 · 무응답 ${missedToday}`],
    ['#/admin/people?visit=1', 'calendar', '방문 예정', `${weekVisits.length}건`, `7일 안 · 오늘 ${weekVisits.filter(v => v.date === today).length}건`]
  ];

  // 우선 확인 대상자: 위험도 높은 순 → 같은 등급이면 score 낮은 순, 상위 5명
  const prio = [...people].sort((a, b) => {
    const ra = R.get(a.id), rb = R.get(b.id);
    return RISK_RANK[rb.level] - RISK_RANK[ra.level] || (ra.score ?? 999) - (rb.score ?? 999);
  }).slice(0, 5);

  // 운영 지표 (계획서 평가 지표)
  const m = dashboard(d, period, today, getNightVitals);
  const goal = (v, ok) => (v == null ? null : ok(v));
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

  const html = `
    <div class="page-title"><h1>전체 현황</h1><p>${longDate(today)}</p></div>

    <section>
      <div class="sec-head"><h2>지역별 현황 · 울주군 웅촌면</h2></div>
      <div id="map" class="map"></div>
      <p class="muted small">점을 누르면 대상자 정보가 보입니다. 확대·축소는 +/- 버튼으로 합니다.</p>
    </section>

    <div class="kpis">${kpis.map(([href, ic, label, v, sub]) => `
      <a class="kpi" href="${href}">
        <span class="kpi-ic">${icon(ic)}</span>
        <span class="label">${label}</span>
        <span class="v">${v}</span>
        <span class="sub">${sub}</span>
      </a>`).join('')}</div>

    <div class="split">
      <section>
        <div class="sec-head"><h2>위험도 분포</h2></div>
        <div class="donut"><canvas id="riskChart"></canvas></div>
        <p class="dist-text">
          <span><i class="dot" style="background:var(--risk-low)"></i>낮음 ${count('low')}</span> ·
          <span><i class="dot" style="background:var(--risk-mid)"></i>주의 ${count('mid')}</span> ·
          <span><i class="dot" style="background:var(--risk-high)"></i>높음 ${count('high')}</span>
        </p>
      </section>
      <section>
        <div class="sec-head"><h2>우선 확인 대상자</h2><span class="muted small">위험도 높은 순 · 상위 5명</span></div>
        ${prio.map(p => prioRow(p, R.get(p.id))).join('') || '<p class="muted">대상자가 없습니다.</p>'}
      </section>
    </div>

    <section>
      <div class="sec-head"><h2>운영 지표</h2>
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
      <h3>통화 현황 (최근 30일)</h3>
      <div class="chartbox"><canvas id="callChart"></canvas></div>
    </section>

    <section>
      <details>
        <summary><h2>판정 설정</h2><span class="muted small">판정 파라미터 · 시연 데이터</span></summary>
        <div class="form" style="margin-top:16px">${Object.keys(DEFAULT_SETTINGS).map(k => `
          <label>${SETTING_LABEL[k]}<input id="set-${k}" type="number" step="any" value="${s[k]}"></label>`).join('')}
          <button class="primary" data-act="saveSettings">저장</button>
        </div>
        <div class="row" style="margin-top:20px">
          <button data-act="reseed">시연 데이터 다시 만들기</button>
          <button data-act="wipe">전체 초기화</button>
        </div>
        <p class="note">시연용이라 계정 정보가 이 브라우저에만 저장됩니다. 실제 운영하려면 서버 인증과 서버 저장이 필요합니다.</p>
      </details>
    </section>`;

  actions = { ...shellActions };
  actions.period = el => { period = el.dataset.v === 'null' ? null : +el.dataset.v; render(); };
  actions.book = el => { const f = document.getElementById('book-' + el.dataset.id); f.hidden = !f.hidden; };
  actions.saveVisit = f => {
    if (!f.date.value) return;
    d.visits.push({ id: 'v' + Date.now().toString(36), personId: f.dataset.id, date: f.date.value, reason: f.reason.value.trim() || '방문 확인', status: 'planned' });
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
    if (!confirm('지금 기록과 녹음을 모두 지우고 시연 데이터를 다시 만들까요? (설정·회원 계정은 유지)')) return;
    await clearAudio();
    setData(reseed(getData()));
    render();
  };
  actions.wipe = async () => {
    if (!confirm('모든 대상자·기록·녹음·방문·설정을 지울까요? (회원 계정은 유지) 되돌릴 수 없습니다.')) return;
    await clearAudio();
    setData({ seedVersion: SEED_VERSION, settings: { ...DEFAULT_SETTINGS }, people: [], calls: [], vitals: [], alerts: [], visits: [], accounts: getData().accounts || [] });
    render();
  };

  return {
    html,
    after: () => {
      drawMap(people, R);
      if (!window.Chart) return;
      // 위험도 분포 도넛 (가운데 전체 인원)
      const center = {
        id: 'center',
        afterDraw(chart) {
          const { ctx, chartArea: a } = chart;
          ctx.save();
          ctx.textAlign = 'center';
          ctx.fillStyle = '#1b1d1c';
          ctx.font = `800 30px ${Chart.defaults.font.family}`;
          ctx.fillText(`${people.length}명`, (a.left + a.right) / 2, (a.top + a.bottom) / 2 + 4);
          ctx.font = `500 13px ${Chart.defaults.font.family}`;
          ctx.fillStyle = '#5a5f5c';
          ctx.fillText('전체 대상자', (a.left + a.right) / 2, (a.top + a.bottom) / 2 + 24);
          ctx.restore();
        }
      };
      charts.push(new Chart(document.getElementById('riskChart'), {
        type: 'doughnut',
        data: {
          labels: ['낮음', '주의', '높음'],
          datasets: [{ data: [count('low'), count('mid'), count('high')], backgroundColor: ['low', 'mid', 'high'].map(riskColor), borderColor: '#fff', borderWidth: 3 }]
        },
        options: { maintainAspectRatio: false, cutout: '68%', plugins: { legend: { display: false } } },
        plugins: [center]
      }));
      // 통화 현황
      const days = [...Array(30)].map((_, i) => addDays(today, i - 29));
      const cnt = status => days.map(dt => d.calls.filter(c => c.date === dt && c.status === status).length);
      const bar = { borderRadius: 4, borderSkipped: false, borderWidth: { top: 2 }, borderColor: '#fff', maxBarThickness: 18 };
      charts.push(new Chart(document.getElementById('callChart'), {
        type: 'bar',
        data: {
          labels: days.map(dt => dt.slice(5)),
          datasets: [
            { label: '완료', data: cnt('completed'), backgroundColor: C.green, ...bar },
            { label: '무응답', data: cnt('missed'), backgroundColor: C.orange, ...bar }
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
  };
}

function prioRow(p, r) {
  const v = nextVisit(p.id);
  const last = getData().calls.filter(c => c.personId === p.id).map(c => c.date).sort().at(-1);
  return `
    <div class="prio">
      <div class="prio-top">
        <a class="who" href="#/admin/p/${p.id}"><span class="avatar">${initial(p.name)}</span><b>${esc(p.name)}</b><span class="muted">${p.age ?? '—'}세</span></a>
        ${riskChip(r.level)}
      </div>
      <div class="chips">${reasonChips(r.reasons, 2)}</div>
      <div class="muted small">최근 통화 ${last ?? '—'} · 권장 조치: ${esc(recommendAction(r))}</div>
      <div class="row">
        <a class="btn" href="#/admin/p/${p.id}">상세</a>
        ${v ? `<span class="tag">${icon('calendar')}방문 예정 ${mmdd(v.date)}</span>` : `<button data-act="book" data-id="${p.id}">${icon('calendar')}방문 예약</button>`}
      </div>
      <form class="book" id="book-${p.id}" data-submit="saveVisit" data-id="${p.id}" hidden>
        <label>방문일<input type="date" name="date" min="${todayStr()}" value="${addDays(todayStr(), 1)}" required></label>
        <label>사유<input name="reason" value="${esc(recommendAction(r).split(' · ')[0])}"></label>
        <button class="primary" type="submit">저장</button>
      </form>
    </div>`;
}

function drawMap(people, R) {
  const el = document.getElementById('map');
  if (!window.L || !el) { if (el) el.innerHTML = '<p class="muted" style="padding:16px">지도를 불러오지 못했습니다 (인터넷 연결 확인).</p>'; return; }
  map = L.map(el, { scrollWheelZoom: false });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  const border = L.geoJSON(ungchon, { style: { color: '#1e3932', weight: 2, dashArray: '6 5', fillColor: '#00754a', fillOpacity: 0.06 } }).addTo(map);
  map.fitBounds(border.getBounds(), { padding: [12, 12] });

  // 높음 점이 가려지지 않게 낮음 → 주의 → 높음 순서로 그린다
  const placed = people.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng))
    .sort((a, b) => RISK_RANK[R.get(a.id).level] - RISK_RANK[R.get(b.id).level]);
  for (const p of placed) {
    const r = R.get(p.id);
    const last = getData().calls.filter(c => c.personId === p.id).map(c => c.date).sort().at(-1);
    L.circleMarker([p.lat, p.lng], { radius: 9, color: '#fff', weight: 2, fillColor: riskColor(r.level), fillOpacity: 1 })
      .bindTooltip(esc(p.name), { direction: 'top', offset: [0, -8] })
      .bindPopup(`
        <div class="pop">
          <b>${esc(p.name)}</b> <span class="muted">${p.age ?? '—'}세</span>
          <div>${riskChip(r.level)}</div>
          <div class="chips">${reasonChips(r.reasons, 2)}</div>
          <div class="muted small">최근 통화 ${last ?? '—'}</div>
          <a class="btn primary" href="#/admin/p/${p.id}">상세 보기</a>
        </div>`)
      .addTo(map);
  }

  const legend = L.control({ position: 'topright' });
  legend.onAdd = () => {
    const div = L.DomUtil.create('div', 'legend');
    div.innerHTML = ['low', 'mid', 'high'].map(lv =>
      `<span><i class="dot" style="background:var(--risk-${lv})"></i>${RISK[lv]} ${people.filter(p => R.get(p.id).level === lv).length}명</span>`).join('');
    return div;
  };
  legend.addTo(map);
}

// ---------- 대상자 관리 ----------
function peoplePage(params) {
  const d = getData(), today = todayStr();
  const me = currentAccount();
  const R = new Map(d.people.map(p => [p.id, risk(p)]));
  const comp = new Map(d.people.map(p => [p.id, completion7(p, d.calls, today).rate]));
  const lastCall = id => d.calls.filter(c => c.personId === id).map(c => c.date).sort().at(-1) || null;
  if (params.get('sort') === 'rate') { list.sort = 'rate'; list.dir = 1; }
  const onlyVisit = params.has('visit'), onlyAlerts = params.has('alerts');

  const cols = [
    ['name', '이름'], ['age', '성별/나이'], ['address', '주소'], ['manager', '담당자'],
    ['risk', '위험도'], ['rate', '최근 7일 완료율'], ['last', '최근 통화일'], ['visit', '다음 방문일']
  ];
  const sortVal = {
    name: p => p.name, age: p => p.age ?? 0, address: p => p.address || '', manager: p => p.manager || '',
    risk: p => RISK_RANK[R.get(p.id).level] * 1000 - (R.get(p.id).score ?? 0), rate: p => comp.get(p.id) ?? -1,
    last: p => lastCall(p.id) || '', visit: p => nextVisit(p.id)?.date || '9999'
  };

  const rows = () => {
    let ps = filterPeople(d.people.filter(p => p.active), list.q, list.mine && me ? displayName(me) : null);
    if (list.risk !== 'all') ps = ps.filter(p => R.get(p.id).level === list.risk);
    if (onlyVisit) ps = ps.filter(p => nextVisit(p.id));
    if (onlyAlerts) ps = ps.filter(p => d.alerts.some(a => a.personId === p.id && a.status === 'open'));
    const f = sortVal[list.sort];
    ps.sort((a, b) => { const x = f(a), y = f(b); return (x < y ? -1 : x > y ? 1 : 0) * list.dir; });
    if (!ps.length) return '<p class="empty">검색 결과가 없습니다</p>';
    return `
      <table class="rtable ptable">
        <thead><tr>${cols.map(([k, t]) => `<th><button class="th ${list.sort === k ? 'on' : ''}" data-act="sort" data-k="${k}">${t}${list.sort === k ? (list.dir > 0 ? ' ▲' : ' ▼') : ''}</button></th>`).join('')}</tr></thead>
        <tbody>${ps.map(p => {
          const r = R.get(p.id), v = nextVisit(p.id), rate = comp.get(p.id);
          return `
          <tr class="click" data-act="open" data-id="${p.id}">
            <td class="first"><div class="who"><span class="avatar">${initial(p.name)}</span><b>${esc(p.name)}</b></div></td>
            <td data-label="성별/나이">${esc(p.sex || '—')} · ${p.age ?? '—'}세</td>
            <td data-label="주소">${shortAddr(p.address)}</td>
            <td data-label="담당자">${esc(p.manager || '—')}</td>
            <td data-label="위험도">${riskChip(r.level)}</td>
            <td data-label="최근 7일 완료율" class="${rate != null && rate < 80 ? 'bad-text' : ''}">${pctText(rate)}</td>
            <td data-label="최근 통화일">${lastCall(p.id) ?? '—'}</td>
            <td data-label="다음 방문일">${v ? mmdd(v.date) : '—'}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>`;
  };
  const inactive = d.people.filter(p => !p.active);
  const managers = [...new Set([...d.people.map(p => p.manager), ...(d.accounts || []).map(displayName)].filter(Boolean))];

  actions = { ...shellActions };
  const refresh = () => { document.getElementById('plist').innerHTML = rows(); };
  actions.q = el => { list.q = el.value; refresh(); };
  actions.mine = el => { list.mine = el.checked; refresh(); };
  actions.riskf = el => { list.risk = el.dataset.v; document.querySelectorAll('[data-act=riskf]').forEach(b => b.classList.toggle('on', b === el)); refresh(); };
  actions.sort = (el, e) => {
    e.stopPropagation();
    const k = el.dataset.k;
    if (list.sort === k) list.dir *= -1; else { list.sort = k; list.dir = k === 'risk' ? -1 : 1; }
    refresh();
  };
  actions.open = el => { location.hash = '#/admin/p/' + el.dataset.id; };
  actions.addPerson = f => {
    const v = n => f[n].value.trim();
    if (!v('name')) return alert('이름을 입력해 주세요.');
    d.people.push({
      id: 'p' + Date.now().toString(36), name: v('name'), sex: f.sex.value, age: +v('age') || null, phone: v('phone'),
      guardianPhone: v('guardian'), preferredTime: v('time'), enrolledAt: today, active: true,
      address: v('address'), manager: v('manager'), lat: parseFloat(v('lat')), lng: parseFloat(v('lng')), livesAlone: f.alone.checked
    });
    save();
    render();
  };
  actions.reactivate = el => { d.people.find(p => p.id === el.dataset.id).active = true; save(); render(); };

  return {
    html: `
      <div class="page-title"><h1>대상자 관리</h1><p>활성 ${d.people.filter(p => p.active).length}명${inactive.length ? ` · 비활성 ${inactive.length}명` : ''}</p></div>
      <section>
        <div class="toolbar">
          <label class="search">${icon('search')}<input data-input="q" value="${esc(list.q)}" placeholder="이름 또는 담당자 검색"></label>
          <label class="check"><input type="checkbox" data-change="mine" ${list.mine ? 'checked' : ''}> 내 담당만</label>
          <div class="seg">${[['all', '전체'], ['high', '높음'], ['mid', '주의'], ['low', '낮음']].map(([v, t]) =>
            `<button data-act="riskf" data-v="${v}" class="${list.risk === v ? 'on' : ''}">${t}</button>`).join('')}</div>
        </div>
        ${onlyVisit || onlyAlerts ? `<p class="filter-on">${onlyVisit ? '방문 예정만' : '미조치 알림 있는 대상자만'} 보는 중 · <a href="#/admin/people">전체 보기</a></p>` : ''}
        <div id="plist">${rows()}</div>
      </section>

      <section>
        <details>
          <summary><h2>대상자 추가</h2><span class="muted small">위도·경도를 넣으면 지도에 표시됩니다</span></summary>
          <form class="form" data-submit="addPerson" style="margin-top:16px">
            <label>이름<input name="name" placeholder="홍길동"></label>
            <label>성별<select name="sex"><option>여</option><option>남</option></select></label>
            <label>나이<input name="age" type="number" min="0" placeholder="78"></label>
            <label>연락처<input name="phone" type="tel" placeholder="010-0000-0000"></label>
            <label>보호자 연락처<input name="guardian" type="tel" placeholder="010-0000-0000"></label>
            <label>선호 통화 시간<input name="time" type="time" value="10:00"></label>
            <label>주소<input name="address" placeholder="울산광역시 울주군 웅촌면 ○○리"></label>
            <label>담당자<input name="manager" list="managers" value="${me ? esc(displayName(me)) : ''}"></label>
            <label>위도<input name="lat" type="number" step="any" placeholder="35.4655"></label>
            <label>경도<input name="lng" type="number" step="any" placeholder="129.2240"></label>
            <label class="check"><input type="checkbox" name="alone"> 독거</label>
            <button class="primary" type="submit">추가</button>
          </form>
          <datalist id="managers">${managers.map(m => `<option value="${esc(m)}">`).join('')}</datalist>
        </details>
        ${inactive.length ? `<h3>비활성 대상자</h3><div class="row">${inactive.map(p => `<span class="tag">${esc(p.name)}</span><button data-act="reactivate" data-id="${p.id}">다시 활성화</button>`).join('')}</div>` : ''}
      </section>`,
    after: () => {
      const q = app.querySelector('[data-input=q]');
      if (list.q && q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
    }
  };
}

// ---------- 대상자 상세 ----------
const TABS = [['summary', '요약'], ['chart', '분석 그래프'], ['calls', '통화 기록'], ['alerts', '알림']];

function personPage(id, tab = 'summary') {
  const d = getData(), s = d.settings, today = todayStr();
  const p = d.people.find(x => x.id === id);
  actions = { ...shellActions };
  if (!p) return { html: `<section><p>대상자를 찾을 수 없습니다.</p><a href="#/admin/people">대상자 관리로</a></section>` };
  const ai = aiSummary(p, d, today, getNightVitals);
  const r = ai.risk;
  const st = r.signals.status;
  const alerts = d.alerts.filter(a => a.personId === id)
    .sort((a, b) => (a.status === 'closed') - (b.status === 'closed') || b.createdAt.localeCompare(a.createdAt));
  const calls = d.calls.filter(c => c.personId === id)
    .sort((a, b) => (b.date + b.startedAt).localeCompare(a.date + a.startedAt));
  const openCount = alerts.filter(a => a.status !== 'closed').length;
  const v = nextVisit(id);

  const tabHtml = {
    summary: () => `
      <section class="ai ai-${r.level}">
        <div class="sec-head"><h2>${icon('sparkle')} AI 종합 분석 <span class="muted small">(최근 7일)</span></h2>${riskChip(r.level)}</div>
        <ul class="ai-list">${ai.bullets.map(b => `<li class="${b.off ? 'off' : ''}">${esc(b.text)}</li>`).join('')}</ul>
        <div class="ai-action"><small>권장 조치</small><b>${esc(ai.action)}</b></div>
        <p class="muted small">※ AI 분석은 참고용 스크리닝이며 최종 판단은 담당 전문인력이 수행합니다.</p>
      </section>

      <div class="split">
        <section>
          <div class="sec-head"><h2>종합 케어 스코어</h2><b class="score">${r.score ?? '—'}<small>점</small></b></div>
          ${Object.entries(CARE_LABEL).map(([k, [label, w]]) => {
            const val = r.signals.parts[k];
            return `<div class="part"><div class="row"><span>${label} <span class="muted small">가중치 ${w}</span></span><b>${val == null ? '측정 없음' : Math.round(val)}</b></div>
              <div class="bar"><i style="width:${val ?? 0}%;background:${val == null ? 'transparent' : val >= 75 ? 'var(--risk-low)' : val >= 55 ? 'var(--risk-mid)' : 'var(--risk-high)'}"></i></div></div>`;
          }).join('')}
          <p class="muted small">75점 이상 낮음 · 55~74점 주의 · 55점 미만 높음. 실제 측정하는 통화 인지검사·통화 응답·야간 SpO₂·안정 시 심박만으로 계산합니다.</p>
        </section>
        <section>
          <div class="sec-head"><h2>기본 정보</h2></div>
          <dl class="info">
            <dt>주소</dt><dd>${esc(p.address || '—')}</dd>
            <dt>담당자</dt><dd>${esc(p.manager || '—')}</dd>
            <dt>연락처</dt><dd>${esc(p.phone)}</dd>
            <dt>보호자</dt><dd>${esc(p.guardianPhone)}</dd>
            <dt>선호 통화 시간</dt><dd>${esc(p.preferredTime)}</dd>
            <dt>등록일</dt><dd>${p.enrolledAt}</dd>
            <dt>기저선</dt><dd>${st.base.ready ? `${st.base.mean.toFixed(1)}% ± ${st.base.sd.toFixed(1)} (${st.baseStart} ~ ${st.baseEnd})` : `형성 중 ${st.base.n}/${s.baselineDays}회`}</dd>
            <dt>다음 방문</dt><dd>${v ? `${v.date} · ${esc(v.reason)}` : '—'}</dd>
          </dl>
        </section>
      </div>

      <section>
        <details>
          <summary><h2>정보 수정</h2><span class="muted small">담당자 · 주소 · 위도·경도</span></summary>
          <form class="form" data-submit="savePerson" style="margin-top:16px">
            <label>이름<input name="name" value="${esc(p.name)}"></label>
            <label>성별<select name="sex">${['여', '남'].map(x => `<option ${p.sex === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
            <label>나이<input name="age" type="number" value="${p.age ?? ''}"></label>
            <label>연락처<input name="phone" value="${esc(p.phone)}"></label>
            <label>보호자 연락처<input name="guardian" value="${esc(p.guardianPhone)}"></label>
            <label>선호 통화 시간<input name="time" type="time" value="${esc(p.preferredTime)}"></label>
            <label>주소<input name="address" value="${esc(p.address || '')}"></label>
            <label>담당자<input name="manager" value="${esc(p.manager || '')}"></label>
            <label>위도<input name="lat" type="number" step="any" value="${p.lat ?? ''}"></label>
            <label>경도<input name="lng" type="number" step="any" value="${p.lng ?? ''}"></label>
            <label class="check"><input type="checkbox" name="alone" ${p.livesAlone ? 'checked' : ''}> 독거</label>
            <button class="primary" type="submit">저장</button>
          </form>
          ${p.active ? `<p style="margin-top:16px"><button data-act="deactivate">비활성화</button> <span class="muted small">통화 대상과 지표에서 빠집니다.</span></p>` : ''}
        </details>
      </section>`,
    chart: () => `
      <section>
        <div class="sec-head"><h2>인지 z-score · 야간 SpO2 · 안정 시 심박</h2>
          <div class="seg">${[30, 90].map(n => `<button data-act="range" data-v="${n}" class="${range === n ? 'on' : ''}">${n}일</button>`).join('')}</div>
        </div>
        <div class="chartbox"><canvas id="personChart"></canvas></div>
        <p class="muted small">초록 음영 = 기저선 구간${st.baseEnd ? ` (${st.baseStart} ~ ${st.baseEnd})` : ''} · 회색 점선 = 관찰 기준 · 빈칸 = 통화 없음 또는 무효 측정일 (신호품질 &lt; ${s.sqiMin} 또는 착용 4시간 미만) · 30일 추세 기울기 ${slopeText(st.slope)}</p>
      </section>`,
    calls: () => `
      <section>
        <div class="sec-head"><h2>통화 기록</h2><span class="muted small">${calls.length}건</span></div>
        ${calls.map(callRow).join('') || '<p class="muted">통화 기록 없음</p>'}
      </section>`,
    alerts: () => `
      <section>
        <div class="sec-head"><h2>알림</h2><span class="muted small">열린 알림 ${openCount}건</span></div>
        ${alerts.map(alertCard).join('') || '<p class="muted">알림 없음</p>'}
      </section>`
  };
  if (!tabHtml[tab]) tab = 'summary';

  const html = `
    <div class="hero">
      <div class="profile">
        <span class="avatar">${initial(p.name)}</span>
        <div>
          <h1>${esc(p.name)} <span class="sub">${esc(p.sex || '')} · ${p.age ?? '—'}세${p.livesAlone ? ' · 독거' : ''}</span>${p.active ? '' : ' <span class="tag">비활성</span>'}</h1>
          <p>${shortAddr(p.address)} · 담당 ${esc(p.manager || '—')}</p>
        </div>
      </div>
      <div class="chips hero-chips">${riskChip(r.level)}${reasonChips(r.reasons)}</div>
      <div class="stat-row">
        <div><small>종합 케어 스코어</small><b>${r.score ?? '—'}점</b></div>
        <div><small>최근 인지검사</small><b>${pctText(st.lastScore)}</b></div>
        <div><small>최근 z</small><b>${st.base.ready ? (st.lastZ?.toFixed(2) ?? '—') : '기저선 형성 중'}</b></div>
        <div><small>최근 7일 통화 완료</small><b>${r.signals.completion.done}/${r.signals.completion.days}</b></div>
      </div>
    </div>
    <nav class="dtabs">${TABS.map(([k, t]) => `<a class="${k === tab ? 'on' : ''}" href="#/admin/p/${p.id}/${k}">${t}${k === 'alerts' && openCount ? ` <span class="count">${openCount}</span>` : ''}</a>`).join('')}</nav>
    ${tabHtml[tab]()}`;

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
  actions.savePerson = f => {
    const v = n => f[n].value.trim();
    Object.assign(p, {
      name: v('name') || p.name, sex: f.sex.value, age: +v('age') || null, phone: v('phone'), guardianPhone: v('guardian'),
      preferredTime: v('time'), address: v('address'), manager: v('manager'),
      lat: parseFloat(v('lat')), lng: parseFloat(v('lng')), livesAlone: f.alone.checked
    });
    saveAndRender();
  };
  actions.deactivate = () => {
    if (!confirm(`${p.name} 님을 비활성화할까요? 통화 대상과 지표에서 빠집니다.`)) return;
    p.active = false;
    saveAndRender();
  };
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

  return { html, after: () => { if (tab === 'chart') drawPersonChart(p, st, s, today); } };
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
// 저장된 데이터가 없거나 시드 버전이 바뀌었으면 시연 데이터를 새로 만든다 (회원 계정·설정은 유지)
if (!getData() || getData().seedVersion !== SEED_VERSION) {
  clearAudio().catch(() => {});
  setData(reseed(getData()));
}
const d0 = getData();
d0.settings = { ...DEFAULT_SETTINGS, ...d0.settings };
d0.visits ??= [];
d0.accounts ??= [];
window.addEventListener('hashchange', route);
route();
