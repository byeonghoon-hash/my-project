// 통화 시뮬레이션: 음성합성 → 녹음 + 받아쓰기 → 다음 문항

import { planForDate, scoreItem, isRepeatAsk, scorePct, SELF_QUESTIONS, CHAT_QUESTION, classifySleep, classifyMood, findRequests } from './items.js';
import { todayStr, nowStamp } from './metrics.js';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const SILENCE_MS = 3000;   // 말이 끝나고 3초 침묵 → 다음 문항
const VOICE_LEVEL = 0.02;  // 이 음량(RMS)보다 크면 말하는 중으로 본다

let skip = null;     // [다음] 버튼
let aborted = false; // 통화 도중 화면을 떠남
let utter = null;    // 크롬에서 onend가 사라지지 않도록 참조를 붙잡아 둔다

export const nextItem = () => skip && skip();
export function stopCall() {
  aborted = true;
  speechSynthesis.cancel();
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

let rate = 0.9; // 말 속도 (대상자 기본 정보 ③)
function speak(text) {
  return new Promise(resolve => {
    if (aborted) return resolve();
    speechSynthesis.cancel();
    utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'ko-KR';
    utter.rate = rate;
    const ko = speechSynthesis.getVoices().find(v => v.lang.startsWith('ko'));
    if (ko) utter.voice = ko;
    const fallback = setTimeout(resolve, 4000 + text.length * 350); // onend가 안 오는 경우 대비
    utter.onend = utter.onerror = () => { clearTimeout(fallback); resolve(); };
    speechSynthesis.speak(utter);
  });
}

// 통화 한 번. 끝나면 { call, blob } (화면을 떠나 중단되면 null). 마이크를 못 쓰면 예외.
// ui: { time(초), question(글자), level(0~1) }
// person.info.call: 호칭(title), 말 속도(rate), 질문 다시 읽기 허용 횟수(rereads), 자기보고 질문(selfReport)
export async function runCall(settings, ui, person) {
  aborted = false;
  const cfg = person?.info?.call || {};
  rate = cfg.rate || 0.9;
  const rereads = cfg.rereads ?? 1;
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const date = todayStr();
  const startedAt = nowStamp();
  const plan = planForDate(date, settings.parallelSets);

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
  const ctx = { ui, level, deadline: t0 + settings.maxCallSec * 1000, useSR: !!SR };
  const clock = setInterval(() => ui.time(Math.floor((performance.now() - t0) / 1000)), 500);

  // 한 문항 묻고 듣기 (재질문이면 허용 횟수만큼 질문을 다시 읽는다). 재질문 발화도 대답 원문에 남긴다.
  const ask = async (question, item) => {
    const r = { answer: '', latencySec: null, repeatAsked: 0, startMs: Math.round(performance.now() - t0), endMs: null };
    ui.question(question);
    let left = rereads;
    const said = [];
    for (;;) {
      await speak(question);
      if (aborted) break;
      const ans = await listen(ctx, item, left > 0);
      r.repeatAsked += ans.asks;
      if (ans.wantReread) { left--; said.push(ans.text); continue; }
      said.push(ans.text);
      r.latencySec = ans.latencyMs == null ? null : Math.round(ans.latencyMs / 100) / 10;
      break;
    }
    r.answer = said.filter(Boolean).join(' ');
    r.endMs = Math.round(performance.now() - t0);
    return r;
  };

  const results = [];
  const timeUp = () => aborted || performance.now() >= ctx.deadline; // 통화 상한을 넘으면 남은 문항은 건너뛴다
  for (const [n, item] of plan.items.entries()) {
    if (timeUp()) break;
    const question = n === 0 && cfg.title ? `${cfg.title}, 안녕하세요. ${item.question}` : item.question;
    const r = await ask(question, item);
    results.push({
      key: item.key, domain: item.domain, question, answer: r.answer, expected: item.expected,
      score: ctx.useSR ? scoreItem(item, r.answer) : null, // 받아쓰기가 없으면 관리자가 채점
      maxScore: item.maxScore, latencySec: r.latencySec, repeatAsked: r.repeatAsked, startMs: r.startMs, endMs: r.endMs
    });
  }
  const allDone = results.length === plan.items.length;

  // 자기보고(수면·기분, 켬/끔 설정)와 안부 대화 — 채점하지 않는다
  const free = { key: 'free', maxSec: 20 };
  let selfReport = null, chat = null;
  if (allDone && cfg.selfReport !== false && !timeUp()) {
    const sleep = await ask(SELF_QUESTIONS.sleep, free);
    const mood = timeUp() ? null : await ask(SELF_QUESTIONS.mood, free);
    // 대답이 없으면 분류하지 않는다
    selfReport = { sleep: { answer: sleep.answer, value: sleep.answer ? classifySleep(sleep.answer) : null } };
    if (mood) selfReport.mood = { answer: mood.answer, value: mood.answer ? classifyMood(mood.answer) : null };
  }
  if (allDone && !timeUp()) chat = { question: CHAT_QUESTION, answer: (await ask(CHAT_QUESTION, free)).answer };

  if (!aborted) {
    ui.question('오늘도 통화해 주셔서 감사합니다.');
    await speak('오늘도 통화해 주셔서 감사합니다.');
  }
  clearInterval(clock);
  if (recorder) await new Promise(resolve => { recorder.onstop = resolve; recorder.stop(); });
  stream.getTracks().forEach(t => t.stop());
  actx.close();
  if (aborted) return null;

  return {
    blob: new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' }), // 녹음하지 않았으면 빈 파일 → 저장 안 함
    call: {
      date, startedAt, time: startedAt.slice(11, 16), source: 'real',
      status: allDone ? 'completed' : 'partial',
      durationSec: Math.round((performance.now() - t0) / 1000),
      rotationDomain: plan.rotationDomain,
      setIndex: plan.setIndex,
      items: results,
      scorePct: scorePct(results),
      selfReport, chat,
      requests: [chat?.answer, selfReport?.sleep?.answer, selfReport?.mood?.answer].flatMap(findRequests)
    }
  };
}

// 답변 구간 하나. 말이 끝나고 3초 침묵 / 문항 최대 시간 / [다음] / 재질문(다시 읽기) 중 먼저 오는 것으로 끝난다.
// 동물 이름(1분 과제)은 중간에 쉬어도 끊지 않고 60초를 기다린다.
function listen(ctx, item, canReread) {
  return new Promise(resolve => {
    const start = performance.now();
    const useSilence = item.key !== 'fluency';
    let spokeAt = null, lastVoice = 0, finals = '', interim = '', asks = 0, recog = null, finished = false;

    const finish = wantReread => {
      if (finished) return;
      finished = true;
      clearInterval(timer);
      skip = null;
      if (recog) { recog.onend = null; recog.abort(); }
      ctx.ui.level(0);
      resolve({ text: (finals + ' ' + interim).trim(), latencyMs: spokeAt ? Math.round(spokeAt - start) : null, asks, wantReread });
    };

    // 받아쓰기: 답변 구간마다 새로 시작한다 (질문 읽는 소리가 받아써지지 않도록)
    const startRecog = () => {
      if (!ctx.useSR) return;
      recog = new SR();
      recog.lang = 'ko-KR';
      recog.continuous = true;
      recog.interimResults = true;
      recog.onresult = e => {
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
      const lv = ctx.level();
      ctx.ui.level(lv);
      if (lv > VOICE_LEVEL) {
        spokeAt ??= now;
        lastVoice = now;
      }
      if (now - start >= item.maxSec * 1000 || now >= ctx.deadline) finish(false);
      else if (useSilence && spokeAt && now - lastVoice >= SILENCE_MS) finish(false);
    }, 100);

    skip = () => finish(false);
  });
}
