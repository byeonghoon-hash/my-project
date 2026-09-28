// 라우팅과 화면 그리기
// #/ 첫 화면 · #/user 어르신(대상자) 화면 · #/login · #/signup
// #/admin 전체 현황 · #/admin/people 대상자 관리 · #/admin/p/<id>[/<탭>] 대상자 상세

import {
  getData, setData, save, saveAudio, getAudio, deleteAudio, clearAudio,
  makeSalt, hashPassword, verifyPassword, displayName, currentAccount, setLogin
} from './store.js';
import { reseed, SEED_VERSION, baseInfo } from './seed.js';
import {
  DEFAULT_SETTINGS, todayStr, nowStamp, addDays, personStatus, updateAlerts, dashboard, isValidNight,
  riskOf, aiSummary, recommendAction, filterPeople, completion7, refreshZ, isCallDay, isPausedOn, spo2Threshold,
  primaryContact, validPhone, autoChecklist, recentAcute, trendAll, TREND_METRICS, METRIC, trendCsv, trendSentence,
  personEvents, journalDraft, mmdd as mdot, daysBetween, visitChecks, visitStart, visitEnd, minToTime, VISIT_TYPES,
  ageFrom, findDuplicates, insideBoundary
} from './metrics.js';
import { getNightVitals, importRing, recomputeRing, deleteRingImport } from './vitals.js';
import { startRing, runCall, nextItem, stopCall } from './call.js';
import { scorePct, DOMAIN_LABEL, orientationParts, countAnimals, SELF_QUESTIONS } from './items.js';
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
  maxCallSec: '통화 상한 (초)',
  sdMinScore: '변화 추이 표준편차 최솟값: 점수 (%p)',
  sdMinSpo2: '변화 추이 표준편차 최솟값: SpO₂ (%p)',
  sdMinHr: '변화 추이 표준편차 최솟값: 심박 (bpm)',
  sdMinLatency: '변화 추이 표준편차 최솟값: 응답 지연 (초)',
  visitBufferMin: '방문 이동 여유 시간 (분)',
  visitDailyLimit: '방문자 하루 방문 한도 (건)'
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
  back: '<path d="m15 18-6-6 6-6"/>',
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
const pctText = v => (v == null ? '-' : `${v.toFixed(1)}%`);
const slopeText = v => (v == null ? '-' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%p/일`);
const stamp = s => (s ? s.slice(0, 10).replace(/-/g, '.') + (s.length > 10 ? ' ' + s.slice(11, 16) : '') : '-'); // YYYY.MM.DD HH:MM
const initial = name => esc((name || '?').slice(0, 1));
const mmdd = s => (s ? `${s.slice(5, 7)}.${s.slice(8, 10)}` : '-'); // 목록: MM.DD
const shortAddr = a => esc((a || '-').replace('울산광역시 울주군 ', ''));
const longDate = s => {
  const d = new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${'일월화수목금토'[d.getDay()]}요일`;
};
const fmtDate = s => (s ? s.slice(0, 10).replace(/-/g, '.') : '-');                 // 상세: YYYY.MM.DD
const fmtDateW = s => `${s.slice(5, 7)}.${s.slice(8, 10)}(${'일월화수목금토'[new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)).getDay()]})`; // MM.DD(요)
const riskChip = lv => `<span class="risk risk-${lv}">위험도 ${RISK[lv]}</span>`;
const reasonChips = (reasons, n = 99) => reasons.slice(0, n).map(r => `<span class="chip">${esc(r)}</span>`).join('');

let actions = {};   // 지금 화면의 버튼 동작 (data-act / data-change / data-input / data-submit)
let cleanup = null; // 화면을 떠날 때 멈출 것 (벨소리·통화)
let charts = [];
let map = null;
let period = 7;     // 운영 지표 기간
let dashCal = {};   // 전체 현황 캘린더 { month, selected, visitor }
const list = { q: '', mine: false, risk: 'all', sort: 'risk', dir: -1, closed: false }; // 대상자 관리 목록 상태

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
  closeVisit();
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
  else if (path === '#/admin/people/new') body = personFormPage(params);
  else if (path.startsWith('#/admin/p/')) body = personPage(path.slice(10).split('/').map(decodeURIComponent), params);
  else body = '<section><p>없는 화면</p></section>';

  Object.assign(actions, visitActions); // 방문 창은 어느 화면에서나 같은 동작
  app.innerHTML = shell(path, me, body.html);
  body.after?.();
  if (vm) drawVisit();
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
             : `<small>로그인 필요</small><a class="btn primary" href="#/login">로그인</a>`}
      </div>
    </aside>
    <div class="scrim" data-act="closeSide"></div>
    <div class="content">
      <header class="topbar"><button class="menu" data-act="openSide" aria-label="메뉴 열기">${icon('menu')}</button><b>I-ME 관리자 시스템</b></header>
      <div class="page">${html}</div>
    </div>
    <div id="modal-root"></div>`;
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
    const at = nowStamp();
    d.calls.push({
      id: 'c' + Date.now(), personId: p.id, date: todayStr(), time: at.slice(11), startedAt: at, status: 'missed', source: 'real',
      durationSec: 0, rotationDomain: null, setIndex: null, items: [], scorePct: null, z: null,
      selfReport: null, chat: null, requests: [], audioId: null
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
    res = await runCall(getData().settings, ui, p); // 호칭·말 속도·다시 읽기 횟수는 대상자 기본 정보에서
  } catch {
    cleanup = null;
    app.innerHTML = `<h1>마이크 사용 불가</h1>
      <p>크롬에서 http://localhost:8000 접속 후 마이크 허용</p>
      <a class="btn" href="#/">처음으로</a>`;
    return;
  }
  cleanup = null;
  if (!res) return; // 통화 도중 화면을 떠남

  const d = getData();
  const id = Date.now().toString(36);
  const audioId = res.blob.size ? 'a' + id : null;
  if (audioId) await saveAudio(audioId, res.blob);
  d.calls.push({ id: 'c' + id, personId: p.id, ...res.call, z: null, audioId });
  refreshZ(d, p, todayStr());
  evaluate([p.id]);
  // 점수나 위험도는 대상자에게 보여주지 않는다
  app.innerHTML = `
    <div class="done-mark">${icon('check')}</div>
    <h1>오늘도 통화해 주셔서 감사합니다.</h1>
    <a class="btn" href="#/">처음으로</a>`;
}

// ---------- 로그인·회원가입 ----------
const authNote = '';

function loginPage(params) {
  const next = params.get('next') || '#/admin';
  actions = { ...shellActions };
  actions.login = async f => {
    const acc = (getData().accounts || []).find(a => a.username === f.username.value.trim());
    const err = f.querySelector('[data-err]');
    if (!acc || !(await verifyPassword(acc, f.password.value))) { err.textContent = '아이디 또는 비밀번호 불일치'; return; }
    setLogin(acc.id);
    location.hash = next;
  };
  return {
    html: `
      <div class="auth"><form class="auth-card" data-submit="login">
        <div class="auth-logo"><i>${icon('heart')}</i>I-ME</div>
        <h1>로그인</h1>
        ${params.get('joined') ? '<p class="ok-msg">가입 완료</p>' : ''}
        <label>아이디<input name="username" autocomplete="username" value="${esc(params.get('id') || '')}" required></label>
        <label>비밀번호<input name="password" type="password" autocomplete="current-password" required></label>
        <small class="err" data-err></small>
        <button class="primary block" type="submit">로그인</button>
        <p class="muted small center"><a href="#/signup?next=${encodeURIComponent(next)}">회원가입</a></p>
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
    for (const n of ['name', 'org', 'username']) if (!v(n)) errs[n] = '입력 필요';
    const accounts = getData().accounts || [];
    if (v('username') && accounts.some(a => a.username === v('username'))) errs.username = '이미 있는 아이디';
    if (f.password.value.length < 6) errs.password = '6자 이상';
    if (f.password.value !== f.password2.value) errs.password2 = '비밀번호 불일치';
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
        <button class="primary block" type="submit">가입</button>
        <p class="muted small center"><a href="#/login?next=${encodeURIComponent(next)}">로그인</a></p>
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
  const callToday = people.filter(p => isCallDay(p, today)); // 통화 일시중지인 사람은 오늘 대상에서 뺀다
  const todayCalls = d.calls.filter(c => c.date === today && callToday.some(p => p.id === c.personId));
  const openReq = (d.requests || []).filter(r => r.status === 'open' && people.some(p => p.id === r.personId));
  const oldestReq = openReq.map(r => r.date).sort()[0];
  const doneToday = new Set(todayCalls.filter(c => c.status === 'completed').map(c => c.personId)).size;
  const missedToday = new Set(todayCalls.filter(c => c.status === 'missed').map(c => c.personId)).size;
  if (!dashCal.selected) dashCal = { month: today.slice(0, 7), selected: today, visitor: '' };
  const dayVisits = d.visits.filter(v => v.date === dashCal.selected && (!dashCal.visitor || v.visitor === dashCal.visitor))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const weekVisits = d.visits.filter(v => v.status === 'planned' && v.date >= today && v.date <= addDays(today, 6));
  const kpis = [
    ['#/admin/people', 'users', '전체 대상자', `${people.length}명`, `높음 ${count('high')} · 주의 ${count('mid')}`],
    ['#/admin/people?alerts=1', 'bell', '미조치 알림', `${openAlerts.length}건`, `그중 의뢰 단계 ${openAlerts.filter(a => a.level === 'refer').length}건`],
    ['#/admin/people?sort=rate', 'phone', '평균 통화 완료율', pctText(avgRate),
      avgRate == null ? '목표 80%' : `목표 80% · <b class="${avgRate >= 80 ? 'good' : 'bad'}">${avgRate >= 80 ? '달성' : '미달'}</b>`],
    ['#/admin/people', 'check', '오늘 통화', `${doneToday} / ${callToday.length}`, `완료 · 무응답 ${missedToday}`],
    ['#/admin?to=cal', 'calendar', '방문 예정', `${weekVisits.length}건`, `7일 안 · 오늘 ${weekVisits.filter(v => v.date === today).length}건`],
    ['#/admin/people?view=requests', 'bell', '미처리 요청', `${openReq.length}건`, oldestReq ? `가장 오래된 요청 ${daysBetween(oldestReq, today)}일 경과` : '없음']
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
    ['평균 통화 시간', m.avgDurationSec == null ? '-' : mmss(m.avgDurationSec), '목표 3분 이하', goal(m.avgDurationSec, v => v <= 180), m.avgDurationSec == null ? null : (m.avgDurationSec / 180) * 100],
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
        ${prio.map(p => prioRow(p, R.get(p.id))).join('') || '<p class="muted">데이터 없음</p>'}
      </section>
    </div>

    <section id="cal">
      <div class="sec-head"><h2>방문 일정</h2><a href="#/admin/people">방문 등록: 대상자 관리</a></div>
      <div class="cal-split">
        ${monthCalendar({ ns: 'dc', month: dashCal.month, selected: dashCal.selected, visitor: dashCal.visitor, levelOf: id => (R.get(id) || risk(d.people.find(p => p.id === id))).level,
          visits: d.visits.filter(v => !dashCal.visitor || v.visitor === dashCal.visitor) })}
        <div class="daylist">
          <h3>${fmtDateW(dashCal.selected)}</h3>
          ${dayVisits.length ? dayVisits.map(v => { const vp = d.people.find(p => p.id === v.personId); return `
            <div class="dayrow st-${v.status}" data-act="openVisit" data-v="${v.id}">
              <b class="time">${visitLine(v)}</b>
              <span><a href="#/admin/p/${v.personId}" class="name">${esc(vp?.name || '-')}</a> ${vp ? riskChip((R.get(vp.id) || risk(vp)).level) : ''}</span>
              <span class="muted small">${esc(v.type)} · ${esc(v.visitor)}</span>
              <span class="small">${esc(v.purpose || '')}</span>
              <span class="chip ${v.status === 'canceled' ? 'warn' : ''}">${VISIT_STATUS[v.status]}</span>
            </div>`; }).join('') : '<p class="muted">일정 없음</p>'}
        </div>
      </div>
    </section>

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
      <p class="muted small">알림 관련 지표(탐지율·연계율·PPV·오경보율·알림 수): 전체 기간</p>
      <h3>통화 현황 (최근 30일)</h3>
      <div class="chartbox"><canvas id="callChart"></canvas></div>
    </section>

    <section>
      <details>
        <summary><h2>판정 설정</h2></summary>
        <div class="form" style="margin-top:16px">${Object.keys(DEFAULT_SETTINGS).map(k => `
          <label>${SETTING_LABEL[k]}<input id="set-${k}" type="number" step="any" value="${s[k]}"></label>`).join('')}
          <button class="primary" data-act="saveSettings">저장</button>
        </div>
        <div class="row" style="margin-top:20px">
          <button data-act="reseed">재생성</button>
          <button data-act="wipe">초기화</button>
        </div>
        
      </details>
    </section>`;

  actions = { ...shellActions };
  actions.period = el => { period = el.dataset.v === 'null' ? null : +el.dataset.v; render(); };
  actions.dcPick = el => { dashCal.selected = el.dataset.date; render(); };
  actions.dcNav = el => { dashCal.month = shiftMonth(dashCal.month, +el.dataset.m); if (el.dataset.m === '0') dashCal.selected = today; render(); };
  actions.dcFilter = el => { dashCal.visitor = el.dataset.v; render(); };
  actions.dcVisitor = el => { dashCal.visitor = el.value; render(); };
  actions.saveSettings = () => {
    for (const k of Object.keys(DEFAULT_SETTINGS)) {
      const v = parseFloat(document.getElementById('set-' + k).value);
      if (!Number.isNaN(v)) s[k] = v;
    }
    evaluate();
    alert('저장됨');
    render();
  };
  actions.reseed = async () => {
    if (!confirm('통화·방문·일지 기록과 녹음을 지우고 기본 데이터로 재생성 (설정·회원 계정·링 데이터 유지)')) return;
    await clearAudio();
    setData(reseed(getData()));
    render();
  };
  actions.wipe = async () => {
    if (!confirm('대상자·기록·녹음·방문·설정 전체 삭제 (회원 계정 유지). 되돌릴 수 없음')) return;
    await clearAudio();
    setData({ seedVersion: SEED_VERSION, settings: { ...DEFAULT_SETTINGS }, people: [], calls: [], vitals: [], alerts: [], visits: [], accounts: getData().accounts || [] });
    render();
  };

  return {
    html,
    after: () => {
      if (new URLSearchParams(location.hash.split('?')[1] || '').get('to') === 'cal') document.getElementById('cal')?.scrollIntoView({ block: 'start' });
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
          labels: days.map(dt => mmdd(dt)),
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
        <a class="who" href="#/admin/p/${p.id}"><span class="avatar">${initial(p.name)}</span><b>${esc(p.name)}</b><span class="muted">${p.age ?? '-'}세</span></a>
        ${riskChip(r.level)}
      </div>
      <div class="chips">${reasonChips(r.reasons, 2)}${r.signals.mobilityLimited ? '<span class="chip warn">거동 제한</span>' : ''}</div>
      <div class="muted small">최근 통화 ${mmdd(last)} · 권장 조치: ${esc(recommendAction(r))}</div>
      <div class="row">
        <a class="btn" href="#/admin/p/${p.id}">상세</a>
        ${v ? `<button class="tag" data-act="openVisit" data-v="${v.id}">${icon('calendar')}방문 예정 ${mdot(v.date)}</button>` : `<button data-act="openVisit" data-p="${p.id}">${icon('calendar')}방문 예약</button>`}
      </div>
    </div>`;
}

function drawMap(people, R) {
  const el = document.getElementById('map');
  if (!window.L || !el) { if (el) el.innerHTML = '<p class="muted" style="padding:16px">지도 불러오기 실패 (인터넷 연결 확인)</p>'; return; }
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
          <b>${esc(p.name)}</b> <span class="muted">${p.age ?? '-'}세</span>
          <div>${riskChip(r.level)}</div>
          <div class="chips">${reasonChips(r.reasons, 2)}</div>
          <div class="muted small">최근 통화 ${mmdd(last)}</div>
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
// 대상자 관리 안의 보기 전환: 대상자 목록 · 어르신 요청사항 · 일지 관리
const subnav = view => `<nav class="dtabs subnav">${[['', '대상자 목록'], ['requests', '어르신 요청사항'], ['journals', '일지 관리']]
  .map(([v, t]) => `<a class="${(view || '') === v ? 'on' : ''}" href="#/admin/people${v ? '?view=' + v : ''}">${t}</a>`).join('')}</nav>`;

function peoplePage(params) {
  if (params.get('view') === 'requests') return requestsPage();
  if (params.get('view') === 'journals') return journalsPage(params);
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
    let ps = filterPeople(d.people.filter(p => p.active || (list.closed && p.closed)), list.q, list.mine && me ? displayName(me) : null);
    if (list.risk !== 'all') ps = ps.filter(p => R.get(p.id).level === list.risk);
    if (onlyVisit) ps = ps.filter(p => nextVisit(p.id));
    if (onlyAlerts) ps = ps.filter(p => d.alerts.some(a => a.personId === p.id && a.status === 'open'));
    const f = sortVal[list.sort];
    ps.sort((a, b) => { const x = f(a), y = f(b); return (x < y ? -1 : x > y ? 1 : 0) * list.dir; });
    if (!ps.length) return '<p class="empty">검색 결과 없음</p>';
    return `
      <table class="rtable ptable">
        <thead><tr>${cols.map(([k, t]) => `<th><button class="th ${list.sort === k ? 'on' : ''}" data-act="sort" data-k="${k}">${t}${list.sort === k ? (list.dir > 0 ? ' ▲' : ' ▼') : ''}</button></th>`).join('')}<th></th></tr></thead>
        <tbody>${ps.map(p => {
          const r = R.get(p.id), v = nextVisit(p.id), rate = comp.get(p.id);
          return `
          <tr class="click" data-act="open" data-id="${p.id}">
            <td class="first"><div class="who"><span class="avatar">${initial(p.name)}</span><b>${esc(p.name)}</b></div></td>
            <td data-label="성별/나이">${esc(p.sex || '-')} · ${p.age ?? '-'}세</td>
            <td data-label="주소">${shortAddr(p.address)}</td>
            <td data-label="담당자">${esc(p.manager || '-')}</td>
            <td data-label="위험도">${p.closed ? `<span class="tag">종결 ${mdot(p.closed.date)}</span>` : riskChip(r.level)}${!p.closed && !r.signals.status.base.ready ? ' <span class="chip">기저선 형성 중</span>' : ''}</td>
            <td data-label="최근 7일 완료율" class="${rate != null && rate < 80 ? 'bad-text' : ''}">${pctText(rate)}</td>
            <td data-label="최근 통화일">${mmdd(lastCall(p.id))}</td>
            <td data-label="다음 방문일">${v ? mdot(v.date) : '-'}</td>
            <td class="end">${p.active ? `<button data-act="openVisit" data-p="${p.id}">방문 등록</button>` : ''}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>`;
  };
  const closedN = d.people.filter(p => p.closed).length;

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
  actions.closedf = el => { list.closed = el.checked; refresh(); };

  return {
    html: `
      <div class="page-title title-row"><div><h1>대상자 관리</h1><p>활성 ${d.people.filter(p => p.active).length}명${closedN ? ` · 종결 ${closedN}명` : ''}</p></div>
        <a class="btn primary" href="#/admin/people/new">대상자 추가</a></div>
      ${subnav('')}
      <section>
        <div class="toolbar">
          <label class="search">${icon('search')}<input data-input="q" value="${esc(list.q)}" placeholder="이름 또는 담당자 검색"></label>
          <label class="check"><input type="checkbox" data-change="mine" ${list.mine ? 'checked' : ''}> 내 담당만</label>
          <label class="check"><input type="checkbox" data-change="closedf" ${list.closed ? 'checked' : ''}> 종결 포함</label>
          <div class="seg">${[['all', '전체'], ['high', '높음'], ['mid', '주의'], ['low', '낮음']].map(([v, t]) =>
            `<button data-act="riskf" data-v="${v}" class="${list.risk === v ? 'on' : ''}">${t}</button>`).join('')}</div>
        </div>
        ${onlyVisit || onlyAlerts ? `<p class="filter-on">${onlyVisit ? '방문 예정만' : '미조치 알림 있는 대상자만'} 보는 중 · <a href="#/admin/people">전체 보기</a></p>` : ''}
        <div id="plist">${rows()}</div>
      </section>`,
    after: () => {
      const q = app.querySelector('[data-input=q]');
      if (list.q && q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
    }
  };
}

// 어르신 요청사항 (통화 대화에서 찾은 요청을 담당자가 등록한 것)
function requestsPage() {
  const d = getData(), today = todayStr();
  const who = id => d.people.find(p => p.id === id);
  const reqs = [...(d.requests || [])].sort((a, b) => (a.status === 'done') - (b.status === 'done') || a.date.localeCompare(b.date));
  actions = { ...shellActions };
  actions.reqDone = el => { const r = d.requests.find(x => x.id === el.dataset.id); r.status = r.status === 'open' ? 'done' : 'open'; save(); render(); };
  return {
    html: `
      <div class="page-title"><h1>대상자 관리</h1><p>미처리 요청 ${reqs.filter(r => r.status === 'open').length}건</p></div>
      ${subnav('requests')}
      <section>
        <div class="sec-head"><h2>어르신 요청사항</h2></div>
        ${reqs.length ? `<table class="rtable">
          <thead><tr><th>날짜</th><th>대상자</th><th>요청 (대상자 말 그대로)</th><th>경과</th><th>상태</th><th></th></tr></thead>
          <tbody>${reqs.map(r => `
            <tr>
              <td data-label="날짜">${mmdd(r.date)}</td>
              <td data-label="대상자"><a href="#/admin/p/${r.personId}/calls?call=${r.callId || ''}">${esc(who(r.personId)?.name || '-')}</a></td>
              <td data-label="요청">"${esc(r.text)}"</td>
              <td data-label="경과">${daysBetween(r.date, today)}일</td>
              <td data-label="상태"><span class="chip ${r.status === 'open' ? 'warn' : ''}">${r.status === 'open' ? '미처리' : '처리 완료'}</span></td>
              <td class="end"><button data-act="reqDone" data-id="${r.id}">${r.status === 'open' ? '완료' : '되돌리기'}</button></td>
            </tr>`).join('')}</tbody>
        </table>` : '<p class="empty">기록 없음</p>'}
      </section>`
  };
}

// 일지 관리: 날짜·작성자·대상자로 걸러 본다
function journalsPage(params) {
  const d = getData();
  const f = { date: params.get('date') || '', author: params.get('author') || '', person: params.get('person') || '' };
  const js = (d.journals || []).filter(j => (!f.date || j.date === f.date) && (!f.author || j.author === f.author) && (!f.person || j.personId === f.person))
    .sort((a, b) => b.date.localeCompare(a.date));
  const authors = [...new Set((d.journals || []).map(j => j.author))];
  actions = { ...shellActions };
  actions.jfilter = () => {
    const q = new URLSearchParams({ view: 'journals' });
    for (const k of ['date', 'author', 'person']) { const v = document.getElementById('jf-' + k).value; if (v) q.set(k, v); }
    location.hash = '#/admin/people?' + q;
  };
  return {
    html: `
      <div class="page-title"><h1>대상자 관리</h1><p>돌봄일지 ${(d.journals || []).length}건</p></div>
      ${subnav('journals')}
      <section>
        <div class="toolbar">
          <label class="check">날짜 <input id="jf-date" type="date" value="${f.date}" data-change="jfilter"></label>
          <label class="check">작성자 <select id="jf-author" data-change="jfilter"><option value="">전체</option>${authors.map(a => `<option ${a === f.author ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select></label>
          <label class="check">대상자 <select id="jf-person" data-change="jfilter"><option value="">전체</option>${d.people.map(p => `<option value="${p.id}" ${p.id === f.person ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
          ${f.date || f.author || f.person ? '<a href="#/admin/people?view=journals">필터 지우기</a>' : ''}
        </div>
        ${js.length ? `<table class="rtable">
          <thead><tr><th>날짜</th><th>대상자</th><th>유형</th><th>작성자</th><th>상태</th><th>평가(A)</th></tr></thead>
          <tbody>${js.map(j => `
            <tr class="click" data-act="openJournal" data-id="${j.id}" data-p="${j.personId}">
              <td data-label="날짜">${mmdd(j.date)}</td>
              <td data-label="대상자"><b>${esc(d.people.find(p => p.id === j.personId)?.name || '-')}</b></td>
              <td data-label="유형">${esc(j.type)}</td>
              <td data-label="작성자">${esc(j.author)}</td>
              <td data-label="상태"><span class="chip ${j.status === 'draft' ? 'warn' : ''}">${j.status === 'draft' ? '초안' : '확정'}</span></td>
              <td data-label="평가" class="muted small">${esc((j.A || '').split('\n')[0].replace(/^- /, ''))}</td>
            </tr>`).join('')}</tbody>
        </table>` : '<p class="empty">검색 결과 없음</p>'}
      </section>`,
    after: () => { actions.openJournal = el => { journalSel = el.dataset.id; location.hash = `#/admin/p/${el.dataset.p}/journal`; }; }
  };
}

// ---------- 대상자 상세 ----------
const TABS = [['summary', '요약'], ['info', '기본 정보'], ['trend', '변화 추이'], ['calls', '통화 기록'], ['visits', '방문 · 요청'], ['journal', '돌봄일지'], ['alerts', '알림']];
const CONDITIONS = ['고혈압', '당뇨병', '이상지질혈증', '심부전', '부정맥', '만성폐쇄성폐질환(COPD)', '천식', '뇌졸중 과거력', '파킨슨병', '우울증', '수면무호흡 진단', '갑상선질환', '만성콩팥병', '관절염', '골다공증'];
const DEVICES = ['안경·돋보기', '틀니', '지팡이', '보행기', '휠체어'];
const JOURNAL_TYPES = ['전화 상담', '방문', '보호자 연락', '기관 연계', '기타'];
const ALERT_LEVEL = { watch: '관찰', caution: '주의', refer: '의뢰' };
let trendOpt = { days: 30, weekly: false, byChange: false, domains: false };
let editSec = null;     // 기본 정보에서 수정 중인 섹션 ('p10:disease')
let openCallId = null;  // 통화 기록에서 펼쳐 둔 통화
let journalSel = null;  // 돌봄일지에서 고른 일지
let notifyOpen = null;  // 보호자 통보 기록을 입력 중인 알림
let closeOpen = false;  // 종결 입력칸 열림

const fmtV = (v, m) => (v == null ? '-' : m.key === 'z' ? v.toFixed(2) : String(Math.round(v * 10) / 10));
const editedText = e => (e ? `최종 수정: ${esc(e.by)} · ${mdot(e.at.slice(0, 10))} ${e.at.slice(11, 16)}` : '');
const telLink = (ph, label = ph) => (ph ? `<a href="tel:${esc(ph.replace(/[^0-9]/g, ''))}">${esc(label)}</a>` : '-');

function personPage([id, tab = 'summary'], params) {
  const d = getData(), s = d.settings, today = todayStr();
  const me = currentAccount();
  const p = d.people.find(x => x.id === id);
  actions = { ...shellActions };
  if (!p) return { html: `<section><p>데이터 없음</p><a href="#/admin/people">대상자 관리</a></section>` };
  if (!TABS.some(([k]) => k === tab)) tab = 'summary';
  const info = p.info || (p.info = {});
  const ai = aiSummary(p, d, today, getNightVitals);
  const r = ai.risk;
  const st = r.signals.status;
  const alerts = d.alerts.filter(a => a.personId === id)
    .sort((a, b) => (a.status === 'closed') - (b.status === 'closed') || b.createdAt.localeCompare(a.createdAt));
  const openCount = alerts.filter(a => a.status !== 'closed').length;
  const pc = primaryContact(p);
  const acuteNow = (info.acute || []).filter(a => a.start <= today && (!a.end || a.end >= today));
  const pause = info.call?.pause;
  const who = me ? displayName(me) : '';

  // 상단 대상자 카드: 위험도·사유 + 주요 만성질환(2개) · 진행 중 급성질환 · 보조기기 · 통화 일시중지
  const chips = [
    riskChip(r.level), !st.base.ready ? '<span class="chip">기저선 형성 중</span>' : '', reasonChips(r.reasons),
    ...(info.conditions || []).slice(0, 2).map(c => `<span class="chip">${esc(c.name)}</span>`),
    ...acuteNow.map(a => `<span class="chip warn">급성: ${esc(a.name)} (${mdot(a.start)}~)</span>`),
    ...(info.devices || []).map(x => `<span class="chip">${esc(x)}</span>`),
    pause?.from && (!pause.to || pause.to >= today) ? `<span class="chip warn">통화 일시중지 ${mdot(pause.from)}~${pause.to ? mdot(pause.to) : ''}</span>` : ''
  ].join('');

  const hero = `
    <div class="hero">
      <div class="hero-top">
        <div class="profile">
          <span class="avatar">${initial(p.name)}</span>
          <div>
            <h1>${esc(p.name)} <span class="sub">${esc(p.sex || '')} · ${p.age ?? '-'}세${info.living ? ' · ' + esc(info.living) : ''}</span>${p.active ? '' : ' <span class="tag">비활성</span>'}</h1>
            <p>${shortAddr(p.address)} · 담당 ${esc(p.manager || '-')}</p>
          </div>
        </div>
        ${pc ? `<div class="contact-card"><small>1순위 비상연락</small><b>${esc(pc.name)} (${esc(pc.relation)})</b>
          <a class="btn call-btn" href="tel:${esc(pc.phone.replace(/[^0-9]/g, ''))}">${icon('phone')}전화</a></div>` : ''}
      </div>
      <div class="chips hero-chips">${chips}</div>
      <div class="stat-row">
        <div><small>종합 케어 스코어</small><b>${r.score ?? '-'}점</b></div>
        <div><small>최근 인지검사</small><b>${pctText(st.lastScore)}</b></div>
        <div><small>최근 z</small><b>${st.base.ready ? (st.lastZ?.toFixed(2) ?? '-') : '기저선 형성 중'}</b></div>
        <div><small>최근 7일 통화 완료</small><b>${r.signals.completion.done}/${r.signals.completion.days}</b></div>
      </div>
    </div>
    <nav class="dtabs">${TABS.map(([k, t]) => `<a class="${k === tab ? 'on' : ''}" href="#/admin/p/${p.id}/${k}">${t}${k === 'alerts' && openCount ? ` <span class="count">${openCount}</span>` : ''}</a>`).join('')}</nav>`;

  const T = tab === 'summary' || tab === 'trend' ? trendAll(d, p, trendOpt, today, getNightVitals) : null;
  const parts = {
    summary: () => summaryTab(p, ai, T),
    info: () => `
      <div class="row info-top">
        <a class="btn primary" href="#/admin/people/new?id=${p.id}">전체 수정</a>
        ${p.closed ? `<span class="chip warn">종결 ${fmtDate(p.closed.date)} · ${esc(p.closed.reason)}</span>`
          : `<button data-act="closeOpen">종결</button>`}
      </div>
      ${closeOpen && !p.closed ? `<form class="book" data-submit="closePerson">
        <label>종결 사유<select name="reason">${CLOSE_REASONS.map(x => `<option>${x}</option>`).join('')}</select></label>
        <label>종결일<input type="date" name="date" value="${today}"></label>
        <button class="primary" type="submit">종결</button>
      </form>` : ''}
      ${infoTab(p)}`,
    visits: () => visitsTab(p),
    trend: () => trendTab(p, T, params.get('m')),
    calls: () => callsTab(p),
    journal: () => journalTab(p),
    alerts: () => `
      <section>
        <div class="sec-head"><h2>알림</h2><span class="muted small">열린 알림 ${openCount}건</span></div>
        ${alerts.map(a => alertCard(a, p)).join('') || '<p class="muted">기록 없음</p>'}
      </section>`
  };
  if (tab === 'calls' && params.get('call')) openCallId = params.get('call');

  // ---- 공통 동작 ----
  const alertOf = el => d.alerts.find(a => a.id === el.dataset.id);
  const callOf = el => d.calls.find(c => c.id === el.dataset.id);
  const saveAndRender = () => { save(); render(); };
  const stamp2 = () => ({ by: who, at: nowStamp() });

  // 알림
  actions.notify = el => { notifyOpen = notifyOpen === el.dataset.id ? null : el.dataset.id; render(); };
  actions.pickContact = el => {
    const c = (info.contacts || [])[+el.value];
    const f = el.closest('form');
    f.name.value = c?.name || ''; f.phone.value = c?.phone || ''; f.relation.value = c?.relation || '';
  };
  actions.saveNotify = f => {
    Object.assign(d.alerts.find(a => a.id === f.dataset.id), { notifiedAt: nowStamp(), notifiedTo: { name: f.name.value.trim(), phone: f.phone.value.trim(), relation: f.relation.value.trim() } });
    notifyOpen = null;
    saveAndRender();
  };
  actions.refer = el => { Object.assign(alertOf(el), { status: 'referred', referredAt: nowStamp() }); saveAndRender(); };
  actions.close = el => { alertOf(el).status = 'closed'; saveAndRender(); };
  actions.outcome = el => { alertOf(el).outcome = el.value || null; save(); };
  actions.note = el => { alertOf(el).note = el.value; save(); };
  actions.check = el => { alertOf(el).checklist[el.dataset.k] = el.checked; save(); };

  // 통화 기록
  actions.play = async (el, e) => {
    e.preventDefault();
    const box = document.getElementById('pl-' + el.dataset.id);
    const blob = await getAudio(callOf(el).audioId);
    box.innerHTML = blob ? `<audio controls autoplay src="${URL.createObjectURL(blob)}"></audio>` : '녹음 파일 없음';
  };
  actions.delAudio = async el => {
    if (!confirm('녹음 삭제 (점수·대화록 유지)')) return;
    const c = callOf(el);
    await deleteAudio(c.audioId);
    c.audioId = null;
    openCallId = c.id;
    saveAndRender();
  };
  actions.score = el => {
    const c = callOf(el), it = c.items[+el.dataset.i];
    it.score = el.value === '' ? null : Math.max(0, Math.min(it.maxScore, +el.value));
    c.scorePct = scorePct(c.items);
    c.edited = stamp2();
    refreshZ(d, p, today);
    evaluate([p.id]);
    openCallId = c.id;
    render();
  };
  actions.addRequest = el => {
    const c = callOf(el);
    d.requests ??= [];
    d.requests.push({ id: 'rq' + Date.now().toString(36), personId: p.id, callId: c.id, date: c.date, text: c.requests[+el.dataset.i], status: 'open', createdAt: nowStamp(), by: who });
    openCallId = c.id;
    saveAndRender();
  };

  // 변화 추이
  actions.topt = el => {
    const k = el.dataset.k, v = el.dataset.v;
    trendOpt = { ...trendOpt, [k]: k === 'days' ? +v : k === 'weekly' ? v === '1' : !trendOpt[k] };
    render();
  };
  actions.metric = el => { location.hash = `#/admin/p/${p.id}/trend?m=${el.dataset.k}`; };
  actions.csv = () => {
    const blob = new Blob([trendCsv(d, p, today, getNightVitals)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `I-ME_${p.name}_지표추이_${today.replace(/-/g, '')}.csv`;
    a.click();
  };

  // 링 데이터
  actions.ringFile = async el => {
    const file = el.files[0];
    if (!file) return;
    try {
      const rec = importRing(d, p.id, file.name, await file.text());
      save();
      alert(`불러오기 완료 · 유효한 밤 ${rec.validNights}, 무효한 밤 ${rec.invalidNights}`);
    } catch (err) {
      alert('불러오기 실패\n' + (err.name === 'QuotaExceededError' ? '브라우저 저장 공간 부족' : err.message));
    }
    render();
  };
  actions.delImport = el => {
    if (!confirm('이 파일의 하룻밤 요약 삭제')) return;
    deleteRingImport(d, el.dataset.id);
    saveAndRender();
  };

  // 등록 정보 (주소·담당자·좌표)
  actions.savePerson = f => {
    const v = n => f[n].value.trim();
    Object.assign(p, {
      name: v('name') || p.name, sex: f.sex.value, age: +v('age') || null, phone: v('phone'),
      preferredTime: v('time'), address: v('address'), manager: v('manager'), lat: parseFloat(v('lat')), lng: parseFloat(v('lng'))
    });
    saveAndRender();
  };

  // 종결: 삭제하지 않고 통화 대상·활성 대상자에서 뺀다
  actions.closeOpen = () => { closeOpen = !closeOpen; render(); };
  actions.closePerson = f => {
    if (!confirm(`${p.name} 종결`)) return;
    p.closed = { reason: f.reason.value, date: f.date.value, by: who };
    p.active = false;
    closeOpen = false;
    saveAndRender();
  };
  actions.reqDone = el => { const q = d.requests.find(x => x.id === el.dataset.id); q.status = q.status === 'open' ? 'done' : 'open'; saveAndRender(); };

  // 기본 정보 섹션 수정
  actions.editSec = el => { editSec = el.dataset.sec ? `${p.id}:${el.dataset.sec}` : null; render(); };
  actions.saveInfo = f => {
    const sec = f.dataset.sec;
    if (!saveInfoSection(p, sec, f)) return;
    info.edited = { ...(info.edited || {}), [sec]: stamp2() };
    editSec = null;
    recomputeRing(d, p.id); // SpO2 기준·보정값·데이터 출처가 바뀌었을 수 있다
    evaluate([p.id]);
    render();
  };

  // 돌봄일지
  actions.selJournal = el => { journalSel = el.dataset.id; render(); };
  actions.newJournal = el => {
    const base = el.dataset.auto ? journalDraft(p, d, today, getNightVitals)
      : { personId: p.id, date: today, type: '전화 상담', status: 'draft', auto: false, S: '', O: '', A: '', P: '' };
    const j = { id: 'j' + Date.now().toString(36), author: who, createdAt: nowStamp(), history: [], ...base };
    d.journals ??= [];
    d.journals.push(j);
    journalSel = j.id;
    saveAndRender();
  };
  const readJournal = () => {
    const g = k => document.getElementById('jn-' + k).value;
    return { date: g('date'), type: g('type'), S: g('S'), O: g('O'), A: g('A'), P: g('P') };
  };
  actions.saveJournal = el => {
    const j = d.journals.find(x => x.id === el.dataset.id);
    const next = readJournal();
    const changed = ['date', 'type', 'S', 'O', 'A', 'P'].some(k => j[k] !== next[k]);
    // 확정 후 수정하면 수정 이력(누가, 언제, 이전 내용)을 남긴다
    if (j.status === 'final' && changed) j.history.push({ ...stamp2(), prev: { date: j.date, type: j.type, S: j.S, O: j.O, A: j.A, P: j.P } });
    Object.assign(j, next);
    if (el.dataset.final) { j.status = 'final'; j.auto = false; j.confirmedBy = who; j.confirmedAt = nowStamp(); }
    saveAndRender();
  };

  return {
    html: hero + parts[tab](),
    after: () => {
      if (tab === 'trend') { drawMetricChart(p, T, params.get('m')); drawPersonChart(p, st, s, today); }
      if (tab === 'calls') {
        app.querySelectorAll('details.crow').forEach(el => el.addEventListener('toggle', () => { if (el.open) openCallId = el.dataset.id; }));
        if (params.get('call')) document.getElementById('call-' + params.get('call'))?.scrollIntoView({ block: 'center' });
      }
    }
  };
}

// ---------- 요약 탭 ----------
function summaryTab(p, ai, T) {
  const d = getData(), s = d.settings, today = todayStr();
  const r = ai.risk, st = r.signals.status;
  const v = nextVisit(p.id);
  return `
    <section class="ai ai-${r.level}">
      <div class="sec-head"><h2>${icon('sparkle')} AI 종합 분석 <span class="muted small">(최근 7일)</span></h2>${riskChip(r.level)}</div>
      <ul class="ai-list">${ai.bullets.map(b => `<li class="${b.off ? 'off' : ''}">${esc(b.text)}</li>`).join('')}</ul>
      <div class="ai-action"><small>권장 조치</small><b>${esc(ai.action)}</b></div>
      <p class="muted small">선별 보조 자료이며 최종 판단은 담당자가 함.</p>
    </section>

    <section>
      <div class="sec-head"><h2>지표별 변화 추이</h2><a class="btn" href="#/admin/p/${p.id}/trend">전체 보기 ${icon('chev')}</a></div>
      ${trendTable(p, T, true)}
    </section>

    <div class="split">
      ${ringCard(p)}
      <section>
        <div class="sec-head"><h2>종합 케어 스코어</h2><b class="score">${r.score ?? '-'}<small>점</small></b></div>
        ${Object.entries(CARE_LABEL).map(([k, [label, w]]) => {
          const val = r.signals.parts[k];
          return `<div class="part"><div class="row"><span>${label} <span class="muted small">가중치 ${w}</span></span><b>${val == null ? '측정 없음' : Math.round(val)}</b></div>
            <div class="bar"><i style="width:${val ?? 0}%;background:${val == null ? 'transparent' : val >= 75 ? 'var(--risk-low)' : val >= 55 ? 'var(--risk-mid)' : 'var(--risk-high)'}"></i></div></div>`;
        }).join('')}
        <p class="muted small">75점 이상 낮음 · 55~74점 주의 · 55점 미만 높음</p>
      </section>
    </div>

    <section>
      <details>
        <summary><h2>등록 정보</h2><span class="muted small">주소 · 담당자 · 위도·경도 · 다음 방문 ${v ? `${fmtDate(v.date)} ${v.startTime} · ${esc(v.purpose)}` : '-'}</span></summary>
        <dl class="info" style="margin-top:14px">
          <dt>주소</dt><dd>${esc(p.address || '-')}</dd>
          <dt>좌표</dt><dd>${p.lat ?? '-'}, ${p.lng ?? '-'}</dd>
          <dt>담당자</dt><dd>${esc(p.manager || '-')}</dd>
          <dt>연락처</dt><dd>${telLink(p.phone)}</dd>
          <dt>등록일</dt><dd>${fmtDate(p.enrolledAt)}</dd>
          <dt>기저선</dt><dd>${st.base.ready ? `${st.base.mean.toFixed(1)}% ± ${st.base.sd.toFixed(1)} (${fmtDate(st.baseStart)} ~ ${fmtDate(st.baseEnd)})` : `형성 중 ${st.base.n}/${s.baselineDays}회`}</dd>
        </dl>
        <form class="form" data-submit="savePerson" style="margin-top:16px">
          <label>이름<input name="name" value="${esc(p.name)}"></label>
          <label>성별<select name="sex">${['여', '남'].map(x => `<option ${p.sex === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
          <label>나이<input name="age" type="number" value="${p.age ?? ''}"></label>
          <label>연락처<input name="phone" value="${esc(p.phone)}"></label>
          <label>통화 시각<input name="time" type="time" value="${esc(p.preferredTime)}"></label>
          <label>주소<input name="address" value="${esc(p.address || '')}"></label>
          <label>담당자<input name="manager" value="${esc(p.manager || '')}"></label>
          <label>위도<input name="lat" type="number" step="any" value="${p.lat ?? ''}"></label>
          <label>경도<input name="lng" type="number" step="any" value="${p.lng ?? ''}"></label>
          <button class="primary" type="submit">저장</button>
        </form>
      </details>
    </section>`;
}

// 야간 생체신호 칸 (링)
function ringCard(p) {
  const d = getData(), s = d.settings, today = todayStr();
  const device = p.info?.device?.source === 'device';
  const thr = spo2Threshold(p);
  let last = null;
  for (let k = 0; k < 60 && !last; k++) { const v = getNightVitals(p.id, addDays(today, -k)); if (v) last = { ...v, date: addDays(today, -k) }; }
  const imports = (d.ringImports || []).filter(i => i.personId === p.id);
  return `
    <section>
      <div class="sec-head"><h2>야간 생체신호 ${device ? '<span class="tag real">실측</span>' : ''}</h2>
        ${thr !== 90 ? `<span class="chip warn">개인 SpO₂ 기준 ${thr}% 적용 중</span>` : ''}</div>
      ${device && !last ? '<p class="wait">링 데이터 없음</p>' : last ? `
        <dl class="info">
          <dt>측정일 (깬 날)</dt><dd>${fmtDate(last.date)} ${isValidNight(last, s) ? '' : '<span class="chip warn">무효한 밤</span>'}</dd>
          <dt>야간 최저 SpO₂</dt><dd>${last.spo2Min ?? '-'}%</dd>
          <dt>${thr}% 미만 시간</dt><dd>${last.spo2BelowMin ?? '-'}분</dd>
          <dt>안정 시 심박</dt><dd>${last.hrRest ?? '-'} bpm</dd>
          <dt>착용 시간</dt><dd>${last.wearHours}시간 · 신호품질 ${last.sqi}</dd>
        </dl>` : '<p class="muted">데이터 없음</p>'}
      ${device ? `
        <label class="btn primary file-btn">${icon('next')}불러오기<input type="file" accept=".csv,text/csv" data-change="ringFile" hidden></label>
        <p class="muted small">CSV 형식: timestamp,hr,spo2,sqi,worn</p>
        ${imports.length ? `<table class="rtable small-table">
          <thead><tr><th>파일</th><th>측정 기간</th><th>샘플</th><th>간격</th><th>유효/무효 밤</th><th>결측</th><th></th></tr></thead>
          <tbody>${imports.map(i => `<tr>
            <td data-label="파일">${esc(i.fileName)}</td><td data-label="측정 기간">${stamp(i.from)} ~ ${stamp(i.to)}</td>
            <td data-label="샘플">${i.samples.toLocaleString()}줄</td><td data-label="간격">${i.intervalSec}초</td>
            <td data-label="유효/무효 밤">${i.validNights} / ${i.invalidNights}</td><td data-label="결측">${i.missingPct}%</td>
            <td class="end"><button data-act="delImport" data-id="${i.id}">삭제</button></td></tr>`).join('')}</tbody>
        </table>` : ''}` : ''}
    </section>`;
}

// ---------- 변화 추이 ----------
function sparkline(t, m) {
  const W = 120, H = 32, today = todayStr();
  const pts = t.series;
  if (!pts.length) return '<span class="muted small">-</span>';
  const from = addDays(today, -(trendOpt.days - 1));
  const vals = pts.map(x => x.value);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (t.baseline) { lo = Math.min(lo, t.baseline.mean - t.sdEff); hi = Math.max(hi, t.baseline.mean + t.sdEff); }
  if (hi === lo) { hi += 1; lo -= 1; }
  const X = dt => 2 + (daysBetween(from, dt) / Math.max(1, trendOpt.days - 1)) * (W - 4);
  const Y = v => H - 3 - ((v - lo) / (hi - lo)) * (H - 6);
  const band = t.baseline ? `<rect x="0" y="${Y(t.baseline.mean + t.sdEff)}" width="${W}" height="${Math.max(1, Y(t.baseline.mean - t.sdEff) - Y(t.baseline.mean + t.sdEff))}" class="sp-band"/>` : '';
  const line = pts.map(x => `${X(x.date).toFixed(1)},${Y(x.value).toFixed(1)}`).join(' ');
  const lastP = pts.at(-1);
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-label="${m.label} 추이">${band}
    <polyline points="${line}" class="sp-line"/><circle cx="${X(lastP.date)}" cy="${Y(lastP.value)}" r="2.5" class="sp-dot"/></svg>`;
}

function trendRow(m, t) {
  const delta = t.delta;
  const cls = delta == null || m.dir === 0 ? 'neu' : delta * m.dir > 0 ? 'good' : delta * m.dir < 0 ? 'bad' : 'neu';
  const deltaHtml = delta == null ? '-' : `<span class="delta ${cls}">${delta > 0 ? '▲ +' : delta < 0 ? '▼ −' : '■ '}${fmtV(Math.abs(delta), m)}</span>`;
  const stCls = { 악화: 'bad', 개선: 'good', 변화: 'neu', 유지: '', '데이터 부족': 'none' }[t.status];
  return `
    <tr class="click ${m.domain ? 'domain-row' : ''}" data-act="metric" data-k="${m.key}">
      <td class="first"><b>${m.label}</b>${t.real ? ' <span class="tag real">실측</span>' : ''} <small class="muted">${m.unit}</small></td>
      <td data-label="최근 7일">${fmtV(t.recent7, m)}</td>
      <td data-label="이전 7일">${fmtV(t.prev7, m)}</td>
      <td data-label="개인 기저선">${t.baseline ? `${fmtV(t.baseline.mean, m)} ± ${fmtV(t.baseline.sd, m)}` : '-'}</td>
      <td data-label="변화">${deltaHtml}</td>
      <td data-label="추이">${sparkline(t, m)}</td>
      <td data-label="상태"><span class="state ${stCls}">${t.status}</span>${t.alertLevel ? ` <span class="badge lv-${t.alertLevel}">${ALERT_LEVEL[t.alertLevel]}</span>` : ''}</td>
    </tr>`;
}

function trendTable(p, T, compact) {
  let ms = TREND_METRICS.filter(m => !m.domain || (!compact && trendOpt.domains));
  if (trendOpt.byChange) ms = [...ms].sort((a, b) => (T[b.key].status === '악화') - (T[a.key].status === '악화') || T[b.key].score - T[a.key].score);
  let group = null;
  const rows = ms.map(m => {
    const head = !trendOpt.byChange && m.group !== group ? `<tr class="group-row"><td colspan="7">${(group = m.group)}</td></tr>` : '';
    return head + trendRow(m, T[m.key]);
  }).join('');
  return `
    <table class="rtable ttable">
      <thead><tr><th>지표</th><th>최근 7일</th><th>이전 7일</th><th>개인 기저선</th><th>변화</th><th>추이 (${trendOpt.days}일${trendOpt.weekly ? ' · 주별' : ''})</th><th>상태</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
`;
}

function trendTab(p, T, mKey) {
  const m = METRIC[mKey];
  const opt = (k, v, t) => `<button data-act="topt" data-k="${k}" data-v="${v}" class="${String(trendOpt[k]) === String(k === 'weekly' ? v === '1' : v) ? 'on' : ''}">${t}</button>`;
  return `
    ${m ? `<section id="bigchart">
      <div class="sec-head"><h2>${m.label}${T[m.key].real ? ' <span class="tag real">실측</span>' : ''}</h2><a class="btn" href="#/admin/p/${p.id}/trend">닫기</a></div>
      <div class="chartbox"><canvas id="metricChart"></canvas></div>
      <p class="trend-line">${esc(trendSentence(m, T[m.key], todayStr()))}</p>
      <p class="muted small">점 = 일별 값 · 선 = 7일 이동평균 · 초록 띠 = 기저선 범위(평균 ± 1표준편차) · 회색 띠 = 급성질환 · 세로 점선 = 약물 변경 · 빗금 = 통화 일시중지 · ▲ = 방문${m.kind === 'call' && m.key !== 'completion' ? ' · 점을 누르면 그날 통화로 이동' : ''}</p>
    </section>` : ''}
    <section>
      <div class="sec-head"><h2>지표별 변화 추이</h2><button data-act="csv">내보내기</button></div>
      <div class="toolbar">
        <div class="seg">${opt('days', 14, '14일')}${opt('days', 30, '30일')}${opt('days', 90, '90일')}</div>
        <div class="seg">${opt('weekly', '0', '일별')}${opt('weekly', '1', '주별')}</div>
        <button data-act="topt" data-k="byChange" class="${trendOpt.byChange ? 'on' : ''}">변화 큰 순</button>
        <button data-act="topt" data-k="domains" class="${trendOpt.domains ? 'on' : ''}">영역별 보기</button>
      </div>
      ${trendTable(p, T, false)}
    </section>
    <section>
      <div class="sec-head"><h2>겹쳐 보기 · 인지 z · 야간 SpO₂ · 안정 시 심박</h2></div>
      <div class="chartbox"><canvas id="personChart"></canvas></div>
    </section>`;
}

// 한 지표의 큰 그래프: 일별 점 + 7일 이동평균 + 기저선 띠 + 사건
function drawMetricChart(p, T, mKey) {
  const m = METRIC[mKey];
  if (!m || !window.Chart) return;
  const d = getData(), today = todayStr(), t = T[m.key];
  const labels = [...Array(trendOpt.days)].map((_, i) => addDays(today, i - trendOpt.days + 1));
  const byDate = new Map(t.daily.map(x => [x.date, x]));
  const vals = labels.map(dt => byDate.get(dt)?.value ?? null);
  const ma = labels.map(dt => {
    const w = t.daily.filter(x => x.date <= dt && x.date >= addDays(dt, -6));
    return w.length ? w.reduce((a, x) => a + x.value, 0) / w.length : null;
  });
  const events = personEvents(p, d);
  const idx = dt => labels.indexOf(dt < labels[0] ? labels[0] : dt > today ? today : dt);
  const hatch = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 8;
    const g = c.getContext('2d'); g.strokeStyle = 'rgba(90,95,92,0.35)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, 8); g.lineTo(8, 0); g.stroke();
    return g.createPattern(c, 'repeat');
  })();
  const deco = {
    id: 'deco',
    beforeDatasetsDraw(chart) {
      const { ctx, chartArea: a, scales: { x, y } } = chart;
      const px = i => x.getPixelForValue(i);
      const half = labels.length > 1 ? (px(1) - px(0)) / 2 : 4;
      ctx.save();
      if (t.baseline) { // 기저선 범위 띠
        ctx.fillStyle = 'rgba(0,117,74,0.1)';
        const y1 = y.getPixelForValue(t.baseline.mean + t.sdEff), y2 = y.getPixelForValue(t.baseline.mean - t.sdEff);
        ctx.fillRect(a.left, Math.max(a.top, y1), a.right - a.left, Math.min(a.bottom, y2) - Math.max(a.top, y1));
      }
      ctx.font = '600 11px sans-serif';
      for (const e of events) {
        const end = e.end || today;
        if (end < labels[0] || e.start > today) continue;
        const x1 = px(idx(e.start)) - half, x2 = px(idx(end)) + half;
        if (e.type === '급성질환') { ctx.fillStyle = 'rgba(90,95,92,0.14)'; ctx.fillRect(x1, a.top, x2 - x1, a.bottom - a.top); ctx.fillStyle = '#5a5f5c'; ctx.fillText(e.label, x1 + 4, a.top + 12); }
        if (e.type === '통화 일시중지') { ctx.fillStyle = hatch; ctx.fillRect(x1, a.top, x2 - x1, a.bottom - a.top); ctx.fillStyle = '#5a5f5c'; ctx.fillText('통화 일시중지', x1 + 4, a.top + 26); }
        if (e.type === '약물 변경' && e.start >= labels[0]) {
          const xx = px(idx(e.start));
          ctx.strokeStyle = '#8b908d'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(xx, a.top); ctx.lineTo(xx, a.bottom); ctx.stroke(); ctx.setLineDash([]);
          ctx.fillStyle = '#5a5f5c'; ctx.fillText(e.label, xx + 4, a.top + 40);
        }
        if (e.type === '방문' && e.start >= labels[0]) {
          const xx = px(idx(e.start));
          ctx.fillStyle = '#1e3932'; ctx.beginPath(); ctx.moveTo(xx, a.bottom - 12); ctx.lineTo(xx - 6, a.bottom - 2); ctx.lineTo(xx + 6, a.bottom - 2); ctx.closePath(); ctx.fill();
        }
      }
      ctx.restore();
    }
  };
  const clickable = m.kind === 'call' && m.key !== 'completion';
  const callSummary = dt => {
    const e = byDate.get(dt);
    const c = e?.callId && d.calls.find(x => x.id === e.callId);
    if (!c) return [];
    const wrong = c.items.filter(i => i.score != null && i.score < i.maxScore).map(i => `${i.domain} ${i.score}/${i.maxScore}`);
    return [`점수 ${pctText(c.scorePct)}${c.z != null ? ` (z ${c.z})` : ''}`, wrong.length ? `틀린 문항: ${wrong.join(', ')}` : '틀린 문항 없음'];
  };
  charts.push(new Chart(document.getElementById('metricChart'), {
    type: 'line',
    data: {
      labels: labels.map(dt => mmdd(dt)),
      datasets: [
        { label: '일별', data: vals, showLine: false, pointRadius: 4, pointHoverRadius: 6, pointBackgroundColor: C.green, pointBorderColor: '#fff', pointBorderWidth: 1.5 },
        { label: '7일 이동평균', data: ma, borderColor: C.blue, borderWidth: 2, pointRadius: 0, cubicInterpolationMode: 'monotone', spanGaps: true }
      ]
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: false, axis: 'x' },
      plugins: {
        legend: { position: 'top', align: 'end' },
        tooltip: { callbacks: { afterBody: items => (clickable && items[0] ? callSummary(labels[items[0].dataIndex]) : []) } }
      },
      onClick: (e, els) => {
        if (!clickable || !els.length) return;
        const c = byDate.get(labels[els[0].index]);
        if (c?.callId) location.hash = `#/admin/p/${p.id}/calls?call=${c.callId}`;
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 12 } },
        y: { grid: { color: C.grid }, border: { display: false }, title: { display: !!m.unit, text: m.unit },
          suggestedMin: t.baseline ? t.baseline.mean - 2 * t.sdEff : undefined, suggestedMax: t.baseline ? t.baseline.mean + 2 * t.sdEff : undefined }
      }
    },
    plugins: [deco]
  }));
}

// ---------- 통화 기록 ----------
function callsTab(p) {
  const d = getData();
  const calls = d.calls.filter(c => c.personId === p.id).sort((a, b) => (b.date + b.startedAt).localeCompare(a.date + a.startedAt));
  return `
    <section>
      <div class="sec-head"><h2>통화 기록</h2><span class="muted small">${calls.length}건 · 줄을 누르면 대화록</span></div>
      ${calls.map(c => callRow(c, p)).join('') || '<p class="muted">기록 없음</p>'}
    </section>`;
}

const nospace = t => (t || '').replace(/\s+/g, '');
function expectedHtml(c, it) {
  const ok = (text, good) => `<span class="ans ${good ? 'hit' : 'miss'}">${esc(text)}</span>`;
  if (it.key === 'register' || it.key === 'recall') return it.expected.split(', ').map(w => ok(w, nospace(it.answer).includes(w))).join(' ');
  if (it.key === 'orientation') {
    const parts = orientationParts(c.date, it.answer || '');
    const [m, dd, w] = it.expected.split(' ');
    return [ok(m, parts.month), ok(dd, parts.day), ok(w, parts.weekday)].join(' ');
  }
  if (it.key === 'fluency') return `${ok(`동물 ${countAnimals(it.answer)}개`, it.score >= it.maxScore)} <span class="muted small">(15개 이상 만점)</span>`;
  return ok(it.expected, it.score === it.maxScore);
}

function callRow(c, p) {
  const d = getData();
  const t = ms => (ms == null ? '' : mmss(ms / 1000));
  const asks = c.items.reduce((a, i) => a + (i.repeatAsked || 0), 0);
  const registered = text => (d.requests || []).some(r => r.callId === c.id && r.text === text);
  const bubbleQ = (q, tag) => `<div class="bubble app">${tag ? `<small>${esc(tag)}</small>` : ''}${esc(q)}</div>`;
  const bubbleA = (a, extra = '') => `<div class="bubble me">${a ? esc(a) : '<span class="muted">받아쓰기 없음</span>'}${extra}</div>`;
  const SV = { good: '잘 잠', poor: '잠을 설침' }, MV = { good: '좋음', normal: '보통', bad: '나쁨' };
  return `
    <details class="crow" id="call-${c.id}" data-id="${c.id}" ${openCallId === c.id ? 'open' : ''}>
      <summary>
        <span class="date">${mdot(c.date)} ${esc(c.time || (c.startedAt || '').slice(11, 16))}</span>
        <span class="st st-${c.status}">${CALL_STATUS[c.status]}</span>
        ${c.status === 'missed' ? '' : `
          <span>점수 <b>${pctText(c.scorePct)}</b>${c.z != null ? ` <span class="muted">(z ${c.z})</span>` : ''}</span>
          <span class="muted">${mmss(c.durationSec)}</span>
          <span class="muted">재질문 ${asks}회</span>`}
        ${c.source === 'real' ? '<span class="tag real">실측</span>' : ''}
        ${c.edited ? '<span class="tag">수정됨</span>' : ''}
        ${c.audioId ? `<button data-act="play" data-id="${c.id}">${icon('play')}재생</button>` : ''}
      </summary>
      <div id="pl-${c.id}"></div>
      ${c.status === 'missed' ? '<p class="muted">무응답</p>' : `
      <div class="convo">
        ${c.items.map((it, i) => `
          <div class="qa">
            ${bubbleQ(it.question, it.domain)}
            ${bubbleA(it.answer)}
            <div class="grade">
              <span>정답 ${expectedHtml(c, it)}</span>
              <span>점수 <input type="number" min="0" max="${it.maxScore}" step="any" value="${it.score ?? ''}" data-change="score" data-id="${c.id}" data-i="${i}"> / ${it.maxScore}</span>
              <span class="muted">응답 지연 ${it.latencySec ?? '-'}초${it.repeatAsked ? ` · 재질문 ${it.repeatAsked}회` : ''}${it.startMs != null ? ` · 녹음 ${t(it.startMs)}~${t(it.endMs)}` : ''}</span>
            </div>
          </div>`).join('')}
        ${c.selfReport ? `
          <div class="qa">${bubbleQ(SELF_QUESTIONS.sleep, '자기보고 · 수면')}${bubbleA(c.selfReport.sleep?.answer, ` <span class="chip">${SV[c.selfReport.sleep?.value] || ''}</span>`)}</div>
          ${c.selfReport.mood ? `<div class="qa">${bubbleQ(SELF_QUESTIONS.mood, '자기보고 · 기분')}${bubbleA(c.selfReport.mood.answer, ` <span class="chip">${MV[c.selfReport.mood.value] || ''}</span>`)}</div>` : ''}` : ''}
        ${c.chat ? `<div class="qa">${bubbleQ(c.chat.question, '안부 대화 · 채점 안 함')}${bubbleA(c.chat.answer)}</div>` : ''}
        ${c.requests?.length ? `<div class="reqs"><b>대화에서 찾은 요청</b>${c.requests.map((q, i) => `
          <div class="row">"${esc(q)}" ${registered(q) ? '<span class="chip">등록됨</span>' : `<button data-act="addRequest" data-id="${c.id}" data-i="${i}">요청 등록</button>`}</div>`).join('')}</div>` : ''}
        ${c.edited ? `<p class="muted small">수정됨 · ${esc(c.edited.by)} · ${mdot(c.edited.at.slice(0, 10))} ${c.edited.at.slice(11, 16)}</p>` : ''}
        ${c.audioId ? `<p><button data-act="delAudio" data-id="${c.id}">${icon('trash')}녹음 삭제</button></p>` : ''}
      </div>`}
    </details>`;
}

// ---------- 방문 · 요청 탭 ----------
function visitsTab(p) {
  const d = getData();
  const vs = d.visits.filter(v => v.personId === p.id).sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime));
  const reqs = (d.requests || []).filter(r => r.personId === p.id).sort((a, b) => b.date.localeCompare(a.date));
  return `
    <section>
      <div class="sec-head"><h2>방문</h2>${p.active ? `<button class="primary" data-act="openVisit" data-p="${p.id}">방문 등록</button>` : ''}</div>
      ${vs.length ? vs.map(v => `
        <div class="dayrow st-${v.status}" data-act="openVisit" data-v="${v.id}">
          <b class="time">${fmtDateW(v.date)} ${visitLine(v)}</b>
          <span>${esc(v.type)} · ${esc(v.visitor)}</span>
          <span class="small">${esc(v.purpose || '')}${v.resultNote ? ` · 결과: ${esc(v.resultNote)}` : ''}${v.cancelReason ? ` · 취소 사유: ${esc(v.cancelReason)}` : ''}</span>
          <span class="chip ${v.status === 'canceled' ? 'warn' : ''}">${VISIT_STATUS[v.status]}</span>
        </div>`).join('') : '<p class="muted">일정 없음</p>'}
    </section>
    <section>
      <div class="sec-head"><h2>어르신 요청사항</h2></div>
      ${reqs.length ? reqs.map(r => `
        <div class="dayrow">
          <b class="time">${mdot(r.date)}</b><span>"${esc(r.text)}"</span>
          <span class="chip ${r.status === 'open' ? 'warn' : ''}">${r.status === 'open' ? '미처리' : '처리 완료'}</span>
          <button data-act="reqDone" data-id="${r.id}">${r.status === 'open' ? '완료' : '되돌리기'}</button>
        </div>`).join('') : '<p class="muted">기록 없음</p>'}
    </section>`;
}

// ---------- 기본 정보 탭 ----------
// 기본 정보 탭. form=true면 섹션 입력칸만 fieldset으로 돌려준다 (대상자 추가·전체 수정 화면이 재사용)
function infoTab(p, form = false) {
  const i = p.info || {};
  const c = i.call || {};
  const sec = (key, title, view, edit) => {
    if (form) return `<fieldset class="fsec info-edit" data-sec="${key}">${edit}</fieldset>`;
    const editing = editSec === `${p.id}:${key}`;
    return `
      <section class="infosec">
        <div class="sec-head"><h2>${title}</h2>
          ${editing ? '' : `<button data-act="editSec" data-sec="${key}">수정</button>`}</div>
        ${editing ? `<form class="info-edit" data-submit="saveInfo" data-sec="${key}" novalidate>${edit}
            <div class="row"><button class="primary" type="submit">저장</button><button type="button" data-act="editSec">취소</button></div></form>` : view}
        <p class="muted small edited">${editedText(i.edited?.[key])}</p>
      </section>`;
  };
  const opts = (list, v) => list.map(x => `<option ${x === v ? 'selected' : ''}>${x}</option>`).join('');
  const today = todayStr();

  const custom = (i.conditions || []).filter(x => !CONDITIONS.includes(x.name));
  const disease = sec('disease', '① 질환·복용약', `
      <p class="muted small">기존 병력 기록 (앱 판정 아님)</p>
      <h3>만성질환</h3><div class="chips">${(i.conditions || []).map(x => `<span class="chip">${esc(x.name)}${x.year ? ` (${x.year})` : ''}</span>`).join('') || '<span class="muted">없음</span>'}</div>
      <h3>급성질환·입원</h3>${(i.acute || []).length ? `<ul class="plain">${i.acute.map(a => `<li><b>${esc(a.name)}</b> · ${fmtDate(a.start)} ~ ${a.end ? fmtDate(a.end) : '<b>진행 중</b>'}${a.hospitalized ? ' · 입원' : ''}${a.memo ? ` · ${esc(a.memo)}` : ''}</li>`).join('')}</ul>` : '<p class="muted">없음</p>'}
      <h3>복용약</h3>${(i.meds || []).length ? `<table class="rtable small-table"><thead><tr><th>약 이름</th><th>용법</th><th>시작일</th><th>최근 변경일</th><th>변경 사유</th></tr></thead><tbody>${i.meds.map(m => `
        <tr><td class="first"><b>${esc(m.name)}</b></td><td data-label="용법">${esc(m.dose)}</td><td data-label="시작일">${fmtDate(m.start)}</td>
        <td data-label="최근 변경일">${fmtDate(m.changed)}${m.changed && m.changed >= addDays(today, -13) ? ' <span class="chip warn">최근 14일</span>' : ''}</td><td data-label="변경 사유">${esc(m.reason || '-')}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">없음</p>'}`, `
      <p class="muted small">기존 병력 기록 (앱 판정 아님)</p>
      <h3>만성질환 <span class="muted small">(진단 연도 선택)</span></h3>
      <div class="cond-grid">${CONDITIONS.map(n => { const x = (i.conditions || []).find(y => y.name === n); return `
        <label class="check"><input type="checkbox" name="cond" value="${n}" ${x ? 'checked' : ''}> ${n}<input class="year" name="year-${n}" type="number" placeholder="연도" value="${x?.year || ''}"></label>`; }).join('')}</div>
      <label>직접 입력 <span class="muted small">예: 통풍(2020), 전립선비대</span><input name="custom" value="${esc(custom.map(x => x.name + (x.year ? `(${x.year})` : '')).join(', '))}"></label>
      <h3>급성질환·입원 <span class="muted small">종료일을 비우면 진행 중</span></h3>
      ${[...(i.acute || []), {}].map(a => `<div class="rowform" data-row="acute">
        <input name="a-name" placeholder="병명" value="${esc(a.name || '')}"><input name="a-start" type="date" value="${a.start || ''}"><input name="a-end" type="date" value="${a.end || ''}">
        <label class="check"><input type="checkbox" name="a-hosp" ${a.hospitalized ? 'checked' : ''}> 입원</label><input name="a-memo" placeholder="메모" value="${esc(a.memo || '')}"></div>`).join('')}
      <h3>복용약 <span class="muted small">이름을 지우면 삭제</span></h3>
      ${[...(i.meds || []), {}].map(m => `<div class="rowform" data-row="med">
        <input name="m-name" placeholder="약 이름" value="${esc(m.name || '')}"><input name="m-dose" placeholder="용법" value="${esc(m.dose || '')}">
        <label>시작일<input name="m-start" type="date" value="${m.start || ''}"></label><label>최근 변경일<input name="m-changed" type="date" value="${m.changed || ''}"></label>
        <input name="m-reason" placeholder="변경 사유 (선택)" value="${esc(m.reason || '')}"></div>`).join('')}`);

  const hear = (i.devices || []).find(x => x.startsWith('보청기'));
  const body = sec('body', '② 보조기기·신체 상태', `
      <dl class="info">
        <dt>보조기기</dt><dd>${(i.devices || []).map(esc).join(', ') || '없음'}</dd>
        <dt>청력</dt><dd>${esc(i.hearing || '-')}</dd><dt>시력</dt><dd>${esc(i.vision || '-')}</dd>
        <dt>발음·말하기</dt><dd>${esc(i.speech || '-')}</dd><dt>거동</dt><dd>${esc(i.mobility || '-')}</dd>
        <dt>거주 형태</dt><dd>${esc(i.living || '-')}</dd><dt>메모</dt><dd>${esc(i.bodyMemo || '-')}</dd>
      </dl>`, `
      <h3>보조기기</h3>
      <div class="cond-grid">
        <label class="check"><input type="checkbox" name="hearing-aid" ${hear ? 'checked' : ''}> 보청기
          <select name="hearing-side">${opts(['좌측', '우측', '양측'], hear?.split(' ')[1] || '양측')}</select></label>
        ${DEVICES.map(x => `<label class="check"><input type="checkbox" name="dev" value="${x}" ${(i.devices || []).includes(x) ? 'checked' : ''}> ${x}</label>`).join('')}
        <label class="check">기타 <input name="dev-etc" value="${esc((i.devices || []).filter(x => !x.startsWith('보청기') && !DEVICES.includes(x)).join(', '))}"></label>
      </div>
      <div class="form">
        <label>청력<select name="hearing">${opts(['정상', '경도 저하', '중등도 이상'], i.hearing)}</select></label>
        <label>시력<select name="vision">${opts(['정상', '저하', '심한 저하'], i.vision)}</select></label>
        <label>발음·말하기<select name="speech">${opts(['정상', '약간 어눌함', '의사소통 어려움'], i.speech)}</select></label>
        <label>거동<select name="mobility">${opts(['독립', '부분 도움', '대부분 도움', '와상'], i.mobility)}</select></label>
        ${form ? '' : `<label>거주 형태<select name="living">${opts(['독거', '부부', '자녀 동거', '기타'], i.living)}</select></label>`}
      </div>
      <label>메모<textarea name="memo">${esc(i.bodyMemo || '')}</textarea></label>`);

  const DAYS = '일월화수목금토';
  const callSec = sec('call', '③ AI 통화 맞춤 설정', `
      <dl class="info">
        <dt>호칭</dt><dd>${esc(c.title || '-')}</dd>
        <dt>통화 시각·요일</dt><dd>${esc(p.preferredTime)} (±1시간) · ${(c.days || []).length === 7 ? '매일' : (c.days || []).map(k => DAYS[k]).join('·')}</dd>
        <dt>첫 통화일</dt><dd>${fmtDate(c.firstCall)}</dd>
        <dt>말 속도</dt><dd>${c.rate ?? 0.9}</dd><dt>질문 다시 읽기</dt><dd>최대 ${c.rereads ?? 1}회</dd>
        <dt>무응답 재발신</dt><dd>${c.retry?.count ?? 0}회 · ${c.retry?.interval ?? 30}분 간격</dd>
        <dt>자기보고 질문</dt><dd>${c.selfReport === false ? '끔' : '켬 (수면·기분)'}</dd>
        <dt>통화 일시중지</dt><dd>${c.pause?.from ? `${fmtDate(c.pause.from)} ~ ${c.pause.to ? fmtDate(c.pause.to) : '종료일 미정'} · ${esc(c.pause.reason || '')}` : '없음'}</dd>
        <dt>SpO₂ 알림 기준</dt><dd>${c.spo2Threshold ?? 90}%${(c.spo2Threshold ?? 90) !== 90 ? ' <span class="chip warn">개인 기준 적용 중</span>' : ''}</dd>
      </dl>
`, `
      <div class="form">
        <label>호칭<input name="title" value="${esc(c.title || '')}" placeholder="윤병훈 어르신"></label>
        <label>통화 시각 (±1시간)<input name="time" type="time" value="${esc(p.preferredTime)}"></label>
        <label>말 속도<select name="rate">${opts(['0.7', '0.8', '0.9', '1.0'], String(c.rate ?? 0.9).replace(/^1$/, '1.0'))}</select></label>
        <label>질문 다시 읽기 허용<select name="rereads">${opts(['0', '1', '2'], String(c.rereads ?? 1))}</select></label>
        <label>무응답 재발신<select name="retry">${opts(['0', '1', '2', '3'], String(c.retry?.count ?? 0))}</select></label>
        <label>재발신 간격 (분)<select name="interval">${opts(['10', '30', '60'], String(c.retry?.interval ?? 30))}</select></label>
        <label>자기보고 질문 (수면·기분)<select name="self">${opts(['켬', '끔'], c.selfReport === false ? '끔' : '켬')}</select></label>
        <label>SpO₂ 알림 기준 (%)<input name="spo2" type="number" step="1" min="80" max="95" value="${c.spo2Threshold ?? 90}"></label>
        <label>첫 통화일<input name="firstCall" type="date" value="${c.firstCall || ''}"></label>
      </div>
      <h3>통화 요일</h3><div class="chips">${[...DAYS].map((x, k) => `<label class="check"><input type="checkbox" name="day" value="${k}" ${(c.days || [0, 1, 2, 3, 4, 5, 6]).includes(k) ? 'checked' : ''}> ${x}</label>`).join('')}</div>
      <h3>통화 일시중지 <span class="muted small">발신 대상일에서 제외</span></h3>
      <div class="form">
        <label>시작일<input name="p-from" type="date" value="${c.pause?.from || ''}"></label>
        <label>종료일<input name="p-to" type="date" value="${c.pause?.to || ''}"></label>
        <label>사유<input name="p-reason" list="pause-reasons" value="${esc(c.pause?.reason || '')}"></label>
      </div>
      <datalist id="pause-reasons"><option value="입원"><option value="가족 방문"><option value="여행"></datalist>
`);

  const ph = (name, v, key) => `<input name="${name}" value="${esc(v || '')}" placeholder="010-0000-0000"><small class="err" data-err="${key}"></small>`;
  const contacts = [...(i.contacts || [])].sort((a, b) => a.priority - b.priority);
  const contactSec = sec('contacts', '④ 응급 연락처', `
      <h3>보호자·비상연락처</h3>
      ${contacts.length ? `<table class="rtable small-table"><thead><tr><th>이름</th><th>관계</th><th>전화</th><th>우선순위</th><th>주의 단계 알림 통보</th></tr></thead><tbody>${contacts.map(x => `
        <tr><td class="first"><b>${esc(x.name)}</b></td><td data-label="관계">${esc(x.relation)}</td><td data-label="전화">${telLink(x.phone)}</td>
        <td data-label="우선순위">${x.priority}순위</td><td data-label="통보">${x.consent ? '동의' : '<span class="chip warn">통보 미동의</span>'}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">없음</p>'}
      <dl class="info" style="margin-top:12px">
        <dt>주 이용 의료기관</dt><dd>${esc(i.clinic?.name || '-')} · ${telLink(i.clinic?.phone)}</dd>
        <dt>보건지소</dt><dd>${esc(i.agencies?.center?.name || '-')} · ${telLink(i.agencies?.center?.phone)}</dd>
        <dt>치매안심센터</dt><dd>${esc(i.agencies?.dementia?.name || '-')} · ${telLink(i.agencies?.dementia?.phone)}</dd>
      </dl>`, `
      <h3>보호자·비상연락처 <span class="muted small">이름을 지우면 삭제 · 전화는 숫자와 하이픈만, 10~11자리</span></h3>
      ${[...contacts, {}].map((x, k) => `<div class="rowform" data-row="contact">
        <input name="c-name" placeholder="이름" value="${esc(x.name || '')}"><input name="c-rel" placeholder="관계 (아들, 이웃…)" value="${esc(x.relation || '')}">
        <span>${ph('c-phone', x.phone, 'c' + k)}</span>
        <select name="c-pri">${opts(['1', '2', '3'], String(x.priority || Math.min(3, k + 1)))}</select>
        <label class="check"><input type="checkbox" name="c-consent" ${x.consent ? 'checked' : ''}> 주의 단계 알림 통보 동의</label></div>`).join('')}
      <div class="form">
        <label>주 이용 의료기관<input name="clinic" value="${esc(i.clinic?.name || '')}"></label><label>전화${ph('clinic-phone', i.clinic?.phone, 'clinic')}</label>
        <label>보건지소<input name="center" value="${esc(i.agencies?.center?.name || '')}"></label><label>전화${ph('center-phone', i.agencies?.center?.phone, 'center')}</label>
        <label>치매안심센터<input name="dementia" value="${esc(i.agencies?.dementia?.name || '')}"></label><label>전화${ph('dementia-phone', i.agencies?.dementia?.phone, 'dementia')}</label>
      </div>`);

  const dv = i.device || {};
  const deviceSec = sec('device', '⑤ 웨어러블 기기', `
      <dl class="info">
        <dt>기기 이름</dt><dd>${esc(dv.name || '-')}</dd>
        <dt>데이터 출처</dt><dd>${{ device: '기기 (링 실측)', mock: '모의', none: '기기 없음' }[dv.source] || '기기 없음'}</dd>
        <dt>시계 보정</dt><dd>${dv.clockOffsetMin || 0}분</dd><dt>SpO₂ 보정</dt><dd>${dv.spo2OffsetPct || 0}%p</dd>
      </dl>`, `
      <div class="form">
        <label>기기 이름<input name="dname" value="${esc(dv.name || '')}"></label>
        <label>데이터 출처<select name="source"><option value="none" ${dv.source === 'none' ? 'selected' : ''}>기기 없음</option><option value="mock" ${dv.source === 'mock' ? 'selected' : ''}>모의</option><option value="device" ${dv.source === 'device' ? 'selected' : ''}>기기</option></select></label>
        <label>시계 보정 (분)<input name="clock" type="number" step="1" value="${dv.clockOffsetMin || 0}"></label>
        <label>SpO₂ 보정 (%p)<input name="so" type="number" step="0.1" value="${dv.spo2OffsetPct || 0}"></label>
      </div>
`);

  const tests = i.tests || [];
  const testSec = sec('tests', '⑥ 대면 인지검사 기록', tests.length ? `<table class="rtable small-table"><thead><tr><th>검사일</th><th>종류</th><th>점수</th><th>검사자</th></tr></thead><tbody>${tests.map(t => `
      <tr><td class="first"><b>${fmtDate(t.date)}</b></td><td data-label="종류">${esc(t.kind)}</td><td data-label="점수">${esc(t.score)}</td><td data-label="검사자">${esc(t.examiner || '')}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">기록 없음</p>', `
      <h3>대면 인지검사 <span class="muted small">종류를 비우면 삭제</span></h3>
      ${[...tests, {}].map(t => `<div class="rowform" data-row="test">
        <select name="t-kind"><option value="">종류</option>${opts(['CIST', 'MMSE-DS', '기타'], t.kind)}</select>
        <input name="t-score" type="number" step="any" placeholder="점수" value="${t.score ?? ''}">
        <label>검사일<input name="t-date" type="date" value="${t.date || ''}"></label>
        <input name="t-examiner" placeholder="검사자" value="${esc(t.examiner || '')}"></div>`).join('')}`);
  if (form) return { disease, body, call: callSec, contacts: contactSec, device: deviceSec, tests: testSec };
  return disease + body + callSec + contactSec + deviceSec + testSec;
}

// 섹션 저장. 전화번호 형식이 틀리면 false.
function saveInfoSection(p, sec, f) {
  const i = p.info;
  const F = n => f.querySelector(`[name="${n}"]`); // 섹션(폼 또는 fieldset) 안에서 찾는다
  const rows = name => [...f.querySelectorAll(`[data-row=${name}]`)];
  const val = (el, n) => el.querySelector(`[name=${n}]`)?.value.trim() || '';
  if (sec === 'disease') {
    const conds = [...f.querySelectorAll('[name=cond]:checked')].map(x => ({ name: x.value, year: +F(`year-${x.value}`).value || null }));
    for (const part of F('custom').value.split(',').map(x => x.trim()).filter(Boolean)) {
      const m = part.match(/^(.*?)\s*\((\d{4})\)$/);
      conds.push({ name: m ? m[1] : part, year: m ? +m[2] : null });
    }
    i.conditions = conds;
    i.acute = rows('acute').filter(el => val(el, 'a-name')).map(el => ({
      name: val(el, 'a-name'), start: val(el, 'a-start'), end: val(el, 'a-end'), hospitalized: el.querySelector('[name=a-hosp]').checked, memo: val(el, 'a-memo')
    }));
    i.meds = rows('med').filter(el => val(el, 'm-name')).map(el => ({
      name: val(el, 'm-name'), dose: val(el, 'm-dose'), start: val(el, 'm-start'), changed: val(el, 'm-changed'), reason: val(el, 'm-reason')
    }));
  }
  if (sec === 'body') {
    const dev = [...f.querySelectorAll('[name=dev]:checked')].map(x => x.value);
    if (F('hearing-aid').checked) dev.unshift(`보청기 ${F('hearing-side').value}`);
    dev.push(...F('dev-etc').value.split(',').map(x => x.trim()).filter(Boolean));
    Object.assign(i, { devices: dev, hearing: F('hearing').value, vision: F('vision').value, speech: F('speech').value, mobility: F('mobility').value, bodyMemo: F('memo').value.trim() });
    if (F('living')) i.living = F('living').value;
  }
  if (sec === 'call') {
    const from = F('p-from').value;
    i.call = {
      ...i.call, title: F('title').value.trim(), rate: +F('rate').value, rereads: +F('rereads').value,
      retry: { count: +F('retry').value, interval: +F('interval').value }, selfReport: F('self').value === '켬',
      days: [...f.querySelectorAll('[name=day]:checked')].map(x => +x.value),
      pause: from ? { from, to: F('p-to').value, reason: F('p-reason').value.trim() } : null,
      spo2Threshold: +F('spo2').value || 90, firstCall: F('firstCall').value
    };
    p.preferredTime = F('time').value;
  }
  if (sec === 'contacts') {
    const errs = {};
    const check = (v, key) => { if (v && !validPhone(v)) errs[key] = '숫자와 하이픈만, 10~11자리'; };
    const cs = rows('contact').map((el, k) => {
      const c = { name: val(el, 'c-name'), relation: val(el, 'c-rel'), phone: val(el, 'c-phone'), priority: +val(el, 'c-pri'), consent: el.querySelector('[name=c-consent]').checked };
      if (c.name) check(c.phone, 'c' + k);
      return c;
    }).filter(c => c.name);
    for (const k of ['clinic', 'center', 'dementia']) check(F(`${k}-phone`).value.trim(), k);
    f.querySelectorAll('[data-err]').forEach(el => { el.textContent = errs[el.dataset.err] || ''; });
    if (Object.keys(errs).length) return false;
    i.contacts = cs;
    i.clinic = { name: F('clinic').value.trim(), phone: F('clinic-phone').value.trim() };
    i.agencies = { center: { name: F('center').value.trim(), phone: F('center-phone').value.trim() }, dementia: { name: F('dementia').value.trim(), phone: F('dementia-phone').value.trim() } };
    p.guardianPhone = primaryContact(p)?.phone || '';
  }
  if (sec === 'tests') {
    i.tests = rows('test').filter(el => val(el, 't-kind')).map(el => ({ kind: val(el, 't-kind'), score: val(el, 't-score'), date: val(el, 't-date'), examiner: val(el, 't-examiner') }));
  }
  if (sec === 'device') i.device = { name: F('dname').value.trim(), source: F('source').value, clockOffsetMin: +F('clock').value || 0, spo2OffsetPct: +F('so').value || 0 };
  return true;
}

// ---------- 돌봄일지 ----------
function journalTab(p) {
  const d = getData();
  const js = (d.journals || []).filter(j => j.personId === p.id).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const sel = js.find(j => j.id === journalSel) || js.find(j => j.status === 'draft') || null;
  const ta = (k, label, hint) => `<label><b>${label}</b> <span class="muted small">${hint}</span><textarea id="jn-${k}" rows="5">${esc(sel[k] || '')}</textarea></label>`;
  return `
    <section>
      <div class="sec-head"><h2>돌봄일지</h2>
        <div class="row"><button class="primary" data-act="newJournal" data-auto="1">${icon('sparkle')}초안 작성</button><button data-act="newJournal">새 일지</button></div></div>
      ${js.length ? `<div class="jlist">${js.map(j => `
        <button class="jitem ${sel?.id === j.id ? 'on' : ''}" data-act="selJournal" data-id="${j.id}">
          <b>${mmdd(j.date)}</b> <span>${esc(j.type)}</span> <span class="muted">${esc(j.author)}</span>
          <span class="chip ${j.status === 'draft' ? 'warn' : ''}">${j.status === 'draft' ? '초안' : '확정'}</span>${j.history?.length ? ` <span class="muted small">수정 ${j.history.length}회</span>` : ''}
        </button>`).join('')}</div>` : '<p class="muted">기록 없음</p>'}
    </section>
    ${sel ? `
    <section class="journal">
      <div class="form">
        <label>날짜<input id="jn-date" type="date" value="${sel.date}"></label>
        <label>유형<select id="jn-type">${JOURNAL_TYPES.map(x => `<option ${x === sel.type ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        <label>작성자<input value="${esc(sel.author)}" disabled></label>
        <label>상태<input value="${sel.status === 'draft' ? '초안' : '확정'}" disabled></label>
      </div>
      ${sel.from ? `<p class="muted small">초안 기간: ${fmtDate(sel.from)} ~ ${fmtDate(sel.date)}</p>` : ''}
      ${ta('S', 'S 주관적', '대상자 말 (따옴표 안은 실제 발화 그대로)')}
      ${ta('O', 'O 객관적', '측정값·관찰')}
      ${ta('A', 'A 평가', '')}
      ${ta('P', 'P 계획', '')}
      <div class="row">
        <button data-act="saveJournal" data-id="${sel.id}">${sel.status === 'final' ? '저장' : '저장'}</button>
        ${sel.status === 'draft' ? `<button class="primary" data-act="saveJournal" data-id="${sel.id}" data-final="1">확정</button>` : ''}
      </div>
      ${sel.confirmedBy ? `<p class="muted small">확정: ${esc(sel.confirmedBy)} · ${stamp(sel.confirmedAt)}</p>` : ''}
      ${sel.history?.length ? `<details><summary><b>수정 이력 ${sel.history.length}건</b></summary>${[...sel.history].reverse().map(h => `
        <div class="hist"><p class="muted small">${esc(h.by)} · ${stamp(h.at)} 수정 · 이전 내용</p>
        <pre>${esc(`[${h.prev.date} · ${h.prev.type}]\nS\n${h.prev.S}\nO\n${h.prev.O}\nA\n${h.prev.A}\nP\n${h.prev.P}`)}</pre></div>`).join('')}</details>` : ''}
    </section>` : ''}`;
}

// ---------- 알림 카드 ----------
function alertCard(a, p) {
  const closed = a.status === 'closed';
  const auto = a.type === 'cognition' ? autoChecklist(p, todayStr()) : {};
  const contacts = [...(p.info?.contacts || [])].map((c, k) => ({ ...c, k })).sort((x, y) => x.priority - y.priority);
  const first = contacts.find(c => c.consent) || contacts[0];
  return `
    <div class="alert-card lvb-${a.level} ${closed ? 'closed' : ''}">
      <div class="row"><b>${TYPE[a.type]}</b><span class="badge lv-${a.level}">${LEVEL[a.level]}</span><span class="tag">${STATUS[a.status]}</span></div>
      <div class="muted small">생성 ${stamp(a.createdAt)} · 보호자 통보 ${stamp(a.notifiedAt)}${a.notifiedTo ? ` (${esc(a.notifiedTo.name)}${a.notifiedTo.relation ? ' · ' + esc(a.notifiedTo.relation) : ''} ${esc(a.notifiedTo.phone)})` : ''} · 연계 ${stamp(a.referredAt)}</div>
      <div class="row">
        <button data-act="notify" data-id="${a.id}" ${closed ? 'disabled' : ''} title="보호자 통보 기록">통보 기록</button>
        <button class="primary" data-act="refer" data-id="${a.id}" ${a.status !== 'open' ? 'disabled' : ''} title="치매안심센터 연계">연계</button>
        <button data-act="close" data-id="${a.id}" ${closed ? 'disabled' : ''}>종결</button>
        <label>수검 결과
          <select data-change="outcome" data-id="${a.id}">
            <option value="">미입력</option>
            <option value="confirmed" ${a.outcome === 'confirmed' ? 'selected' : ''}>확진</option>
            <option value="normal" ${a.outcome === 'normal' ? 'selected' : ''}>정상</option>
          </select>
        </label>
      </div>
      ${notifyOpen === a.id ? `
        <form class="book" data-submit="saveNotify" data-id="${a.id}">
          <label>통보한 보호자<select data-change="pickContact">${contacts.map(c => `<option value="${c.k}" ${c === first ? 'selected' : ''}>${esc(c.name)} (${esc(c.relation)}) ${esc(c.phone)}${c.consent ? '' : ' · 통보 미동의'}</option>`).join('')}<option value="-1">직접 입력</option></select></label>
          <label>이름<input name="name" value="${esc(first?.name || '')}"></label>
          <label>관계<input name="relation" value="${esc(first?.relation || '')}"></label>
          <label>전화<input name="phone" value="${esc(first?.phone || '')}"></label>
          <button class="primary" type="submit">저장</button>
        </form>` : ''}
      ${a.type === 'cognition' ? `
        <div class="checklist"><b>감별 체크리스트</b> 
          <div class="checks">${Object.entries(CHECKS).map(([k, t]) => `
            <label><input type="checkbox" data-change="check" data-id="${a.id}" data-k="${k}" ${a.checklist?.[k] || auto[k] ? 'checked' : ''} ${auto[k] ? 'disabled' : ''}> ${t}${auto[k] ? ' <span class="chip">자동</span>' : ''}</label>`).join('')}</div>
        </div>` : ''}
      <label>메모<textarea data-change="note" data-id="${a.id}" placeholder="처리 내용">${esc(a.note)}</textarea></label>
    </div>`;
}

// 겹쳐 보기: 인지 z + 야간 최저 SpO2(오른쪽 축) + 안정 시 심박
function drawPersonChart(p, st, s, today) {
  if (!window.Chart || !document.getElementById('personChart')) return;
  const range = trendOpt.days;
  const labels = [...Array(range)].map((_, i) => addDays(today, i - range + 1));
  const zByDate = Object.fromEntries(st.zs.map(x => [x.date, x.z]));
  const nights = labels.map(dt => {
    const v = getNightVitals(p.id, dt);
    return isValidNight(v, s) ? v : null; // 무효 측정일은 빈칸
  });
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
      labels: labels.map(dt => mmdd(dt)),
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

// ---------- 월간 캘린더 (전체 현황·방문 등록 창이 같이 쓴다) ----------
// o: { ns(동작 이름 앞말), month 'YYYY-MM', visits(이미 필터링된 목록), selected, highlight(강조할 대상자 id),
//      visitor(필터: '' 전체 | 이름), countVisitor(날짜 칸에 건수를 셀 방문자), levelOf(personId → 위험도) }
function monthCalendar(o) {
  const d = getData(), today = todayStr(), me = currentAccount();
  const [y, m] = o.month.split('-').map(Number);
  const startDow = new Date(y, m - 1, 1).getDay(); // 일요일부터
  const days = new Date(y, m, 0).getDate();
  const limit = d.settings.visitDailyLimit;
  const nameOf = id => d.people.find(p => p.id === id)?.name || '-';
  const cells = [];
  for (let k = 0; k < startDow; k++) cells.push('<div class="cal-cell empty"></div>');
  for (let dd = 1; dd <= days; dd++) {
    const date = `${o.month}-${String(dd).padStart(2, '0')}`;
    const dow = (startDow + dd - 1) % 7;
    const vs = o.visits.filter(v => v.date === date).sort((a, b) => a.startTime.localeCompare(b.startTime));
    const n = o.countVisitor ? d.visits.filter(v => v.date === date && v.visitor === o.countVisitor && v.status !== 'canceled').length : 0;
    const chips = vs.slice(0, 3).map(v => `<span class="cal-chip st-${v.status} ${v.personId === o.highlight ? 'hl' : ''}">
      <i class="dot" style="background:var(--risk-${o.levelOf(v.personId)})"></i>${v.startTime} ${esc(nameOf(v.personId))}</span>`).join('');
    cells.push(`<button type="button" class="cal-cell ${dow === 0 ? 'sun' : dow === 6 ? 'sat' : ''} ${date === today ? 'today' : ''} ${date === o.selected ? 'sel' : ''} ${o.countVisitor && n >= limit ? 'full' : ''}"
      data-act="${o.ns}Pick" data-date="${date}">
      <span class="cal-day">${dd}${n ? `<small class="cal-count">${n}</small>` : ''}</span>${chips}${vs.length > 3 ? `<span class="cal-more">+${vs.length - 3}</span>` : ''}</button>`);
  }
  const visitors = [...new Set([...d.people.map(p => p.manager), ...(d.accounts || []).map(displayName), ...d.visits.map(v => v.visitor)].filter(Boolean))];
  const mine = me ? displayName(me) : '';
  return `
    <div class="cal">
      <div class="cal-head">
        <div class="row">
          <button type="button" data-act="${o.ns}Nav" data-m="-1" aria-label="이전 달">${icon('back')}</button>
          <button type="button" data-act="${o.ns}Nav" data-m="0">오늘</button>
          <button type="button" data-act="${o.ns}Nav" data-m="1" aria-label="다음 달">${icon('chev')}</button>
          <b class="cal-title">${y}년 ${m}월</b>
        </div>
        <div class="row">
          <div class="seg">
            <button type="button" data-act="${o.ns}Filter" data-v="" class="${!o.visitor ? 'on' : ''}">전체</button>
            ${mine ? `<button type="button" data-act="${o.ns}Filter" data-v="${esc(mine)}" class="${o.visitor === mine ? 'on' : ''}">내 일정</button>` : ''}
          </div>
          <select data-change="${o.ns}Visitor" aria-label="방문자"><option value="">방문자 전체</option>${visitors.map(v => `<option ${v === o.visitor ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>
        </div>
      </div>
      <div class="cal-grid">${[...'일월화수목금토'].map((w, k) => `<div class="cal-dow ${k === 0 ? 'sun' : k === 6 ? 'sat' : ''}">${w}</div>`).join('')}${cells.join('')}</div>
    </div>`;
}
const shiftMonth = (month, n) => {
  if (n === 0) return todayStr().slice(0, 7);
  const [y, m] = month.split('-').map(Number);
  const dt = new Date(y, m - 1 + n, 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
};
const levelMap = () => { const d = getData(); const R = new Map(d.people.map(p => [p.id, risk(p).level])); return id => R.get(id) || 'low'; };
const VISIT_STATUS = { planned: '예정', done: '완료', canceled: '취소' };
const visitLine = v => `${v.startTime}~${minToTime(visitEnd(v))}`;

// ---------- 방문 등록·수정 창 ----------
let vm = null; // 열린 방문 창의 상태
function openVisit({ personId, visitId }) {
  const d = getData(), me = currentAccount();
  const v = visitId ? d.visits.find(x => x.id === visitId) : null;
  const p = d.people.find(x => x.id === (v?.personId || personId));
  const tomorrow = addDays(todayStr(), 1);
  vm = v ? { ...v, mode: 'edit', force: false, sub: null }
    : { mode: 'new', id: null, personId: p.id, date: tomorrow, startTime: '10:00', durationMin: 60, type: '정기 방문',
        visitor: me ? displayName(me) : p.manager, purpose: '', status: 'planned', force: false, sub: null };
  vm.month = vm.date.slice(0, 7);
  vm.calVisitor = vm.visitor; // 캘린더 필터 기본값: 방문자(내 일정)
  drawVisit();
}
function closeVisit() { vm = null; const r = document.getElementById('modal-root'); if (r) r.innerHTML = ''; }

function visitCandidate() {
  const { id, personId, date, startTime, durationMin, type, visitor, purpose } = vm;
  return { id, personId, date, startTime, durationMin: +durationMin, type, visitor, purpose };
}

function checksHtml() {
  const d = getData();
  if (vm.status !== 'planned') return '';
  const c = visitChecks(d, visitCandidate(), nowStamp());
  const nameOf = pid => d.people.find(p => p.id === pid)?.name || '-';
  return [
    ...c.errors.map(t => `<p class="chk err-box">${esc(t)}</p>`),
    ...c.conflicts.map(v => `<p class="chk err-box">시간 겹침 · ${esc(nameOf(v.personId))} ${visitLine(v)} (이동 여유 ${d.settings.visitBufferMin}분 포함)</p>`),
    ...c.warnings.map(t => `<p class="chk warn-box">${esc(t)}</p>`),
    ...c.notes.map(t => `<p class="chk note-box">${esc(t)}</p>`)
  ].join('');
}

// 그날의 시간표 (08:00~18:00): 기존 방문은 블록, 새 방문은 점선 블록
function timetableHtml() {
  const d = getData(), H = 300, S = 8 * 60, E = 18 * 60;
  const y = m => Math.max(0, Math.min(H, ((m - S) / (E - S)) * H));
  const nameOf = pid => d.people.find(p => p.id === pid)?.name || '-';
  const day = d.visits.filter(v => v.date === vm.date && v.id !== vm.id && v.status !== 'canceled' && (!vm.calVisitor || v.visitor === vm.calVisitor));
  const block = (v, cls) => `<div class="tt-block ${cls}" style="top:${y(visitStart(v))}px;height:${Math.max(14, y(visitEnd(v)) - y(visitStart(v)))}px">${visitLine(v)} ${esc(nameOf(v.personId))}</div>`;
  return `
    <div class="tt"><b>${fmtDateW(vm.date)} 시간표</b>
      <div class="tt-body" style="height:${H}px">
        ${[8, 10, 12, 14, 16, 18].map(h => `<span class="tt-hour" style="top:${y(h * 60)}px">${String(h).padStart(2, '0')}:00</span>`).join('')}
        ${day.map(v => block(v, '')).join('')}
        ${vm.status === 'planned' ? block(visitCandidate(), 'new') : ''}
      </div></div>`;
}

function drawVisit() {
  const d = getData();
  let root = document.getElementById('modal-root');
  if (!root || !vm) return;
  const p = d.people.find(x => x.id === vm.personId);
  const levelOf = levelMap();
  const visitors = [...new Set([...d.people.map(x => x.manager), ...(d.accounts || []).map(displayName)].filter(Boolean))];
  const r = risk(p);
  const opts = (list, v) => list.map(x => `<option ${String(x) === String(v) ? 'selected' : ''}>${x}</option>`).join('');
  const readOnly = vm.status !== 'planned';
  const c = readOnly ? null : visitChecks(d, visitCandidate(), nowStamp());
  const blocked = c && c.errors.length;
  root.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="방문 ${vm.mode === 'new' ? '등록' : '일정'}">
      <div class="modal-panel">
        <div class="sec-head"><h2>방문 ${vm.mode === 'new' ? '등록' : '일정'} · ${esc(p.name)}</h2><button type="button" data-act="vmClose" aria-label="닫기">닫기</button></div>
        <div class="modal-grid">
          <div>
            ${monthCalendar({ ns: 'vm', month: vm.month, selected: vm.date, highlight: p.id, visitor: vm.calVisitor, countVisitor: vm.visitor, levelOf,
              visits: d.visits.filter(v => !vm.calVisitor || v.visitor === vm.calVisitor) })}
            ${timetableHtml()}
          </div>
          <div class="vm-form">
            <label>대상자<input value="${esc(p.name)} · ${p.age ?? '-'}세" disabled></label>
            <label>날짜<input type="date" data-change="vmSet" data-k="date" value="${vm.date}" ${readOnly ? 'disabled' : ''}></label>
            <label>시작 시각<input type="time" step="600" data-change="vmSet" data-k="startTime" value="${vm.startTime}" ${readOnly ? 'disabled' : ''}></label>
            <label>소요 시간<select data-change="vmSet" data-k="durationMin" ${readOnly ? 'disabled' : ''}>${[30, 60, 90, 120].map(n => `<option value="${n}" ${+vm.durationMin === n ? 'selected' : ''}>${n}분</option>`).join('')}</select></label>
            <label>방문 유형<select data-change="vmSet" data-k="type" ${readOnly ? 'disabled' : ''}>${opts(VISIT_TYPES, vm.type)}</select></label>
            <label>방문자<select data-change="vmSet" data-k="visitor" ${readOnly ? 'disabled' : ''}>${opts(visitors, vm.visitor)}</select></label>
            <label>목적<input data-input="vmText" data-k="purpose" value="${esc(vm.purpose)}" placeholder="${esc(r.reasons.slice(0, 2).join(', ') || '정기 안부 확인')}" ${readOnly ? 'disabled' : ''}></label>
            <div id="vm-checks">${readOnly ? '' : checksHtml()}</div>
            ${readOnly ? `<p class="chip ${vm.status === 'done' ? '' : 'warn'}">${VISIT_STATUS[vm.status]}${vm.resultNote ? ` · ${esc(vm.resultNote)}` : ''}${vm.cancelReason ? ` · ${esc(vm.cancelReason)}` : ''}</p>` : ''}
            ${vm.sub === 'done' ? `<label>결과 메모<textarea id="vm-note" rows="3"></textarea></label><div class="row"><button class="primary" type="button" data-act="vmDone">완료</button><button type="button" data-act="vmSub">취소</button></div>`
              : vm.sub === 'cancel' ? `<label>취소 사유<input id="vm-reason"></label><div class="row"><button class="primary" type="button" data-act="vmCancel">확정</button><button type="button" data-act="vmSub">닫기</button></div>`
              : readOnly ? '' : `
              <div class="row">
                <button class="primary" type="button" data-act="vmSave" ${blocked ? 'disabled' : ''}>${c.conflicts.length && vm.force ? '그래도 등록' : vm.mode === 'new' ? '등록' : '저장'}</button>
                <button type="button" data-act="vmClose">취소</button>
              </div>
              ${vm.mode === 'edit' ? `<div class="row"><button type="button" data-act="vmSub" data-v="done">방문 완료</button><button type="button" data-act="vmSub" data-v="cancel">방문 취소</button></div>` : ''}`}
          </div>
        </div>
      </div>
    </div>`;
}

// 방문 창의 동작 (어느 화면에서 열든 같은 동작)
const visitActions = {
  vmClose: () => closeVisit(),
  vmPick: el => { vm.date = el.dataset.date; vm.force = false; drawVisit(); },
  vmNav: el => { vm.month = shiftMonth(vm.month, +el.dataset.m); drawVisit(); },
  vmFilter: el => { vm.calVisitor = el.dataset.v; drawVisit(); },
  vmVisitor: el => { vm.calVisitor = el.value; drawVisit(); },
  vmSet: el => {
    vm[el.dataset.k] = el.value;
    if (el.dataset.k === 'date' && el.value) vm.month = el.value.slice(0, 7);
    if (el.dataset.k === 'visitor') vm.calVisitor = el.value; // 방문자를 바꾸면 캘린더도 그 방문자 일정으로
    vm.force = false;
    drawVisit();
  },
  vmText: el => { vm[el.dataset.k] = el.value; },
  vmSave: () => {
    const d = getData(), me = currentAccount();
    const c = visitChecks(d, visitCandidate(), nowStamp());
    if (c.errors.length) return;
    if (c.conflicts.length && !vm.force) { vm.force = true; drawVisit(); return; } // 겹치면 한 번 더 눌러야 등록
    const cand = visitCandidate();
    if (!cand.purpose) cand.purpose = risk(d.people.find(p => p.id === cand.personId)).reasons.slice(0, 2).join(', ') || '정기 안부 확인';
    if (vm.mode === 'new') {
      d.visits.push({ ...cand, id: 'v' + Date.now().toString(36), status: 'planned', resultNote: '', cancelReason: '', createdBy: me ? displayName(me) : '', createdAt: nowStamp() });
    } else Object.assign(d.visits.find(v => v.id === vm.id), cand);
    save();
    closeVisit();
    render();
  },
  vmSub: el => { vm.sub = el.dataset.v || null; drawVisit(); },
  vmDone: () => {
    const d = getData(), me = currentAccount();
    const v = d.visits.find(x => x.id === vm.id);
    const note = document.getElementById('vm-note').value.trim();
    Object.assign(v, { status: 'done', resultNote: note });
    // 돌봄일지 작성 화면을 유형 '방문'으로 연다
    const j = { id: 'j' + Date.now().toString(36), personId: v.personId, date: v.date, type: '방문', status: 'draft', auto: false,
      author: me ? displayName(me) : v.visitor, createdAt: nowStamp(), history: [], S: '', O: note ? `- 방문 결과: ${note}` : '', A: '', P: '' };
    d.journals ??= [];
    d.journals.push(j);
    journalSel = j.id;
    save();
    closeVisit();
    location.hash = `#/admin/p/${v.personId}/journal`;
  },
  vmCancel: () => {
    const d = getData();
    Object.assign(d.visits.find(x => x.id === vm.id), { status: 'canceled', cancelReason: document.getElementById('vm-reason').value.trim() });
    save();
    closeVisit();
    render();
  },
  openVisit: el => openVisit({ personId: el.dataset.p, visitId: el.dataset.v })
};

// ---------- 대상자 추가·전체 수정 ----------
const REFERRALS = ['보건소 의뢰', '방문간호 연계', '본인 신청', '보호자 신청', '기타'];
const CLOSE_REASONS = ['시설 입소', '이사', '참여 철회', '사망', '기타'];
let pfState = null; // { force: 중복 경고 뒤 '그래도 추가' }

function personFormPage(params) {
  const d = getData(), me = currentAccount(), today = todayStr();
  const editId = params.get('id');
  const orig = editId ? d.people.find(p => p.id === editId) : null;
  const blank = {
    id: null, name: '', sex: '', birth: '', phone: '', phoneType: '휴대폰', education: '', canRead: '',
    address: '', lat: '', lng: '', manager: me ? displayName(me) : '', enrolledAt: today, referral: '', dementiaCenter: '',
    preferredTime: '10:00',
    info: baseInfo({ living: '', device: { name: '', source: 'none', clockOffsetMin: 0, spo2OffsetPct: 0 },
      consent: { service: null, recording: null, guardianShare: null, privacy: null, method: '본인', proxy: null, date: today, renewDate: addDays(today, 365) },
      call: { ...baseInfo().call, firstCall: addDays(today, 1) } })
  };
  const p = orig ? JSON.parse(JSON.stringify(orig)) : blank;
  const i = p.info, cs = i.consent || {};
  const secs = infoTab(p, true);
  const opts = (list, v) => list.map(x => `<option ${x === v ? 'selected' : ''}>${x}</option>`).join('');
  const yn = (name, v, req) => `<span class="yn">${[['yes', '동의'], ['no', '미동의']].map(([k, t]) =>
    `<label class="check"><input type="radio" name="${name}" value="${k}" ${v === (k === 'yes') ? 'checked' : ''} ${req ? 'data-req' : ''}> ${t}</label>`).join('')}</span>`;
  const R = '<b class="req">*</b>';
  const managers = [...new Set([...d.people.map(x => x.manager), ...(d.accounts || []).map(displayName)].filter(Boolean))];
  const TOC = [['s1', '① 기본 인적 사항'], ['s2', '② 주소와 위치'], ['s3', '③ 관리 정보'], ['s4', '④ 동의'], ['s5', '⑤ 질환·복용약'],
    ['s6', '⑥ 보조기기·신체 상태'], ['s7', '⑦ 응급 연락처'], ['s8', '⑧ 통화 설정'], ['s9', '⑨ 웨어러블'], ['s10', '⑩ 대면 인지검사 기록']];
  const S = (id, title, body) => `<section id="${id}" class="pf-sec"><h2>${title}</h2>${body}</section>`;

  const html = `
    <div class="page-title"><h1>${orig ? `대상자 수정 · ${esc(orig.name)}` : '대상자 추가'}</h1></div>
    <div class="pf">
      <nav class="pf-toc">${TOC.map(([id, t]) => `<button type="button" data-act="jump" data-to="${id}">${t}</button>`).join('')}</nav>
      <form id="pform" class="pf-body" data-submit="savePerson2" novalidate>
        ${S('s1', '① 기본 인적 사항', `<div class="form">
          <label><span>이름 ${R}</span><input name="name" value="${esc(p.name)}" data-req></label>
          <label><span>성별 ${R}</span><select name="sex" data-req><option value="">선택</option>${opts(['여', '남'], p.sex)}</select></label>
          <label><span>생년월일 ${R}</span><input name="birth" type="date" value="${p.birth || ''}" max="${today}" data-req data-input="pfAge"></label>
          <label>나이<input id="pf-age" value="${p.birth ? ageFrom(p.birth, today) + '세' : ''}" disabled></label>
          <label><span>통화 받을 전화번호 ${R}</span><input name="phone" type="tel" value="${esc(p.phone)}" data-req placeholder="010-0000-0000"><small class="err" data-err="phone"></small></label>
          <label>전화 종류<select name="phoneType">${opts(['휴대폰', '집전화'], p.phoneType)}</select></label>
          <label><span>거주 형태 ${R}</span><select name="living" data-req><option value="">선택</option>${opts(['독거', '부부', '자녀 동거', '기타'], i.living)}</select></label>
          <label>교육 연수<input name="education" type="number" min="0" max="25" value="${p.education ?? ''}"></label>
          <label>한글 읽기<select name="canRead"><option value="">선택</option>${opts(['가능', '어려움'], p.canRead)}</select></label>
        </div>`)}
        ${S('s2', '② 주소와 위치', `<div class="form">
          <label class="wide"><span>주소 ${R}</span><input name="address" value="${esc(p.address)}" data-req placeholder="울주군 웅촌면 ○○리"></label>
          <label><span>위도 ${R}</span><input name="lat" type="number" step="any" value="${p.lat ?? ''}" data-req data-change="pfLatLng"></label>
          <label><span>경도 ${R}</span><input name="lng" type="number" step="any" value="${p.lng ?? ''}" data-req data-change="pfLatLng"></label>
        </div>
        <div id="pf-map" class="map small-map"></div><p class="err" id="pf-map-err"></p>`)}
        ${S('s3', '③ 관리 정보', `<div class="form">
          <label><span>담당자 ${R}</span><select name="manager" data-req>${opts(managers, p.manager)}</select></label>
          <label><span>등록일 ${R}</span><input name="enrolledAt" type="date" value="${p.enrolledAt}" data-req></label>
          <label>의뢰 경로<select name="referral"><option value="">선택</option>${opts(REFERRALS, p.referral)}</select></label>
          <label>치매안심센터 기존 등록<select name="dementiaCenter"><option value="">선택</option>${opts(['예', '아니요', '모름'], p.dementiaCenter)}</select></label>
        </div>`)}
        ${S('s4', '④ 동의', `
          <div class="consent">
            <div><span>서비스 참여 ${R}</span>${yn('c-service', cs.service, true)}</div>
            <div><span>통화 녹음 ${R}</span>${yn('c-recording', cs.recording, true)}</div>
            <div><span>결과의 보호자 공유</span>${yn('c-share', cs.guardianShare, false)}</div>
            <div><span>개인정보 수집·이용 ${R}</span>${yn('c-privacy', cs.privacy, true)}</div>
          </div>
          <p class="muted small">통화 녹음 미동의: 녹음 없이 채점만</p>
          <div class="form">
            <label>동의 방식<select name="c-method" data-change="pfMethod">${opts(['본인', '대리인'], cs.method)}</select></label>
            <label><span>동의 일자 ${R}</span><input name="c-date" type="date" value="${cs.date || today}" data-req></label>
            <label>재동의 예정일<input name="c-renew" type="date" value="${cs.renewDate || addDays(today, 365)}"></label>
          </div>
          <div class="form" id="pf-proxy" ${cs.method === '대리인' ? '' : 'hidden'}>
            <label><span>대리인 이름 ${R}</span><input name="px-name" value="${esc(cs.proxy?.name || '')}" data-req-proxy></label>
            <label><span>관계 ${R}</span><input name="px-rel" value="${esc(cs.proxy?.relation || '')}" data-req-proxy></label>
            <label><span>연락처 ${R}</span><input name="px-phone" value="${esc(cs.proxy?.phone || '')}" data-req-proxy></label>
          </div>`)}
        ${S('s5', '⑤ 질환·복용약', secs.disease)}
        ${S('s6', '⑥ 보조기기·신체 상태', secs.body)}
        ${S('s7', `⑦ 응급 연락처 ${R}`, secs.contacts)}
        ${S('s8', '⑧ 통화 설정', secs.call)}
        ${S('s9', '⑨ 웨어러블', secs.device)}
        ${S('s10', '⑩ 대면 인지검사 기록', secs.tests)}
        <div class="pf-save">
          <div id="pf-dup"></div>
          <div class="row">
            <button class="primary" type="submit">저장</button>
            <button type="button" class="missing" data-act="pfMissing" id="pf-missing" hidden></button>
            <a class="btn" href="${orig ? `#/admin/p/${orig.id}/info` : '#/admin/people'}">취소</a>
          </div>
        </div>
      </form>
    </div>`;

  // 빈 필수 항목 (보이는 칸만)
  const missing = () => {
    const f = document.getElementById('pform');
    const empty = [];
    f.querySelectorAll('[data-req]').forEach(el => {
      if (el.type === 'radio') {
        const g = f.querySelectorAll(`[name="${el.name}"]`);
        if (![...g].some(x => x.checked) && !empty.some(e => e.name === el.name)) empty.push(el);
      } else if (!el.value.trim()) empty.push(el);
    });
    if (f.querySelector('[name=c-method]').value === '대리인') f.querySelectorAll('[data-req-proxy]').forEach(el => { if (!el.value.trim()) empty.push(el); });
    const contacts = [...f.querySelectorAll('[data-row=contact] [name=c-name]')].filter(el => el.value.trim());
    if (!contacts.length) empty.push(f.querySelector('[data-row=contact] [name=c-name]'));
    if (!f.querySelector('[name=time]').value) empty.push(f.querySelector('[name=time]'));
    return empty;
  };

  actions = { ...shellActions };
  actions.jump = el => document.getElementById(el.dataset.to).scrollIntoView({ behavior: 'smooth', block: 'start' });
  actions.pfAge = el => { document.getElementById('pf-age').value = el.value ? ageFrom(el.value, today) + '세' : ''; };
  actions.pfMethod = el => { document.getElementById('pf-proxy').hidden = el.value !== '대리인'; };
  actions.pfMissing = () => { const m = missing()[0]; m?.scrollIntoView({ block: 'center' }); m?.focus(); };
  actions.pfForce = () => { pfState = { force: true }; document.getElementById('pform').requestSubmit(); };
  actions.savePerson2 = f => {
    const F = n => f.querySelector(`[name="${n}"]`);
    const miss = missing();
    const mb = document.getElementById('pf-missing');
    mb.hidden = !miss.length;
    mb.textContent = `필수 ${miss.length}개 빈칸`;
    if (miss.length) return;
    const phone = F('phone').value.trim();
    const perr = f.querySelector('[data-err=phone]');
    perr.textContent = validPhone(phone, 9) ? '' : '숫자와 하이픈만, 9~11자리';
    if (perr.textContent) { F('phone').scrollIntoView({ block: 'center' }); return; }
    const radio = n => { const x = f.querySelector(`[name="${n}"]:checked`); return x ? x.value === 'yes' : null; };
    if (!radio('c-service') || !radio('c-privacy')) { alert('서비스 참여·개인정보 수집 동의 필요'); document.getElementById('s4').scrollIntoView(); return; }
    const birth = F('birth').value;
    if (birth > today) { alert('생년월일이 오늘보다 늦음'); return; }
    const age = ageFrom(birth, today);
    const cand = { id: orig?.id, name: F('name').value.trim(), birth, phone };
    const dups = findDuplicates(d.people, cand);
    if (dups.length && !pfState?.force) {
      document.getElementById('pf-dup').innerHTML = `<div class="chk err-box">중복 의심 · ${dups.map(x => `<a href="#/admin/p/${x.id}">${esc(x.name)} (${x.birth ? fmtDate(x.birth) : x.age + '세'}, ${esc(x.phone)})</a>`).join(', ')}
        <button type="button" data-act="pfForce">그래도 ${orig ? '저장' : '추가'}</button></div>`;
      document.getElementById('pf-dup').scrollIntoView({ block: 'center' });
      return;
    }
    if (age < 60 && !confirm(`나이 ${age}세 (대상 기준 60세 이상). 계속 저장`)) return;
    const lat = parseFloat(F('lat').value), lng = parseFloat(F('lng').value);
    const target = orig || { id: 'p' + Date.now().toString(36), active: true, closed: null, info: p.info };
    for (const k of ['disease', 'body', 'contacts', 'call', 'device', 'tests']) {
      if (!saveInfoSection(target, k, f.querySelector(`fieldset[data-sec=${k}]`))) { f.querySelector(`fieldset[data-sec=${k}]`).scrollIntoView({ block: 'center' }); return; }
    }
    Object.assign(target, {
      name: cand.name, sex: F('sex').value, birth, age, phone, phoneType: F('phoneType').value,
      education: F('education').value === '' ? null : +F('education').value, canRead: F('canRead').value || null,
      address: F('address').value.trim(), lat, lng, manager: F('manager').value, enrolledAt: F('enrolledAt').value,
      referral: F('referral').value || null, dementiaCenter: F('dementiaCenter').value || null
    });
    target.info.living = F('living').value;
    target.info.call.title ||= `${target.name} 어르신`;
    target.info.consent = {
      service: true, recording: radio('c-recording'), guardianShare: radio('c-share'), privacy: true,
      method: F('c-method').value, proxy: F('c-method').value === '대리인' ? { name: F('px-name').value.trim(), relation: F('px-rel').value.trim(), phone: F('px-phone').value.trim() } : null,
      date: F('c-date').value, renewDate: F('c-renew').value
    };
    const by = me ? displayName(me) : '';
    target.info.edited = { ...(target.info.edited || {}), ...Object.fromEntries(['disease', 'body', 'call', 'contacts', 'device', 'tests'].map(k => [k, { by, at: nowStamp() }])) };
    if (!orig) d.people.push(target);
    pfState = null;
    save();
    location.hash = `#/admin/p/${target.id}`;
  };

  return {
    html,
    after: () => {
      if (!window.L) return;
      const el = document.getElementById('pf-map');
      map = L.map(el, { scrollWheelZoom: false });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
      const border = L.geoJSON(ungchon, { style: { color: '#1e3932', weight: 2, dashArray: '6 5', fillColor: '#00754a', fillOpacity: 0.05 } }).addTo(map);
      map.fitBounds(border.getBounds(), { padding: [8, 8] });
      let marker = null;
      const place = (lat, lng) => {
        marker?.remove();
        marker = L.circleMarker([lat, lng], { radius: 9, color: '#fff', weight: 2, fillColor: '#00754a', fillOpacity: 1 }).addTo(map);
        document.getElementById('pf-map-err').textContent = insideBoundary(ungchon, lat, lng) ? '' : '웅촌면 경계 밖';
      };
      if (Number.isFinite(+p.lat) && p.lat !== '') place(+p.lat, +p.lng);
      map.on('click', e => {
        const lat = +e.latlng.lat.toFixed(6), lng = +e.latlng.lng.toFixed(6);
        document.querySelector('#pform [name=lat]').value = lat;
        document.querySelector('#pform [name=lng]').value = lng;
        place(lat, lng);
      });
      actions.pfLatLng = () => {
        const lat = parseFloat(document.querySelector('#pform [name=lat]').value), lng = parseFloat(document.querySelector('#pform [name=lng]').value);
        if (Number.isFinite(lat) && Number.isFinite(lng)) place(lat, lng);
      };
    }
  };
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
// 기존 방문에 없는 칸 채우기: 시각 10:00, 소요 60분
for (const v of d0.visits) {
  v.startTime ||= '10:00';
  v.durationMin ||= 60;
  v.type ||= '정기 방문';
  v.visitor ||= d0.people.find(p => p.id === v.personId)?.manager || '';
  v.purpose ??= v.reason || '';
  v.resultNote ??= '';
}
// 나이는 생년월일로 다시 계산
for (const p of d0.people) if (p.birth) p.age = ageFrom(p.birth, todayStr());
d0.accounts ??= [];
window.addEventListener('hashchange', route);
route();
