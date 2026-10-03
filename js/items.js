// 문항 뱅크, 오늘의 문항 선택(로테이션), 자동 채점
import CIST from './cist_items.json' with { type: 'json' }; // 정기 인지검사(전화형) 원문·대체 문항

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

// 예전 기록(동물 이름 과제) 채점용 동물 목록과, 낱말 뒤에 붙는 조사
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
  // 정기 인지검사의 기억 문장 핵심어는 매일 통화에서 쓰지 않는다 (연습효과 방지)
  const words = wordsForDate(date, B.memory.words.filter(w => !CIST_RESERVED.words.includes(w)));
  const digits = len => {
    for (;;) { // 정기 검사 숫자열(6973·57284)과 같은 줄은 쓰지 않는다
      let s = '';
      while (s.length < len) { const d = String(Math.floor(r() * 9) + 1); if (!s.includes(d)) s += d; }
      if (!CIST_RESERVED.digits.some(x => x.includes(s) || s.includes(x))) return s;
    }
  };
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

// =========================================================
// 정기 인지검사(전화형) — 원검사(CIST)를 전화로 바꾼 버전. 화면에는 'CIST'라고 쓰지 않는다.
// 문항 원문·대체 문항은 cist_items.json 한 파일. 여기는 순수 함수만 (채점·방식 고르기).
// =========================================================
export { CIST };
export const CIST_DOMAINS = CIST.domains;                    // [[key, 이름], …] 6개 영역
export const CIST_DOMAIN_LABEL = Object.fromEntries(CIST.domains);
export const FIDELITY_LABEL = CIST.fidelity;
export const CIST_RESERVED = {
  words: [...new Set(Object.values(CIST.memory.forms).flatMap(f => f.keys.map(k => k.word.replace(/\d+시/, '')).filter(Boolean)))],
  digits: CIST.attention.digits.items.map(x => x.digits)
};
const FRUIT_VEG = new Set(CIST.executive.fluency.words);
const FILLERS = new Set(CIST.executive.fluency.fillers);

// 방식 기본값(★)과 고를 수 있는지 (대체 문항 칸이 비어 있으면 고를 수 없다)
export const DEFAULT_CIST_MODES = Object.fromEntries(Object.entries(CIST.modes).map(([k, m]) => [k, m.options.find(o => o.default).id]));
export function modeAvailable(key, id) {
  const o = CIST.modes[key]?.options.find(x => x.id === id);
  if (!o) return false;
  if (o.needs === 'visualScreen') return CIST.executive.visual.b.items.length > 0 && CIST.executive.visual.b.items.every(x => x.image);
  if (o.needs === 'visualVoice') return CIST.executive.visual.c.items.length > 0;
  return true;
}
export const normalizeModes = m => Object.fromEntries(Object.keys(CIST.modes).map(k => [k, modeAvailable(k, m?.[k]) ? m[k] : DEFAULT_CIST_MODES[k]]));
export const modeOption = (key, id) => CIST.modes[key].options.find(o => o.id === id);

// 한글 숫자를 숫자로: '이천이십육년'→2026년, '시월'→10월, '삼 일'→3일, '열한 시'→11시, '두 시'→2시
const SINO = { 공: 0, 영: 0, 일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 륙: 6, 칠: 7, 팔: 8, 구: 9 };
const sinoValue = w => {
  let total = 0, cur = 0;
  for (const ch of w) {
    if (ch in SINO) cur = SINO[ch];
    else { const u = { 십: 10, 백: 100, 천: 1000 }[ch]; total += (cur || 1) * u; cur = 0; }
  }
  return total + cur;
};
const NATIVE = { 열두: 12, 열한: 11, 열: 10, 아홉: 9, 여덟: 8, 일곱: 7, 여섯: 6, 다섯: 5, 네: 4, 세: 3, 두: 2, 한: 1 };
export function korToDigits(text) {
  let t = String(text || '');
  t = t.replace(/시\s*월/g, '10월').replace(/유\s*월/g, '6월');
  t = t.replace(/(열두|열한|열|아홉|여덟|일곱|여섯|다섯|네|세|두|한)\s*시/g, (_, w) => `${NATIVE[w]}시`);
  t = t.replace(/([일이삼사오육륙칠팔구십백천]+)\s*(년|월|일|시|분|번)/g, (m, w, unit) => `${sinoValue(w)}${unit}`);
  // 단위 없이 말한 연도: '이천이십육' → 2026 (세 글자 이상, '천'이 들어간 것만)
  t = t.replace(/[일이삼사오육칠팔구]?천(?:[일이삼사오육칠팔구]?백)?(?:[일이삼사오육칠팔구]?십)?[일이삼사오육칠팔구]?/g, w => (w.length >= 3 ? String(sinoValue(w)) : w));
  return t;
}
// 대답 안의 숫자들 (단위 앞 숫자 우선): '2026년' → [2026]
const numbersIn = (t, unit) => {
  const n = korToDigits(t);
  const withUnit = [...n.matchAll(new RegExp(`(\\d+)\\s*${unit}`, 'g'))].map(m => +m[1]);
  return withUnit.length ? withUnit : [...n.matchAll(/\d+/g)].map(m => +m[0]);
};
// 숫자 하나로 답하는 문항 (빈칸 숫자 4): 숫자, 또는 한 글자 한글 숫자·'넷'
const numberAnswer = (t, want) => numbersIn(t, '').includes(want)
  || String(t || '').split(/[^가-힣]+/).some(w => SINO[w] === want || NATIVE[w] === want || (want === 4 && w === '넷'));

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const weekdayOf = date => WEEK[new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10))).getUTCDay()];
const hasWeekday = (t, date) => { const w = weekdayOf(date); return nospace(t).includes(w + '요일') || nospace(t).includes(w + '욜'); };

// 의미 유창성: 과일·채소 목록과 대조, 중복 제외. 목록에 없는 말은 '확인 필요' 후보로.
export function fluencyWords(answer) {
  const found = [], candidates = [];
  for (const raw of String(answer || '').split(/[\s,.?!…·]+/)) {
    if (!raw) continue;
    let hit = null;
    for (const p of [...PARTICLES, '를', '을', '하고요', '도요']) if (raw.endsWith(p) && FRUIT_VEG.has(raw.slice(0, raw.length - p.length))) { hit = raw.slice(0, raw.length - p.length); break; }
    if (hit) { if (!found.includes(hit)) found.push(hit); continue; }
    const w = raw.replace(/(요|예|도|하고|랑|이랑)$/, '');
    if (/^[가-힣]{2,}$/.test(w) && !FILLERS.has(w) && !FILLERS.has(raw) && !candidates.includes(w)) candidates.push(w);
  }
  return { found, candidates };
}
export const fluencyPoints = (n, cut) => (n >= cut.two ? 2 : n >= cut.one ? 1 : 0);

// 문항 하나 채점 → { score, status, note }. status: 'auto' | 'needs_review' | 'omitted'
// 담당자가 고친 점수(reviewed)는 여기서 다시 계산하지 않는다.
export function scoreCist(item) {
  const a = item.answer || '', t = nospace(a);
  if (item.status === 'omitted') return { score: null, status: 'omitted', note: item.note || '' };
  if (!t && !['draw', 'choice'].includes(item.type)) return { score: 0, status: 'auto', note: '무응답' };
  switch (item.type) {
    case 'time': {
      if (/음력/.test(a)) return { score: null, status: 'needs_review', note: '음력으로 답함' };
      if (item.part === 'weekday') return { score: hasWeekday(a, item.date) ? 1 : 0, status: 'auto' };
      const want = item.part === 'year' ? +item.date.slice(0, 4) : item.part === 'month' ? +item.date.slice(5, 7) : +item.date.slice(8, 10);
      const unit = { year: '년', month: '월', day: '일' }[item.part];
      const ns = numbersIn(a, unit);
      const ok = ns.includes(want) || (item.part === 'year' && ns.includes(want % 100));
      return { score: ok ? 1 : 0, status: 'auto' };
    }
    case 'place':
      if (item.mode === 'b') return { score: (item.areas || []).some(w => t.includes(nospace(w))) ? 1 : 0, status: 'auto' };
      return (item.home || []).some(w => t.includes(nospace(w))) ? { score: 1, status: 'auto' } : { score: null, status: 'needs_review', note: '통화 장소 확인 필요' };
    case 'recall': {
      const n = nospace(korToDigits(a));
      if (item.accept.some(w => n.includes(nospace(korToDigits(w))))) return { score: 2, status: 'auto', note: '회상' };
      if (item.recog) {
        const r = nospace(korToDigits(item.recog.response || ''));
        const right = nospace(korToDigits(item.recog.answer));
        const wrong = item.recog.options.filter(o => o !== item.recog.answer).some(o => r.includes(nospace(korToDigits(o))));
        return { score: r.includes(right) && !wrong ? 1 : 0, status: 'auto', note: '재인' };
      }
      return { score: 0, status: 'auto' };
    }
    case 'digits': return { score: digitsOf(nospace(korToDigits(a))).includes(item.digits) ? 1 : 0, status: 'auto' };
    case 'reverse': return { score: clean(a).includes([...item.word].reverse().join('')) ? 1 : 0, status: 'auto' };
    case 'answers': {
      const n = nospace(korToDigits(a));
      const ok = item.answers.some(w => (/^\d+$/.test(w) ? numberAnswer(a, +w) : n.includes(nospace(korToDigits(w)))));
      return { score: ok ? 1 : 0, status: 'auto' };
    }
    case 'fluency': {
      const { found, candidates } = fluencyWords(a);
      const accepted = (item.accepted || []).filter(w => candidates.includes(w));
      const n = found.length + accepted.length;
      const pending = candidates.filter(w => !(item.decided || []).includes(w));
      return { score: fluencyPoints(n, item.cut), status: pending.length ? 'needs_review' : 'auto', note: `${n}개`, found, candidates };
    }
    case 'comp': {
      if (item.variant === 'c') { // '하나, 둘' 다음 요일: 순서대로
        const i1 = t.indexOf('하나'), i2 = t.indexOf('둘'), i3 = t.indexOf(weekdayOf(item.date) + '요일');
        return { score: i1 >= 0 && i2 > i1 && i3 > i2 ? 1 : 0, status: 'auto' };
      }
      const said = item.variant === 'a' ? (item.words || []).some(w => t.includes(nospace(w))) : hasWeekday(a, item.date);
      const sound = (item.segments || 0) >= 2; // 말소리 앞에 따로 난 소리
      return { score: said && sound ? 1 : 0, status: 'needs_review', note: `1점 후보 ${said && sound ? '있음' : '없음'} · 녹음으로 확정` };
    }
    case 'draw': return { score: null, status: 'needs_review', note: item.note || '담당자 채점 (0~2점)' };
    case 'choice': return { score: item.chosen === item.correct ? 1 : 0, status: 'auto' };
    default: return { score: 0, status: 'auto' };
  }
}

// 문장형: 회차마다 A·B 교대 (지난 회차 수가 짝수면 A)
export const cistForm = prevCount => (prevCount % 2 ? 'B' : 'A');
// 단어 거꾸로 말하기: 고정이면 금수강산, 교대면 회차 순서대로
export const reverseWordFor = (mode, prevCount) => {
  const ws = CIST.attention.reverseWord[mode === 'b' ? 'b' : 'a'];
  return ws[prevCount % ws.length];
};
// 장소 '동네 이름' 채점용: 등록 주소에서 면·리 이름 ('웅촌면' → 웅촌, '대복리' → 대복)
export const placeAreas = address => [...String(address || '').matchAll(/([가-힣]+?)(면|리|동|읍)(?![가-힣])/g)].flatMap(m => [m[1] + m[2], m[1]]).filter(w => w.length >= 2);

// 정기 검사 한 회차의 문항 목록과 진행 순서 (call.js가 이 순서대로 읽고 듣는다).
// 순서: 인사 → 지남력 → 기억 등록 → 주의력 → 시공간 → 집행(언어 추론 → 유창성 → 시각 추론) → 언어 → 지연 회상 → 재인 → 끝인사
// opts: { date, modes, prevCount, title, place(평소 통화 장소), address }
export function cistPlan({ date, modes, prevCount = 0, title = '', place = '집', address = '' }) {
  const M = normalizeModes(modes);
  const form = cistForm(prevCount);
  const F = CIST.memory.forms[form];
  const fid = key => modeOption(key, M[key]).fidelity;
  const q = t => fillTitle(t, title);
  const items = [], steps = [];
  const add = (it, step) => { items.push({ score: null, status: 'auto', note: '', answer: '', ...it }); if (step) steps.push(step); };
  const omit = (id, domain, maxScore, note) => add({ id, domain, type: 'omitted', fidelity: 'omitted', maxScore, status: 'omitted', note });

  // 지남력: 시간 4문항(원형) + 장소 1문항(방식)
  for (const t of CIST.orientation.time) add({ id: t.id, domain: 'orientation', type: 'time', part: t.part, date, fidelity: 'original', maxScore: 1, question: q(t.q) }, { kind: 'ask', id: t.id, reread: true });
  if (M.place === 'c') omit('o_place', 'orientation', 1, '장소 미시행');
  else {
    const P = CIST.orientation.place[M.place];
    const home = !place || place === '집' ? CIST.orientation.place.a.home : [place];
    add({ id: 'o_place', domain: 'orientation', type: 'place', mode: M.place, fidelity: fid('place'), maxScore: 1, question: q(P.q),
      ...(M.place === 'a' ? { home } : { areas: placeAreas(address) }) }, { kind: 'ask', id: 'o_place', reread: true });
  }
  // 기억 등록: 문장을 정확히 두 번 ('/'마다 0.4초 쉼), 따라 말하기는 채점하지 않는다
  steps.push({ kind: 'register', form, parts: F.speak, lines: [CIST.memory.intro, CIST.memory.again], remember: CIST.memory.remember, times: 2 });
  // 주의력: 숫자는 한 번만 1초 간격, 단어 거꾸로
  steps.push({ kind: 'say', text: CIST.attention.digits.intro });
  for (const d of CIST.attention.digits.items) add({ id: d.id, domain: 'attention', type: 'digits', digits: d.digits, fidelity: 'original', maxScore: 1, question: [...d.digits].join(', ') }, { kind: 'digits', id: d.id, once: CIST.attention.digits.once });
  const word = reverseWordFor(M.reverseWord, prevCount);
  add({ id: 'a_reverse', domain: 'attention', type: 'reverse', word, fidelity: fid('reverseWord'), maxScore: 1, question: `${CIST.attention.reverseWord.q} '${word}'` }, { kind: 'ask', id: 'a_reverse', reread: false });
  // 시공간: 화면 그리기(입력이 없으면 음성 대체로 자동 전환) · 음성 대체 · 미시행
  const voiceVisuo = () => CIST.visuospatial.b.map(v => ({ id: v.id, domain: 'visuospatial', type: 'answers', answers: v.answers, fidelity: 'replaced', maxScore: 1, question: v.q }));
  if (M.visuospatial === 'c') omit('v_draw', 'visuospatial', 2, '시공간 미시행');
  else if (M.visuospatial === 'b') for (const v of voiceVisuo()) add(v, { kind: 'ask', id: v.id, reread: true });
  else add({ id: 'v_draw', domain: 'visuospatial', type: 'draw', fidelity: 'adapted', maxScore: 2, question: CIST.visuospatial.a.q, maxSec: CIST.visuospatial.a.maxSec },
    { kind: 'draw', id: 'v_draw', figure: CIST.visuospatial.a.figure, fallback: voiceVisuo() });
  // 집행기능: 언어 추론 2점(다시 읽기 한 번) → 유창성 → 시각 추론
  const V = CIST.executive.verbal;
  for (const v of V.items) add({ id: v.id, domain: 'executive', type: 'answers', answers: v.answers, label: v.label, fidelity: 'original', maxScore: 1, question: V.q.join(' ') });
  steps.push({ kind: 'verbal', ids: V.items.map(v => v.id), lines: V.q });
  const FL = CIST.executive.fluency, cut = FL[M.fluency];
  add({ id: 'e_fluency', domain: 'executive', type: 'fluency', cut: { two: cut.two, one: cut.one }, sec: cut.sec, fidelity: fid('fluency'), maxScore: 2,
    question: FL.q.replace('{시간}', cut.timeText) }, { kind: 'fluency', id: 'e_fluency', stop: FL.stop });
  const VR = M.visualReasoning === 'a' ? null : CIST.executive.visual[M.visualReasoning].items;
  if (!VR?.length) omit('e_visual', 'executive', 2, '시각 추론 미시행');
  else VR.forEach((v, n) => add({ id: `e_visual${n + 1}`, domain: 'executive', fidelity: 'replaced', maxScore: 1, question: v.q,
    ...(M.visualReasoning === 'b' ? { type: 'choice', options: v.options, image: v.image, correct: v.correct } : { type: 'answers', answers: v.answers }) },
  { kind: M.visualReasoning === 'b' ? 'choice' : 'ask', id: `e_visual${n + 1}`, reread: true }));
  // 언어기능: 이름 대기 3 · 이해력
  for (const v of CIST.language.naming) add({ id: v.id, domain: 'language', type: 'answers', answers: v.answers, fidelity: 'original', maxScore: 1, question: v.q }, { kind: 'ask', id: v.id, reread: true });
  const C = CIST.language.comprehension[M.comprehension];
  add({ id: 'l_comp', domain: 'language', type: 'comp', variant: M.comprehension, words: C.words, date, fidelity: fid('comprehension'), maxScore: 1, question: C.q },
    { kind: 'ask', id: 'l_comp', reread: false, segments: true });
  // 지연 회상(등록 3분 뒤, 낱말마다 2점) → 못 떠올린 낱말만 재인(1점)
  for (const k of F.keys) add({ id: k.id, domain: 'memory', type: 'recall', word: k.word, accept: k.accept, form, fidelity: 'original', maxScore: 2, question: CIST.memory.recall,
    recog: null, recogSpec: F.recognition.find(r => r.key === k.id) });
  steps.push({ kind: 'recall', ids: F.keys.map(k => k.id), q: CIST.memory.recall, gapSec: 180, filler: CIST.script.filler });
  steps.push({ kind: 'recognition', ids: F.keys.map(k => k.id) });
  return { form, modes: M, items, steps };
}

// 문항 하나 다시 채점 (담당자가 고친 점수는 그대로)
export const rescoreCist = it => (it.status === 'reviewed' || it.status === 'omitted' ? it : { ...it, ...pickScore(scoreCist(it)) });
const pickScore = r => ({ score: r.score, status: r.status, note: r.note ?? '', ...(r.found ? { found: r.found, candidates: r.candidates } : {}) });
