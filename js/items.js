// 문항 뱅크, 오늘의 문항 선택(로테이션), 자동 채점

// ---------- 평행형 문항 세트 (설정의 N은 최대 10) ----------
export const MAX_SETS = 10;

const WORD_SETS = [
  ['사과', '기차', '모자'], ['나무', '자동차', '시계'], ['연필', '바다', '우산'],
  ['의자', '구름', '장갑'], ['호수', '신발', '가방'], ['자전거', '꽃병', '양말'],
  ['책상', '하늘', '냄비'], ['거울', '단풍', '수건'], ['비행기', '접시', '목도리'],
  ['안경', '시냇물', '베개']
];

// [3자리, 4자리]
const DIGIT_SETS = [
  ['382', '4179'], ['518', '2946'], ['736', '8251'], ['294', '6817'], ['853', '3162'],
  ['461', '7394'], ['627', '5183'], ['915', '2468'], ['348', '9725'], ['572', '1836']
];

// 공통점 문항: 핵심어 중 하나라도 들어가면 1점
const SIM_SETS = [
  [['사과', '배', ['과일']], ['기차', '버스', ['교통', '탈것', '타는', '운송']]],
  [['셔츠', '바지', ['옷', '의류', '입는']], ['망치', '톱', ['연장', '도구', '공구']]],
  [['눈', '귀', ['감각', '얼굴', '신체', '몸']], ['책상', '의자', ['가구']]],
  [['장미', '튤립', ['꽃']], ['연필', '볼펜', ['필기', '쓰는', '문구']]],
  [['피아노', '바이올린', ['악기', '음악']], ['시금치', '배추', ['채소', '야채', '나물']]],
  [['숟가락', '젓가락', ['식기', '수저', '먹는']], ['봄', '가을', ['계절']]],
  [['강', '바다', ['물']], ['신문', '라디오', ['소식', '뉴스', '언론', '매체']]],
  [['칼', '가위', ['자르', '자른']], ['산', '언덕', ['높', '땅']]],
  [['편지', '전화', ['연락', '소식', '전하']], ['할머니', '손자', ['가족', '식구']]],
  [['소나무', '대나무', ['나무', '식물']], ['달', '해', ['하늘', '빛', '밝']]]
];

// 언어유창성 채점용 동물 목록
export const ANIMALS = `개 강아지 고양이 소 송아지 황소 젖소 말 망아지 당나귀 노새 돼지 멧돼지 닭 병아리 오리 거위 염소 흑염소 양
토끼 쥐 햄스터 다람쥐 청설모 호랑이 사자 표범 치타 퓨마 재규어 스라소니 삵 늑대 여우 너구리 오소리 수달 족제비 담비
곰 판다 코끼리 기린 하마 코뿔소 얼룩말 낙타 사슴 노루 고라니 순록 캥거루 코알라 원숭이 고릴라 침팬지 오랑우탄 박쥐
두더지 고슴도치 들소 버팔로 물소 알파카 라마 나무늘보 개미핥기 하이에나 스컹크 미어캣 비버 물개 물범 바다표범 바다사자
고래 돌고래 범고래 상어 참새 비둘기 까치 까마귀 제비 독수리 매 부엉이 수리부엉이 올빼미 갈매기 백조 두루미 학 황새
왜가리 공작 앵무새 펭귄 타조 딱따구리 꿩 메추리 칠면조 기러기 원앙 뻐꾸기 꾀꼬리 종달새 카나리아 벌새 뱀 구렁이 도마뱀
악어 거북 거북이 자라 이구아나 카멜레온 개구리 두꺼비 도롱뇽 올챙이 붕어 잉어 메기 미꾸라지 금붕어 연어 참치 고등어
꽁치 멸치 갈치 복어 가오리 해마 장어 뱀장어 오징어 문어 낙지 새우 게 가재 조개 전복 해파리 불가사리 성게 나비 나방
벌 꿀벌 개미 잠자리 메뚜기 귀뚜라미 매미 모기 파리 무당벌레 사마귀 거미 지렁이 달팽이 반딧불이 풍뎅이 사슴벌레
장수풍뎅이 쇠똥구리 벼룩`.split(/\s+/);

const ANIMAL_SET = new Set(ANIMALS);
const PARTICLES = ['', '요', '이요', '랑', '이랑', '하고', '도', '이', '가', '는', '은', '나', '이나', '고'];

// ---------- 도우미 ----------
const DOMAINS = ['attention', 'fluency', 'executive'];
export const DOMAIN_LABEL = { attention: '주의력', fluency: '언어유창성', executive: '집행기능' };
// 문항별 영역 이름 (통화 기록의 items[].domain)
export const ITEM_DOMAIN = {
  orientation: '지남력', register: '기억 등록', backward3: '주의력', backward4: '주의력',
  fluency: '언어유창성', similarity1: '공통점', similarity2: '공통점', recall: '지연 회상'
};
// 자기보고(켬/끔 설정)와 안부 대화(채점 안 함) 질문
export const SELF_QUESTIONS = { sleep: '어젯밤 잠은 잘 주무셨어요?', mood: '오늘 기분은 어떠세요?' };
export const CHAT_QUESTION = '요즘 지내시기는 어떠세요? 불편하신 건 없으세요?';
export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const KDIGIT = '공일이삼사오육칠팔구';

const dayIndex = date => Math.floor(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / 864e5);
const hasBatchim = w => (w.charCodeAt(w.length - 1) - 0xac00) % 28 !== 0;
const nospace = t => (t || '').replace(/\s+/g, '');

// 1~31을 한글 숫자 읽기로 (예: 27 → 이십칠)
export function korNum(n) {
  const tens = Math.floor(n / 10), ones = n % 10;
  return (tens ? (tens > 1 ? KDIGIT[tens] : '') + '십' : '') + (ones ? KDIGIT[ones] : '');
}

// ---------- 오늘의 문항 ----------
// 단어 세트는 매일 → 같은 세트가 다시 나오는 간격 D = N일
// 로테이션 과제는 3일마다 같은 과제 → D = 3N일
export function planForDate(date, sets = 6) {
  const n = Math.max(1, Math.min(MAX_SETS, Math.round(sets)));
  const day = dayIndex(date);
  const setIndex = day % n;
  const rot = Math.floor(day / 3) % n;
  const rotationDomain = DOMAINS[day % 3];
  const words = WORD_SETS[setIndex];

  let rotation;
  if (rotationDomain === 'attention') {
    const [d3, d4] = DIGIT_SETS[rot];
    const say = d => [...d].map(x => KDIGIT[x]).join(', ');
    rotation = [
      { key: 'backward3', question: `제가 부르는 숫자를 거꾸로 말해 주세요. ${say(d3)}.`, maxScore: 1, maxSec: 20, digits: d3 },
      { key: 'backward4', question: `이번에는 네 개입니다. 거꾸로 말해 주세요. ${say(d4)}.`, maxScore: 1, maxSec: 20, digits: d4 }
    ];
  } else if (rotationDomain === 'fluency') {
    rotation = [{ key: 'fluency', question: '지금부터 1분 동안 생각나는 동물 이름을 되도록 많이 말해 주세요.', maxScore: 5, maxSec: 60 }];
  } else {
    rotation = SIM_SETS[rot].map(([a, b, keys], i) => ({
      key: 'similarity' + (i + 1),
      question: `${a}${hasBatchim(a) ? '과' : '와'} ${b}${hasBatchim(b) ? '은' : '는'} 어떤 점이 같을까요?`,
      maxScore: 1, maxSec: 20, keys
    }));
  }

  return {
    rotationDomain,
    setIndex,
    items: [
      { key: 'orientation', question: '오늘은 몇 월 며칠, 무슨 요일인가요?', maxScore: 3, maxSec: 20, date },
      { key: 'register', question: `제가 말하는 세 단어를 잘 듣고 따라 말해 주세요. ${words.join(', ')}.`, maxScore: 3, maxSec: 20, words },
      ...rotation,
      { key: 'recall', question: '아까 따라 하신 세 단어를 다시 한 번 말해 주세요.', maxScore: 3, maxSec: 20, words }
    ].map(it => ({ ...it, domain: ITEM_DOMAIN[it.key], expected: expectedText(it) }))
  };
}

// 정답 문구 (통화 기록에 함께 저장)
export function expectedText(item) {
  switch (item.key) {
    case 'orientation': {
      const m = +item.date.slice(5, 7), d = +item.date.slice(8, 10);
      return `${m}월 ${d}일 ${WEEKDAYS[new Date(Date.UTC(+item.date.slice(0, 4), m - 1, d)).getUTCDay()]}요일`;
    }
    case 'register': case 'recall': return item.words.join(', ');
    case 'backward3': case 'backward4': return [...item.digits].reverse().join(' ');
    case 'fluency': return '동물 이름 15개 이상 (3개당 1점)';
    default: return item.keys.join(' / ');
  }
}

// 자기보고 대답 분류 (규칙 기반)
export const classifySleep = a => (/설쳤|못\s*잤|못\s*자|안\s*와|깼|뒤척|잠이\s*안/.test(a || '') ? 'poor' : 'good');
export function classifyMood(a) {
  if (/안\s*좋|나쁘|우울|속상|힘들|외롭|적적/.test(a || '')) return 'bad';
  if (/좋(다|아|네|습|지)|상쾌|즐겁|기분\s*좋/.test(a || '')) return 'good';
  return 'normal';
}

// 대화에서 요청 후보 찾기: 이런 표현이 들어간 문장을 그대로 뽑는다
const REQUEST_WORDS = /해\s*줬으면|해\s*주면|필요하|갖다|도와|아프|아파/;
export function findRequests(text) {
  return (text || '').split(/[.?!…\n]+/).map(t => t.trim()).filter(t => t && REQUEST_WORDS.test(t));
}

// ---------- 자동 채점 ----------
export function scoreItem(item, transcript) {
  const t = nospace(transcript);
  switch (item.key) {
    case 'orientation': return scoreOrientation(item.date, t);
    case 'register':
    case 'recall': return item.words.filter(w => t.includes(w)).length;
    case 'backward3':
    case 'backward4': {
      const digits = [...t].map(c => (KDIGIT.includes(c) ? KDIGIT.indexOf(c) : c)).join('').replace(/\D/g, '');
      return digits.includes([...item.digits].reverse().join('')) ? 1 : 0;
    }
    case 'fluency': return Math.min(5, Math.round((countAnimals(transcript) / 3) * 10) / 10); // 15개 = 5점
    case 'similarity1':
    case 'similarity2': return item.keys.some(k => t.includes(k)) ? 1 : 0;
    default: return 0;
  }
}

// 월·일·요일 각 1점. 숫자("9월 27일")와 한글("구월 이십칠일") 모두 받는다.
const scoreOrientation = (date, t) => Object.values(orientationParts(date, t)).filter(Boolean).length;
export function orientationParts(date, answer) {
  const t = nospace(answer);
  const m = +date.slice(5, 7), d = +date.slice(8, 10);
  const wd = WEEKDAYS[new Date(Date.UTC(+date.slice(0, 4), m - 1, d)).getUTCDay()];
  const notNum = '(^|[^0-9일이삼사오육유칠팔구십시])'; // 앞 글자가 숫자면 다른 수의 일부다 (예: 십이월 안의 이월)
  const monthWords = [String(m), korNum(m)];
  if (m === 6) monthWords.push('유월');
  if (m === 10) monthWords.push('시월');
  const monthOk = monthWords.some(w => new RegExp(notNum + w + '월').test(t));
  const dayOk = [String(d), korNum(d)].some(w => new RegExp(notNum + w + '일').test(t));
  const wdOk = t.includes(wd + '요일') || t.includes(wd + '욜');
  return { month: monthOk, day: dayOk, weekday: wdOk };
}

// 중복 없는 동물 수. 낱말 뒤의 조사("호랑이요", "사자랑")는 허용한다.
export function countAnimals(transcript) {
  const found = new Set();
  for (const raw of (transcript || '').split(/[\s,.?!…]+/)) {
    for (const p of PARTICLES) {
      if (raw.endsWith(p) && ANIMAL_SET.has(raw.slice(0, raw.length - p.length))) {
        found.add(raw.slice(0, raw.length - p.length));
        break;
      }
    }
  }
  return found.size;
}

// 재질문("네?", "뭐라고", "다시", "잘 안 들려") 감지
export const isRepeatAsk = transcript => /네\?|예\?|뭐라고|뭐라구|뭐라꼬|다시|안\s*들려|못\s*들었/.test(transcript || '');

// 하루 점수(%) = 얻은 점수 / 그날 만점 × 100. 채점 안 된 문항이 있으면 null.
export function scorePct(items) {
  const scored = items.filter(i => i.maxScore > 0);
  if (!scored.length || scored.some(i => i.score == null)) return null;
  const got = scored.reduce((s, i) => s + i.score, 0);
  const max = scored.reduce((s, i) => s + i.maxScore, 0);
  return Math.round((got / max) * 1000) / 10;
}

// =========================================================
// 통화 대본 (고정 문장) · AI 대화 검사 — 순수 함수만 (브라우저·node 공용)
// 검사 문항·채점은 위 코드 그대로다. AI(LLM)는 인사·안부 대화·통화 후 정리만 맡는다.
// =========================================================
export const SCRIPT = {
  greetTail: '오늘도 몇 가지 여쭤볼게요.',
  greetFixed: '{호칭}, 안녕하세요. 보건소 안부 전화예요.',
  bridges: ['잘하셨어요. 다음 거 여쭤볼게요.', '네, 좋습니다. 이번에는요.', '고맙습니다. 하나 더 여쭤볼게요.'],
  offTopic: '네, 그 얘기는 조금 있다가 더 들을게요. 먼저 이것부터 여쭤볼게요.',
  acks: ['네, 그러셨구나.', '아이고, 네.'],
  chatFixed: ['식사는 잘 하셨어요?', '요즘 불편하신 데는 없으세요?'],  // AI 대화를 못 쓸 때 안부 질문 2개
  chatClose: '말씀 잘 들었어요. 담당 간호사님께도 전해 드릴게요.',
  emergency: '지금 많이 불편하시면 바로 119에 전화하세요. 담당 간호사님께도 바로 알릴게요.',
  goodbye: '오늘도 통화해 주셔서 감사합니다.'
};

// 응급 표현 목록: 이 두 줄만 고치면 된다. 띄어쓰기는 무시하고 찾는다.
export const EMERGENCY_PHRASES = ['가슴이 아파', '가슴이 답답', '숨이 차', '숨을 못', '쓰러', '넘어졌', '피가', '어지러워서 못', '죽고 싶', '살기 싫'];
export const SEVERE_PHRASES = ['죽고 싶', '살기 싫']; // 이 표현이면 안내 뒤 바로 끝인사

// 어르신 발화에서 응급 표현 찾기 → { phrase, severe } | null (LLM보다 먼저 코드에서)
export function detectEmergency(text) {
  const t = nospace(text);
  const phrase = EMERGENCY_PHRASES.find(p => t.includes(nospace(p)));
  return phrase ? { phrase, severe: SEVERE_PHRASES.includes(phrase) } : null;
}

// AI 답에 들어 있으면 버리는 말 (진단·점수 표현)
export const FORBIDDEN_WORDS = ['치매', '진단', '점수', '검사 결과'];
const hasForbidden = t => FORBIDDEN_WORDS.some(w => nospace(t).includes(nospace(w)));

// /api/chat 응답 검사: 형식이 틀리거나, say가 80자를 넘거나, 금지어가 있으면 null (→ 고정 문장으로 마무리)
export function checkChatReply(raw) {
  let r = raw;
  if (typeof r === 'string') { try { r = JSON.parse(r); } catch { return null; } }
  if (!r || typeof r !== 'object' || typeof r.say !== 'string' || typeof r.end !== 'boolean') return null;
  const say = r.say.trim();
  if (!say || say.length > 80 || hasForbidden(say)) return null;
  return { say, end: r.end };
}

// {호칭} 자리표시를 실제 호칭으로 (AI에게는 이름을 보내지 않는다)
export const fillTitle = (text, title) => (text || '').replaceAll('{호칭}', (title || '').trim() || '어르신');

// 인용 검사: quote가 어르신이 실제로 한 말 안에 그대로 있어야 남긴다 (띄어쓰기만 무시)
export function keepQuoted(list, elderTexts) {
  const said = (elderTexts || []).map(nospace);
  return (Array.isArray(list) ? list : []).filter(x => x && typeof x.text === 'string' && typeof x.quote === 'string'
    && nospace(x.quote).length >= 2 && said.some(s => s.includes(nospace(x.quote))))
    .map(x => ({ text: x.text.trim().slice(0, 60), quote: x.quote.trim() }));
}

// /api/summarize 응답 정리. 인용이 확인된 항목만, 진단 표현이 든 요약은 버린다.
export function checkSummary(raw, elderTexts) {
  if (!raw || typeof raw !== 'object') return null;
  const summary = typeof raw.summary === 'string' && !hasForbidden(raw.summary) ? fillTitle(raw.summary.trim(), '').slice(0, 200) : '';
  const pick = (v, ok) => (ok.includes(v) ? v : 'unknown');
  return {
    summary,
    selfReport: { sleep: pick(raw.selfReport?.sleep, ['good', 'poor']), mood: pick(raw.selfReport?.mood, ['good', 'normal', 'bad']) },
    requests: keepQuoted(raw.requests, elderTexts),
    concerns: keepQuoted(raw.concerns, elderTexts).filter(c => !hasForbidden(c.text))
  };
}

// 대상자 동의 문구 (대상자 추가 ④ 동의 · 기본 정보 ③)
export const AI_CONSENT_TEXT = '음성 합성은 Typecast, 대화 처리는 Anthropic 서버로 대화 내용(읽어 줄 문장·호칭, 인사·자기보고·안부 대화의 말)이 전송됨. 이름·주소·전화·질환·검사 점수는 보내지 않음.';

// 음성·대화 방식 고르기. 서버 상태(/api/health)와 대상자 동의를 함께 본다.
export const aiAgreed = person => person?.info?.consent?.ai === true;
export const useAiVoice = (health, person) => !!health?.tts && aiAgreed(person);
export const useAiChat = (health, person) => !!health?.llm && aiAgreed(person);
// 문장 하나의 AI 음성 결과 → 'ok' | 'fallback'(그 문장만 기본 음성) | 'credits'(이후 기본 음성)
export function ttsOutcome({ status, elapsedMs, timeoutMs = 8000 }) {
  if (status === 402) return 'credits';
  if (status !== 200 || elapsedMs > timeoutMs) return 'fallback';
  return 'ok';
}

// 검사 중 딴 이야기: 꽤 길게 말했는데 문항 점수가 0이면 (동물 이름 과제, '모르겠다'·'기억 안 난다' 같은 대답은 제외)
export const isOffTopic = (item, answer) => item.key !== 'fluency' && nospace(answer).length >= 15
  && !/모르|기억|생각이안|까먹/.test(nospace(answer)) && scoreItem(item, answer) === 0;
