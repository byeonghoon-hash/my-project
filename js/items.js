// 문항 뱅크, 오늘의 문항 선택(로테이션), 자동 채점

// ---------- 기본 문항 뱅크 ----------
// 관리자 화면 '문항 관리'에서 고친 뱅크는 data.questionBank에 저장된다. 없으면 이 기본값을 쓴다.
// 영역마다 통화 한 번에 한 문항만 묻고, 다음 통화에는 다른 문항이 나오도록 날짜 순서로 돌린다 (학습 방지).
// 통화 기록에는 그날 문항의 정답 정보(단어·숫자·핵심어)를 함께 저장하므로, 뱅크를 고쳐도 지난 기록의 채점은 그대로다.
const q = (id, fields) => ({ id, on: true, ...fields });
export const DEFAULT_BANK = {
  script: {
    greeting: '안녕하세요, {호칭}. 통화 가능하신가요?',
    condition: '그럼 오늘 몸 상태는 좀 어떠세요?',
    recent: '최근 며칠 동안 불편하거나 잊어버리신 게 있나요?',
    intro: '알려 주셔서 감사합니다. 이제 기억과 집중에 관한 짧은 질문 몇 가지 드릴게요.',
    closing: '질문에 답변해 주셔서 감사합니다. 다음에도 전화드릴게요. 좋은 하루 보내세요.'
  },
  orientation: [
    q('o1', { part: 'year', q: '지금은 몇 년도인가요?' }),
    q('o2', { part: 'month', q: '지금은 몇 월인가요?' }),
    q('o3', { part: 'day', q: '오늘은 며칠인가요?' }),
    q('o4', { part: 'weekday', q: '오늘은 무슨 요일인가요?' }),
    q('o5', { part: 'season', q: '지금 계절을 말씀해 주실 수 있나요?' })
  ],
  memory: {
    register: '지금 단어 세 개를 말씀드릴게요. 따라 말씀하시고, 잠시 후에 다시 여쭤볼 테니 기억해 주세요.',
    recall: '처음에 기억해 달라고 말씀드린 세 단어는 무엇인가요?',
    // 문서의 15개 + 추가 10개 (구체적이고 소리가 서로 겹치지 않는 두 글자 낱말)
    words: ['사과', '버스', '모자', '사자', '우산', '연필', '바다', '시계', '감자', '나무', '구두', '당근', '기차', '수박', '수건',
      '거울', '장갑', '호박', '오리', '편지', '양말', '라디오', '안경', '비누', '참새']
  },
  attention: [
    q('a1', { type: 'forward', q: '숫자를 듣고 그대로 말씀해 주세요.', len: 4 }),
    q('a2', { type: 'backward', q: '숫자를 듣고 거꾸로 말씀해 주세요.', len: 3 }),
    q('a3', { type: 'wordBackward', q: '단어를 듣고 거꾸로 말씀해 주세요.',
      words: ['고양이', '지우개', '컵라면', '컴퓨터', '핸드폰', '모니터', '대학교', '중학교', '소나무', '대나무', '선생님', '보리차', '강아지',
        '송아지', '소방관', '경찰관', '키보드', '야구공', '농구공', '축구공', '배구공', '기억력', '태극기'] })
  ],
  language: [
    q('l1', { type: 'naming', q: '시간을 확인하려고 손목에 차는 물건은 무엇인가요?', answers: ['시계'] }),
    q('l2', { type: 'naming', q: '비가 올 때 머리 위에 펼쳐 쓰는 물건은 무엇인가요?', answers: ['우산', '양산'] }),
    q('l3', { type: 'naming', q: '종이를 자를 때 사용하는 도구는 무엇인가요?', answers: ['가위', '칼'] }),
    q('l4', { type: 'naming', q: '크다의 반대말은 무엇인가요?', answers: ['작다', '작은', '작아', '쪼깐', '쪼그만'] }),
    q('l5', { type: 'naming', q: '짧다의 반대말은 무엇인가요?', answers: ['길다', '긴거', '길어', '기다란'] }),
    q('l6', { type: 'naming', q: '자물쇠를 열려면 무엇이 필요한가요?', answers: ['열쇠', '키', '쇳대'] }),
    q('l7', { type: 'repeat', q: '제가 하는 말을 그대로 따라 해 주세요.', sentence: '아침에 고양이가 세수합니다.' }),
    q('l8', { type: 'repeat', q: '제가 하는 말을 그대로 따라 해 주세요.', sentence: '마당에서 아이가 놀고 있습니다.' }),
    q('l9', { type: 'repeat', q: '제가 하는 말을 그대로 따라 해 주세요.', sentence: '밤에 부엉이가 웁니다.' }),
    q('l10', { type: 'repeat', q: '제가 하는 말을 그대로 따라 해 주세요.', sentence: '점심에 새가 날아다닙니다.' }),
    q('l11', { type: 'repeat', q: '제가 하는 말을 그대로 따라 해 주세요.', sentence: '남자가 커피를 마십니다.' }),
    q('l12', { type: 'repeat', q: '제가 하는 말을 그대로 따라 해 주세요.', sentence: '여자가 버스를 탑니다.' }),
    q('l13', { type: 'repeat', q: '제가 하는 말을 그대로 따라 해 주세요.', sentence: '덜컹덜컹 달려간다 시골버스야.' })
  ],
  executive: [
    q('e1', { q: '버스와 기차는 어떤 점이 비슷한가요?', answers: ['타는', '탄다', '탈것', '이동', '교통', '사람', '태우'] }),
    q('e2', { q: '자동차와 택시는 어떤 점이 비슷한가요?', answers: ['타는', '탄다', '탈것', '이동', '교통', '사람', '태우', '차'] }),
    q('e3', { q: '사과와 배는 어떤 점이 비슷한가요?', answers: ['과일', '깎아', '까서', '먹는'] }),
    q('e4', { q: '수박과 참외는 어떤 점이 비슷한가요?', answers: ['과일', '여름', '먹는', '깎아'] }),
    q('e5', { q: '바나나와 귤은 어떤 점이 비슷한가요?', answers: ['과일', '까서', '까먹', '먹는', '껍질'] }),
    q('e6', { q: '참치와 고등어는 어떤 점이 비슷한가요?', answers: ['생선', '물고기', '바다', '고기', '어류'] }),
    q('e7', { q: '굴비와 연어는 어떤 점이 비슷한가요?', answers: ['생선', '물고기', '바다', '고기', '어류'] }),
    q('e8', { q: '개와 고양이는 어떤 점이 비슷한가요?', answers: ['동물', '애완', '반려', '네발', '네 발', '짐승', '키우'] }),
    q('e9', { q: '돼지와 소는 어떤 점이 비슷한가요?', answers: ['동물', '가축', '짐승', '키우', '고기', '네발'] }),
    q('e10', { q: '닭과 오리는 어떤 점이 비슷한가요?', answers: ['동물', '가축', '날개', '새', '알', '조류', '키우'] }),
    q('e11', { q: '피아노와 기타는 어떤 점이 비슷한가요?', answers: ['악기', '소리', '연주', '음악'] }),
    q('e12', { q: '북과 장구는 어떤 점이 비슷한가요?', answers: ['악기', '치는', '타악기', '소리', '연주', '두드리', '음악'] })
  ]
};

// 통화 순서와 영역 이름 (통화 기록의 items[].domain)
export const DOMAINS = [
  ['orientation', '지남력'], ['register', '기억 등록'], ['attention', '주의력'],
  ['language', '언어기능'], ['recall', '지연 회상'], ['executive', '집행기능']
];
export const DOMAIN_LABEL = Object.fromEntries(DOMAINS);
export const ORIENT_PART = { year: '연도', month: '월', day: '일', weekday: '요일', season: '계절' };
export const ATTENTION_TYPE = { forward: '숫자 바로 따라 말하기', backward: '숫자 거꾸로 말하기', wordBackward: '단어 거꾸로 말하기' };
export const LANGUAGE_TYPE = { naming: '이름 대기', repeat: '문장 따라 말하기' };
// 자기보고(켬/끔 설정)와 안부 대화(채점 안 함) 질문
export const SELF_QUESTIONS = { sleep: '어젯밤 잠은 잘 주무셨어요?', mood: '오늘 기분은 어떠세요?' };
export const CHAT_QUESTION = '요즘 지내시기는 어떠세요? 불편하신 건 없으세요?';
export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const KDIGIT = '공일이삼사오육칠팔구';

const dayIndex = date => Math.floor(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / 864e5);
const nospace = t => (t || '').replace(/\s+/g, '');
const clean = t => nospace(t).replace(/[.,?!…~"'“”]/g, '');
const seeded = seed => () => { // mulberry32: 날짜가 같으면 같은 문항
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// 한글 숫자 읽기 (예: 27 → 이십칠, 2026 → 이천이십육)
export function korNum(n) {
  const units = [[1000, '천'], [100, '백'], [10, '십']];
  let out = '';
  for (const [u, w] of units) {
    const k = Math.floor(n / u) % 10;
    if (k) out += (k > 1 ? KDIGIT[k] : '') + w;
  }
  return out + (n % 10 ? KDIGIT[n % 10] : '');
}

// 뱅크 정리: 빠진 칸은 기본값으로, 켜진 문항이 하나도 없는 영역은 기본값을 쓴다 (통화가 멈추지 않게)
export function normalizeBank(b) {
  const d = DEFAULT_BANK, src = b && typeof b === 'object' ? b : {};
  const list = (k, ok) => {
    const l = Array.isArray(src[k]) ? src[k].filter(x => x && typeof x.q === 'string' && x.q.trim() && ok(x)) : [];
    return l.some(x => x.on !== false) ? l : d[k];
  };
  const words = [...new Set((src.memory?.words || []).map(w => String(w).trim()).filter(Boolean))];
  return {
    script: { ...d.script, ...Object.fromEntries(Object.entries(src.script || {}).filter(([k, v]) => k in d.script && typeof v === 'string' && v.trim())) },
    orientation: list('orientation', x => x.part in ORIENT_PART),
    memory: {
      register: src.memory?.register?.trim() || d.memory.register,
      recall: src.memory?.recall?.trim() || d.memory.recall,
      words: words.length >= 6 ? words : d.memory.words
    },
    attention: list('attention', x => x.type in ATTENTION_TYPE && (x.type !== 'wordBackward' || x.words?.length)),
    language: list('language', x => (x.type === 'naming' && x.answers?.length) || (x.type === 'repeat' && x.sentence?.trim())),
    executive: list('executive', x => x.answers?.length),
    edited: src.edited || null
  };
}

const SEASON = m => (m >= 3 && m <= 5 ? '봄' : m >= 6 && m <= 8 ? '여름' : m >= 9 && m <= 11 ? '가을' : '겨울');

// 그날의 단어 세 개: 날짜로 섞되, 전날 단어와 겹치지 않게
export function wordsForDate(date, pool) {
  const pick = d => {
    const r = seeded(dayIndex(d) * 7919 + 17);
    return [...pool].map(w => [r(), w]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  };
  const prev = new Set(pick(new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10) - 1)).toISOString().slice(0, 10)).slice(0, 3));
  const order = pick(date);
  const fresh = order.filter(w => !prev.has(w));
  return (fresh.length >= 3 ? fresh : order).slice(0, 3);
}

// ---------- 오늘의 문항 ----------
// 영역마다 켜진 문항을 날짜 순서로 하나씩: 같은 문항이 다시 나오기까지의 간격 = 그 영역의 켜진 문항 수(일)
export function planForDate(date, bank = DEFAULT_BANK) {
  const B = normalizeBank(bank);
  const day = dayIndex(date);
  const r = seeded(day * 104729 + 3);
  // 켜진 문항을 건너뛰며 고른다 (보폭이 문항 수와 서로소라 n일 동안 모든 문항이 한 번씩 나온다)
  const rot = (list, offset) => {
    const on = list.filter(x => x.on !== false), len = on.length;
    const gcd = (x, y) => (y ? gcd(y, x % y) : x);
    const step = [5, 7, 3, 2, 1].find(k => k < len && gcd(k, len) === 1) || 1;
    return on[(day * step + offset) % len];
  };
  const words = wordsForDate(date, B.memory.words);
  const digits = len => { let s = ''; while (s.length < len) { const d = String(Math.floor(r() * 9) + 1); if (!s.includes(d)) s += d; } return s; };
  const say = d => [...d].map(x => KDIGIT[x]).join(', ');

  const o = rot(B.orientation, 0);
  const a = rot(B.attention, 1);
  const l = rot(B.language, 2);
  const e = rot(B.executive, 3);
  let att;
  if (a.type === 'wordBackward') {
    const w = a.words[Math.floor(r() * a.words.length)];
    att = { key: 'wordBackward', qid: a.id, question: `${a.q} ${w}.`, word: w };
  } else {
    const ds = digits(Math.max(2, Math.min(7, +a.len || 3)));
    att = { key: a.type, qid: a.id, question: `${a.q} ${say(ds)}.`, digits: ds };
  }
  const lang = l.type === 'repeat'
    ? { key: 'repeat', qid: l.id, question: `${l.q} ${l.sentence}`, sentence: l.sentence }
    : { key: 'naming', qid: l.id, question: l.q, answers: l.answers };

  const items = [
    { key: 'orientation', qid: o.id, question: o.q, part: o.part, date, maxScore: 1, domain: '지남력' },
    { key: 'register', qid: 'words', question: `${B.memory.register} ${words.join(', ')}.`, words, maxScore: 3, domain: '기억 등록' },
    { ...att, maxScore: 1, domain: '주의력' },
    { ...lang, maxScore: 1, domain: '언어기능' },
    { key: 'recall', qid: 'words', question: B.memory.recall, words, maxScore: 3, domain: '지연 회상' },
    { key: 'similarity', qid: e.id, question: e.q, answers: e.answers, maxScore: 1, domain: '집행기능' }
  ];
  return { script: B.script, items: items.map(it => ({ ...it, maxSec: 20, expected: expectedText(it) })) };
}

// 통화 기록에 남길 문항 정보: 채점에 필요한 정답 정보까지 함께 (뱅크를 고쳐도 지난 기록 채점이 그대로)
export const itemSpec = it => Object.fromEntries(['key', 'qid', 'domain', 'part', 'date', 'words', 'digits', 'word', 'sentence', 'answers']
  .filter(k => it[k] !== undefined).map(k => [k, it[k]]));

// 정답 문구 (통화 기록에 함께 저장)
export function expectedText(item) {
  switch (item.key) {
    case 'orientation': {
      const y = +item.date.slice(0, 4), m = +item.date.slice(5, 7), d = +item.date.slice(8, 10);
      return { year: `${y}년`, month: `${m}월`, day: `${d}일`, season: SEASON(m),
        weekday: `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}요일` }[item.part] ||
        `${m}월 ${d}일 ${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}요일`; // 예전 기록 (월·일·요일)
    }
    case 'register': case 'recall': return item.words.join(', ');
    case 'forward': return [...item.digits].join(' ');
    case 'backward': case 'backward3': case 'backward4': return [...item.digits].reverse().join(' ');
    case 'wordBackward': return [...item.word].reverse().join('');
    case 'repeat': return item.sentence;
    case 'fluency': return '동물 이름 15개 이상 (3개당 1점)';
    default: return (item.answers || item.keys || []).join(' / ');
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
// 받아쓰기 글자에서 숫자만 (한글 숫자 '일 이 삼'도 숫자로)
const digitsOf = t => [...t].map(c => (KDIGIT.includes(c) ? KDIGIT.indexOf(c) : c)).join('').replace(/\D/g, '');
export function scoreItem(item, transcript) {
  const t = nospace(transcript);
  switch (item.key) {
    case 'orientation': return item.part ? (orientationPart(item.date, item.part, t) ? 1 : 0) : scoreOrientation(item.date, t);
    case 'register':
    case 'recall': return item.words.filter(w => t.includes(w)).length;
    case 'forward': return digitsOf(t).includes(item.digits) ? 1 : 0;
    case 'backward':
    case 'backward3':
    case 'backward4': return digitsOf(t).includes([...item.digits].reverse().join('')) ? 1 : 0;
    case 'wordBackward': return clean(t).includes([...item.word].reverse().join('')) ? 1 : 0;
    case 'naming': return item.answers.some(k => t.includes(nospace(k))) ? 1 : 0;
    case 'repeat': return repeatOk(item.sentence, transcript) ? 1 : 0;
    case 'fluency': return Math.min(5, Math.round((countAnimals(transcript) / 3) * 10) / 10); // 예전 기록
    case 'similarity':
    case 'similarity1':
    case 'similarity2': return (item.answers || item.keys).some(k => t.includes(nospace(k))) ? 1 : 0;
    default: return 0;
  }
}

// 문장 따라 말하기: 낱말마다 앞 두 글자(어간)가 대답에 모두 있으면 맞음 (끝말 '-다/-요'·사투리 어미는 봐준다)
export function repeatOk(sentence, answer) {
  const a = clean(answer);
  return sentence.split(/\s+/).map(w => clean(w).slice(0, 2)).filter(w => w.length >= 2).every(w => a.includes(w));
}

// 지남력 한 가지 (연도·월·일·요일·계절)
export function orientationPart(date, part, answer) {
  const t = nospace(answer);
  const y = +date.slice(0, 4), m = +date.slice(5, 7);
  if (part === 'year') return [String(y), String(y).slice(2) + '년', korNum(y), korNum(y % 100) + '년'].some(w => t.includes(w));
  if (part === 'season') return t.includes(SEASON(m));
  return orientationParts(date, answer)[part === 'weekday' ? 'weekday' : part];
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
  bridges: ['잘하셨어요. 다음 거 여쭤볼게요.', '네, 좋습니다. 이번에는요.', '고맙습니다. 하나 더 여쭤볼게요.'],
  offTopic: '네, 그 얘기는 조금 있다가 더 들을게요. 먼저 이것부터 여쭤볼게요.',
  acks: ['네, 그러셨구나.', '아이고, 네.'],
  chatFixed: ['식사는 잘 하셨어요?', '요즘 필요하신 건 없으세요?'],  // AI 대화를 못 쓸 때 안부 질문 2개 (불편한 점은 앞에서 이미 묻는다)
  declined: '네, 알겠습니다. 편하실 때 다시 전화드릴게요.',
  chatClose: '말씀 잘 들었어요. 담당 간호사님께도 전해 드릴게요.',
  emergency: '지금 많이 불편하시면 바로 119에 전화하세요. 담당 간호사님께도 바로 알릴게요.',
};
// 첫 질문('통화 가능하신가요?')에 어렵다고 하면 검사 없이 끝낸다
export const isDecline = a => /안\s*돼|안\s*되|바빠|바쁘|나중에|못\s*하|곤란|지금은\s*좀|안\s*할/.test(a || '');

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
