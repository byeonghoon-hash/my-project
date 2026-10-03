// 통화 시뮬레이션: 인사 → 인지검사(고정) → 자기보고 → 안부 대화 → 끝인사
// 정기 인지검사 날(cist 계획이 있으면): 인사 → 정기 검사 문항 → 끝인사 → 안부 한 번 → 마무리 (상한 cistMaxSec)
// 음성 출력은 speak() 하나만 거친다: AI 음성(Typecast, server.py 경유) 또는 브라우저 기본 음성.
// AI(Claude)는 인사·안부 대화·통화 후 정리만 맡는다. 검사 문항·순서·제한 시간·채점은 items.js 그대로.
// 서버가 없거나 키·크레딧·동의가 없으면 기본 음성 + 고정 대본으로 끝까지 간다.

import {
  planForDate, scoreItem, isDecline, itemSpec, isRepeatAsk, scorePct, SELF_QUESTIONS, classifySleep, classifyMood, findRequests,
  SCRIPT, detectEmergency, checkChatReply, fillTitle, useAiVoice, useAiChat, ttsOutcome, isOffTopic, CIST, rescoreCist, scoreCist, yearFollowUp, recogInEarlier
} from './items.js';
import { todayStr, nowStamp } from './metrics.js';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const SILENCE_MS = 3000;   // 말이 끝나고 3초 침묵 → 다음 문항
const VOICE_LEVEL = 0.02;  // 이 음량(RMS)보다 크면 말하는 중으로 본다
const ECHO_MS = 300;       // 앱 목소리가 끝나고 이만큼 지난 뒤부터 어르신 말을 받는다
const TTS_MS = 8000;       // AI 음성 한 문장 제한 시간
const CHAT_MS = 8500;      // AI 대화 한 턴 제한 시간 (서버 8초 + 여유)
const CHAT_MAX_SEC = 60;   // 안부 대화 최대 시간

let skip = null;      // [다음] 버튼
let aborted = false;  // 통화 도중 화면을 떠남
let utter = null;     // 크롬에서 onend가 사라지지 않도록 참조를 붙잡아 둔다
let audio = null;     // 지금 재생 중인 AI 음성
let quietUntil = 0;   // 이 시각 전에는 마이크 입력을 무시한다 (앱 목소리가 어르신 말로 적히지 않게)
let voice = { ai: false, voiceId: '', tempo: 0.9, blobs: new Map(), used: false };
let rate = 0.9;       // 말 속도 (대상자 기본 정보 ③)

export const nextItem = () => skip && skip();
export function stopCall() {
  aborted = true;
  speechSynthesis.cancel();
  audio?.pause();
  audio?.onended?.();
  nextItem();
}

// 벨소리: 짧은 비프음 두 번을 2초마다. 멈추는 함수를 돌려준다.
export function startRing() {
  const ctx = new AudioContext();
  const beep = t => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.value = 0.2;
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.25);
  };
  const ring = () => { beep(ctx.currentTime); beep(ctx.currentTime + 0.4); };
  ring();
  const id = setInterval(ring, 2000);
  return () => { clearInterval(id); ctx.close(); };
}

// ---------- 서버 (server.py) ----------
const wait = ms => new Promise(r => setTimeout(r, Math.max(0, ms)));
async function post(path, body, ms) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  const t0 = performance.now();
  try {
    const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ac.signal });
    return { status: r.status, res: r, elapsedMs: performance.now() - t0 };
  } catch {
    return { status: 0, res: null, elapsedMs: performance.now() - t0 };
  } finally {
    clearTimeout(timer);
  }
}

// { tts, llm, voices }. python -m http.server 로 열었거나 서버가 꺼져 있으면 모두 false.
export async function getHealth() {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 2000);
  try {
    const r = await fetch('/api/health', { signal: ac.signal, cache: 'no-store' });
    const h = r.ok ? await r.json() : null;
    return { tts: !!h?.tts, llm: !!h?.llm, credits: !!h?.credits, voices: Array.isArray(h?.voices) ? h.voices : [] };
  } catch {
    return { tts: false, llm: false, credits: false, voices: [] };
  } finally {
    clearTimeout(timer);
  }
}

// AI 음성 한 문장 → { blob } | { error: 'credits' | 'fail' }. 미리 듣기에도 쓴다.
export async function fetchVoice(text, voiceId, tempo, cache) {
  const r = await post('/api/tts', { text, voiceId, tempo, cache }, TTS_MS);
  const out = ttsOutcome({ status: r.status, elapsedMs: r.elapsedMs, timeoutMs: TTS_MS });
  if (out !== 'ok') return { error: out === 'credits' ? 'credits' : 'fail' };
  try { return { blob: await r.res.blob() }; } catch { return { error: 'fail' }; }
}

async function askLlm(body) {
  const r = await post('/api/chat', body, CHAT_MS);
  if (r.status !== 200) return null;
  try { return checkChatReply(await r.res.json()); } catch { return null; }
}

// 통화 후 정리 (보내는 것: 인사·자기보고·안부 대화의 문장만). 실패하면 null → 규칙 기반 추출을 그대로 쓴다.
export async function summarizeCall(talk) {
  if (!talk?.some(t => t.role === 'elder')) return null;
  const r = await post('/api/summarize', { history: talk.map(t => ({ role: t.role, text: t.text })) }, 22000);
  if (r.status !== 200) return null;
  try { return await r.res.json(); } catch { return null; }
}

// 전화가 울리는 동안 미리 준비: 서버 상태 + AI 인사 한 문장 (지난 안부 요약만 보낸다)
export function prepareCall(person, summaries, settings) {
  const health = getHealth();
  const greet = health.then(h => (useAiChat(h, person)
    ? askLlm({ phase: 'greeting', history: [], summaries: summaries.slice(0, 3), remainingSec: settings.maxCallSec })
    : null));
  return { health, greet, summaries: summaries.slice(0, 3) };
}

// ---------- 음성 출력: 모든 소리는 이 함수만 거친다 ----------
// cache: 고정 문장이면 true (서버에 mp3 저장). slow: 다시 읽기 (같은 mp3를 0.85배로).
function voiceBlob(text, cache) {
  if (!voice.blobs.has(text)) {
    voice.blobs.set(text, fetchVoice(text, voice.voiceId, voice.tempo, cache).then(r => {
      if (r.error === 'credits') voice.ai = false; // 크레딧 부족: 이후 문장은 기본 음성
      if (!r.blob) voice.blobs.delete(text);
      return r.blob || null;
    }));
  }
  return voice.blobs.get(text);
}

function playBlob(blob, slow) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(blob);
    const a = new Audio(url);
    a.playbackRate = slow ? 0.85 : 1;
    let done = false;
    const finish = ok => { if (done) return; done = true; clearTimeout(guard); URL.revokeObjectURL(url); if (audio === a) audio = null; resolve(ok); };
    const guard = setTimeout(() => finish(true), 60000);
    a.onended = () => finish(true);
    a.onerror = () => finish(false);
    audio = a;
    a.play().catch(() => finish(false));
  });
}

function speakBasic(text, slow) {
  return new Promise(resolve => {
    if (aborted) return resolve();
    speechSynthesis.cancel();
    utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'ko-KR';
    utter.rate = slow ? rate * 0.85 : rate;
    const ko = speechSynthesis.getVoices().find(v => v.lang.startsWith('ko'));
    if (ko) utter.voice = ko;
    const fallback = setTimeout(resolve, 4000 + text.length * 350); // onend가 안 오는 경우 대비
    utter.onend = utter.onerror = () => { clearTimeout(fallback); resolve(); };
    speechSynthesis.speak(utter);
  });
}

export async function speak(text, { cache = false, slow = false } = {}) {
  if (aborted || !text) return;
  quietUntil = Infinity;
  try {
    if (voice.ai) {
      const blob = await voiceBlob(text, cache);
      if (blob && !aborted && (await playBlob(blob, slow))) { voice.used = true; return; }
    }
    if (!aborted) await speakBasic(text, slow); // AI 음성이 없거나 실패한 문장만 기본 음성
  } finally {
    quietUntil = performance.now() + ECHO_MS;
  }
}

// 고정 문장 미리 받기 (서버 제한에 맞춰 한 번에 2개씩)
async function prefetch(texts) {
  const queue = [...new Set(texts)];
  const worker = async () => { while (queue.length && voice.ai && !aborted) await voiceBlob(queue.shift(), true); };
  await Promise.all([worker(), worker()]);
}

// ---------- 통화 한 번 ----------
// 끝나면 { call, blob, talk } (화면을 떠나 중단되면 null). 마이크를 못 쓰면 예외.
// ui: { time(초), question(글자), level(0~1), emergency(발화, 표현) }
// person.info.call: 호칭(title), 말 속도(rate), 질문 다시 읽기 허용 횟수(rereads), 자기보고 질문(selfReport)
// cist: items.js cistPlan() 결과. 있으면 그날은 매일 문항 대신 정기 검사를 한다.
// ui.draw(figure) → { finish(): Promise<{ blob, strokes }> } | null (그림판을 못 띄우면 음성 대체로 자동 전환)
export async function runCall(settings, ui, person, prep, bank, cist = null) {
  aborted = false;
  const cfg = person?.info?.call || {};
  rate = cfg.rate || 0.9;
  const rereads = cfg.rereads ?? 1;
  const title = cfg.title || '';
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const date = todayStr();
  const startedAt = nowStamp();
  const plan = planForDate(date, bank); // 관리자 '문항 관리'에서 고친 뱅크

  // AI 사용 여부: 서버 상태 × 대상자 동의
  const health = (await prep?.health) || { tts: false, llm: false, voices: [] };
  const voiceIds = health.voices.map(v => v.id);
  voice = {
    ai: useAiVoice(health, person), used: false, blobs: new Map(),
    voiceId: voiceIds.includes(settings.voiceId) ? settings.voiceId : voiceIds[0] || '',
    tempo: Math.min(1, Math.max(0.7, Math.round(rate * 100) / 100))
  };
  const aiChat = useAiChat(health, person);
  const S = plan.script;
  const greetLine = fillTitle(S.greeting, title);
  if (voice.ai && cist) prefetch([fillTitle(CIST.script.greeting, title), fillTitle(CIST.script.intro, title), CIST.memory.intro, CIST.memory.again, ...cist.items.filter(i => i.question && !['recall', 'digits'].includes(i.type)).map(i => i.question)]);
  else if (voice.ai) {
    prefetch([greetLine, ...(aiChat ? [] : [S.condition]), S.recent, S.intro,
      ...plan.items.flatMap((it, n) => (n ? [SCRIPT.bridges[(n - 1) % 3], it.question] : [it.question])),
      ...SCRIPT.acks, SCRIPT.offTopic, SCRIPT.emergency, SCRIPT.declined, SELF_QUESTIONS.sleep, SELF_QUESTIONS.mood,
      ...(aiChat ? [] : SCRIPT.chatFixed), SCRIPT.chatClose, S.closing]);
  }

  // 통화 전체를 한 파일로 녹음. 통화 녹음 미동의면 녹음하지 않고 채점만 한다 (마이크는 받아쓰기·음량 감지에 쓴다)
  const record = person?.info?.consent?.recording !== false;
  const chunks = [];
  const recorder = record ? new MediaRecorder(stream) : null;
  if (recorder) {
    recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
    recorder.start(1000);
  }

  // 음량 측정 (말 시작·침묵 감지)
  const actx = new AudioContext();
  const analyser = actx.createAnalyser();
  analyser.fftSize = 1024;
  actx.createMediaStreamSource(stream).connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  const level = () => {
    analyser.getFloatTimeDomainData(buf);
    return Math.sqrt(buf.reduce((s, x) => s + x * x, 0) / buf.length);
  };

  const t0 = performance.now();
  const ctx = { ui, level, deadline: t0 + (cist ? settings.cistMaxSec || 900 : settings.maxCallSec) * 1000, useSR: !!SR };
  const clock = setInterval(() => ui.time(Math.floor((performance.now() - t0) / 1000)), 500);
  const leftSec = () => (ctx.deadline - performance.now()) / 1000;
  const timeUp = () => aborted || performance.now() >= ctx.deadline; // 통화 상한을 넘으면 남은 문항은 건너뛴다

  // 밖으로 보내는 문장에서는 호칭(이름이 들어 있다)을 {호칭} 자리표시로 되돌린다
  const anon = t => (title ? t.replaceAll(title, '{호칭}') : t);
  // 대화 기록: 앱/어르신 번갈아. ai = AI가 만든 문장
  const turns = [];
  const emergencies = [];
  let endNow = false; // '죽고 싶' 같은 표현: 안내 뒤 끝인사
  const say = async (text, { cache = true, slow = false, ai = false, phase = 'item', show, visual } = {}) => {
    if (aborted) return;
    ui.question(show ?? text); // show: 화면에 다른 글자 (숫자·외울 문장은 화면에 보이지 않게)
    ui.visual?.(visual ?? null); // visual: 대본 대신 보여 줄 칸 (카드·모양·보기). 없으면 지운다
    turns.push({ role: 'app', text, ai, phase });
    await speak(text, { cache, slow });
  };
  const hear = async (item, canReread) => {
    await wait(quietUntil - performance.now()); // 앱 목소리 끝 + 0.3초 뒤부터
    return listen(ctx, item, canReread);
  };
  // 응급 표현: LLM을 부르지 않고 바로 안내 + 관리자 알림
  const checkEmergency = async (text, phase) => {
    const em = detectEmergency(text);
    if (!em) return false;
    emergencies.push({ text, phrase: em.phrase, phase, atMs: Math.round(performance.now() - t0) });
    ui.emergency?.(text, em.phrase);
    await say(SCRIPT.emergency, { phase: 'emergency' });
    if (em.severe) endNow = true;
    return true;
  };

  // 한 문항 묻고 듣기 (재질문이면 허용 횟수만큼 천천히 다시 읽는다, 딴 이야기면 한 번 다시 묻는다)
  // limit: { rereads(다시 읽기 허용 횟수), noOff(딴 이야기 확인 안 함) }
  const ask = async (question, item, phase = 'item', opts = {}, limit = {}) => {
    const r = { answer: '', latencySec: null, repeatAsked: 0, startMs: Math.round(performance.now() - t0), endMs: null, emergency: false, segments: 0 };
    let left = limit.rereads ?? rereads, offLeft = phase === 'item' && !limit.noOff ? 1 : 0, slow = false;
    const said = [];
    for (;;) {
      await say(question, { slow, phase, ...opts });
      if (aborted) break;
      const ans = await hear(item, left > 0);
      r.repeatAsked += ans.asks;
      r.segments = ans.segments;
      said.push(ans.text);
      const off = !ans.wantReread && offLeft > 0 && isOffTopic(item, ans.text);
      if (ans.text) turns.push({ role: 'elder', text: ans.text, phase: off ? 'offtopic' : phase });
      if (await checkEmergency(ans.text, phase)) { r.emergency = true; break; }
      if (ans.wantReread) { left--; slow = true; continue; }
      if (off) { offLeft--; slow = false; await say(SCRIPT.offTopic, { phase: 'offtopic' }); continue; }
      r.latencySec = ans.latencyMs == null ? null : Math.round(ans.latencyMs / 100) / 10;
      break;
    }
    r.answer = said.filter(Boolean).join(' ');
    r.endMs = Math.round(performance.now() - t0);
    return r;
  };

  const free = { key: 'free', maxSec: 20 };
  const teardown = async () => {
    clearInterval(clock);
    if (recorder) await new Promise(resolve => { recorder.onstop = resolve; recorder.stop(); });
    stream.getTracks().forEach(t => t.stop());
    actx.close();
  };
  const blob = () => new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' }); // 녹음하지 않았으면 빈 파일 → 저장 안 함

  // ---------- 정기 인지검사(전화형) ----------
  if (cist) {
    const T = CIST.script;
    const items = cist.items.map(i => ({ ...i }));
    const byId = id => items.find(i => i.id === id);
    const modes = { ...cist.modes };
    const register = [];
    let autoSwitch = null, drawing = null, regEnd = null;
    const NUM = ['공', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
    const stamp = (it, r) => Object.assign(it, { answer: r.answer, latencySec: r.latencySec, repeatAsked: r.repeatAsked, startMs: r.startMs, endMs: r.endMs, asked: true });
    const askItem = async (it, limit, show) => {
      const r = await ask(it.question, { key: 'cist', maxSec: 20 }, 'item', { show: show ?? it.show, visual: it.visual }, { noOff: true, ...limit });
      stamp(it, r);
      if (!r.answer && !r.emergency) await say(T.timeout); // 제한 시간 안에 대답이 없으면 0점 '무응답'
      return r;
    };
    // 외울 문장: 끊어 읽는 자리('/')마다 0.4초
    const sayParts = async parts => {
      turns.push({ role: 'app', text: parts.join(' / '), phase: 'item' });
      ui.question('잘 들어 주세요');
      for (const part of parts) { if (aborted) return; await speak(part, { cache: true }); await wait(400); }
    };

    const hello = await ask(fillTitle(T.greeting, title), free, 'greeting');
    const declined = !endNow && isDecline(hello.answer);
    if (declined) { await say(SCRIPT.declined, { phase: 'goodbye' }); endNow = true; }
    else await say(fillTitle(T.intro, title), { show: CIST.screen.intro });
    for (const step of declined ? [] : cist.steps) {
      if (aborted || endNow || timeUp()) break;
      const it = step.id ? byId(step.id) : null;
      if (step.kind === 'say') await say(step.text, step.show ? { show: step.show } : {});
      else if (step.kind === 'ask') {
        // 다시 읽기: 문항에 정해진 횟수(거꾸로 말하기·이해력 1번) 또는 대상자 설정
        const r = await askItem(it, { rereads: step.rereads ?? (step.reread ? rereads : 0) }, step.show);
        if (step.segments) it.segments = r.segments; // 말소리 앞에 따로 난 소리(박수·기침) 수
        // 연도를 두 자리나 육십갑자로만 말하면 한 번 되묻는다 (마지막 대답으로 채점)
        const follow = step.follow && !endNow && yearFollowUp(it.answer);
        if (follow) { const f = await ask(follow, { key: 'cist', maxSec: 20 }, 'item', {}, { rereads: 0, noOff: true }); if (f.answer) it.answer += ' ' + f.answer; }
      } else if (step.kind === 'register') {
        // 정확히 두 번 읽는다. 따라 말하기는 채점하지 않는다.
        for (let n = 0; n < step.times && !aborted && !endNow; n++) {
          await say(step.lines[n], { show: step.show });
          await sayParts(step.parts);
          const a = await hear(free, false);
          if (a.text) turns.push({ role: 'elder', text: a.text, phase: 'item' });
          register.push(a.text);
          await checkEmergency(a.text, 'item');
        }
        await say(step.remember, { show: step.showRemember });
        regEnd = performance.now();
      } else if (step.kind === 'digits') {
        // 숫자는 1초 간격으로 한 번만. 다시 불러 달라고 하시면 정해진 안내만 한다.
        const startMs = Math.round(performance.now() - t0);
        turns.push({ role: 'app', text: it.question, phase: 'item' });
        ui.question('숫자를 잘 들어 주세요');
        for (const [n, d] of [...it.digits].entries()) { if (n) await wait(1000); await speak(NUM[+d], { cache: true }); }
        let a = await hear({ key: 'cist', maxSec: 20 }, true);
        const said = [a.text];
        let asks = a.asks;
        if (a.wantReread && !aborted) { await say(step.once); a = await hear({ key: 'cist', maxSec: 20 }, false); said.push(a.text); asks += a.asks; }
        const answer = said.filter(Boolean).join(' ');
        if (answer) turns.push({ role: 'elder', text: answer, phase: 'item' });
        stamp(it, { answer, latencySec: a.latencyMs == null ? null : Math.round(a.latencyMs / 100) / 10, repeatAsked: asks, startMs, endMs: Math.round(performance.now() - t0) });
        if (!(await checkEmergency(answer, 'item')) && !answer) await say(T.timeout);
      } else if (step.kind === 'draw') {
        const pad = step.figure ? ui.draw?.(step.figure) : null;
        let res = null;
        if (pad) {
          await say(it.question, { show: it.show });
          const startMs = Math.round(performance.now() - t0);
          const a = await hear({ key: 'draw', maxSec: it.maxSec, stopOn: /다했|다그렸|끝났/ }, false);
          res = await pad.finish();
          if (a.text) turns.push({ role: 'elder', text: a.text, phase: 'item' });
          stamp(it, { answer: res?.strokes ? `그림 ${res.strokes}획` : '', latencySec: null, repeatAsked: 0, startMs, endMs: Math.round(performance.now() - t0) });
        }
        if (res?.strokes && res.blob) drawing = res.blob;
        else { // 그림판이 없거나 입력이 없으면 음성 대체 두 문항으로 자동 전환
          autoSwitch = pad ? '시공간: 그림 입력 없음 → 음성 대체' : '시공간: 그림판 사용 불가 → 음성 대체';
          modes.visuospatial = 'b';
          items.splice(items.indexOf(it), 1, ...step.fallback.map(f => ({ score: null, status: 'auto', note: '', answer: '', ...f })));
          for (const f of step.fallback) { if (timeUp() || endNow) break; await askItem(byId(f.id), { rereads }); }
        }
      } else if (step.kind === 'verbal') {
        const [a, b] = step.ids.map(byId);
        await askItem(a, { rereads: 1 }); // 다시 읽기 한 번만
        stamp(b, { ...a });
      } else if (step.kind === 'fluency') {
        // 중간에 쉬어도 끊지 않고 정한 시간(1분 또는 30초)을 다 기다린다
        const r = await ask(it.question, { key: 'fluency', maxSec: it.sec }, 'item', { show: it.show }, { rereads: 0, noOff: true });
        stamp(it, r);
        await say(step.stop);
      } else if (step.kind === 'choice') {
        const startMs = Math.round(performance.now() - t0);
        await say(it.question);
        const chosen = ui.choose ? await ui.choose(it) : null;
        Object.assign(it, { chosen, answer: chosen == null ? '' : it.options[chosen], asked: true, startMs, endMs: Math.round(performance.now() - t0) });
      } else if (step.kind === 'recall') {
        // 등록 뒤 3분이 안 지났으면 잡담 한 문항을 끼우고, 그래도 모자라면 남은 시간만큼 쉰다
        if (regEnd && (performance.now() - regEnd) / 1000 < step.gapSec) {
          const f = await ask(step.filler, free, 'filler');
          await checkEmergency(f.answer, 'filler');
          const rest = step.gapSec * 1000 - (performance.now() - regEnd);
          if (rest > 0 && !aborted && !endNow) { ui.question('잠시만 기다려 주세요'); await wait(Math.min(rest, ctx.deadline - performance.now())); }
        }
        if (aborted || endNow || timeUp()) break;
        const r = await ask(step.q, { key: 'cist', maxSec: 30 }, 'item', {}, { rereads: 0, noOff: true });
        for (const id of step.ids) stamp(byId(id), r);
        // 못 떠올린 낱말이 있으면 '더 생각나는 것은 없으신가요?'로 회상이 끝났는지 확인한 뒤 재인으로
        if (r.answer && !endNow && step.ids.some(id => scoreCist(byId(id)).score < 2)) {
          const more = await ask(step.more, { key: 'cist', maxSec: 20 }, 'item', {}, { rereads: 0, noOff: true });
          if (more.answer) for (const id of step.ids) byId(id).answer += ' ' + more.answer;
        }
        if (!r.answer && !r.emergency) await say(T.timeout);
      } else if (step.kind === 'recognition') {
        // 떠올리지 못한 낱말만 보기를 들려준다 (1점). 앞 재인 대답에서 이미 말한 낱말은 묻지 않고 재인으로 인정
        const said = [];
        for (const id of step.ids) {
          const k = byId(id);
          if (!k.asked || scoreCist(k).score === 2 || timeUp() || endNow || aborted) continue;
          const early = recogInEarlier(k, said);
          if (early) { k.recog = { ...k.recogSpec, response: k.recogSpec.answer, note: `앞 재인 대답에서 말함: "${early}"` }; continue; }
          const r = await ask(k.recogSpec.q, { key: 'cist', maxSec: 20 }, 'item', { show: k.recogSpec.show, visual: k.recogSpec.visual }, { rereads, noOff: true });
          k.recog = { ...k.recogSpec, response: r.answer, startMs: r.startMs, endMs: r.endMs };
          said.push(r.answer);
        }
      }
    }
    // 묻지 못한 문항(시간 초과·응급 안내로 중단)은 담당자 확인으로 남긴다
    const scored = items.map(it => (it.status === 'omitted' ? it : it.asked ? rescoreCist(it)
      : { ...it, score: null, status: 'needs_review', note: endNow ? '통화 중단으로 묻지 못함' : '시간 초과로 묻지 못함' }));
    const finished = items.every(it => it.status === 'omitted' || it.asked);

    // 끝인사 → 안부 한 번(AI면 AI 한 문장, 아니면 고정 질문) → 마무리
    const chatStart = turns.length;
    if (!declined && !aborted) {
      await say(T.end);
      if (!endNow && leftSec() > 15) {
        const reply = aiChat ? await askLlm({ phase: 'chat', history: [], summaries: prep?.summaries || [], remainingSec: 30 }) : null;
        await say(reply ? fillTitle(reply.say, title) : SCRIPT.chatFixed[1], { cache: !reply, ai: !!reply, phase: 'chat' });
        const a = await hear({ key: 'free', maxSec: 20 }, false);
        if (a.text) turns.push({ role: 'elder', text: a.text, phase: 'chat' });
        await checkEmergency(a.text, 'chat');
      }
      await say(T.closing, { phase: 'goodbye' });
    }
    await teardown();
    if (aborted) return null;
    const chatTurns = turns.slice(chatStart).filter(t => t.phase === 'chat' || t.phase === 'emergency');
    const elderChat = chatTurns.filter(t => t.role === 'elder').map(t => t.text).join(' ');
    return {
      blob: blob(),
      talk: turns.filter(t => ['greeting', 'filler', 'chat'].includes(t.phase)).map(t => ({ ...t, text: anon(t.text) })),
      aiChat,
      drawing,
      session: { form: cist.form, modes, autoSwitch, register, items: scored },
      call: {
        date, startedAt, time: startedAt.slice(11, 16), source: 'real', kind: 'cist',
        status: declined ? 'partial' : finished ? 'completed' : 'partial', declined,
        durationSec: Math.round((performance.now() - t0) / 1000),
        items: [], scorePct: null, selfReport: null,
        chat: chatTurns.length ? { question: chatTurns.find(t => t.role === 'app')?.text || '', answer: elderChat } : null,
        greeting: { text: fillTitle(T.greeting, title), ai: false }, opening: null,
        transcript: turns.map(({ role, text, phase }) => ({ role, text, phase })),
        chatTurns: chatTurns.map(({ role, text, ai }) => ({ role, text, ai: !!ai })),
        voice: voice.used ? 'ai' : 'basic', chatMode: aiChat ? 'ai' : 'fixed', emergencies,
        requests: [hello.answer, elderChat].flatMap(findRequests)
      }
    };
  }

  // ① 인사: '안녕하세요, {호칭}. 통화 가능하신가요?' → 어렵다고 하시면 다음에 다시 전화
  const hello = await ask(greetLine, free, 'greeting');
  const declined = !endNow && isDecline(hello.answer);
  if (declined) { await say(SCRIPT.declined, { phase: 'goodbye' }); endNow = true; }
  // ② 몸 상태: AI 한 문장(지난 안부를 잇는 질문, 전화가 울리는 동안 받아 둔 것) 또는 고정 문장
  let opening = null;
  if (!endNow && !timeUp()) {
    const greet = aiChat ? await Promise.race([prep?.greet, wait(1500).then(() => null)]).catch(() => null) : null;
    const condQ = greet ? fillTitle(greet.say, title) : S.condition;
    const cond = await ask(condQ, free, 'greeting', greet ? { cache: false, ai: true } : {});
    // ③ 최근 문제 (채점 안 함, 요청·관찰 메모로 쓴다)
    const recent = !endNow && !timeUp() ? await ask(S.recent, free, 'recent') : null;
    opening = { hello: hello.answer, condition: { question: condQ, answer: cond.answer, ai: !!greet }, recent: recent ? { question: S.recent, answer: recent.answer } : null };
    if (!endNow) await say(S.intro);
  }

  // ② 인지검사: 고정 문항 · 고정 연결 멘트(정답 여부와 상관없이 같은 말) · 기존 채점
  const results = [];
  for (const [n, item] of plan.items.entries()) {
    if (timeUp() || endNow) break;
    if (n > 0) await say(SCRIPT.bridges[(n - 1) % SCRIPT.bridges.length]);
    if (timeUp()) break;
    const r = await ask(item.question, item);
    results.push({
      ...itemSpec(item), question: item.question, answer: r.answer, expected: item.expected,
      score: ctx.useSR ? scoreItem(item, r.answer) : null, // 받아쓰기가 없으면 관리자가 채점
      maxScore: item.maxScore, latencySec: r.latencySec, repeatAsked: r.repeatAsked, startMs: r.startMs, endMs: r.endMs
    });
  }
  const allDone = results.length === plan.items.length;
  const go = () => allDone && !endNow && !timeUp();

  // ③ 자기보고 (수면·기분, 켬/끔 설정) — 채점하지 않는다
  let selfReport = null;
  if (go() && cfg.selfReport !== false) {
    const sleep = await ask(SELF_QUESTIONS.sleep, free, 'self');
    const mood = go() ? await ask(SELF_QUESTIONS.mood, free, 'self') : null;
    // 대답이 없으면 분류하지 않는다
    selfReport = { sleep: { answer: sleep.answer, value: sleep.answer ? classifySleep(sleep.answer) : null } };
    if (mood) selfReport.mood = { answer: mood.answer, value: mood.answer ? classifyMood(mood.answer) : null };
  }

  // ④ 안부 대화: AI(최대 3번 주고받기 또는 60초) 또는 고정 질문 2개. 시간이 모자라면 여기부터 줄인다.
  const chatStart = turns.length;
  const chatLeft = () => Math.min(leftSec() - 8, CHAT_MAX_SEC - (performance.now() - chatT0) / 1000); // 끝인사 몫 8초
  let chatT0 = performance.now();
  if (go() && leftSec() > 20) {
    chatT0 = performance.now();
    const listenChat = async () => {
      const a = await hear({ key: 'free', maxSec: Math.max(5, Math.min(20, chatLeft())) }, false);
      if (a.text) turns.push({ role: 'elder', text: a.text, phase: 'chat' });
      return a.text;
    };
    if (aiChat) {
      const history = () => turns.filter(t => t.phase !== 'item' && t.phase !== 'emergency').map(t => ({ role: t.role, text: anon(t.text) }));
      const llm = () => askLlm({ phase: 'chat', history: history(), summaries: prep?.summaries || [], remainingSec: Math.round(chatLeft()) });
      // 1초 안에 답이 없으면 맞장구를 먼저 (미리 받아 둔 파일이라 바로 나온다)
      const llmWithAck = async () => {
        const p = llm();
        const first = await Promise.race([p, wait(1000).then(() => 'late')]);
        if (first !== 'late') return first;
        await say(SCRIPT.acks[turns.length % SCRIPT.acks.length], { phase: 'chat' });
        return p;
      };
      let reply = await llm();
      for (let n = 0; ; n++) {
        if (!reply) { await say(SCRIPT.chatClose, { phase: 'chat' }); break; } // 버린 답·시간 초과 → 고정 마무리
        await say(fillTitle(reply.say, title), { cache: false, ai: true, phase: 'chat' }); // 개인 이야기는 캐시하지 않는다
        if (reply.end || aborted) break;
        if (chatLeft() < 5) { await say(SCRIPT.chatClose, { phase: 'chat' }); break; }
        const text = await listenChat();
        if (await checkEmergency(text, 'chat')) break;
        if (n >= 2 || chatLeft() < 8) { await say(SCRIPT.chatClose, { phase: 'chat' }); break; } // 3번째 주고받기 뒤
        reply = await llmWithAck();
      }
    } else {
      for (const q of SCRIPT.chatFixed) {
        if (aborted || chatLeft() < 5) break;
        await say(q, { phase: 'chat' });
        if (await checkEmergency(await listenChat(), 'chat')) break;
      }
      if (!endNow && !emergencies.some(e => e.phase === 'chat')) await say(SCRIPT.chatClose, { phase: 'chat' });
    }
  }
  const chatTurns = turns.slice(chatStart).filter(t => t.phase === 'chat' || t.phase === 'emergency');

  // ⑤ 끝인사
  if (!aborted && !declined) await say(S.closing, { phase: 'goodbye' });
  await teardown();
  if (aborted) return null;

  const firstQ = chatTurns.find(t => t.role === 'app');
  const chatAnswer = chatTurns.filter(t => t.role === 'elder').map(t => t.text).join(' ');
  const chat = firstQ ? { question: firstQ.text, answer: chatAnswer } : null;
  return {
    blob: blob(),
    // 통화 후 정리에 보내는 문장: 인사·딴 이야기·자기보고·안부 대화 (검사 문항과 대답은 보내지 않는다)
    talk: turns.filter(t => ['greeting', 'recent', 'offtopic', 'self', 'chat'].includes(t.phase)).map(t => ({ ...t, text: anon(t.text) })),
    aiChat,
    call: {
      date, startedAt, time: startedAt.slice(11, 16), source: 'real',
      status: allDone ? 'completed' : 'partial', declined,
      durationSec: Math.round((performance.now() - t0) / 1000),
      items: results,
      scorePct: scorePct(results),
      selfReport, chat,
      greeting: { text: greetLine, ai: false }, opening, chatTurns: chatTurns.map(({ role, text, ai }) => ({ role, text, ai: !!ai })),
      voice: voice.used ? 'ai' : 'basic', chatMode: aiChat ? 'ai' : 'fixed',
      emergencies,
      requests: [opening?.condition.answer, opening?.recent?.answer, ...chatTurns.filter(t => t.role === 'elder').map(t => t.text), selfReport?.sleep?.answer, selfReport?.mood?.answer,
        ...turns.filter(t => t.phase === 'offtopic').map(t => t.text)].flatMap(findRequests)
    }
  };
}

// 답변 구간 하나. 말이 끝나고 3초 침묵 / 문항 최대 시간 / [다음] / 재질문(다시 읽기) 중 먼저 오는 것으로 끝난다.
// 동물 이름·유창성·그리기는 중간에 쉬어도 끊지 않는다. item.stopOn: 받아쓰기에 이 말이 나오면 끝 ('다 했어요').
// segments: 0.25초 넘게 쉬었다가 다시 난 소리 묶음 수 (이해력 문항의 '후'·'콜록' 확인용)
function listen(ctx, item, canReread) {
  return new Promise(resolve => {
    const start = performance.now();
    const useSilence = item.key !== 'fluency' && item.key !== 'draw';
    let spokeAt = null, lastVoice = 0, finals = '', interim = '', asks = 0, recog = null, finished = false, segments = 0;

    const finish = wantReread => {
      if (finished) return;
      finished = true;
      clearInterval(timer);
      skip = null;
      if (recog) { recog.onend = null; recog.abort(); }
      ctx.ui.level(0);
      resolve({ text: (finals + ' ' + interim).trim(), latencyMs: spokeAt ? Math.round(spokeAt - start) : null, asks, wantReread, segments });
    };

    // 받아쓰기: 답변 구간마다 새로 시작한다 (질문 읽는 소리가 받아써지지 않도록)
    const startRecog = () => {
      if (!ctx.useSR) return;
      recog = new SR();
      recog.lang = 'ko-KR';
      recog.continuous = true;
      recog.interimResults = true;
      recog.onresult = e => {
        if (performance.now() < quietUntil) return; // 앱 목소리가 나오는 중
        interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const text = e.results[i][0].transcript;
          if (!e.results[i].isFinal) { interim += text; continue; }
          finals += ' ' + text;
          if (isRepeatAsk(text)) {
            asks++;
            if (canReread) return finish(true);
          }
        }
        if (item.stopOn?.test((finals + interim).replace(/\s/g, ''))) finish(false);
      };
      recog.onerror = e => {
        if (['not-allowed', 'service-not-allowed', 'network', 'language-not-supported'].includes(e.error)) ctx.useSR = false;
      };
      recog.onend = () => { if (!finished && ctx.useSR) startRecog(); }; // 크롬이 스스로 끊으면 다시 켠다
      try { recog.start(); } catch { ctx.useSR = false; }
    };
    startRecog();

    const timer = setInterval(() => {
      const now = performance.now();
      const lv = now < quietUntil ? 0 : ctx.level();
      ctx.ui.level(lv);
      if (lv > VOICE_LEVEL) {
        if (!lastVoice || now - lastVoice > 250) segments++;
        spokeAt ??= now;
        lastVoice = now;
      }
      if (now - start >= item.maxSec * 1000 || now >= ctx.deadline) finish(false);
      else if (useSilence && spokeAt && now - lastVoice >= SILENCE_MS) finish(false);
    }, 100);

    skip = () => finish(false);
  });
}
