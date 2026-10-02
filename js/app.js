// 라우팅과 화면 그리기
// #/ 첫 화면 · #/user 어르신(대상자) 화면 · #/login · #/signup
// #/admin 전체 현황 · #/admin/people 대상자 관리 · #/admin/p/<id>[/<탭>] 대상자 상세

import {
  getData, setData, save, reloadData, saveAudio, getAudio, deleteAudio, clearAudio,
  makeSalt, hashPassword, verifyPassword, displayName, currentAccount, setLogin
} from './store.js';
import { reseed, SEED_VERSION, baseInfo } from './seed.js';
import {
  DEFAULT_SETTINGS, todayStr, nowStamp, addDays, personStatus, updateAlerts, dashboard, isValidNight,
  riskOf, aiSummary, recommendAction, filterPeople, completion7, refreshZ, isCallDay, spo2Threshold,
  primaryContact, validPhone, autoChecklist, trendAll, TREND_METRICS, METRIC, trendCsv, trendSentence,
  personEvents, journalDraft, daysBetween, visitChecks, visitStart, visitEnd, minToTime, VISIT_TYPES,
  ageFrom, findDuplicates, insideBoundary,
  fmtDate, fmtMD, fmtMDW, fmtStamp, fmtDur, fmtNum, fmtUnit, timelineRange, layoutLabels, completionDelta
} from './metrics.js';
import { getNightVitals, importRing, recomputeRing, deleteRingImport } from './vitals.js';
import { startRing, runCall, nextItem, stopCall, prepareCall, summarizeCall, getHealth, fetchVoice } from './call.js';
import { scorePct, orientationParts, countAnimals, SELF_QUESTIONS, checkSummary, AI_CONSENT_TEXT } from './items.js';
import ungchon from './ungchon.js';
import { icon } from './icons.js';

const app = document.getElementById('app');

const LEVEL = { watch: '관찰', caution: '주의', refer: '의뢰' };
const LEVEL_CHIP = { watch: 'info', caution: 'mid', refer: 'high' };
const TYPE = { emergency: '응급 표현 (통화 중)', cognition: '인지 기저선 이탈', spo2: '야간 저산소 (수면무호흡 의심)', hearing: '재질문 잦음 (난청 의심)', noAnswer: '연속 무응답 (안부 확인)' };
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

// 색은 style.css의 :root 변수에서만 읽는다 (차트·지도도 같은 값)
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const riskColor = lv => css(`--${lv}`);

// 표시 형식은 metrics.js의 fmt 함수만 쓴다
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const mmss = sec => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.round(sec % 60)).padStart(2, '0')}`; // 통화 중 시계
const pctText = v => fmtUnit(v, '%', 1);
const mmdd = fmtMD, mdot = fmtMD, stamp = fmtStamp, fmtDateW = fmtMDW;
const initial = name => esc((name || '?').slice(0, 1));
const shortAddr = a => esc((a || '-').replace('울산광역시 울주군 ', ''));
const riskChip = lv => `<span class="chip chip-${lv} risk">위험도 ${RISK[lv]}</span>`;
const reasonChips = (reasons, n = 99) => reasons.slice(0, n).map(r => `<span class="chip">${esc(r)}</span>`).join('');
const levelChip = lv => `<span class="chip chip-${LEVEL_CHIP[lv]}">${LEVEL[lv]}</span>`;
const empty = (text, ic = 'inbox') => `<div class="empty">${icon(ic, 20)}<span>${text}</span></div>`;
const btn = (label, attrs = '', kind = 'secondary', size = 'sm') => `<button type="button" class="btn btn-${kind}${size ? ' btn-' + size : ''}" ${attrs}>${label}</button>`;

let actions = {};   // 지금 화면의 버튼 동작 (data-act / data-change / data-input / data-submit)
let cleanup = null; // 화면을 떠날 때 멈출 것 (벨소리·통화)
let timers = [];    // 화면을 떠날 때 멈출 반복 (현재 시각 선 등)
let charts = [];
let map = null;
let period = 7;     // 운영 지표 기간
let dashCal = {};   // 전체 현황 캘린더 { view, anchor, month, selected, visitor }
let tlMine = true;  // 오늘 시간표: 내 담당만
const list = { q: '', mine: false, risk: 'all', sort: 'risk', dir: -1, closed: false, visit: false }; // 대상자 관리 목록 상태

// 이벤트는 document 한 곳에서 받는다 (모달은 body 아래에 붙기 때문)
for (const [type, key] of [['click', 'act'], ['change', 'change'], ['input', 'input']]) {
  document.addEventListener(type, e => {
    const el = e.target.closest(`[data-${key}]`);
    if (el && actions[el.dataset[key]]) actions[el.dataset[key]](el, e);
  });
}
document.addEventListener('submit', e => {
  const f = e.target.closest('[data-submit]');
  if (!f) return;
  e.preventDefault();
  if (actions[f.dataset.submit]) actions[f.dataset.submit](f, e);
});
document.addEventListener('keydown', e => {
  // 버튼 역할을 하는 표 줄·SVG 도형: Enter로 누른다
  const el = e.target.closest?.('[role=button][data-act], tr[data-act]');
  if (el && el === e.target && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
  // 탭: 좌우 화살표로 옮긴다
  const tab = e.target.closest?.('[role=tab]');
  if (tab && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
    const tabs = [...tab.closest('[role=tablist]').querySelectorAll('[role=tab]')];
    const next = tabs[(tabs.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    next.focus();
    next.click();
  }
});

// ---------- 모달 (JS 부품 1) ----------
// modal({ title, body, foot, size: 'sm'|'md'|'lg', dirty() }) → { el, body, close(force) }
// 포커스를 창 안에 가두고, Esc·바깥 클릭으로 닫고, 닫으면 연 버튼으로 포커스를 돌려준다.
let modalSeq = 0;
function modal({ title, body = '', foot = '', size = 'sm', dirty = () => false, onClose = null, role = 'dialog' }) {
  const opener = document.activeElement;
  const id = 'mt' + ++modalSeq;
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `
    <div class="modal modal-${size}" role="${role}" aria-modal="true" aria-labelledby="${id}">
      <div class="modal-head"><h2 id="${id}">${title}</h2><button type="button" class="btn btn-ghost btn-icon btn-sm" data-close aria-label="닫기">${icon('x')}</button></div>
      <div class="modal-body">${body}</div>
      <div class="modal-foot">${foot}</div>
    </div>`;
  document.body.append(wrap);
  const top = () => [...document.querySelectorAll('.modal-backdrop')].at(-1) === wrap;
  const focusables = () => [...wrap.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')]
    .filter(el => el.offsetParent !== null);
  let closing = false;
  const close = async force => {
    if (closing) return;
    if (!force && dirty()) {
      closing = true;
      const ok = await confirmBox({ title: '닫기', text: '작성 중인 내용이 사라집니다', ok: '닫기', danger: true });
      closing = false;
      if (!ok) return;
    }
    wrap.remove();
    document.removeEventListener('keydown', onKey, true);
    if (opener && document.contains(opener)) opener.focus();
    onClose?.();
  };
  const onKey = e => {
    if (!top()) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    if (e.key === 'Tab') {
      const f = focusables();
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f.at(-1).focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  };
  document.addEventListener('keydown', onKey, true);
  wrap.addEventListener('mousedown', e => { if (e.target === wrap) close(); });
  wrap.addEventListener('click', e => { if (e.target.closest('[data-close]')) close(); });
  const first = wrap.querySelector('.modal-body input:not([disabled]), .modal-body select:not([disabled]), .modal-body textarea') || wrap.querySelector('.modal-foot .btn:last-child') || wrap.querySelector('[data-close]');
  first?.focus();
  return { el: wrap, body: wrap.querySelector('.modal-body'), foot: wrap.querySelector('.modal-foot'), close };
}

// 확인 창 (alert·confirm 대신). 위험한 동작은 danger: 무엇이 사라지는지 한 줄로 쓴다.
function confirmBox({ title, text, ok = '확인', cancel = '취소', danger = false }) {
  return new Promise(resolve => {
    let done = false;
    const m = modal({
      title, role: 'alertdialog', body: `<p class="desc">${esc(text)}</p>`,
      foot: `${cancel ? `<button type="button" class="btn btn-secondary" data-close>${cancel}</button>` : ''}<button type="button" class="btn ${danger ? 'btn-danger solid' : 'btn-primary'}" data-ok>${ok}</button>`,
      onClose: () => { if (!done) resolve(false); }
    });
    m.el.querySelector('[data-ok]').addEventListener('click', () => { done = true; m.close(true); resolve(true); });
  });
}

// ---------- 알림 메시지 · 토스트 (JS 부품 2) ----------
// toast('방문 등록됨') · toast('실패 이유', { error: true }) · toast('방문 취소됨', { undo: () => ... })
function toast(msg, { error = false, undo = null } = {}) {
  let box = document.querySelector('.toasts');
  if (!box) {
    box = document.createElement('div');
    box.className = 'toasts';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    document.body.append(box);
  }
  const t = document.createElement('div');
  t.className = 'toast' + (error ? ' error' : '');
  t.innerHTML = `${icon(error ? 'alert' : 'check', 18)}<span>${esc(msg)}</span>${undo ? '<button type="button" class="btn">되돌리기</button>' : ''}`;
  box.append(t);
  const timer = setTimeout(() => t.remove(), error || undo ? 5000 : 3000);
  if (undo) t.querySelector('button').addEventListener('click', () => { clearTimeout(timer); t.remove(); undo(); });
}

// 차트 기본값 (한 곳에서만 정한다)
function chartDefaults() {
  if (!window.Chart) return;
  const D = Chart.defaults;
  D.font.family = '"IBM Plex Sans KR", system-ui, sans-serif';
  D.font.size = 12;
  D.color = css('--muted');
  D.borderColor = css('--line');
  D.scale.grid.color = css('--line');
  D.plugins.legend.display = false; // 범례는 제목 줄에 글자로
  Object.assign(D.plugins.tooltip, { backgroundColor: css('--ink'), cornerRadius: 8, padding: 10, boxPadding: 4, titleFont: { weight: '600' } });
  D.elements.line.borderWidth = 2.5;
  D.elements.point.radius = 0;
  D.elements.point.hoverRadius = 4;
  D.animation.duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : D.animation.duration;
}
chartDefaults();
const SERIES = () => [css('--accent'), css('--ink-2'), css('--faint')];
const legendHtml = items => `<div class="chart-legend">${items.map(([label, color, line]) =>
  `<span><i class="${line ? 'line' : ''}" style="${line ? `border-top-color:${color}` : `background:${color}`}"></i>${label}</span>`).join('')}</div>`;

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
  document.querySelectorAll('.modal-backdrop').forEach(m => m.remove());
  vm = null;
  vmModal = null;
  cleanup?.();
  cleanup = null;
  document.body.classList.remove('side-open');
  window.scrollTo(0, 0);
  render();
}

// 사이드바 펼침 상태는 이 브라우저에만 기억한다 (저장이 막혀도 동작)
const railKey = 'ime-rail-open';
const railOpen = () => { try { return localStorage.getItem(railKey) === '1'; } catch { return false; } };

function render() {
  actions = {};
  charts.forEach(c => c.destroy());
  charts = [];
  timers.forEach(clearInterval);
  timers = [];
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

  let pg;
  if (path === '#/login' || path === '#/signup') pg = authPage(path === '#/signup', params);
  else if (path === '#/admin') pg = dashboardPage();
  else if (path === '#/admin/people') pg = peoplePage(params);
  else if (path === '#/admin/people/new') pg = personFormPage(params);
  else if (path.startsWith('#/admin/p/')) pg = personPage(path.slice(10).split('/').map(decodeURIComponent), params);
  else pg = { title: '없는 화면', html: empty('없는 화면') };

  Object.assign(actions, shellActions, visitActions); // 사이드바·방문 창은 어느 화면에서나 같은 동작
  document.title = `${pg.docTitle || pg.title} · I-ME`;
  if (pg.bare) document.body.classList.add('auth-page');
  if (railOpen()) document.body.classList.add('side-wide');
  app.innerHTML = pg.bare ? pg.html : shell(path, me, pg);
  pg.after?.();
  if (me) notifyEmergencies();
}

// 열린 응급 표현 알림을 관리자 화면에서 한 번씩 알린다 (이 탭에서 이미 본 것은 다시 띄우지 않는다)
function notifyEmergencies() {
  const d = getData();
  let seen = [];
  try { seen = JSON.parse(sessionStorage.getItem('ime-seen-emergency') || '[]'); } catch { /* 저장이 막힌 브라우저 */ }
  const fresh = d.alerts.filter(a => a.type === 'emergency' && a.status === 'open' && !seen.includes(a.id));
  for (const a of fresh) toast(`응급 표현 · ${d.people.find(p => p.id === a.personId)?.name || '-'} · 즉시 확인`, { error: true });
  try { sessionStorage.setItem('ime-seen-emergency', JSON.stringify([...seen, ...fresh.map(a => a.id)])); } catch { /* 무시 */ }
}
// 어르신 화면을 다른 탭에서 열어 통화하면 관리자 탭이 바로 다시 그린다 (입력 창이 열려 있으면 데이터만 다시 읽음)
window.addEventListener('storage', e => {
  if (e.key !== 'cogcare-v1' || !e.newValue) return;
  reloadData();
  if (location.hash.startsWith('#/admin') && !document.querySelector('.modal-backdrop') && !document.activeElement?.matches('input, textarea, select')) render();
  else if (location.hash.startsWith('#/admin')) notifyEmergencies();
});

// 어르신 ↔ 관리자 화면 전환 (관리자는 로그인 필요)
const switchTop = which => `<nav class="switch-top" aria-label="화면 전환">
  <a href="#/user" ${which === 'user' ? 'aria-current="page"' : ''}>어르신</a><a href="#/admin" ${which === 'admin' ? 'aria-current="page"' : ''}>관리자</a></nav>`;

// 아이콘 사이드바 + 페이지 머리 + 본문
function shell(path, me, pg) {
  const wide = railOpen();
  const item = (href, ic, label, on) => `<a class="nav" href="${href}" ${on ? 'aria-current="page"' : ''} data-tip="${label}">${icon(ic, 20)}<span>${label}</span></a>`;
  const crumbs = pg.crumbs ? `<nav class="crumbs" aria-label="위치">${pg.crumbs.map(([t, h]) => h ? `<a href="${h}">${esc(t)}</a>` : `<span aria-current="page">${esc(t)}</span>`).join('<span aria-hidden="true">›</span>')}</nav>` : '';
  return `
    <aside class="side" aria-label="주 메뉴">
      <div class="side-top"><a class="logo-mark" href="#/" aria-label="I-ME 처음 화면">I-ME</a><span class="logo-text">지역사회 인지건강</span></div>
      <button type="button" class="side-toggle" data-act="toggleRail" aria-expanded="${wide}" aria-label="${wide ? '메뉴 접기' : '메뉴 펼치기'}">${icon('panel', 18)}</button>
      <nav>
        ${item('#/admin', 'map', '전체 현황', path === '#/admin')}
        ${item('#/admin/people', 'users', '대상자', path.startsWith('#/admin/p'))}
        <button type="button" class="nav" data-act="logout" data-tip="로그아웃">${icon('logout', 20)}<span>로그아웃</span></button>
      </nav>
      <div class="side-foot">
        <span class="short"><span class="initial" aria-hidden="true">${initial(me.name)}</span></span>
        <span class="short nm">${esc(me.name)}</span><span class="short jb">${esc(me.job)}</span>
        <div class="long"><small>담당 인력</small><b>${esc(displayName(me))}</b><span>${esc(me.org || '소속 미입력')}</span></div>
      </div>
    </aside>
    <div class="scrim" data-act="closeSide"></div>
    <div class="content">
      <header class="topbar"><button type="button" class="btn btn-secondary btn-icon btn-sm" data-act="openSide" aria-label="메뉴 열기" aria-expanded="false">${icon('menu')}</button>
        <a class="logo-mark" href="#/admin" aria-label="전체 현황">I-ME</a><b>${esc(pg.docTitle || pg.title)}</b></header>
      <div class="page">
        <header class="phead">
          <div>${crumbs}${pg.title && !pg.hideTitle ? `<h1>${esc(pg.title)}</h1>` : ''}${pg.sub ? `<p class="sub">${pg.sub}</p>` : ''}</div>
          <div class="phead-actions">
            ${pg.head || ''}
            <form class="hsearch" role="search" data-submit="hsearch">${icon('search', 16)}<input name="q" aria-label="대상자 검색" placeholder="이름 또는 담당자 검색"></form>
            ${switchTop('admin')}
          </div>
        </header>
        ${pg.html}
      </div>
    </div>`;
}

const shellActions = {
  openSide: el => { document.body.classList.add('side-open'); el.setAttribute('aria-expanded', 'true'); document.querySelector('.side .nav')?.focus(); },
  closeSide: () => { document.body.classList.remove('side-open'); document.querySelector('.topbar .btn')?.setAttribute('aria-expanded', 'false'); },
  toggleRail: el => {
    const wide = !document.body.classList.contains('side-wide');
    document.body.classList.toggle('side-wide', wide);
    el.setAttribute('aria-expanded', wide);
    el.setAttribute('aria-label', wide ? '메뉴 접기' : '메뉴 펼치기');
    try { localStorage.setItem(railKey, wide ? '1' : '0'); } catch { /* 저장이 막힌 브라우저: 이번 화면에서만 */ }
    map?.invalidateSize();
  },
  logout: () => { setLogin(null); location.hash = '#/login'; },
  hsearch: f => { list.q = f.q.value.trim(); if (location.hash === '#/admin/people') render(); else location.hash = '#/admin/people'; }
};

function home() {
  document.title = 'I-ME';
  app.innerHTML = `
    <div class="brand"><div class="logo-mark" aria-hidden="true">I-ME</div><div class="brand-name">I-ME</div></div>
    <div class="stack">
      <a class="big-btn tile" href="#/user"><span class="ic">${icon('phone', 20)}</span>대상자 화면<span class="chev">${icon('chev', 20)}</span></a>
      <a class="big-btn tile ghost" href="#/admin"><span class="ic">${icon('chart', 20)}</span>관리자 화면<span class="chev">${icon('chev', 20)}</span></a>
    </div>`;
}

// ---------- 대상자(어르신) 화면 — 로그인 없이 쓴다 ----------
function userSelect() {
  document.title = '어르신 · I-ME';
  const people = getData().people.filter(p => p.active);
  app.innerHTML = `
    ${switchTop('user')}
    <h1>누구세요?</h1>
    <div class="stack">${people.map(p => `
      <button type="button" class="big-btn tile" data-act="pick" data-id="${p.id}"><span class="avatar" aria-hidden="true">${initial(p.name)}</span>${esc(p.name)}<span class="chev">${icon('chev', 20)}</span></button>`).join('')}
    </div>
    <a class="big-btn ghost" href="#/">${icon('back', 20)}처음으로</a>`;
  actions.pick = el => ringing(people.find(p => p.id === el.dataset.id));
}

function ringing(p) {
  app.innerHTML = `
    <div class="phone">
      <p class="caller-label">보건소 안부전화</p>
      <div class="pulse"><div class="avatar">${icon('heart', 20)}</div></div>
      <h1>안부 전화가 왔습니다</h1>
      <div class="answer">
        <button type="button" class="big-btn accept" data-act="accept">${icon('phone', 20)}받기</button>
        <button type="button" class="big-btn reject" data-act="reject">${icon('phone', 20)}거절</button>
      </div>
    </div>`;
  const stopRing = startRing();
  // 전화가 울리는 동안 서버 상태와 AI 인사를 미리 받아 둔다 (보내는 것: 지난 안부 요약만)
  const summaries = getData().calls.filter(c => c.personId === p.id && c.aiSummary?.summary)
    .sort((a, b) => (b.startedAt || b.date).localeCompare(a.startedAt || a.date)).map(c => c.aiSummary.summary);
  const prep = prepareCall(p, summaries, getData().settings);
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
    app.innerHTML = `<h1>전화를 받지 않으셨어요.</h1><a class="big-btn" href="#/">${icon('back', 20)}처음으로</a>`;
  }
  actions.reject = missed;
  actions.accept = () => { cleanup(); inCall(p, prep); };
}

async function inCall(p, prep) {
  app.innerHTML = `
    <div class="phone">
      <div class="call-top"><span class="live">통화 중</span><span class="timer" id="time">00:00</span></div>
      <div class="question" id="q" aria-live="polite">연결 중</div>
      <div class="voice" id="lv" aria-hidden="true">${'<span></span>'.repeat(7)}</div>
      <button type="button" class="big-btn ghost" data-act="next">다음 ${icon('next', 20)}</button>
    </div>`;
  const $ = id => document.getElementById(id); // 화면을 떠난 뒤에는 null
  const weights = [0.45, 0.7, 0.9, 1, 0.9, 0.7, 0.45];
  const ui = {
    time: s => { const el = $('time'); if (el) el.textContent = mmss(s); },
    question: t => { const el = $('q'); if (el) el.textContent = t; },
    level: v => {
      const bars = $('lv')?.children || [];
      [...bars].forEach((b, i) => { b.style.height = 14 + Math.min(60, v * 900 * weights[i] * (0.7 + Math.random() * 0.6)) + 'px'; });
    },
    // 응급 표현: 통화가 끝나기 전에 바로 관리자 알림(높음)을 만든다
    emergency: text => {
      const d = getData();
      d.alerts.push({
        id: 'al' + Date.now().toString(36), personId: p.id, createdAt: nowStamp(), type: 'emergency', level: 'refer', status: 'open',
        referredAt: null, notifiedAt: null, notifiedTo: null, outcome: null, checklist: {}, note: `통화 중 발화: "${text}"`
      });
      save();
    }
  };
  actions.next = nextItem;
  cleanup = stopCall;

  let res;
  try {
    res = await runCall(getData().settings, ui, p, prep); // 호칭·말 속도·다시 읽기 횟수는 대상자 기본 정보에서
  } catch {
    cleanup = null;
    app.innerHTML = `<h1>마이크 사용 불가</h1>
      <p>크롬에서 http://localhost:8000 접속 후 마이크 허용</p>
      <a class="big-btn" href="#/">${icon('back', 20)}처음으로</a>`;
    return;
  }
  cleanup = null;
  if (!res) return; // 통화 도중 화면을 떠남

  const d = getData();
  const id = Date.now().toString(36);
  const audioId = res.blob.size ? 'a' + id : null;
  if (audioId) await saveAudio(audioId, res.blob);
  const call = { id: 'c' + id, personId: p.id, ...res.call, z: null, audioId };
  d.calls.push(call);
  refreshZ(d, p, todayStr());
  evaluate([p.id]);
  // 통화 후 정리 (AI): 인용이 확인된 항목만 붙인다. 실패하면 규칙 기반 추출 그대로.
  if (res.aiChat) summarizeCall(res.talk).then(raw => {
    const sum = checkSummary(raw, res.talk.filter(t => t.role === 'elder').map(t => t.text));
    if (!sum) return;
    call.aiSummary = { summary: sum.summary, concerns: sum.concerns, requests: sum.requests };
    for (const r of sum.requests) if (!call.requests.includes(r.quote)) call.requests.push(r.quote);
    for (const k of ['sleep', 'mood']) {
      const v = sum.selfReport[k];
      if (call.selfReport?.[k] && call.selfReport[k].value == null && v !== 'unknown') call.selfReport[k].value = v;
    }
    save();
  });
  // 점수나 위험도는 대상자에게 보여주지 않는다
  app.innerHTML = `
    <div class="done-mark">${icon('check', 20)}</div>
    <h1>오늘도 통화해 주셔서 감사합니다.</h1>
    <a class="big-btn" href="#/">${icon('back', 20)}처음으로</a>`;
}

// ---------- 로그인·회원가입 (왼쪽 40% 로고 · 오른쪽 380px 입력) ----------
// 입력칸 오류: 입력칸 아래 글자 + aria-invalid + aria-describedby
function showErrors(f, errs) {
  f.querySelectorAll('[data-err]').forEach(el => {
    const msg = errs[el.dataset.err] || '';
    el.textContent = msg;
    const input = f.querySelector(`[name="${el.dataset.err}"]`);
    if (!input) return;
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (msg) input.setAttribute('aria-describedby', el.id); else input.removeAttribute('aria-describedby');
  });
  f.querySelector('[aria-invalid="true"]')?.focus();
}

function authPage(signup, params) {
  const next = params.get('next') || '#/admin';
  const q = encodeURIComponent(next);
  const field = (label, input, key, req = true) => `<label><span>${label}${req ? ' <span class="req" aria-hidden="true">*</span>' : ''}</span>${input}<small class="err" id="err-${key}" data-err="${key}"></small></label>`;
  const pw = (name, auto, ph = '') => `<span class="pw"><input name="${name}" type="password" autocomplete="${auto}" aria-required="true" ${ph}><button type="button" class="btn btn-ghost btn-sm" data-act="pwToggle" aria-pressed="false" aria-label="비밀번호 보기">${icon('eye', 16)}보기</button></span>`;
  // 웅촌면 경계를 옅게 그린 장식
  const pts = ungchon.geometry.coordinates[0];
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const [minX, minY, maxX, maxY] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const ring = pts.map(([x, y]) => `${(x - minX).toFixed(5)},${(maxY - y).toFixed(5)}`).join(' L');
  const deco = `<svg class="deco" viewBox="0 0 ${(maxX - minX).toFixed(5)} ${(maxY - minY).toFixed(5)}" aria-hidden="true"><path d="M${ring}Z"/></svg>`;

  actions.pwToggle = el => {
    const input = el.parentElement.querySelector('input');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    el.setAttribute('aria-pressed', show);
    el.innerHTML = `${icon(show ? 'eyeOff' : 'eye', 16)}${show ? '숨기기' : '보기'}`;
  };
  actions.login = async (f) => {
    const b = f.querySelector('[type=submit]');
    b.setAttribute('aria-busy', 'true');
    const acc = (getData().accounts || []).find(a => a.username === f.username.value.trim());
    const ok = acc && (await verifyPassword(acc, f.password.value));
    b.removeAttribute('aria-busy');
    if (!ok) { showErrors(f, { password: '아이디 또는 비밀번호 불일치' }); return; }
    setLogin(acc.id);
    location.hash = next;
  };
  actions.signup = async f => {
    const v = n => f[n].value.trim();
    const errs = {};
    for (const n of ['name', 'org', 'username']) if (!v(n)) errs[n] = '입력 필요';
    const accounts = getData().accounts || [];
    if (v('username') && accounts.some(a => a.username === v('username'))) errs.username = '이미 있는 아이디';
    if (f.password.value.length < 6) errs.password = '6자 이상';
    if (f.password.value !== f.password2.value) errs.password2 = '비밀번호 불일치';
    showErrors(f, errs);
    if (Object.keys(errs).length) return;
    const salt = makeSalt();
    const d = getData();
    d.accounts = [...accounts, {
      id: 'u' + Date.now().toString(36), username: v('username'), name: v('name'), job: f.job.value, org: v('org'),
      salt, hash: await hashPassword(salt, f.password.value), createdAt: nowStamp()
    }];
    save();
    location.hash = `#/login?joined=1&id=${encodeURIComponent(v('username'))}&next=${q}`;
  };

  const tabs = `<nav class="tabs" role="tablist" aria-label="로그인·회원가입">
    <a role="tab" href="#/login?next=${q}" aria-selected="${!signup}" tabindex="${signup ? -1 : 0}">로그인</a>
    <a role="tab" href="#/signup?next=${q}" aria-selected="${signup}" tabindex="${signup ? 0 : -1}">회원가입</a></nav>`;
  const form = signup ? `
      <form class="auth-card" data-submit="signup" novalidate>
        ${tabs}
        ${field('이름', '<input name="name" autocomplete="name" aria-required="true">', 'name')}
        ${field('직종', `<select name="job">${JOBS.map(j => `<option>${j}</option>`).join('')}</select>`, 'job')}
        ${field('소속', '<input name="org" placeholder="웅촌면 보건지소" aria-required="true">', 'org')}
        ${field('아이디', '<input name="username" autocomplete="username" aria-required="true">', 'username')}
        ${field('비밀번호', pw('password', 'new-password', 'placeholder="6자 이상"'), 'password')}
        ${field('비밀번호 확인', pw('password2', 'new-password'), 'password2')}
        <button class="btn btn-primary btn-block" type="submit">가입</button>
      </form>` : `
      <form class="auth-card" data-submit="login" novalidate>
        ${tabs}
        ${params.get('joined') ? '<p class="ok-msg" role="status">가입 완료 · 로그인 필요</p>' : ''}
        ${field('아이디', `<input name="username" autocomplete="username" aria-required="true" value="${esc(params.get('id') || '')}">`, 'username')}
        ${field('비밀번호', pw('password', 'current-password'), 'password')}
        <button class="btn btn-primary btn-block" type="submit">로그인</button>
      </form>`;
  return {
    bare: true, title: signup ? '회원가입' : '로그인',
    html: `
      <div class="auth2">
        <div class="auth-brand"><a class="logo-mark" href="#/" aria-label="I-ME 처음 화면">I-ME</a><h1>I-ME</h1><p>지역사회 인지건강 관리</p>${deco}</div>
        <div class="auth-form" style="position:relative">${switchTop('admin')}${form}</div>
      </div>`,
    after: () => app.querySelector(signup ? '[name=name]' : params.get('id') ? '[name=password]' : '[name=username]')?.focus()
  };
}

// ---------- 전체 현황 ----------
// 오늘 할 일: 통화(완료·무응답·대기), 방문, 담당 알림. scope = 담당자 표시 이름(내 담당) 또는 null(전체)
function todayPlan(d, today, scope) {
  const people = d.people.filter(p => p.active && (!scope || p.manager === scope));
  const ids = new Set(people.map(p => p.id));
  const toMin = t => { const [h, m] = (t || '10:00').split(':').map(Number); return h * 60 + (m || 0); };
  const calls = people.filter(p => isCallDay(p, today)).map(p => {
    const c = d.calls.filter(x => x.personId === p.id && x.date === today).sort((a, b) => (a.startedAt || '').localeCompare(b.startedAt || '')).at(-1);
    const status = !c ? 'wait' : c.status === 'missed' ? 'miss' : 'done';
    return { p, c, status, min: toMin(c ? c.time || c.startedAt?.slice(11, 16) : p.preferredTime) };
  });
  const visits = d.visits.filter(v => v.date === today && v.status !== 'canceled' && (!scope || ids.has(v.personId) || v.visitor === scope))
    .map(v => ({ v, p: d.people.find(x => x.id === v.personId), start: visitStart(v), end: visitEnd(v) }));
  const alerts = d.alerts.filter(a => a.status === 'open' && ids.has(a.personId)).length;
  const n = { visit: visits.filter(x => x.v.status === 'planned').length, wait: calls.filter(x => x.status === 'wait').length, miss: calls.filter(x => x.status === 'miss').length, alerts };
  return { calls, visits, n, total: n.visit + n.wait + n.miss + n.alerts };
}

// 오늘 시간표 SVG (가로 110px). 너비는 그릴 때 칸 너비를 읽는다.
function timelineSvg(plan, width) {
  const H = 110, L = 28, Rr = 28;
  const now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes();
  const [a, b] = timelineRange([...plan.calls.map(x => x.min), ...plan.visits.flatMap(x => [x.start, x.end])]);
  const X = m => L + ((m - a) / (b - a)) * (width - L - Rr);
  const ST = { done: ['c-done', '완료'], miss: ['c-miss', '무응답'], wait: ['c-wait', '대기'] };
  const hh = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  let s = '';
  for (let m = a; m <= b; m += 120) s += `<line class="grid" x1="${X(m)}" x2="${X(m)}" y1="40" y2="92"/><text class="tick" x="${X(m)}" y="106" text-anchor="middle">${hh(m)}</text>`;
  s += `<line class="axis" x1="${L}" x2="${width - Rr}" y1="64" y2="64"/>`;
  for (const { v, p, start, end } of plan.visits) {
    const x1 = X(start), w = Math.max(6, X(end) - x1);
    const label = `${p?.name || '-'} 방문 ${hh(start)}~${hh(end)}`;
    s += `<a role="button" tabindex="0" data-act="openVisit" data-v="${v.id}" aria-label="${esc(label)}"><title>${esc(label)}</title>
      <rect class="vbar" x="${x1}" y="14" width="${w}" height="22" rx="6"/>${w > 44 ? `<text class="vtext" x="${x1 + 6}" y="29">${esc(p?.name || '-')}</text>` : ''}</a>`;
  }
  const labs = layoutLabels(plan.calls.map(x => ({ ...x, x: X(x.min) })));
  for (const it of labs) {
    const [cls, t] = ST[it.status];
    const label = `${it.p.name} ${hh(it.min)} 통화 ${t}`;
    const href = it.c ? `#/admin/p/${it.p.id}/calls?call=${it.c.id}` : `#/admin/p/${it.p.id}/calls`;
    s += `<a href="${href}" aria-label="${esc(label)}"><title>${esc(label)}</title><circle class="${cls}" cx="${it.x}" cy="64" r="6"/>
      <text class="lbl ${it.hidden ? 'hide' : ''}" x="${it.x}" y="${it.side === 'top' ? 50 : 84}" text-anchor="middle">${esc(it.p.name)}</text></a>`;
  }
  if (nowMin >= a && nowMin <= b) s += `<line class="now" x1="${X(nowMin)}" x2="${X(nowMin)}" y1="10" y2="92"/><text class="now-t" x="${X(nowMin) + 4}" y="9">${hh(nowMin)}</text>`;
  return `<svg class="tl" width="${width}" height="${H}" viewBox="0 0 ${width} ${H}" role="group" aria-label="오늘 통화·방문 시간표">${s}</svg>`;
}

function dashboardPage() {
  const d = getData(), s = d.settings, today = todayStr();
  const me = currentAccount(), mine = displayName(me);
  const people = d.people.filter(p => p.active);
  const R = new Map(d.people.map(p => [p.id, risk(p)]));
  const count = lv => people.filter(p => R.get(p.id).level === lv).length;

  const openAlerts = d.alerts.filter(a => a.status === 'open' && people.some(p => p.id === a.personId));
  const comp = completionDelta(d, today);
  const callToday = people.filter(p => isCallDay(p, today)); // 통화 일시중지·통화 요일이 아닌 사람은 오늘 대상에서 뺀다
  const todayCalls = d.calls.filter(c => c.date === today && callToday.some(p => p.id === c.personId));
  const openReq = (d.requests || []).filter(r => r.status === 'open' && people.some(p => p.id === r.personId));
  const oldestReq = openReq.map(r => r.date).sort()[0];
  const doneToday = new Set(todayCalls.filter(c => c.status === 'completed').map(c => c.personId)).size;
  const missedToday = new Set(todayCalls.filter(c => c.status === 'missed').map(c => c.personId)).size;
  const weekVisits = d.visits.filter(v => v.status === 'planned' && v.date >= today && v.date <= addDays(today, 6));
  if (!dashCal.selected) dashCal = { view: '2w', anchor: today, month: today.slice(0, 7), selected: today, visitor: '' };
  const dayVisits = d.visits.filter(v => v.date === dashCal.selected && (!dashCal.visitor || v.visitor === dashCal.visitor))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const plan = todayPlan(d, today, tlMine ? mine : null);

  const dl = comp.delta;
  const kpis = [
    ['#/admin/people', '전체 대상자', `${people.length}<small>명</small>`, `높음 ${count('high')} · 주의 ${count('mid')}`],
    ['#/admin/people?alerts=1', '미조치 알림', `${openAlerts.length}<small>건</small>`, `의뢰 단계 ${openAlerts.filter(a => a.level === 'refer').length}건`],
    ['#/admin/people?sort=rate', '7일 완료율', comp.now == null ? '-' : `${fmtNum(comp.now, 1)}<small>%</small>`,
      dl == null ? '목표 80%' : `<span class="${dl >= 0 ? 'up' : 'down'}">${dl >= 0 ? '▲' : '▼'} ${fmtNum(Math.abs(dl), 1)}%p</span> 지난주 대비`],
    ['#/admin/people', '오늘 통화', `${doneToday}<small>/ ${callToday.length}</small>`, `무응답 ${missedToday}`],
    ['#/admin?to=cal', '방문 예정', `${weekVisits.length}<small>건</small>`, `7일 안 · 오늘 ${weekVisits.filter(v => v.date === today).length}건`],
    ['#/admin/people?view=requests', '미처리 요청', `${openReq.length}<small>건</small>`, oldestReq ? `가장 오래된 요청 ${daysBetween(oldestReq, today)}일 경과` : '없음']
  ];

  // 우선 확인 대상자: 위험도 높은 순 → 같은 등급이면 score 낮은 순, 상위 5명
  const prio = [...people].sort((a, b) => {
    const ra = R.get(a.id), rb = R.get(b.id);
    return RISK_RANK[rb.level] - RISK_RANK[ra.level] || (ra.score ?? 999) - (rb.score ?? 999);
  }).slice(0, 5);

  // 운영 지표 (계획서 평가 지표)
  const m = dashboard(d, period, today, getNightVitals);
  const goal = (v, ok) => (v == null ? null : ok(v));
  const rows = [
    ['통화 완료율', pctText(m.completionRate), '목표 80% 이상', goal(m.completionRate, v => v >= 80), m.completionRate],
    ['무응답률', pctText(m.missedRate)],
    ['평균 통화 시간', fmtDur(m.avgDurationSec), '목표 3분 이하', goal(m.avgDurationSec, v => v <= 180), m.avgDurationSec == null ? null : (m.avgDurationSec / 180) * 100],
    ['유효 측정일 비율', pctText(m.validDayRate), '목표 70% 이상', goal(m.validDayRate, v => v >= 70), m.validDayRate],
    ['웨어러블 착용 순응도', pctText(m.wearRate), '목표 75% 이상', goal(m.wearRate, v => v >= 75), m.wearRate],
    ['8주 유지율', pctText(m.retention8w), '목표 70% 이상', goal(m.retention8w, v => v >= 70), m.retention8w],
    ['기저선 이탈 탐지율', pctText(m.detectionRate)],
    ['의뢰 연계율', pctText(m.referralRate)],
    ['연계 후 확진율 (PPV)', pctText(m.ppv)],
    ['오경보율', pctText(m.falseAlarmRate)],
    ['수면무호흡 의심 / 난청 의심', `${fmtUnit(m.spo2Alerts, '건')} / ${fmtUnit(m.hearingAlerts, '건')}`]
  ];

  const bandChip = (href, label, n, attrs = '') => `<a class="band-chip" href="${href}" ${attrs}>${label} <b>${n}</b></a>`;
  const html = `
    <div class="hero-block">
      <div class="band">
        <div class="band-top">
          <div class="band-title"><span class="d">오늘 · ${fmtMDW(today)}</span><b>할 일</b><span class="n">${plan.total}</span><span class="d">건</span></div>
          <div class="band-chips">
            ${bandChip('#/admin?to=cal', '방문', plan.n.visit)}
            ${bandChip('#/admin/people', '통화 대기', plan.n.wait)}
            ${bandChip('#/admin/people', '무응답 확인', plan.n.miss)}
            ${bandChip('#/admin/people?alerts=1', '담당 알림', plan.n.alerts)}
            <div class="seg" role="group" aria-label="시간표 범위">
              <button type="button" data-act="tlScope" data-v="all" aria-pressed="${!tlMine}" class="${tlMine ? '' : 'on'}">전체</button>
              <button type="button" data-act="tlScope" data-v="mine" aria-pressed="${tlMine}" class="${tlMine ? 'on' : ''}">내 담당</button>
            </div>
          </div>
        </div>
        <div class="tl-scroll" id="tl">${plan.calls.length || plan.visits.length ? '' : `<p class="d small" style="padding:8px 0">${tlMine ? '내 담당 대상자의 오늘 일정 없음' : '오늘 일정 없음'}</p>`}</div>
      </div>
      <div class="map-wrap">
        <div class="map-box">
          <div id="map" class="map" aria-label="울주군 웅촌면 대상자 지도"></div>
          <div id="map-state" class="map-state skeleton">지도 불러오는 중</div>
          <div class="legend-glass glass" aria-label="범례">
            ${['low', 'mid', 'high'].map((lv, k) => `<span><i style="width:${14 + 4 * k}px;height:${14 + 4 * k}px;background:var(--${lv})"></i>${RISK[lv]} ${count(lv)}</span>`).join('')}
          </div>
        </div>
        <div class="sum glass">${kpis.map(([href, k, v, x]) => `
          <a href="${href}"><span class="k">${k}</span><span class="v">${v}</span><span class="x">${x}</span></a>`).join('')}</div>
        <aside class="prio-glass glass" aria-label="우선 확인 대상자">
          <div class="card-head"><h2>우선 확인</h2><span class="sub">위험도 높은 순 · 상위 5명</span></div>
          <div class="prio-list">${prio.map(p => prioRow(p, R.get(p.id))).join('') || empty('대상자 없음', 'users')}</div>
        </aside>
      </div>
    </div>

    <div class="grid2">
      <section class="card" id="cal">
        <div class="card-head"><h2>방문 일정</h2><span class="sub">날짜를 누르면 그날 목록</span></div>
        ${monthCalendar({ ns: 'dc', view: dashCal.view, views: true, anchor: dashCal.anchor, month: dashCal.month, selected: dashCal.selected, visitor: dashCal.visitor,
          levelOf: id => (R.get(id) || { level: 'low' }).level, visits: d.visits.filter(v => !dashCal.visitor || v.visitor === dashCal.visitor) })}
        <div class="daylist">
          <h3>${fmtMDW(dashCal.selected)} · ${dayVisits.length}건</h3>
          ${dayVisits.length ? dayVisits.map(v => { const vp = d.people.find(p => p.id === v.personId); return `
            <div class="dayrow st-${v.status}" data-act="openVisit" data-v="${v.id}" role="button" tabindex="0">
              <b class="time">${visitLine(v)}</b>
              <span><span class="name">${esc(vp?.name || '-')}</span> ${vp ? riskChip((R.get(vp.id) || { level: 'low' }).level) : ''}</span>
              <span class="muted small">${esc(v.type)} · ${esc(v.visitor)}${v.purpose ? ' · ' + esc(v.purpose) : ''}</span>
              <span class="chip ${v.status === 'canceled' ? 'chip-mid' : v.status === 'done' ? 'chip-low' : 'chip-info'}">${VISIT_STATUS[v.status]}</span>
            </div>`; }).join('') : empty('일정 없음', 'calendar')}
        </div>
      </section>
      <section class="card">
        <div class="card-head"><h2>위험도 분포</h2><span class="sub">누르면 대상자 목록</span></div>
        <div class="donut-row">
          <div class="donut"><canvas id="riskChart" aria-label="위험도 분포 도넛" role="img"></canvas>
            <div class="center"><b>${people.length}</b><small>전체 대상자</small></div></div>
          <div class="dist">${['high', 'mid', 'low'].map(lv => `
            <a href="#/admin/people?risk=${lv}"><i class="dot dot-${lv}"></i>${RISK[lv]}<b>${count(lv)}</b></a>`).join('')}</div>
        </div>
      </section>
    </div>

    <div class="grid2" style="margin-top:var(--s5)">
      <section class="card">
        <div class="card-head"><h2>통화 현황 · 최근 14일</h2>
          ${legendHtml([['완료', 'var(--accent)'], ['무응답', 'var(--miss)'], ['대기', 'var(--pending)'], ['목표 80%', 'var(--ink-2)', true]])}</div>
        <div class="chartbox"><canvas id="callChart" role="img" aria-label="최근 14일 일별 통화 완료·무응답·대기"></canvas></div>
      </section>
      <section class="card">
        <div class="card-head"><h2>운영 지표</h2>
          <div class="seg" role="group" aria-label="기간">${[[7, '7일'], [30, '30일'], [null, '전체']].map(([v, t]) =>
            `<button type="button" data-act="period" data-v="${v}" aria-pressed="${period === v}" class="${period === v ? 'on' : ''}">${t}</button>`).join('')}</div>
        </div>
        <div class="kpi-rows">${rows.map(([label, v, g, ok, fill]) => `
          <div class="kpi-row">
            <span class="k">${label}</span><b class="v">${v}</b>
            ${g ? `<div class="bar ${ok === false ? 'bad' : ''}"><i style="width:${Math.max(0, Math.min(100, fill ?? 0))}%"></i></div>
              <div class="g"><span>${g}</span>${ok == null ? '' : ok ? '<span class="ok-t">달성</span>' : '<span class="bad-t">미달</span>'}</div>` : ''}
          </div>`).join('')}</div>
        <p class="muted small" style="margin-top:var(--s4)">알림 관련 지표(탐지율·연계율·PPV·오경보율·알림 수): 전체 기간</p>
      </section>
    </div>

    <details class="card" style="margin-top:var(--s5)">
      <summary><h2>판정 설정</h2><span class="muted small">판정 파라미터 · 데이터 재생성 · 초기화</span></summary>
      <form class="form" data-submit="saveSettings">${Object.keys(DEFAULT_SETTINGS).map(k => `
        <label>${SETTING_LABEL[k]}<input id="set-${k}" type="number" step="any" value="${s[k]}"></label>`).join('')}
        <button class="btn btn-primary" type="submit">저장</button>
      </form>
      <div class="card-head" style="margin:var(--s6) 0 var(--s2)"><h2>AI 음성 · 대화</h2></div>
      <div id="voice-set" class="stack"><p class="muted">확인 중</p></div>
      <p class="muted small" style="margin-top:var(--s3)">음성 합성: Typecast</p>
      <div class="row" style="margin-top:var(--s5)">
        ${btn(`${icon('refresh', 16)}재생성`, 'data-act="reseed"', 'secondary', '')}
        ${btn(`${icon('trash', 16)}초기화`, 'data-act="wipe"', 'danger', '')}
      </div>
    </details>`;

  actions.period = el => { period = el.dataset.v === 'null' ? null : +el.dataset.v; render(); };
  actions.tlScope = el => { tlMine = el.dataset.v === 'mine'; render(); };
  actions.dcPick = el => { dashCal.selected = el.dataset.date; render(); document.getElementById('cal')?.scrollIntoView({ block: 'nearest' }); };
  actions.dcNav = el => {
    const n = +el.dataset.m;
    if (n === 0) Object.assign(dashCal, { anchor: today, month: today.slice(0, 7), selected: today });
    else if (dashCal.view === '2w') dashCal.anchor = addDays(dashCal.anchor, 14 * n);
    else dashCal.month = shiftMonth(dashCal.month, n);
    render();
  };
  actions.dcView = el => { dashCal.view = el.dataset.v; dashCal.month = dashCal.selected.slice(0, 7); dashCal.anchor = dashCal.selected; render(); };
  actions.dcFilter = el => { dashCal.visitor = el.dataset.v; render(); };
  actions.mapRetry = () => render();
  actions.saveSettings = () => {
    for (const k of Object.keys(DEFAULT_SETTINGS)) {
      const v = parseFloat(document.getElementById('set-' + k).value);
      if (!Number.isNaN(v)) s[k] = v;
    }
    evaluate();
    render();
    toast('설정 저장됨');
  };
  actions.reseed = async () => {
    if (!(await confirmBox({ title: '데이터 재생성', text: '통화·방문·일지 기록과 녹음이 지워지고 기본 데이터로 다시 만들어짐 (설정·회원 계정·링 데이터 유지)', ok: '재생성', danger: true }))) return;
    await clearAudio();
    setData(reseed(getData()));
    render();
    toast('데이터 재생성됨');
  };
  actions.wipe = async () => {
    if (!(await confirmBox({ title: '전체 초기화', text: '대상자·기록·녹음·방문·설정이 모두 삭제되고 되돌릴 수 없음 (회원 계정 유지)', ok: '초기화', danger: true }))) return;
    await clearAudio();
    setData({ seedVersion: SEED_VERSION, settings: { ...DEFAULT_SETTINGS }, people: [], calls: [], vitals: [], alerts: [], visits: [], accounts: getData().accounts || [] });
    render();
    toast('초기화됨');
  };

  // AI 음성 설정: 서버(/api/health)의 목소리 목록에서 앱 전체에 하나만 고른다
  const drawVoices = async () => {
    const box = document.getElementById('voice-set');
    const h = await getHealth();
    if (!box || !document.contains(box)) return;
    const cur = h.voices.some(v => v.id === s.voiceId) ? s.voiceId : h.voices[0]?.id;
    const status = h.tts ? 'AI 음성 사용 중' : h.credits ? '음성 크레딧 부족 · 기본 음성' : 'AI 음성 미사용 · 기본 음성';
    box.innerHTML = `
      <p><span class="chip ${h.tts ? 'chip-low' : h.credits ? 'chip-mid' : 'chip-neutral'}">${status}</span>
        <span class="chip ${h.llm ? 'chip-low' : 'chip-neutral'}">${h.llm ? 'AI 대화 사용 중' : 'AI 대화 미사용 · 고정 대본'}</span></p>
      ${h.voices.length ? `<div class="stack" role="radiogroup" aria-label="목소리">${h.voices.map(v => `
        <div class="row"><label class="check"><input type="radio" name="voice" value="${esc(v.id)}" data-change="voicePick" ${v.id === cur ? 'checked' : ''}> ${esc(v.label)}</label>
          ${btn(`${icon('play', 16)}미리 듣기`, `data-act="voiceTry" data-v="${esc(v.id)}" ${h.tts ? '' : 'disabled'}`)}</div>`).join('')}</div>`
        : '<p class="muted small">목소리 목록 없음 · server.py로 실행하고 .env에 TYPECAST_VOICES 입력</p>'}`;
  };
  actions.voicePick = el => { s.voiceId = el.value; save(); toast('목소리 저장됨'); };
  actions.voiceTry = async el => {
    el.setAttribute('aria-busy', 'true');
    const r = await fetchVoice('안녕하세요. 보건소 안부 전화예요.', el.dataset.v, 0.9, true);
    el.removeAttribute('aria-busy');
    if (!r.blob) { toast(r.error === 'credits' ? '음성 크레딧 부족' : '미리 듣기 실패', { error: true }); drawVoices(); return; }
    const a = new Audio(URL.createObjectURL(r.blob));
    a.onended = () => URL.revokeObjectURL(a.src);
    a.play().catch(() => toast('재생 실패', { error: true }));
  };

  const drawTl = () => {
    const box = document.getElementById('tl');
    if (!box || (!plan.calls.length && !plan.visits.length)) return;
    const focused = document.activeElement?.closest?.('#tl') ? document.activeElement.getAttribute('aria-label') : null;
    box.innerHTML = timelineSvg(plan, Math.max(innerWidth <= 768 ? 720 : 600, box.clientWidth));
    if (focused) box.querySelector(`[aria-label="${CSS.escape(focused)}"]`)?.focus();
  };

  return {
    title: '전체 현황', sub: fmtDate(today), html,
    after: () => {
      drawTl();
      drawVoices();
      timers.push(setInterval(drawTl, 60000)); // 현재 시각 선은 1분마다
      if (new URLSearchParams(location.hash.split('?')[1] || '').get('to') === 'cal') document.getElementById('cal')?.scrollIntoView({ block: 'start' });
      drawMap(people, R);
      if (!window.Chart) return;
      // 위험도 분포 도넛: 지름 150, 두께 16, 조각 간격 3
      charts.push(new Chart(document.getElementById('riskChart'), {
        type: 'doughnut',
        data: { labels: ['낮음', '주의', '높음'], datasets: [{ data: [count('low'), count('mid'), count('high')], backgroundColor: ['low', 'mid', 'high'].map(riskColor), borderWidth: 0, spacing: 3 }] },
        options: {
          maintainAspectRatio: false, cutout: 75 - 16,
          onClick: (e, els) => { if (els.length) location.hash = '#/admin/people?risk=' + ['low', 'mid', 'high'][els[0].index]; },
          onHover: (e, els) => { e.native.target.style.cursor = els.length ? 'pointer' : 'default'; }
        }
      }));
      // 최근 14일 통화: 완료 · 무응답 · 대기 + 목표 80% 점선
      const days = [...Array(14)].map((_, i) => addDays(today, i - 13));
      const targets = days.map(dt => d.people.filter(p => (p.active || (p.closed && p.closed.date > dt)) && p.enrolledAt <= dt && isCallDay(p, dt)));
      const cnt = st => days.map(dt => d.calls.filter(c => c.date === dt && c.status === st).length);
      const done = cnt('completed'), miss = cnt('missed');
      const wait = days.map((dt, i) => targets[i].filter(p => !d.calls.some(c => c.personId === p.id && c.date === dt)).length);
      const bar = { borderRadius: 3, borderSkipped: false, maxBarThickness: 18, stack: 'calls' };
      charts.push(new Chart(document.getElementById('callChart'), {
        type: 'bar',
        data: {
          labels: days.map(dt => fmtMD(dt)),
          datasets: [
            { label: '완료', data: done, backgroundColor: css('--accent'), ...bar },
            { label: '무응답', data: miss, backgroundColor: css('--miss'), ...bar },
            { label: '대기', data: wait, backgroundColor: css('--pending'), ...bar },
            { type: 'line', label: '목표 80%', data: targets.map(t => +(t.length * 0.8).toFixed(1)), borderColor: css('--ink-2'), borderDash: [5, 4], borderWidth: 1.5, stack: 'goal', stepped: 'middle' }
          ]
        },
        options: {
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          scales: {
            x: { stacked: true, grid: { display: false }, ticks: { autoSkip: false, maxRotation: 0, callback: (v, i) => (i === 13 ? '오늘' : (13 - i) % 2 ? '' : days.map(fmtMD)[i]) } },
            y: { stacked: true, beginAtZero: true, ticks: { precision: 0 }, border: { display: false } }
          }
        }
      }));
    }
  };
}

function prioRow(p, r) {
  const v = nextVisit(p.id);
  return `
    <div class="prio">
      <div class="prio-top">
        <a class="nm" href="#/admin/p/${p.id}">${esc(p.name)}</a><span class="muted small">${p.age ?? '-'}세</span>
        ${r.signals.mobilityLimited ? '<span class="chip chip-mid">거동 제한</span>' : ''}${riskChip(r.level)}
      </div>
      <div class="why" title="${esc(r.reasons.join(' · '))}">${esc(r.reasons.slice(0, 2).join(' · ') || '특이 사항 없음')}</div>
      <div class="act">
        <span class="rec" title="${esc(recommendAction(r))}">${esc(recommendAction(r))}</span>
        ${v ? btn(`${icon('calendar', 16)}방문 예정 ${mdot(v.date)}`, `data-act="openVisit" data-v="${v.id}"`, 'ghost')
            : btn(`${icon('calendar', 16)}방문 예약`, `data-act="openVisit" data-p="${p.id}"`)}
      </div>
    </div>`;
}

// 지도 바탕 (OpenStreetMap, 키 없이 쓰는 공개 타일). 색은 style.css에서 옅게. 불러오는 중 · 실패 · 다시 시도
function baseTiles(target, onLoad, onFail) {
  let loaded = false, errs = 0;
  return L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).on('tileload', () => { loaded = true; })
    .on('load', () => { if (loaded) onLoad?.(); }) // 모든 타일이 실패해도 load가 오므로, 한 장이라도 받았을 때만
    .on('tileerror', () => { if (!loaded && ++errs >= 4) onFail?.(); })
    .addTo(target);
}
const boundaryStyle = () => ({ color: css('--ink-2'), weight: 1.5, dashArray: '6 5', fillColor: css('--accent'), fillOpacity: 0.05 });

function drawMap(people, R) {
  const el = document.getElementById('map'), state = document.getElementById('map-state');
  const fail = () => {
    state.hidden = false;
    state.className = 'map-state';
    state.innerHTML = `${icon('alert', 20)}<span>지도를 불러오지 못함</span>${btn(`${icon('refresh', 16)}다시 시도`, 'data-act="mapRetry"')}`;
  };
  if (!window.L || !el) return fail();
  map = L.map(el, { scrollWheelZoom: false, zoomControl: false });
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  map.attributionControl.setPrefix(false).setPosition('bottomleft');
  baseTiles(map, () => { state.hidden = true; }, fail);
  const border = L.geoJSON(ungchon, { style: boundaryStyle(), interactive: false }).addTo(map);
  const wide = innerWidth > 1200;
  map.fitBounds(border.getBounds(), wide ? { paddingTopLeft: [24, 96], paddingBottomRight: [352, 48] } : { paddingTopLeft: [24, 24], paddingBottomRight: [48, 48] });

  // 높음 점이 가려지지 않게 낮음 → 주의 → 높음 순서로 그린다. 반지름 7 / 9 / 11, 높음은 퍼지는 고리
  const RAD = { low: 7, mid: 9, high: 11 };
  const placed = people.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng))
    .sort((a, b) => RISK_RANK[R.get(a.id).level] - RISK_RANK[R.get(b.id).level]);
  for (const p of placed) {
    const r = R.get(p.id);
    const last = getData().calls.filter(c => c.personId === p.id).map(c => c.date).sort().at(-1);
    if (r.level === 'high') L.marker([p.lat, p.lng], { icon: L.divIcon({ className: '', html: '<span class="pulse-ring"></span>', iconSize: [22, 22] }), interactive: false, keyboard: false }).addTo(map);
    L.circleMarker([p.lat, p.lng], { radius: RAD[r.level], color: css('--panel'), weight: 2.5, fillColor: riskColor(r.level), fillOpacity: 1 })
      .bindTooltip(esc(p.name), { direction: 'top', offset: [0, -RAD[r.level]] })
      .bindPopup(`
        <div class="pop">
          <b>${esc(p.name)}</b> <span class="muted">${p.age ?? '-'}세</span>
          <div>${riskChip(r.level)}</div>
          <div class="chips">${reasonChips(r.reasons, 2)}</div>
          <div class="muted small">최근 통화 ${mmdd(last)}</div>
          <a class="btn btn-primary btn-sm" href="#/admin/p/${p.id}">상세 보기</a>
        </div>`)
      .addTo(map);
  }
}

// ---------- 대상자 관리 ----------
// 대상자 관리 안의 보기 전환: 대상자 목록 · 어르신 요청사항 · 일지 관리
const subnav = view => `<nav class="tabs subtabs" aria-label="대상자 관리 보기">${[['', '대상자 목록'], ['requests', '어르신 요청사항'], ['journals', '일지 관리']]
  .map(([v, t]) => `<a href="#/admin/people${v ? '?view=' + v : ''}" ${(view || '') === v ? 'aria-selected="true" aria-current="page"' : ''}>${t}</a>`).join('')}</nav>`;
const addBtn = `<a class="btn btn-primary" href="#/admin/people/new">${icon('user', 16)}대상자 추가</a>`;

// 정렬 머리글: 버튼 + aria-sort + ▲/▼/↕
const sortTh = (k, t, cur, dir, n = false) => `<th aria-sort="${cur === k ? (dir > 0 ? 'ascending' : 'descending') : 'none'}" class="${n ? 'n' : ''}">
  <button type="button" class="th" data-act="sort" data-k="${k}" aria-pressed="${cur === k}">${t}<span class="sort" aria-hidden="true">${cur === k ? (dir > 0 ? '▲' : '▼') : '⇅'}</span></button></th>`;

function peoplePage(params) {
  if (params.get('view') === 'requests') return requestsPage();
  if (params.get('view') === 'journals') return journalsPage(params);
  const d = getData(), today = todayStr();
  const me = currentAccount();
  const R = new Map(d.people.map(p => [p.id, risk(p)]));
  const comp = new Map(d.people.map(p => [p.id, completion7(p, d.calls, today).rate]));
  const lastCall = id => d.calls.filter(c => c.personId === id).map(c => c.date).sort().at(-1) || null;
  if (params.get('sort') === 'rate') { list.sort = 'rate'; list.dir = 1; }
  if (params.get('risk')) list.risk = params.get('risk');
  if (params.has('visit')) list.visit = true;
  const onlyAlerts = params.has('alerts');

  const cols = [
    ['name', '이름'], ['age', '성별/나이'], ['address', '주소'], ['manager', '담당자'],
    ['risk', '위험도'], ['rate', '최근 7일 완료율', true], ['last', '최근 통화일'], ['visit', '다음 방문일']
  ];
  const sortVal = {
    name: p => p.name, age: p => p.age ?? 0, address: p => p.address || '', manager: p => p.manager || '',
    risk: p => RISK_RANK[R.get(p.id).level] * 1000 - (R.get(p.id).score ?? 0), rate: p => comp.get(p.id) ?? -1,
    last: p => lastCall(p.id) || '', visit: p => nextVisit(p.id)?.date || '9999'
  };

  const rows = () => {
    let ps = filterPeople(d.people.filter(p => p.active || (list.closed && p.closed)), list.q, list.mine && me ? displayName(me) : null);
    if (list.risk !== 'all') ps = ps.filter(p => R.get(p.id).level === list.risk);
    if (list.visit) ps = ps.filter(p => nextVisit(p.id));
    if (onlyAlerts) ps = ps.filter(p => d.alerts.some(a => a.personId === p.id && a.status === 'open'));
    const f = sortVal[list.sort];
    ps.sort((a, b) => { const x = f(a), y = f(b); return (x < y ? -1 : x > y ? 1 : 0) * list.dir; });
    const countLine = `<p class="count-line" role="status">검색 결과 <b class="num">${ps.length}</b>명</p>`;
    if (!ps.length) return countLine + empty('검색 결과 없음', 'search');
    return `${countLine}
      <div class="table-wrap"><table class="table rtable">
        <thead><tr>${cols.map(([k, t, n]) => sortTh(k, t, list.sort, list.dir, n)).join('')}<th><span class="sr-only">방문 등록</span></th></tr></thead>
        <tbody>${ps.map(p => {
          const r = R.get(p.id), v = nextVisit(p.id), rate = comp.get(p.id);
          return `
          <tr class="click" data-act="open" data-id="${p.id}" tabindex="0" aria-label="${esc(p.name)} 상세 보기">
            <td class="first"><div class="who"><span class="ibox ${p.closed ? 'none' : r.level}" aria-hidden="true">${initial(p.name)}</span><b>${esc(p.name)}</b></div></td>
            <td data-label="성별/나이">${esc(p.sex || '-')} · ${p.age ?? '-'}세</td>
            <td data-label="주소" class="clip" title="${shortAddr(p.address)}">${shortAddr(p.address)}</td>
            <td data-label="담당자">${esc(p.manager || '-')}</td>
            <td data-label="위험도">${p.closed ? `<span class="chip">종결 ${mdot(p.closed.date)}</span>` : riskChip(r.level)}${!p.closed && !r.signals.status.base.ready ? ' <span class="chip chip-info">기저선 형성 중</span>' : ''}</td>
            <td data-label="최근 7일 완료율" class="n ${rate != null && rate < 80 ? 'bad-t' : ''}">${pctText(rate)}</td>
            <td data-label="최근 통화일" class="num">${mmdd(lastCall(p.id))}</td>
            <td data-label="다음 방문일" class="num">${v ? mdot(v.date) : '-'}</td>
            <td class="end">${p.active ? btn('방문 등록', `data-act="openVisit" data-p="${p.id}"`) : ''}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>`;
  };
  const closedN = d.people.filter(p => p.closed).length;
  const toggle = (act, label, on, v = '') => `<button type="button" class="toggle" data-act="${act}" ${v !== '' ? `data-v="${v}"` : ''} aria-pressed="${on}">${label}</button>`;

  const refresh = () => { document.getElementById('plist').innerHTML = rows(); };
  actions.q = el => { list.q = el.value; refresh(); };
  actions.flag = el => {
    const k = el.dataset.v;
    list[k] = !list[k];
    el.setAttribute('aria-pressed', list[k]);
    refresh();
  };
  actions.riskf = el => {
    list.risk = el.dataset.v;
    document.querySelectorAll('[data-act=riskf]').forEach(b => b.setAttribute('aria-pressed', b === el));
    refresh();
  };
  actions.sort = (el, e) => {
    e.stopPropagation();
    const k = el.dataset.k;
    if (list.sort === k) list.dir *= -1; else { list.sort = k; list.dir = k === 'risk' ? -1 : 1; }
    refresh();
    document.querySelector(`[data-act=sort][data-k=${k}]`)?.focus();
  };
  actions.open = (el, e) => { if (e.target.closest('button, a')) return; location.hash = '#/admin/p/' + el.dataset.id; };

  return {
    title: '대상자 관리', sub: `활성 ${d.people.filter(p => p.active).length}명${closedN ? ` · 종결 ${closedN}명` : ''}`, head: addBtn,
    html: `
      ${subnav('')}
      <section class="card">
        <label class="bigsearch">${icon('search', 18)}<span class="sr-only">대상자 검색</span><input data-input="q" value="${esc(list.q)}" placeholder="이름 또는 담당자 검색"></label>
        <div class="filters" role="group" aria-label="목록 거르기">
          ${[['all', '전체'], ['high', '높음'], ['mid', '주의'], ['low', '낮음']].map(([v, t]) => toggle('riskf', v === 'all' ? t : `<i class="dot dot-${v}"></i>${t}`, list.risk === v, v)).join('')}
          <span class="sep" aria-hidden="true"></span>
          ${toggle('flag', '방문 예정만', list.visit, 'visit')}
          ${toggle('flag', '내 담당만', list.mine, 'mine')}
          ${toggle('flag', '종결 포함', list.closed, 'closed')}
        </div>
        ${onlyAlerts ? `<p class="filter-on">미조치 알림 있는 대상자만 보는 중 · <a href="#/admin/people">전체 보기</a></p>` : ''}
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
  actions.reqDone = el => { const r = d.requests.find(x => x.id === el.dataset.id); r.status = r.status === 'open' ? 'done' : 'open'; save(); render(); toast(r.status === 'done' ? '요청 처리 완료' : '미처리로 되돌림'); };
  return {
    title: '대상자 관리', sub: `미처리 요청 ${reqs.filter(r => r.status === 'open').length}건`, head: addBtn,
    html: `
      ${subnav('requests')}
      <section class="card">
        <div class="card-head"><h2>어르신 요청사항</h2><span class="sub">통화 대화에서 찾아 등록한 요청 · 대상자 말 그대로</span></div>
        ${reqs.length ? `<div class="table-wrap"><table class="table rtable">
          <thead><tr><th>날짜</th><th>대상자</th><th>요청</th><th class="n">경과</th><th>상태</th><th><span class="sr-only">처리</span></th></tr></thead>
          <tbody>${reqs.map(r => `
            <tr>
              <td data-label="날짜" class="num">${mmdd(r.date)}</td>
              <td data-label="대상자"><a href="#/admin/p/${r.personId}/calls?call=${r.callId || ''}">${esc(who(r.personId)?.name || '-')}</a></td>
              <td data-label="요청">"${esc(r.text)}"</td>
              <td data-label="경과" class="n">${fmtUnit(daysBetween(r.date, today), '일')}</td>
              <td data-label="상태"><span class="chip ${r.status === 'open' ? 'chip-mid' : 'chip-low'}">${r.status === 'open' ? '미처리' : '처리 완료'}</span></td>
              <td class="end">${btn(r.status === 'open' ? '완료' : '되돌리기', `data-act="reqDone" data-id="${r.id}"`)}</td>
            </tr>`).join('')}</tbody>
        </table></div>` : empty('기록 없음')}
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
  actions.jfilter = () => {
    const q = new URLSearchParams({ view: 'journals' });
    for (const k of ['date', 'author', 'person']) { const v = document.getElementById('jf-' + k).value; if (v) q.set(k, v); }
    location.hash = '#/admin/people?' + q;
  };
  actions.openJournal = el => { journalSel = el.dataset.id; location.hash = `#/admin/p/${el.dataset.p}/journal`; };
  return {
    title: '대상자 관리', sub: `돌봄일지 ${(d.journals || []).length}건`, head: addBtn,
    html: `
      ${subnav('journals')}
      <section class="card">
        <div class="toolbar">
          <label class="check">날짜 <input id="jf-date" type="date" value="${f.date}" data-change="jfilter"></label>
          <label class="check">작성자 <select id="jf-author" data-change="jfilter"><option value="">전체</option>${authors.map(a => `<option ${a === f.author ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select></label>
          <label class="check">대상자 <select id="jf-person" data-change="jfilter"><option value="">전체</option>${d.people.map(p => `<option value="${p.id}" ${p.id === f.person ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
          ${f.date || f.author || f.person ? '<a class="btn btn-ghost btn-sm" href="#/admin/people?view=journals">필터 지우기</a>' : ''}
        </div>
        ${js.length ? `<div class="table-wrap"><table class="table rtable">
          <thead><tr><th>날짜</th><th>대상자</th><th>유형</th><th>작성자</th><th>상태</th><th>평가(A)</th></tr></thead>
          <tbody>${js.map(j => `
            <tr class="click" data-act="openJournal" data-id="${j.id}" data-p="${j.personId}" tabindex="0">
              <td data-label="날짜" class="num">${mmdd(j.date)}</td>
              <td data-label="대상자"><b>${esc(d.people.find(p => p.id === j.personId)?.name || '-')}</b></td>
              <td data-label="유형">${esc(j.type)}</td>
              <td data-label="작성자">${esc(j.author)}</td>
              <td data-label="상태"><span class="chip ${j.status === 'draft' ? 'chip-mid' : 'chip-low'}">${j.status === 'draft' ? '초안' : '확정'}</span></td>
              <td data-label="평가" class="muted small clip" title="${esc((j.A || '').split('\n')[0].replace(/^- /, ''))}">${esc((j.A || '').split('\n')[0].replace(/^- /, ''))}</td>
            </tr>`).join('')}</tbody>
        </table></div>` : empty('검색 결과 없음', 'search')}
      </section>`
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

const fmtV = (v, m) => (v == null ? '-' : m.key === 'z' ? v.toFixed(2) : String(Math.round(v * 10) / 10));
const editedText = e => (e ? `최종 수정: ${esc(e.by)} · ${mdot(e.at.slice(0, 10))} ${e.at.slice(11, 16)}` : '');
const telLink = (ph, label = ph) => (ph ? `<a href="tel:${esc(ph.replace(/[^0-9]/g, ''))}">${esc(label)}</a>` : '-');

function personPage([id, tab = 'summary'], params) {
  const d = getData(), s = d.settings, today = todayStr();
  const me = currentAccount();
  const p = d.people.find(x => x.id === id);
  if (!p) return { title: '대상자 상세', crumbs: [['대상자 관리', '#/admin/people'], ['없는 대상자']], html: `<section class="card">${empty('데이터 없음', 'users')}</section>` };
  if (!TABS.some(([k]) => k === tab)) tab = 'summary';
  const info = p.info || (p.info = {});
  const ai = aiSummary(p, d, today, getNightVitals);
  const r = ai.risk;
  const st = r.signals.status;
  const alerts = d.alerts.filter(a => a.personId === id)
    .sort((a, b) => (a.status === 'closed') - (b.status === 'closed') || (a.type !== 'emergency') - (b.type !== 'emergency') || b.createdAt.localeCompare(a.createdAt));
  const openCount = alerts.filter(a => a.status !== 'closed').length;
  const pc = primaryContact(p);
  const acuteNow = (info.acute || []).filter(a => a.start <= today && (!a.end || a.end >= today));
  const pause = info.call?.pause;
  const who = me ? displayName(me) : '';
  const lv = p.closed ? 'none' : r.level;

  // 상단 대상자 카드: 위험도·사유 + 주요 만성질환(2개) · 진행 중 급성질환 · 보조기기 · 통화 일시중지
  const chips = [
    reasonChips(r.reasons),
    ...(info.conditions || []).slice(0, 2).map(c => `<span class="chip chip-neutral">${esc(c.name)}</span>`),
    ...acuteNow.map(a => `<span class="chip chip-mid">급성: ${esc(a.name)} (${mdot(a.start)}~)</span>`),
    ...(info.devices || []).map(x => `<span class="chip chip-neutral">${esc(x)}</span>`),
    pause?.from && (!pause.to || pause.to >= today) ? `<span class="chip chip-info">통화 일시중지 ${mdot(pause.from)}~${pause.to ? mdot(pause.to) : ''}</span>` : ''
  ].join('');
  const tel = ph => esc((ph || '').replace(/[^0-9]/g, ''));
  const counts = {
    calls: d.calls.filter(c => c.personId === id).length,
    journal: (d.journals || []).filter(j => j.personId === id).length,
    alerts: openCount
  };

  const hero = `
    <div class="print-head"><span>${esc(p.name)} · ${esc(TABS.find(([k]) => k === tab)[1])}</span><span>출력일 ${fmtDate(today)}</span><span>출력자 ${esc(who)}</span></div>
    <section class="card">
      <div class="pcard">
        <div class="pcard-main">
          <span class="ibox lg ${lv}" aria-hidden="true">${initial(p.name)}</span>
          <div style="min-width:0">
            <h1>${esc(p.name)} ${p.closed ? `<span class="chip">종결 ${mdot(p.closed.date)}</span>` : riskChip(r.level)}${!st.base.ready ? ' <span class="chip chip-info">기저선 형성 중</span>' : ''}</h1>
            <p class="meta">${esc(p.sex || '')} · ${p.age ?? '-'}세${info.living ? ' · ' + esc(info.living) : ''} · ${shortAddr(p.address)} · 담당 ${esc(p.manager || '-')}</p>
            <div class="chips">${chips}</div>
          </div>
        </div>
        <div class="pcard-side">
          <div class="pcard-actions">
            ${pc ? `<a class="btn btn-secondary" href="tel:${tel(pc.phone)}" aria-label="${esc(pc.name)}에게 전화">${icon('phone', 16)}전화</a>` : ''}
            ${p.active ? btn(`${icon('calendar', 16)}방문 등록`, `data-act="openVisit" data-p="${p.id}"`, 'primary', '') : ''}
          </div>
          ${pc ? `<p class="contact">1순위 비상연락 · ${esc(pc.name)} (${esc(pc.relation)}) <a href="tel:${tel(pc.phone)}" class="num">${esc(pc.phone)}</a></p>` : '<p class="contact">비상연락처 없음</p>'}
        </div>
      </div>
      <div class="stats">
        <div class="stat"><small>종합 케어 스코어</small><b>${r.score ?? '-'}<small>점</small></b></div>
        <div class="stat"><small>최근 인지검사</small><b>${st.lastScore == null ? '-' : `${fmtNum(st.lastScore, 1)}<small>%</small>`}</b></div>
        <div class="stat"><small>최근 z</small><b>${st.base.ready ? (st.lastZ == null ? '-' : fmtNum(st.lastZ, 2)) : '<small>기저선 형성 중</small>'}</b></div>
        <div class="stat"><small>최근 7일 통화 완료</small><b>${r.signals.completion.done}<small>/ ${r.signals.completion.days}</small></b></div>
      </div>
    </section>
    <div class="tab-sentinel" aria-hidden="true"></div>
    <div class="tabbar">
      <span class="who-mini">${esc(p.name)} ${p.closed ? '' : riskChip(r.level)}</span>
      <nav class="tabs" role="tablist" aria-label="대상자 상세">${TABS.map(([k, t]) => `<a role="tab" href="#/admin/p/${p.id}/${k}" aria-selected="${k === tab}" tabindex="${k === tab ? 0 : -1}">${t}${counts[k] ? ` <span class="cnt ${k === 'alerts' ? 'hot' : ''}">${counts[k]}</span>` : ''}</a>`).join('')}</nav>
    </div>`;

  const T = tab === 'summary' || tab === 'trend' ? trendAll(d, p, trendOpt, today, getNightVitals) : null;
  const parts = {
    summary: () => summaryTab(p, ai, T),
    info: () => `
      <div class="row info-top">
        <a class="btn btn-secondary btn-sm" href="#/admin/people/new?id=${p.id}">전체 수정</a>
        ${p.closed ? `<span class="chip chip-mid">종결 ${fmtDate(p.closed.date)} · ${esc(p.closed.reason)}</span>` : btn('종결', 'data-act="closeOpen"', 'danger')}
      </div>
      ${infoTab(p)}`,
    visits: () => visitsTab(p),
    trend: () => trendTab(p, T, params.get('m')),
    calls: () => callsTab(p),
    journal: () => journalTab(p),
    alerts: () => `
      <section class="card">
        <div class="card-head"><h2>알림</h2><span class="sub">열린 알림 ${openCount}건</span></div>
        ${alerts.map(a => alertCard(a, p)).join('') || empty('기록 없음', 'bell')}
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
    toast('보호자 통보 기록됨');
  };
  actions.refer = el => { Object.assign(alertOf(el), { status: 'referred', referredAt: nowStamp() }); saveAndRender(); toast('연계됨으로 기록'); };
  actions.close = el => { alertOf(el).status = 'closed'; saveAndRender(); toast('알림 종결'); };
  actions.outcome = el => { alertOf(el).outcome = el.value || null; save(); toast('수검 결과 저장됨'); };
  actions.note = el => { alertOf(el).note = el.value; save(); };
  actions.check = el => { alertOf(el).checklist[el.dataset.k] = el.checked; save(); };

  // 통화 기록
  actions.play = async (el, e) => {
    e.preventDefault();
    const box = document.getElementById('pl-' + el.dataset.id);
    const blob = await getAudio(callOf(el).audioId);
    box.innerHTML = blob ? `<audio controls autoplay src="${URL.createObjectURL(blob)}"></audio>` : '<p class="muted small">녹음 파일 없음</p>';
  };
  actions.delAudio = async el => {
    if (!(await confirmBox({ title: '녹음 삭제', text: '이 통화의 녹음 파일이 지워짐 (점수·대화록은 남음)', ok: '삭제', danger: true }))) return;
    const c = callOf(el);
    await deleteAudio(c.audioId);
    c.audioId = null;
    openCallId = c.id;
    saveAndRender();
    toast('녹음 삭제됨');
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
    toast('점수 수정됨');
  };
  actions.addRequest = el => {
    const c = callOf(el);
    d.requests ??= [];
    d.requests.push({ id: 'rq' + Date.now().toString(36), personId: p.id, callId: c.id, date: c.date, text: c.requests[+el.dataset.i], status: 'open', createdAt: nowStamp(), by: who });
    openCallId = c.id;
    saveAndRender();
    toast('요청 등록됨');
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
    toast('CSV 내보냄');
  };

  // 링 데이터: 처리하는 동안 버튼은 돌아가는 표시, 칸에는 뼈대 표시. 틀린 줄은 줄 번호와 이유를 보여 준다.
  actions.ringFile = async el => {
    const file = el.files[0];
    if (!file) return;
    const label = el.closest('label'), box = document.getElementById('ring-body');
    label.setAttribute('aria-busy', 'true');
    if (box) box.innerHTML = '<div class="skeleton sk-line"></div><div class="skeleton sk-line" style="width:70%"></div><div class="skeleton sk-line" style="width:50%"></div>';
    await new Promise(requestAnimationFrame);
    await new Promise(res => setTimeout(res, 30));
    let rec = null, error = null;
    try {
      rec = importRing(d, p.id, file.name, await file.text());
      save();
    } catch (err) {
      error = err.name === 'QuotaExceededError' ? { message: '브라우저 저장 공간 부족' } : err;
    }
    render();
    const badList = bad => `<ul class="err-list">${bad.slice(0, 10).map(b => `<li>${b.line}번째 줄 · ${esc(b.reason)}</li>`).join('')}${bad.length > 10 ? `<li>그 밖 ${bad.length - 10}줄</li>` : ''}</ul>`;
    if (error) {
      toast('링 데이터 불러오기 실패', { error: true });
      modal({ title: '불러오기 실패', body: `<p>${esc(file.name)} · ${esc(error.message)}</p>${error.bad?.length ? badList(error.bad) : ''}`, foot: '<button type="button" class="btn btn-primary" data-close>확인</button>' });
      return;
    }
    toast(`링 데이터 ${rec.validNights + rec.invalidNights}밤 불러옴 (유효 ${rec.validNights})`);
    if (rec.bad?.length) modal({ title: `건너뛴 줄 ${rec.bad.length}개`, body: `<p class="desc">형식이 맞지 않아 계산에서 뺀 줄</p>${badList(rec.bad)}`, foot: '<button type="button" class="btn btn-primary" data-close>확인</button>' });
  };
  actions.delImport = async el => {
    if (!(await confirmBox({ title: '불러오기 기록 삭제', text: '이 파일로 계산한 하룻밤 요약이 지워짐 (다른 파일의 밤은 남음)', ok: '삭제', danger: true }))) return;
    deleteRingImport(d, el.dataset.id);
    saveAndRender();
    toast('불러오기 기록 삭제됨');
  };

  // 등록 정보 (주소·담당자·좌표)
  actions.savePerson = f => {
    const v = n => f[n].value.trim();
    Object.assign(p, {
      name: v('name') || p.name, sex: f.sex.value, age: +v('age') || null, phone: v('phone'),
      preferredTime: v('time'), address: v('address'), manager: v('manager'), lat: parseFloat(v('lat')), lng: parseFloat(v('lng'))
    });
    saveAndRender();
    toast('등록 정보 저장됨');
  };

  // 종결: 삭제하지 않고 통화 대상·활성 대상자에서 뺀다
  actions.closeOpen = () => {
    const m = modal({
      title: `종결 · ${esc(p.name)}`,
      body: `<p class="desc">통화 대상과 활성 대상자에서 빠짐 (기록은 남음)</p>
        <form class="form two" id="close-form" data-submit="closePerson" style="margin-top:var(--s4)">
          <label>종결 사유<select name="reason">${CLOSE_REASONS.map(x => `<option>${x}</option>`).join('')}</select></label>
          <label>종결일<input type="date" name="date" value="${today}"></label>
        </form>`,
      foot: `<button type="button" class="btn btn-secondary" data-close>취소</button><button type="submit" form="close-form" class="btn btn-danger solid">종결</button>`
    });
    actions.closePerson = f => {
      p.closed = { reason: f.reason.value, date: f.date.value, by: who };
      p.active = false;
      m.close(true);
      saveAndRender();
      toast(`${p.name} 종결됨`);
    };
  };
  actions.reqDone = el => { const q = d.requests.find(x => x.id === el.dataset.id); q.status = q.status === 'open' ? 'done' : 'open'; saveAndRender(); toast(q.status === 'done' ? '요청 처리 완료' : '미처리로 되돌림'); };

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
    toast('기본 정보 저장됨');
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
    toast(el.dataset.auto ? '초안 작성됨 · 확인 후 확정' : '새 일지 만듦');
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
    toast(el.dataset.final ? '일지 확정됨' : '일지 저장됨');
  };
  actions.print = () => print();

  return {
    title: p.name, hideTitle: true, docTitle: `${p.name} · ${TABS.find(([k]) => k === tab)[1]}`,
    crumbs: [['대상자 관리', '#/admin/people'], [p.name]],
    html: hero + parts[tab](),
    after: () => {
      // 탭 줄이 위에 붙으면 이름·위험도를 함께 보여 준다
      const sentinel = app.querySelector('.tab-sentinel'), bar = app.querySelector('.tabbar');
      if (sentinel && bar && window.IntersectionObserver) new IntersectionObserver(([e]) => bar.classList.toggle('stuck', !e.isIntersecting && e.boundingClientRect.top < 0)).observe(sentinel);
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
  const d = getData(), s = d.settings;
  const r = ai.risk, st = r.signals.status;
  const v = nextVisit(p.id);
  // AI 줄: 점 · 항목 이름(128px) · 내용
  const bullet = b => `<li class="${b.off ? 'off' : ''}"><i class="dot" aria-hidden="true"></i><span class="lab">${esc(b.label || '')}</span><span class="tx">${esc(b.text)}</span></li>`;
  return `
    <section class="card ai-${r.level}">
      <div class="card-head"><h2>${icon('sparkle', 18)} AI 종합 분석 <span class="sub">최근 7일</span></h2>
        <div class="row">${riskChip(r.level)}${btn('인쇄', 'data-act="print"', 'ghost')}</div></div>
      <ul class="ai-list">${ai.bullets.map(bullet).join('')}</ul>
      <div class="ai-action"><small>권장 조치</small><b>${esc(ai.action)}</b></div>
      <p class="ai-foot">선별 보조 자료이며 최종 판단은 담당자가 함.</p>
    </section>

    <section class="card">
      <div class="card-head"><h2>지표별 변화 추이</h2><a class="btn btn-secondary btn-sm" href="#/admin/p/${p.id}/trend">전체 보기 ${icon('chev', 16)}</a></div>
      ${trendTable(p, T, true)}
    </section>

    <div class="split" style="margin-top:var(--s5)">
      ${ringCard(p)}
      <section class="card">
        <div class="card-head"><h2>종합 케어 스코어</h2><b class="score">${r.score ?? '-'}<small>점</small></b></div>
        ${Object.entries(CARE_LABEL).map(([k, [label, w]]) => {
          const val = r.signals.parts[k];
          return `<div class="part"><div class="row"><span>${label} <span class="muted small">가중치 ${w}</span></span><b class="num">${val == null ? '측정 없음' : Math.round(val)}</b></div>
            <div class="bar ${val == null ? '' : val >= 75 ? 'low' : val >= 55 ? 'mid' : 'bad'}"><i style="width:${val ?? 0}%"></i></div></div>`;
        }).join('')}
        <p class="muted small">75점 이상 낮음 · 55~74점 주의 · 55점 미만 높음</p>
      </section>
    </div>

    <details class="card" style="margin-top:var(--s5)">
      <summary><h2>등록 정보</h2><span class="muted small">주소 · 담당자 · 위도·경도 · 다음 방문 ${v ? `${fmtDate(v.date)} ${v.startTime} · ${esc(v.purpose)}` : '-'}</span></summary>
      <dl class="info">
        <dt>주소</dt><dd>${esc(p.address || '-')}</dd>
        <dt>좌표</dt><dd class="num">${p.lat ?? '-'}, ${p.lng ?? '-'}</dd>
        <dt>담당자</dt><dd>${esc(p.manager || '-')}</dd>
        <dt>연락처</dt><dd>${telLink(p.phone)}</dd>
        <dt>등록일</dt><dd>${fmtDate(p.enrolledAt)}</dd>
        <dt>기저선</dt><dd>${st.base.ready ? `${fmtNum(st.base.mean, 1)}% ± ${fmtNum(st.base.sd, 1)} (${fmtDate(st.baseStart)} ~ ${fmtDate(st.baseEnd)})` : `형성 중 ${st.base.n}/${s.baselineDays}회`}</dd>
      </dl>
      <form class="form noprint" data-submit="savePerson" style="margin-top:var(--s5)">
        <label>이름<input name="name" value="${esc(p.name)}"></label>
        <label>성별<select name="sex">${['여', '남'].map(x => `<option ${p.sex === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        <label>나이<input name="age" type="number" value="${p.age ?? ''}"></label>
        <label>연락처<input name="phone" type="tel" value="${esc(p.phone)}"></label>
        <label>통화 시각<input name="time" type="time" value="${esc(p.preferredTime)}"></label>
        <label>주소<input name="address" value="${esc(p.address || '')}"></label>
        <label>담당자<input name="manager" value="${esc(p.manager || '')}"></label>
        <label>위도<input name="lat" type="number" step="any" value="${p.lat ?? ''}"></label>
        <label>경도<input name="lng" type="number" step="any" value="${p.lng ?? ''}"></label>
        <button class="btn btn-primary" type="submit">저장</button>
      </form>
    </details>`;
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
    <section class="card">
      <div class="card-head"><h2>야간 생체신호 ${device ? '<span class="chip chip-info">실측</span>' : ''}</h2>
        ${thr !== 90 ? `<span class="chip chip-mid">개인 SpO₂ 기준 ${thr}% 적용 중</span>` : ''}</div>
      <div id="ring-body">
      ${device && !last ? `<p class="wait">링 데이터 없음 · CSV 불러오기 필요</p>` : last ? `
        <dl class="info">
          <dt>측정일 (깬 날)</dt><dd>${fmtDate(last.date)} ${isValidNight(last, s) ? '' : '<span class="chip chip-mid">무효한 밤</span>'}</dd>
          <dt>야간 최저 SpO₂</dt><dd class="num">${fmtUnit(last.spo2Min, '%')}</dd>
          <dt>${thr}% 미만 시간</dt><dd>${fmtUnit(last.spo2BelowMin, '분')}</dd>
          <dt>안정 시 심박</dt><dd>${fmtUnit(last.hrRest, 'bpm')}</dd>
          <dt>착용 시간</dt><dd>${fmtUnit(last.wearHours, '시간', 1)} · 신호품질 ${fmtNum(last.sqi, 2)}</dd>
        </dl>` : empty('데이터 없음', 'heart')}
      </div>
      ${device ? `
        <label class="btn btn-primary file-btn">${icon('next', 16)}링 데이터 불러오기<input type="file" accept=".csv,text/csv" data-change="ringFile" hidden></label>
        <p class="muted small" style="margin-top:var(--s2)">CSV 형식: timestamp,hr,spo2,sqi,worn</p>
        ${imports.length ? `<div class="table-wrap" style="margin-top:var(--s3)"><table class="table compact rtable">
          <thead><tr><th>파일</th><th>측정 기간</th><th class="n">샘플</th><th class="n">간격</th><th class="n">유효/무효 밤</th><th class="n">결측</th><th><span class="sr-only">삭제</span></th></tr></thead>
          <tbody>${imports.map(i => `<tr>
            <td data-label="파일" class="clip" title="${esc(i.fileName)}">${esc(i.fileName)}</td><td data-label="측정 기간" class="num">${stamp(i.from)} ~ ${stamp(i.to)}</td>
            <td data-label="샘플" class="n">${fmtUnit(i.samples, '줄')}</td><td data-label="간격" class="n">${fmtUnit(i.intervalSec, '초', 1)}</td>
            <td data-label="유효/무효 밤" class="n">${i.validNights} / ${i.invalidNights}</td><td data-label="결측" class="n">${fmtUnit(i.missingPct, '%', 1)}</td>
            <td class="end">${btn(icon('trash', 16), `data-act="delImport" data-id="${i.id}" aria-label="불러오기 기록 삭제"`, 'danger', 'sm btn-icon')}</td></tr>`).join('')}</tbody>
        </table></div>` : ''}` : ''}
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
    <tr class="click" data-act="metric" data-k="${m.key}" tabindex="0" aria-label="${m.label} 큰 그래프">
      <td class="first"><b>${m.label}</b>${t.real ? ' <span class="chip chip-info">실측</span>' : ''} <small>${m.unit}</small></td>
      <td data-label="최근 7일" class="n">${fmtV(t.recent7, m)}</td>
      <td data-label="이전 7일" class="n">${fmtV(t.prev7, m)}</td>
      <td data-label="개인 기저선" class="n">${t.baseline ? `${fmtV(t.baseline.mean, m)} ± ${fmtV(t.baseline.sd, m)}` : '-'}</td>
      <td data-label="변화" class="n">${deltaHtml}</td>
      <td data-label="추이">${sparkline(t, m)}</td>
      <td data-label="상태"><span class="state ${stCls}">${t.status}</span>${t.alertLevel ? ' ' + levelChip(t.alertLevel) : ''}</td>
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
    <div class="table-wrap"><table class="table compact rtable ttable">
      <thead><tr><th>지표</th><th class="n">최근 7일</th><th class="n">이전 7일</th><th class="n">개인 기저선</th><th class="n">변화</th><th>추이 (${trendOpt.days}일${trendOpt.weekly ? ' · 주별' : ''})</th><th>상태</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}

function trendTab(p, T, mKey) {
  const m = METRIC[mKey];
  const opt = (k, v, t) => { const on = String(trendOpt[k]) === String(k === 'weekly' ? v === '1' : v); return `<button type="button" data-act="topt" data-k="${k}" data-v="${v}" aria-pressed="${on}" class="${on ? 'on' : ''}">${t}</button>`; };
  const flag = (k, t) => `<button type="button" class="toggle" data-act="topt" data-k="${k}" aria-pressed="${!!trendOpt[k]}">${t}</button>`;
  return `
    ${m ? `<section class="card" id="bigchart">
      <div class="card-head"><h2>${m.label}${T[m.key].real ? ' <span class="chip chip-info">실측</span>' : ''}</h2>
        <div class="row">${legendHtml([['일별', 'var(--accent)'], ['7일 이동평균', 'var(--ink-2)', true], ['기저선 범위', 'var(--accent-soft)']])}
        <a class="btn btn-secondary btn-sm" href="#/admin/p/${p.id}/trend">닫기</a></div></div>
      <div class="chartbox tall"><canvas id="metricChart" role="img" aria-label="${m.label} 일별 추이"></canvas></div>
      <p class="trend-line">${esc(trendSentence(m, T[m.key], todayStr()))}</p>
      <p class="muted small">회색 띠 = 급성질환 · 세로 점선 = 약물 변경 · 빗금 = 통화 일시중지 · ▲ = 방문${m.kind === 'call' && m.key !== 'completion' ? ' · 점을 누르면 그날 통화로 이동' : ''}</p>
    </section>` : ''}
    <section class="card">
      <div class="card-head"><h2>지표별 변화 추이</h2>${btn(`${icon('next', 16)}CSV 내보내기`, 'data-act="csv"')}</div>
      <div class="toolbar">
        <div class="seg" role="group" aria-label="기간">${opt('days', 14, '14일')}${opt('days', 30, '30일')}${opt('days', 90, '90일')}</div>
        <div class="seg" role="group" aria-label="묶음">${opt('weekly', '0', '일별')}${opt('weekly', '1', '주별')}</div>
        ${flag('byChange', '변화 큰 순')}${flag('domains', '영역별 보기')}
      </div>
      ${trendTable(p, T, false)}
    </section>
    <section class="card">
      <div class="card-head"><h2>겹쳐 보기</h2>${legendHtml([['인지 z', 'var(--accent)'], ['야간 최저 SpO₂', 'var(--ink-2)'], ['안정 시 심박', 'var(--faint)'], ['관찰 기준', 'var(--high)', true]])}</div>
      <div class="chartbox tall"><canvas id="personChart" role="img" aria-label="인지 z, 야간 SpO2, 안정 시 심박 겹쳐 보기"></canvas></div>
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
    const g = c.getContext('2d'); g.strokeStyle = css('--line-strong'); g.lineWidth = 2;
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
        ctx.fillStyle = css('--accent-soft');
        const y1 = y.getPixelForValue(t.baseline.mean + t.sdEff), y2 = y.getPixelForValue(t.baseline.mean - t.sdEff);
        ctx.fillRect(a.left, Math.max(a.top, y1), a.right - a.left, Math.min(a.bottom, y2) - Math.max(a.top, y1));
      }
      ctx.font = `600 11px ${Chart.defaults.font.family}`;
      for (const e of events) {
        const end = e.end || today;
        if (end < labels[0] || e.start > today) continue;
        const x1 = px(idx(e.start)) - half, x2 = px(idx(end)) + half;
        if (e.type === '급성질환') { ctx.fillStyle = css('--line'); ctx.fillRect(x1, a.top, x2 - x1, a.bottom - a.top); ctx.fillStyle = css('--muted'); ctx.fillText(e.label, x1 + 4, a.top + 12); }
        if (e.type === '통화 일시중지') { ctx.fillStyle = hatch; ctx.fillRect(x1, a.top, x2 - x1, a.bottom - a.top); ctx.fillStyle = css('--muted'); ctx.fillText('통화 일시중지', x1 + 4, a.top + 26); }
        if (e.type === '약물 변경' && e.start >= labels[0]) {
          const xx = px(idx(e.start));
          ctx.strokeStyle = css('--faint'); ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(xx, a.top); ctx.lineTo(xx, a.bottom); ctx.stroke(); ctx.setLineDash([]);
          ctx.fillStyle = css('--muted'); ctx.fillText(e.label, xx + 4, a.top + 40);
        }
        if (e.type === '방문' && e.start >= labels[0]) {
          const xx = px(idx(e.start));
          ctx.fillStyle = css('--ink-2'); ctx.beginPath(); ctx.moveTo(xx, a.bottom - 12); ctx.lineTo(xx - 6, a.bottom - 2); ctx.lineTo(xx + 6, a.bottom - 2); ctx.closePath(); ctx.fill();
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
        { label: '일별', data: vals, showLine: false, pointRadius: 3.5, pointHoverRadius: 6, pointBackgroundColor: css('--accent'), pointBorderColor: css('--panel'), pointBorderWidth: 1.5 },
        { label: '7일 이동평균', data: ma, borderColor: css('--ink-2'), borderDash: [6, 4], pointRadius: 0, cubicInterpolationMode: 'monotone', spanGaps: true }
      ]
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: false, axis: 'x' },
      plugins: {
        tooltip: { callbacks: { afterBody: items => (clickable && items[0] ? callSummary(labels[items[0].dataIndex]) : []) } }
      },
      onClick: (e, els) => {
        if (!clickable || !els.length) return;
        const c = byDate.get(labels[els[0].index]);
        if (c?.callId) location.hash = `#/admin/p/${p.id}/calls?call=${c.callId}`;
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 12 } },
        y: { border: { display: false }, title: { display: !!m.unit, text: m.unit },
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
    <section class="card">
      <div class="card-head"><h2>통화 기록</h2><span class="sub">${calls.length}건 · 줄을 누르면 대화록</span></div>
      ${calls.map(c => callRow(c, p)).join('') || empty('기록 없음')}
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
  const bubbleQ = (q, tag, ai = false) => `<div class="bubble app ${ai ? 'ai' : ''}">${tag ? `<small>${esc(tag)}</small>` : ''}${esc(q)}</div>`;
  const bubbleA = (a, extra = '') => `<div class="bubble me">${a ? esc(a) : '<span class="muted">받아쓰기 없음</span>'}${extra}</div>`;
  const SV = { good: '잘 잠', poor: '잠을 설침' }, MV = { good: '좋음', normal: '보통', bad: '나쁨' };
  return `
    <details class="crow" id="call-${c.id}" data-id="${c.id}" ${openCallId === c.id ? 'open' : ''}>
      <summary>
        <span class="date">${mdot(c.date)} ${esc(c.time || (c.startedAt || '').slice(11, 16))}</span>
        <span class="st st-${c.status}">${CALL_STATUS[c.status]}</span>
        ${c.status === 'missed' ? '' : `
          <span>점수 <b class="num">${pctText(c.scorePct)}</b>${c.z != null ? ` <span class="muted">(z ${c.z})</span>` : ''}</span>
          <span class="muted">${fmtDur(c.durationSec)}</span>
          <span class="muted">재질문 ${asks}회</span>`}
        ${c.source === 'real' ? '<span class="chip chip-info">실측</span>' : ''}
        ${c.voice ? `<span class="chip chip-neutral">${c.voice === 'ai' ? 'AI 음성' : '기본 음성'}</span>` : ''}
        ${c.emergencies?.length ? '<span class="chip chip-high">응급 표현</span>' : ''}
        ${c.edited ? '<span class="chip">수정됨</span>' : ''}
        ${c.audioId ? `<button type="button" class="btn btn-secondary btn-sm" data-act="play" data-id="${c.id}">${icon('play', 16)}재생</button>` : ''}
      </summary>
      <div id="pl-${c.id}"></div>
      ${c.status === 'missed' ? '<p class="muted small" style="margin-top:8px">무응답 · 대화 없음</p>' : `
      <div class="convo">
        ${c.emergencies?.length ? `<div class="chk err-box"><b>응급 표현</b>${c.emergencies.map(e => `<div>"${esc(e.text)}" · ${esc(e.phrase)}</div>`).join('')}</div>` : ''}
        ${c.aiSummary?.summary || c.aiSummary?.concerns?.length ? `<div class="chk note-box">
          ${c.aiSummary.summary ? `<div><b>안부 요약</b> ${esc(c.aiSummary.summary)}</div>` : ''}
          ${c.aiSummary.concerns?.length ? `<div><b>관찰 메모</b></div>${c.aiSummary.concerns.map(x => `<div>${esc(x.text)} · "${esc(x.quote)}"</div>`).join('')}` : ''}
        </div>` : ''}
        ${c.greeting ? `<div class="qa">${bubbleQ(c.greeting.text, c.greeting.ai ? '인사 · AI 문장' : '인사', c.greeting.ai)}</div>` : ''}
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
          <div class="qa">${bubbleQ(SELF_QUESTIONS.sleep, '자기보고 · 수면')}${bubbleA(c.selfReport.sleep?.answer, ` <span class="chip chip-neutral">${SV[c.selfReport.sleep?.value] || ''}</span>`)}</div>
          ${c.selfReport.mood ? `<div class="qa">${bubbleQ(SELF_QUESTIONS.mood, '자기보고 · 기분')}${bubbleA(c.selfReport.mood.answer, ` <span class="chip chip-neutral">${MV[c.selfReport.mood.value] || ''}</span>`)}</div>` : ''}` : ''}
        ${c.chatTurns?.length ? `<div class="qa"><small class="muted">안부 대화 · 채점 안 함${c.chatMode === 'ai' ? ' · 옅은 말풍선 = AI 문장' : ''}</small>
          ${c.chatTurns.map(t => (t.role === 'app' ? bubbleQ(t.text, '', t.ai) : bubbleA(t.text))).join('')}</div>`
          : c.chat ? `<div class="qa">${bubbleQ(c.chat.question, '안부 대화 · 채점 안 함')}${bubbleA(c.chat.answer)}</div>` : ''}
        ${c.requests?.length ? `<div class="reqs"><b>대화에서 찾은 요청</b>${c.requests.map((q, i) => `
          <div class="row">"${esc(q)}" ${registered(q) ? '<span class="chip">등록됨</span>' : `<button type="button" class="btn btn-secondary btn-sm" data-act="addRequest" data-id="${c.id}" data-i="${i}">요청 등록</button>`}</div>`).join('')}</div>` : ''}
        ${c.edited ? `<p class="muted small">수정됨 · ${esc(c.edited.by)} · ${mdot(c.edited.at.slice(0, 10))} ${c.edited.at.slice(11, 16)}</p>` : ''}
        ${c.audioId ? `<p><button type="button" class="btn btn-danger btn-sm" data-act="delAudio" data-id="${c.id}">${icon('trash', 16)}녹음 삭제</button></p>` : ''}
      </div>`}
    </details>`;
}

// ---------- 방문 · 요청 탭 ----------
function visitsTab(p) {
  const d = getData();
  const vs = d.visits.filter(v => v.personId === p.id).sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime));
  const reqs = (d.requests || []).filter(r => r.personId === p.id).sort((a, b) => b.date.localeCompare(a.date));
  return `
    <section class="card">
      <div class="card-head"><h2>방문</h2>${p.active ? btn(`${icon('calendar', 16)}방문 등록`, `data-act="openVisit" data-p="${p.id}"`, 'primary') : ''}</div>
      ${vs.length ? vs.map(v => `
        <div class="dayrow st-${v.status}" data-act="openVisit" data-v="${v.id}" role="button" tabindex="0">
          <b class="time">${fmtDateW(v.date)} ${visitLine(v)}</b>
          <span>${esc(v.type)} · ${esc(v.visitor)}</span>
          <span class="small">${esc(v.purpose || '')}${v.resultNote ? ` · 결과: ${esc(v.resultNote)}` : ''}${v.cancelReason ? ` · 취소 사유: ${esc(v.cancelReason)}` : ''}</span>
          <span class="chip ${v.status === 'canceled' ? 'chip-mid' : v.status === 'done' ? 'chip-low' : 'chip-info'}">${VISIT_STATUS[v.status]}</span>
        </div>`).join('') : empty('일정 없음', 'calendar')}
    </section>
    <section class="card">
      <div class="card-head"><h2>어르신 요청사항</h2></div>
      ${reqs.length ? reqs.map(r => `
        <div class="dayrow" style="cursor:default">
          <b class="time">${mdot(r.date)}</b><span>"${esc(r.text)}"</span>
          <span class="row"><span class="chip ${r.status === 'open' ? 'chip-mid' : 'chip-low'}">${r.status === 'open' ? '미처리' : '처리 완료'}</span>
          <button type="button" class="btn btn-secondary btn-sm" data-act="reqDone" data-id="${r.id}">${r.status === 'open' ? '완료' : '되돌리기'}</button></span>
        </div>`).join('') : empty('기록 없음')}
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
      <section class="card infosec">
        <div class="card-head"><h2>${title}</h2>
          ${editing ? '' : `<button type="button" class="btn btn-secondary btn-sm" data-act="editSec" data-sec="${key}">수정</button>`}</div>
        ${editing ? `<form class="info-edit" data-submit="saveInfo" data-sec="${key}" novalidate>${edit}
            <div class="row"><button class="btn btn-primary" type="submit">저장</button><button type="button" class="btn btn-secondary" data-act="editSec">취소</button></div></form>` : view}
        <p class="edited">${editedText(i.edited?.[key])}</p>
      </section>`;
  };
  const opts = (list, v) => list.map(x => `<option ${x === v ? 'selected' : ''}>${x}</option>`).join('');
  const today = todayStr();

  const custom = (i.conditions || []).filter(x => !CONDITIONS.includes(x.name));
  const disease = sec('disease', '① 질환·복용약', `
      <p class="muted small">기존 병력 기록 (앱 판정 아님)</p>
      <h3>만성질환</h3><div class="chips">${(i.conditions || []).map(x => `<span class="chip">${esc(x.name)}${x.year ? ` (${x.year})` : ''}</span>`).join('') || '<span class="muted">없음</span>'}</div>
      <h3>급성질환·입원</h3>${(i.acute || []).length ? `<ul class="plain">${i.acute.map(a => `<li><b>${esc(a.name)}</b> · ${fmtDate(a.start)} ~ ${a.end ? fmtDate(a.end) : '<b>진행 중</b>'}${a.hospitalized ? ' · 입원' : ''}${a.memo ? ` · ${esc(a.memo)}` : ''}</li>`).join('')}</ul>` : '<p class="muted">없음</p>'}
      <h3>복용약</h3>${(i.meds || []).length ? `<table class="table compact rtable"><thead><tr><th>약 이름</th><th>용법</th><th>시작일</th><th>최근 변경일</th><th>변경 사유</th></tr></thead><tbody>${i.meds.map(m => `
        <tr><td class="first"><b>${esc(m.name)}</b></td><td data-label="용법">${esc(m.dose)}</td><td data-label="시작일">${fmtDate(m.start)}</td>
        <td data-label="최근 변경일">${fmtDate(m.changed)}${m.changed && m.changed >= addDays(today, -13) ? ' <span class="chip chip-mid">최근 14일</span>' : ''}</td><td data-label="변경 사유">${esc(m.reason || '-')}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">없음</p>'}`, `
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
        <dt>외부 AI 서비스</dt><dd>${i.consent?.ai === true ? '동의 (AI 음성·대화)' : '미동의 · 기본 음성과 고정 대본'}</dd>
        <dt>통화 일시중지</dt><dd>${c.pause?.from ? `${fmtDate(c.pause.from)} ~ ${c.pause.to ? fmtDate(c.pause.to) : '종료일 미정'} · ${esc(c.pause.reason || '')}` : '없음'}</dd>
        <dt>SpO₂ 알림 기준</dt><dd>${c.spo2Threshold ?? 90}%${(c.spo2Threshold ?? 90) !== 90 ? ' <span class="chip chip-mid">개인 기준 적용 중</span>' : ''}</dd>
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
        ${form ? '' : `<label>외부 AI 서비스 이용 동의<select name="ai-consent">${opts(['동의', '미동의'], i.consent?.ai === true ? '동의' : '미동의')}</select><span class="help">${AI_CONSENT_TEXT}</span></label>`}
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

  const ph = (name, v, key) => `<input name="${name}" type="tel" value="${esc(v || '')}" placeholder="010-0000-0000"><small class="err" id="err-${p.id || 'new'}-${key}" data-err="${key}"></small>`;
  const contacts = [...(i.contacts || [])].sort((a, b) => a.priority - b.priority);
  const contactSec = sec('contacts', '④ 응급 연락처', `
      <h3>보호자·비상연락처</h3>
      ${contacts.length ? `<table class="table compact rtable"><thead><tr><th>이름</th><th>관계</th><th>전화</th><th>우선순위</th><th>주의 단계 알림 통보</th></tr></thead><tbody>${contacts.map(x => `
        <tr><td class="first"><b>${esc(x.name)}</b></td><td data-label="관계">${esc(x.relation)}</td><td data-label="전화">${telLink(x.phone)}</td>
        <td data-label="우선순위">${x.priority}순위</td><td data-label="통보">${x.consent ? '동의' : '<span class="chip chip-mid">통보 미동의</span>'}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">없음</p>'}
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
  const testSec = sec('tests', '⑥ 대면 인지검사 기록', tests.length ? `<table class="table compact rtable"><thead><tr><th>검사일</th><th>종류</th><th>점수</th><th>검사자</th></tr></thead><tbody>${tests.map(t => `
      <tr><td class="first"><b>${fmtDate(t.date)}</b></td><td data-label="종류">${esc(t.kind)}</td><td data-label="점수">${esc(t.score)}</td><td data-label="검사자">${esc(t.examiner || '')}</td></tr>`).join('')}</tbody></table>` : empty('기록 없음'), `
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
    if (F('ai-consent')) i.consent = { ...(i.consent || {}), ai: F('ai-consent').value === '동의' };
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
    f.querySelectorAll('[data-err]').forEach(el => {
      el.textContent = errs[el.dataset.err] || '';
      const input = el.previousElementSibling;
      if (input?.matches('input')) {
        input.setAttribute('aria-invalid', el.textContent ? 'true' : 'false');
        if (el.textContent) input.setAttribute('aria-describedby', el.id); else input.removeAttribute('aria-describedby');
      }
    });
    if (Object.keys(errs).length) { f.querySelector('[aria-invalid="true"]')?.focus(); return false; }
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
    <section class="card">
      <div class="card-head"><h2>돌봄일지</h2>
        <div class="row">${btn('인쇄', 'data-act="print"', 'ghost')}${btn('새 일지', 'data-act="newJournal"')}${btn(`${icon('sparkle', 16)}초안 작성`, 'data-act="newJournal" data-auto="1"', 'primary')}</div></div>
      ${js.length ? `<div class="jlist">${js.map(j => `
        <button type="button" class="btn btn-secondary jitem ${sel?.id === j.id ? 'on' : ''}" aria-pressed="${sel?.id === j.id}" data-act="selJournal" data-id="${j.id}">
          <b>${mmdd(j.date)}</b> <span>${esc(j.type)}</span> <span class="muted">${esc(j.author)}</span>
          <span class="chip ${j.status === 'draft' ? 'chip-mid' : 'chip-low'}">${j.status === 'draft' ? '초안' : '확정'}</span>${j.history?.length ? ` <span class="muted small">수정 ${j.history.length}회</span>` : ''}
        </button>`).join('')}</div>` : empty('기록 없음')}
    </section>
    ${sel ? `
    <section class="card journal">
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
        ${sel.status === 'draft' ? `${btn('저장', `data-act="saveJournal" data-id="${sel.id}"`, 'secondary', '')}${btn('확정', `data-act="saveJournal" data-id="${sel.id}" data-final="1"`, 'primary', '')}`
          : btn('저장', `data-act="saveJournal" data-id="${sel.id}"`, 'primary', '')}
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
      <div class="row"><b>${TYPE[a.type]}</b>${a.type === 'emergency' ? '<span class="chip chip-high">높음</span>' : levelChip(a.level)}<span class="chip">${STATUS[a.status]}</span></div>
      <div class="muted small">생성 ${stamp(a.createdAt)} · 보호자 통보 ${stamp(a.notifiedAt)}${a.notifiedTo ? ` (${esc(a.notifiedTo.name)}${a.notifiedTo.relation ? ' · ' + esc(a.notifiedTo.relation) : ''} ${esc(a.notifiedTo.phone)})` : ''} · 연계 ${stamp(a.referredAt)}</div>
      <div class="row">
        <button type="button" class="btn btn-secondary btn-sm" data-act="notify" data-id="${a.id}" ${closed ? 'disabled' : ''}>보호자 통보 기록</button>
        <button type="button" class="btn btn-primary btn-sm" data-act="refer" data-id="${a.id}" ${a.status !== 'open' ? 'disabled' : ''} data-tip="치매안심센터 연계로 기록">연계</button>
        <button type="button" class="btn btn-secondary btn-sm" data-act="close" data-id="${a.id}" ${closed ? 'disabled' : ''}>종결</button>
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
          <button class="btn btn-primary btn-sm" type="submit">저장</button>
        </form>` : ''}
      ${a.type === 'cognition' ? `
        <div class="checklist"><b>감별 체크리스트</b> 
          <div class="checks">${Object.entries(CHECKS).map(([k, t]) => `
            <label><input type="checkbox" data-change="check" data-id="${a.id}" data-k="${k}" ${a.checklist?.[k] || auto[k] ? 'checked' : ''} ${auto[k] ? 'disabled' : ''}> ${t}${auto[k] ? ' <span class="chip chip-info">자동</span>' : ''}</label>`).join('')}</div>
        </div>` : ''}
      ${a.type === 'emergency' ? '<p class="chk err-box">대상자에게 119 안내함 · 즉시 전화 확인</p>' : ''}
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
      ctx.fillStyle = css('--accent-soft');
      ctx.fillRect(x.getPixelForValue(i0) - half, area.top, x.getPixelForValue(i1) - x.getPixelForValue(i0) + 2 * half, area.bottom - area.top);
      ctx.restore();
    }
  };
  const line = (label, data, color, axis) => ({
    label, data, yAxisID: axis, borderColor: color, backgroundColor: color,
    pointHoverRadius: 5, pointBorderColor: css('--panel'), pointBorderWidth: 1.5, cubicInterpolationMode: 'monotone'
  });
  charts.push(new Chart(document.getElementById('personChart'), {
    type: 'line',
    data: {
      labels: labels.map(dt => mmdd(dt)),
      datasets: [
        line('인지 z-score', labels.map(dt => zByDate[dt] ?? null), SERIES()[0], 'y'),
        { label: `관찰 기준 (z ${s.zWatch})`, data: labels.map(() => s.zWatch), yAxisID: 'y', borderColor: css('--high'), borderDash: [6, 4], borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 0 },
        line('야간 최저 SpO2 (%)', nights.map(v => v?.spo2Min ?? null), SERIES()[1], 'y1'),
        line('안정 시 심박 (bpm)', nights.map(v => v?.hrRest ?? null), SERIES()[2], 'y2')
      ]
    },
    options: {
      maintainAspectRatio: false,
      spanGaps: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 12 } },
        y: { title: { display: true, text: 'z' }, border: { display: false } },
        y1: { position: 'right', title: { display: true, text: 'SpO2 %' }, grid: { drawOnChartArea: false }, border: { display: false } },
        y2: { position: 'right', title: { display: true, text: '심박' }, grid: { drawOnChartArea: false }, border: { display: false } }
      }
    },
    plugins: [shade]
  }));
}

// ---------- 캘린더: 월간 · 2주 (전체 현황·방문 등록 창이 같이 쓴다) ----------
// o: { ns(동작 이름 앞말), view 'month'|'2w', views(보기 전환 표시), anchor(2주 보기 기준일), month 'YYYY-MM',
//      visits(이미 걸러진 목록), selected, highlight(강조할 대상자 id), visitor(필터: '' 전체 | 이름),
//      visitorSelect(방문자 고르기 표시), countVisitor(날짜 칸에 건수를 셀 방문자), levelOf(personId → 위험도) }
function monthCalendar(o) {
  const d = getData(), today = todayStr(), me = currentAccount();
  const view = o.view || 'month';
  const limit = d.settings.visitDailyLimit;
  const nameOf = id => d.people.find(p => p.id === id)?.name || '-';
  const dowOf = date => new Date(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)).getDay();
  let dates, title, lead = 0;
  if (view === '2w') {
    const start = addDays(o.anchor || today, -dowOf(o.anchor || today)); // 그 주 일요일부터 14일
    dates = [...Array(14)].map((_, k) => addDays(start, k));
    title = `${fmtMD(dates[0])} ~ ${fmtMD(dates[13])}`;
  } else {
    const [y, m] = o.month.split('-').map(Number);
    const days = new Date(y, m, 0).getDate();
    lead = new Date(y, m - 1, 1).getDay();
    dates = [...Array(days)].map((_, k) => `${o.month}-${String(k + 1).padStart(2, '0')}`);
    title = `${y}년 ${m}월`;
  }
  const cells = [...Array(lead)].map(() => '<div class="cal-cell empty" aria-hidden="true"></div>');
  for (const date of dates) {
    const dow = dowOf(date);
    const vs = o.visits.filter(v => v.date === date).sort((a, b) => a.startTime.localeCompare(b.startTime));
    const n = o.countVisitor ? d.visits.filter(v => v.date === date && v.visitor === o.countVisitor && v.status !== 'canceled').length : 0;
    const chips = vs.slice(0, 3).map(v => `<span class="cal-chip st-${v.status} ${v.personId === o.highlight ? 'hl' : ''}">
      <i class="dot dot-${o.levelOf(v.personId)}"></i>${v.startTime} ${esc(nameOf(v.personId))}</span>`).join('');
    const label = `${fmtMDW(date)} 방문 ${vs.length}건${date === today ? ' · 오늘' : ''}`;
    cells.push(`<button type="button" class="cal-cell ${dow === 0 ? 'sun' : dow === 6 ? 'sat' : ''} ${date === today ? 'today' : ''} ${date < today ? 'past' : ''} ${date === o.selected ? 'sel' : ''} ${o.countVisitor && n >= limit ? 'full' : ''}"
      data-act="${o.ns}Pick" data-date="${date}" aria-label="${label}" aria-pressed="${date === o.selected}">
      <span class="cal-day">${view === '2w' && (date.endsWith('-01') || date === dates[0]) ? `${+date.slice(5, 7)}/${+date.slice(8)}` : +date.slice(8)}${n ? `<small class="cal-count">${n}</small>` : ''}</span>${chips}${vs.length > 3 ? `<span class="cal-more">+${vs.length - 3}</span>` : ''}</button>`);
  }
  const visitors = [...new Set([...d.people.map(p => p.manager), ...(d.accounts || []).map(displayName), ...d.visits.map(v => v.visitor)].filter(Boolean))];
  const mine = me ? displayName(me) : '';
  const seg = (act, v, label, on) => `<button type="button" data-act="${o.ns}${act}" data-v="${esc(v)}" aria-pressed="${on}" class="${on ? 'on' : ''}">${label}</button>`;
  const unit = view === '2w' ? '2주' : '달';
  return `
    <div class="cal ${view === 'month' ? 'month' : 'weeks'}">
      <div class="cal-head">
        <div class="row">
          ${btn(icon('back', 16), `data-act="${o.ns}Nav" data-m="-1" aria-label="이전 ${unit}"`, 'secondary', 'sm btn-icon')}
          ${btn('오늘', `data-act="${o.ns}Nav" data-m="0"`)}
          ${btn(icon('chev', 16), `data-act="${o.ns}Nav" data-m="1" aria-label="다음 ${unit}"`, 'secondary', 'sm btn-icon')}
          <b class="cal-title" aria-live="polite">${title}</b>
        </div>
        <div class="row">
          ${o.views ? `<div class="seg" role="group" aria-label="보기">${seg('View', '2w', '2주', view === '2w')}${seg('View', 'month', '월간', view === 'month')}</div>` : ''}
          <div class="seg" role="group" aria-label="일정 범위">${seg('Filter', '', '전체', !o.visitor)}${mine ? seg('Filter', mine, '내 일정', o.visitor === mine) : ''}</div>
          ${o.visitorSelect ? `<select data-change="${o.ns}Visitor" aria-label="방문자"><option value="">방문자 전체</option>${visitors.map(v => `<option ${v === o.visitor ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>` : ''}
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

// ---------- 방문 등록·수정 창 (모달 1040px) ----------
let vm = null;      // 열린 방문 창의 상태
let vmModal = null; // modal() 이 돌려준 창
function openVisit({ personId, visitId }) {
  const d = getData(), me = currentAccount();
  const v = visitId ? d.visits.find(x => x.id === visitId) : null;
  const p = d.people.find(x => x.id === (v?.personId || personId));
  const tomorrow = addDays(todayStr(), 1);
  vm = v ? { ...v, mode: 'edit', force: false, sub: null, dirty: false }
    : { mode: 'new', id: null, personId: p.id, date: tomorrow, startTime: '10:00', durationMin: 60, type: '정기 방문',
        visitor: me ? displayName(me) : p.manager, purpose: '', status: 'planned', force: false, sub: null, dirty: false };
  vm.month = vm.date.slice(0, 7);
  vm.calVisitor = vm.visitor; // 캘린더 필터 기본값: 방문자(내 일정)
  vmModal = modal({ title: `방문 ${vm.mode === 'new' ? '등록' : '일정'} · ${esc(p.name)}`, size: 'lg', dirty: () => vm?.dirty, onClose: () => { vm = null; vmModal = null; } });
  drawVisit();
  vmModal.el.querySelector('[data-k=date]')?.focus();
}
const closeVisit = () => vmModal?.close(true);

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
    <div class="tt"><b>${fmtMDW(vm.date)} 시간표</b>
      <div class="tt-body" style="height:${H}px">
        ${[8, 10, 12, 14, 16, 18].map(h => `<span class="tt-hour" style="top:${y(h * 60)}px">${String(h).padStart(2, '0')}:00</span>`).join('')}
        ${day.map(v => block(v, '')).join('')}
        ${vm.status === 'planned' ? block(visitCandidate(), 'new') : ''}
      </div></div>`;
}

function drawVisit() {
  if (!vm || !vmModal) return;
  const d = getData();
  const p = d.people.find(x => x.id === vm.personId);
  const levelOf = levelMap();
  const visitors = [...new Set([...d.people.map(x => x.manager), ...(d.accounts || []).map(displayName)].filter(Boolean))];
  const r = risk(p);
  const opts = (list, v) => list.map(x => `<option ${String(x) === String(v) ? 'selected' : ''}>${x}</option>`).join('');
  const readOnly = vm.status !== 'planned';
  const c = readOnly ? null : visitChecks(d, visitCandidate(), nowStamp());
  const blocked = c && c.errors.length;
  // 다시 그려도 포커스를 잃지 않게 같은 칸으로 돌려놓는다
  const f = document.activeElement;
  const key = f && vmModal.el.contains(f) ? (f.dataset.k ? `[data-k="${f.dataset.k}"]` : f.dataset.date ? `[data-date="${f.dataset.date}"]` : f.dataset.act ? `[data-act="${f.dataset.act}"]${f.dataset.m ? `[data-m="${f.dataset.m}"]` : ''}` : null) : null;
  const dis = readOnly ? 'disabled' : '';
  vmModal.body.innerHTML = `
    <div class="modal-grid">
      <div>
        ${monthCalendar({ ns: 'vm', month: vm.month, selected: vm.date, highlight: p.id, visitor: vm.calVisitor, visitorSelect: true, countVisitor: vm.visitor, levelOf,
          visits: d.visits.filter(v => !vm.calVisitor || v.visitor === vm.calVisitor) })}
        ${timetableHtml()}
      </div>
      <div class="vm-form">
        <label>대상자<input value="${esc(p.name)} · ${p.age ?? '-'}세" disabled></label>
        <div class="form two">
          <label>날짜<input type="date" data-change="vmSet" data-k="date" value="${vm.date}" ${dis}></label>
          <label>시작 시각<input type="time" step="600" data-change="vmSet" data-k="startTime" value="${vm.startTime}" ${dis}></label>
          <label>소요 시간<select data-change="vmSet" data-k="durationMin" ${dis}>${[30, 60, 90, 120].map(n => `<option value="${n}" ${+vm.durationMin === n ? 'selected' : ''}>${n}분</option>`).join('')}</select></label>
          <label>방문 유형<select data-change="vmSet" data-k="type" ${dis}>${opts(VISIT_TYPES, vm.type)}</select></label>
        </div>
        <label>방문자<select data-change="vmSet" data-k="visitor" ${dis}>${opts(visitors, vm.visitor)}</select></label>
        <label>목적<input data-input="vmText" data-k="purpose" value="${esc(vm.purpose)}" placeholder="${esc(r.reasons.slice(0, 2).join(', ') || '정기 안부 확인')}" ${dis}></label>
        <div id="vm-checks" aria-live="polite">${readOnly ? '' : checksHtml()}</div>
        ${readOnly ? `<p><span class="chip ${vm.status === 'done' ? 'chip-low' : 'chip-mid'}">${VISIT_STATUS[vm.status]}</span> ${vm.resultNote ? esc(vm.resultNote) : ''}${vm.cancelReason ? esc(vm.cancelReason) : ''}</p>` : ''}
        ${vm.sub === 'done' ? `<label>결과 메모<textarea id="vm-note" rows="3" data-input="vmDirty"></textarea></label>`
          : vm.sub === 'cancel' ? `<label>취소 사유<input id="vm-reason" data-input="vmDirty"></label>` : ''}
      </div>
    </div>`;
  vmModal.foot.innerHTML = vm.sub === 'done' ? `${btn('돌아가기', 'data-act="vmSub"', 'secondary', '')}${btn(`${icon('check', 16)}방문 완료`, 'data-act="vmDone"', 'primary', '')}`
    : vm.sub === 'cancel' ? `${btn('돌아가기', 'data-act="vmSub"', 'secondary', '')}${btn('방문 취소', 'data-act="vmCancel"', 'danger solid', '')}`
    : readOnly ? btn('닫기', 'data-close', 'secondary', '')
    : `${vm.mode === 'edit' ? `<span style="margin-right:auto" class="row">${btn('방문 완료', 'data-act="vmSub" data-v="done"', 'secondary', '')}${btn('방문 취소', 'data-act="vmSub" data-v="cancel"', 'danger', '')}</span>` : ''}
       ${btn('닫기', 'data-close', 'secondary', '')}
       <button type="button" class="btn btn-primary" data-act="vmSave" ${blocked ? 'disabled' : ''}>${c.conflicts.length && vm.force ? '그래도 등록' : vm.mode === 'new' ? '등록' : '저장'}</button>`;
  if (key) vmModal.el.querySelector(key)?.focus();
}

// 방문 창의 동작 (어느 화면에서 열든 같은 동작)
const visitActions = {
  vmPick: el => { vm.date = el.dataset.date; vm.force = false; vm.dirty = true; drawVisit(); },
  vmNav: el => { vm.month = shiftMonth(vm.month, +el.dataset.m); drawVisit(); },
  vmFilter: el => { vm.calVisitor = el.dataset.v; drawVisit(); },
  vmVisitor: el => { vm.calVisitor = el.value; drawVisit(); },
  vmSet: el => {
    vm[el.dataset.k] = el.value;
    if (el.dataset.k === 'date' && el.value) vm.month = el.value.slice(0, 7);
    if (el.dataset.k === 'visitor') vm.calVisitor = el.value; // 방문자를 바꾸면 캘린더도 그 방문자 일정으로
    vm.force = false;
    vm.dirty = true;
    drawVisit();
  },
  vmText: el => { vm[el.dataset.k] = el.value; vm.dirty = true; },
  vmDirty: () => { vm.dirty = true; },
  vmSave: () => {
    const d = getData(), me = currentAccount();
    const c = visitChecks(d, visitCandidate(), nowStamp());
    if (c.errors.length) return;
    if (c.conflicts.length && !vm.force) { vm.force = true; drawVisit(); return; } // 겹치면 한 번 더 눌러야 등록
    const cand = visitCandidate();
    if (!cand.purpose) cand.purpose = risk(d.people.find(p => p.id === cand.personId)).reasons.slice(0, 2).join(', ') || '정기 안부 확인';
    const isNew = vm.mode === 'new';
    if (isNew) {
      d.visits.push({ ...cand, id: 'v' + Date.now().toString(36), status: 'planned', resultNote: '', cancelReason: '', createdBy: me ? displayName(me) : '', createdAt: nowStamp() });
    } else Object.assign(d.visits.find(v => v.id === vm.id), cand);
    save();
    closeVisit();
    render();
    toast(isNew ? `방문 등록됨 · ${fmtMDW(cand.date)} ${cand.startTime}` : '방문 수정됨');
  },
  vmSub: el => { vm.sub = el.dataset.v || null; drawVisit(); vmModal?.el.querySelector('#vm-note, #vm-reason')?.focus(); },
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
    toast('방문 완료 · 일지 초안 만듦');
  },
  vmCancel: async () => {
    const reason = document.getElementById('vm-reason').value.trim();
    if (!(await confirmBox({ title: '방문 취소', text: '이 방문이 취소로 바뀌고 오늘 할 일·시간표에서 빠짐', ok: '방문 취소', cancel: '돌아가기', danger: true }))) return;
    const d = getData();
    const v = d.visits.find(x => x.id === vm.id);
    const before = { status: v.status, cancelReason: v.cancelReason };
    Object.assign(v, { status: 'canceled', cancelReason: reason });
    save();
    closeVisit();
    render();
    toast('방문 취소됨', { undo: () => { Object.assign(v, before); save(); render(); toast('방문 취소를 되돌림'); } });
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
  const R = '<b class="req" aria-hidden="true">*</b>';
  const managers = [...new Set([...d.people.map(x => x.manager), ...(d.accounts || []).map(displayName)].filter(Boolean))];
  const TOC = [['s1', '① 기본 인적 사항'], ['s2', '② 주소와 위치'], ['s3', '③ 관리 정보'], ['s4', '④ 동의'], ['s5', '⑤ 질환·복용약'],
    ['s6', '⑥ 보조기기·신체 상태'], ['s7', '⑦ 응급 연락처'], ['s8', '⑧ 통화 설정'], ['s9', '⑨ 웨어러블'], ['s10', '⑩ 대면 인지검사 기록']];
  const S = (id, title, body) => `<section id="${id}" class="card pf-sec"><h2>${title}</h2>${body}</section>`;

  const html = `
    <div class="pf">
      <nav class="pf-toc" aria-label="입력 항목">${TOC.map(([id, t]) => `<button type="button" class="btn btn-ghost btn-sm" data-act="jump" data-to="${id}">${t}</button>`).join('')}</nav>
      <form id="pform" class="pf-body" data-submit="savePerson2" novalidate>
        ${S('s1', '① 기본 인적 사항', `<div class="form">
          <label><span>이름 ${R}</span><input name="name" value="${esc(p.name)}" data-req></label>
          <label><span>성별 ${R}</span><select name="sex" data-req><option value="">선택</option>${opts(['여', '남'], p.sex)}</select></label>
          <label><span>생년월일 ${R}</span><input name="birth" type="date" value="${p.birth || ''}" max="${today}" data-req data-input="pfAge"></label>
          <label>나이<input id="pf-age" value="${p.birth ? ageFrom(p.birth, today) + '세' : ''}" disabled></label>
          <label><span>통화 받을 전화번호 ${R}</span><input name="phone" type="tel" value="${esc(p.phone)}" data-req placeholder="010-0000-0000"><small class="err" id="err-pf-phone" data-err="phone"></small></label>
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
            <div><span>외부 AI 서비스 이용 ${R}<br><small class="muted">${AI_CONSENT_TEXT}</small></span>${yn('c-ai', cs.ai, true)}</div>
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
            <label><span>연락처 ${R}</span><input name="px-phone" type="tel" value="${esc(cs.proxy?.phone || '')}" data-req-proxy></label>
          </div>`)}
        ${S('s5', '⑤ 질환·복용약', secs.disease)}
        ${S('s6', '⑥ 보조기기·신체 상태', secs.body)}
        ${S('s7', `⑦ 응급 연락처 ${R}`, secs.contacts)}
        ${S('s8', '⑧ 통화 설정', secs.call)}
        ${S('s9', '⑨ 웨어러블', secs.device)}
        ${S('s10', '⑩ 대면 인지검사 기록', secs.tests)}
        <div id="pf-dup" aria-live="polite"></div>
        <div class="savebar">
          <button type="button" class="btn btn-ghost btn-sm left" data-act="pfMissing" id="pf-missing"></button>
          <div class="row">
            <a class="btn btn-secondary" href="${orig ? `#/admin/p/${orig.id}/info` : '#/admin/people'}">취소</a>
            <button class="btn btn-primary" type="submit">저장</button>
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
  // 빈 필수 칸 표시 (aria-invalid) + 아래 저장 줄의 '필수 항목 N개 남음'
  const markMissing = shown => {
    const f = document.getElementById('pform');
    if (!f) return;
    const miss = missing();
    if (shown) f.querySelectorAll('[data-req], [data-req-proxy]').forEach(el => el.setAttribute('aria-invalid', miss.includes(el) ? 'true' : 'false'));
    const mb = document.getElementById('pf-missing');
    mb.textContent = miss.length ? `필수 항목 ${miss.length}개 남음` : '필수 항목 모두 입력됨';
    mb.classList.toggle('bad', !!miss.length);
    mb.disabled = !miss.length;
  };

  actions.jump = el => document.getElementById(el.dataset.to).scrollIntoView({ behavior: 'smooth', block: 'start' });
  actions.pfAge = el => { document.getElementById('pf-age').value = el.value ? ageFrom(el.value, today) + '세' : ''; };
  actions.pfMethod = el => { document.getElementById('pf-proxy').hidden = el.value !== '대리인'; };
  actions.pfMissing = () => { const m = missing()[0]; m?.scrollIntoView({ block: 'center' }); m?.focus(); };
  actions.pfForce = () => { pfState = { force: true }; document.getElementById('pform').requestSubmit(); };
  actions.savePerson2 = async f => {
    const F = n => f.querySelector(`[name="${n}"]`);
    const miss = missing();
    markMissing(true);
    if (miss.length) { miss[0].scrollIntoView({ block: 'center' }); miss[0].focus(); return; }
    const phone = F('phone').value.trim();
    const perr = f.querySelector('[data-err=phone]');
    perr.textContent = validPhone(phone, 9) ? '' : '숫자와 하이픈만, 9~11자리';
    F('phone').setAttribute('aria-invalid', perr.textContent ? 'true' : 'false');
    if (perr.textContent) { F('phone').setAttribute('aria-describedby', perr.id); F('phone').scrollIntoView({ block: 'center' }); F('phone').focus(); return; }
    const radio = n => { const x = f.querySelector(`[name="${n}"]:checked`); return x ? x.value === 'yes' : null; };
    if (!radio('c-service') || !radio('c-privacy')) { toast('서비스 참여·개인정보 수집 동의 필요', { error: true }); document.getElementById('s4').scrollIntoView(); return; }
    const birth = F('birth').value;
    if (birth > today) { toast('생년월일이 오늘보다 늦음', { error: true }); F('birth').setAttribute('aria-invalid', 'true'); F('birth').focus(); return; }
    const age = ageFrom(birth, today);
    const cand = { id: orig?.id, name: F('name').value.trim(), birth, phone };
    const dups = findDuplicates(d.people, cand);
    if (dups.length && !pfState?.force) {
      document.getElementById('pf-dup').innerHTML = `<div class="chk err-box">중복 의심 · ${dups.map(x => `<a href="#/admin/p/${x.id}">${esc(x.name)} (${x.birth ? fmtDate(x.birth) : x.age + '세'}, ${esc(x.phone)})</a>`).join(', ')}
        <button type="button" class="btn btn-secondary btn-sm" data-act="pfForce">그래도 ${orig ? '저장' : '추가'}</button></div>`;
      document.getElementById('pf-dup').scrollIntoView({ block: 'center' });
      return;
    }
    if (age < 60 && !(await confirmBox({ title: '나이 확인', text: `나이 ${age}세 (대상 기준 60세 이상). 그래도 저장`, ok: '저장' }))) return;
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
      date: F('c-date').value, renewDate: F('c-renew').value, ai: radio('c-ai') === true
    };
    const by = me ? displayName(me) : '';
    target.info.edited = { ...(target.info.edited || {}), ...Object.fromEntries(['disease', 'body', 'call', 'contacts', 'device', 'tests'].map(k => [k, { by, at: nowStamp() }])) };
    if (!orig) d.people.push(target);
    pfState = null;
    save();
    location.hash = `#/admin/p/${target.id}`;
    toast(orig ? '대상자 정보 저장됨' : `${target.name} 추가됨`);
  };

  return {
    title: orig ? `대상자 수정 · ${orig.name}` : '대상자 추가',
    crumbs: orig ? [['대상자 관리', '#/admin/people'], [orig.name, `#/admin/p/${orig.id}/info`], ['전체 수정']] : [['대상자 관리', '#/admin/people'], ['대상자 추가']],
    html,
    after: () => {
      const f = document.getElementById('pform');
      f.querySelectorAll('[data-req], [data-req-proxy]').forEach(el => el.setAttribute('aria-required', 'true'));
      f.addEventListener('input', () => markMissing(false));
      f.addEventListener('change', () => markMissing(false));
      markMissing(false);
      const el = document.getElementById('pf-map');
      if (!window.L) { el.innerHTML = `<div class="map-state">${icon('alert', 20)}<span>지도를 불러오지 못함 · 위도·경도를 직접 입력</span></div>`; return; }
      map = L.map(el, { scrollWheelZoom: false });
      map.attributionControl.setPrefix(false).setPosition('bottomleft');
      baseTiles(map);
      const border = L.geoJSON(ungchon, { style: boundaryStyle(), interactive: false }).addTo(map);
      map.fitBounds(border.getBounds(), { padding: [8, 8] });
      let marker = null;
      const place = (lat, lng) => {
        marker?.remove();
        marker = L.circleMarker([lat, lng], { radius: 9, color: css('--panel'), weight: 2.5, fillColor: css('--accent'), fillOpacity: 1 }).addTo(map);
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
// 외부 AI 서비스 동의 칸이 없던 기존 대상자는 동의한 것으로 (새 대상자는 추가할 때 고른다)
for (const p of d0.people) if (p.info && p.info.consent?.ai === undefined) p.info.consent = { ...(p.info.consent || {}), ai: true };
d0.accounts ??= [];
window.addEventListener('hashchange', route);
route();
