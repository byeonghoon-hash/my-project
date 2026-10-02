# I-ME 서버: 앱 파일 제공 + Typecast(음성 합성)·Claude(대화) API 중계
# 실행: python server.py  →  http://localhost:8000   (검사: python server.py --selftest)
# 표준 라이브러리만 쓴다 (pip 설치 필요 없음). API 키는 이 서버만 알고, 브라우저로 보내지 않는다.

import hashlib
import json
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CACHE = ROOT / 'cache' / 'tts'
HOST, PORT = '127.0.0.1', 8000  # 이 컴퓨터에서만 열린다

TYPECAST_URL = 'https://api.typecast.ai/v1/text-to-speech'
ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

# 앱 화면에 필요한 파일만 내보낸다
ALLOWED_EXT = {'.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
               '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg',
               '.csv': 'text/csv; charset=utf-8', '.woff2': 'font/woff2'}
BLOCKED_NAMES = {'server.py', 'cache', 'tools'}

TTS_SLOTS = threading.BoundedSemaphore(2)  # Typecast 무료 요금제: 동시 2개까지
state = {'credits_until': 0.0}              # 크레딧 부족을 알게 된 시각 + 10분
CONFIG = {}


# ---------- .env ----------
def load_env(path):
    """KEY=값 줄 단위. # 주석과 빈 줄은 무시. 파일이 없으면 빈 dict."""
    env = {}
    try:
        text = Path(path).read_text(encoding='utf-8-sig')
    except OSError:
        return env
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, v = line.split('=', 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def configure(env):
    voices = []
    for part in env.get('TYPECAST_VOICES', '').split(','):
        if part.strip():
            vid, _, label = part.strip().partition(':')
            voices.append({'id': vid.strip(), 'label': label.strip() or vid.strip()})
    CONFIG.clear()
    CONFIG.update(tts_key=env.get('TYPECAST_API_KEY', ''), llm_key=env.get('ANTHROPIC_API_KEY', ''),
                  model=env.get('LLM_MODEL', ''), voices=voices)


def health():
    return {'tts': bool(CONFIG.get('tts_key')) and bool(CONFIG.get('voices')) and time.time() >= state['credits_until'],
            'llm': bool(CONFIG.get('llm_key')) and bool(CONFIG.get('model')),
            'voices': CONFIG.get('voices', []),
            'credits': time.time() < state['credits_until']}


# ---------- 정적 파일 보호 ----------
def static_path(url_path):
    """내보내도 되는 파일이면 Path, 아니면 None (→ 403)."""
    path = url_path.split('?', 1)[0].split('#', 1)[0]
    path = urllib.parse.unquote(path)
    parts = [p for p in path.replace('\\', '/').split('/') if p]
    if not parts:
        parts = ['index.html']
    if any(p.startswith('.') or p == '..' for p in parts) or parts[0] in BLOCKED_NAMES or parts[-1] in BLOCKED_NAMES:
        return None
    target = (ROOT / Path(*parts)).resolve()
    if ROOT not in target.parents or target.suffix.lower() not in ALLOWED_EXT:
        return None
    return target


# ---------- Typecast ----------
def cache_key(voice_id, tempo, text):
    return hashlib.sha256(f'{voice_id}|{round(float(tempo), 2)}|{text}'.encode('utf-8')).hexdigest()


def check_tts(body):
    """입력 검사. 맞으면 (text, voiceId, tempo, cache), 틀리면 None."""
    if not isinstance(body, dict):
        return None
    text, vid, tempo = body.get('text'), body.get('voiceId'), body.get('tempo', 0.9)
    if not isinstance(text, str) or not 1 <= len(text.strip()) <= 300:
        return None
    if vid not in {v['id'] for v in CONFIG.get('voices', [])}:
        return None
    if isinstance(tempo, bool) or not isinstance(tempo, (int, float)) or not 0.7 <= tempo <= 1.0:
        return None
    return text.strip(), vid, round(float(tempo), 2), body.get('cache') is True


def typecast(text, voice_id, tempo):
    """mp3 바이트. 실패하면 ('credits' | 'busy' | 'fail') 예외."""
    payload = {'voice_id': voice_id, 'text': text, 'model': 'ssfm-v30', 'language': 'kor',
               'prompt': {'emotion_type': 'preset', 'emotion_preset': 'normal', 'emotion_intensity': 1.0},
               'output': {'audio_format': 'mp3', 'audio_tempo': tempo, 'target_lufs': -16}}
    req = urllib.request.Request(TYPECAST_URL, data=json.dumps(payload).encode('utf-8'), method='POST',
                                 headers={'X-API-KEY': CONFIG['tts_key'], 'Content-Type': 'application/json'})
    if not TTS_SLOTS.acquire(timeout=8):
        raise RuntimeError('busy')
    try:
        for attempt in (0, 1):
            try:
                with urllib.request.urlopen(req, timeout=8) as r:
                    return r.read()
            except urllib.error.HTTPError as e:
                if e.code == 402:
                    state['credits_until'] = time.time() + 600  # 10분 동안 기본 음성
                    raise RuntimeError('credits')
                if e.code == 429 and attempt == 0:
                    time.sleep(1)
                    continue
                raise RuntimeError('fail')
            except Exception:
                raise RuntimeError('fail')
        raise RuntimeError('fail')
    finally:
        TTS_SLOTS.release()


# ---------- Claude ----------
# 시스템 프롬프트는 서버 코드에만 둔다 (브라우저가 보낼 수 없다)
CHAT_SYSTEM = """너는 보건소의 안부 전화 도우미다. 상대는 울산 웅촌면에 사는 어르신이다.
- 존댓말, 쉬운 말. 한 번에 1~2문장, 40자 안팎. 질문은 한 번에 하나.
- 어르신 말에 먼저 공감하고 이어서 묻는다. 화제: 식사, 잠, 몸 불편한 곳, 기분, 필요한 것.
- 금지: 의학적 진단, 병명 추측, 약 복용 지시, 검사 결과·점수 언급.
- 어르신이 불편한 곳을 말하면 '담당 간호사님께 꼭 전해 드릴게요'라고 답한다.
- 어르신을 부를 때는 {호칭} 이라고만 쓴다. 이름을 지어내지 않는다.
- 남은 시간이 15초보다 적으면 짧게 인사하며 마무리한다.
- 출력은 JSON 한 개만: {"say": "...", "end": false}. 대화를 마무리하는 말일 때만 "end": true.
단계가 greeting이면: 인사(안녕하세요)와 통화 가능 여부는 이미 물었다. 지난 안부 요약이 있으면 그 내용을 이어 오늘 몸 상태를 묻는 질문 한 문장, 없으면 '오늘 몸 상태는 좀 어떠세요?' 같은 질문 한 문장만 쓴다. 검사나 질문 개수 이야기는 하지 않는다. end는 false."""

SUMMARY_SYSTEM = """너는 보건소 안부 전화 기록을 정리한다. 대화 기록을 읽고 JSON 한 개만 출력한다.
{"summary": "한두 문장 안부 요약", "selfReport": {"sleep": "good|poor|unknown", "mood": "good|normal|bad|unknown"},
 "requests": [{"text": "짧은 요청 이름", "quote": "어르신 말 그대로"}], "concerns": [{"text": "짧은 관찰 메모", "quote": "어르신 말 그대로"}]}
- quote는 '어르신:' 줄에서 글자 그대로 복사한다. 바꾸거나 지어내지 않는다. 근거가 없으면 빈 배열.
- requests는 어르신이 원하거나 필요하다고 한 것, concerns는 몸·생활의 불편이나 걱정.
- 진단, 병명 추측, 점수 표현을 쓰지 않는다."""


def claude(system, user_text, max_tokens, timeout):
    """첫 텍스트 블록에서 JSON 객체를 꺼낸다. 실패하면 RuntimeError('fail')."""
    payload = {'model': CONFIG['model'], 'max_tokens': max_tokens, 'system': system,
               'messages': [{'role': 'user', 'content': user_text}]}
    req = urllib.request.Request(ANTHROPIC_URL, data=json.dumps(payload).encode('utf-8'), method='POST',
                                 headers={'x-api-key': CONFIG['llm_key'], 'anthropic-version': '2023-06-01',
                                          'content-type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            res = json.loads(r.read().decode('utf-8'))
    except Exception:
        raise RuntimeError('fail')
    if res.get('stop_reason') == 'refusal':
        raise RuntimeError('fail')
    text = ''.join(b.get('text', '') for b in res.get('content', []) if b.get('type') == 'text')
    start, end = text.find('{'), text.rfind('}')
    if start < 0 or end <= start:
        raise RuntimeError('fail')
    try:
        return json.loads(text[start:end + 1])
    except ValueError:
        raise RuntimeError('fail')


def transcript_text(history):
    """[{role: 'app'|'elder', text}] → '앱: …\\n어르신: …'. 형식이 틀리면 None."""
    if not isinstance(history, list) or len(history) > 40:
        return None
    lines = []
    for t in history:
        if not isinstance(t, dict) or t.get('role') not in ('app', 'elder') or not isinstance(t.get('text'), str) or len(t['text']) > 600:
            return None
        lines.append(('앱: ' if t['role'] == 'app' else '어르신: ') + t['text'].replace('\n', ' '))
    return '\n'.join(lines)


def chat_prompt(body):
    if not isinstance(body, dict) or body.get('phase') not in ('greeting', 'chat'):
        return None
    talk = transcript_text(body.get('history', []))
    sums = body.get('summaries', [])
    remaining = body.get('remainingSec', 60)
    if talk is None or not isinstance(sums, list) or len(sums) > 3 or not all(isinstance(x, str) and len(x) <= 300 for x in sums):
        return None
    if isinstance(remaining, bool) or not isinstance(remaining, (int, float)):
        return None
    return (f"[단계] {body['phase']}\n[남은 시간] {int(remaining)}초\n"
            f"[지난 안부 요약]\n{chr(10).join('- ' + x for x in sums) or '- 없음'}\n"
            f"[오늘 대화]\n{talk or '(아직 없음)'}\n다음에 할 말을 JSON으로.")


# ---------- HTTP ----------
class Handler(BaseHTTPRequestHandler):
    server_version = 'I-ME'

    def log_message(self, fmt, *args):  # 요청 경로와 상태만 (본문·키는 남기지 않는다)
        sys.stderr.write('%s %s\n' % (self.command, self.path.split('?')[0]))

    def send(self, code, body=b'', ctype='application/json', extra=None):
        if isinstance(body, (dict, list)):
            body = json.dumps(body, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store' if self.path.startswith('/api/') else 'no-cache')
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def do_GET(self):
        if self.path.split('?')[0] == '/api/health':
            return self.send(200, health())
        if self.path.startswith('/api/'):
            return self.send(404, {'error': 'not_found'})
        target = static_path(self.path)
        if target is None:
            return self.send(403, {'error': 'forbidden'})
        if not target.is_file():
            return self.send(404, {'error': 'not_found'})
        self.send(200, target.read_bytes(), ALLOWED_EXT[target.suffix.lower()])

    do_HEAD = do_GET

    def read_json(self):
        n = int(self.headers.get('Content-Length') or 0)
        if n <= 0 or n > 64_000:
            return None
        try:
            return json.loads(self.rfile.read(n).decode('utf-8'))
        except ValueError:
            return None

    def do_POST(self):
        path, body = self.path.split('?')[0], self.read_json()
        if path == '/api/tts':
            return self.tts(body)
        if path in ('/api/chat', '/api/summarize'):
            return self.llm(path, body)
        self.send(404, {'error': 'not_found'})

    def tts(self, body):
        h = health()
        if not h['tts']:
            return self.send(503, {'error': 'credits' if time.time() < state['credits_until'] else 'off'})
        args = check_tts(body)
        if not args:
            return self.send(400, {'error': 'bad_request'})
        text, vid, tempo, use_cache = args
        file = CACHE / f'{cache_key(vid, tempo, text)}.mp3'
        if use_cache and file.is_file():
            return self.send(200, file.read_bytes(), 'audio/mpeg', {'X-Cache': 'hit'})
        try:
            mp3 = typecast(text, vid, tempo)
        except RuntimeError as e:
            code = str(e)
            return self.send(402 if code == 'credits' else 503 if code == 'busy' else 502, {'error': code})
        if use_cache:  # 고정 문장만 저장한다 (안부 대화 문장은 저장하지 않는다)
            CACHE.mkdir(parents=True, exist_ok=True)
            tmp = file.with_suffix('.tmp')
            tmp.write_bytes(mp3)
            tmp.replace(file)
        self.send(200, mp3, 'audio/mpeg', {'X-Cache': 'miss'})

    def llm(self, path, body):
        if not health()['llm']:
            return self.send(503, {'error': 'off'})
        if path == '/api/chat':
            prompt = chat_prompt(body)
            system, max_tokens, timeout = CHAT_SYSTEM, 200, 8
        else:
            talk = transcript_text(body.get('history') if isinstance(body, dict) else None)
            prompt = f'[대화 기록]\n{talk}\n정리 JSON을 출력.' if talk else None
            system, max_tokens, timeout = SUMMARY_SYSTEM, 800, 20
        if not prompt:
            return self.send(400, {'error': 'bad_request'})
        try:
            out = claude(system, prompt, max_tokens, timeout)
        except RuntimeError:
            return self.send(502, {'error': 'fail'})
        if path == '/api/chat':
            out = {'say': out.get('say'), 'end': out.get('end')}  # 브라우저가 형식·길이·금지어를 다시 검사한다
        self.send(200, out)


def make_server(port=PORT):
    return ThreadingHTTPServer((HOST, port), Handler)


# ---------- 자체 검사 ----------
def selftest():
    with tempfile.TemporaryDirectory() as d:
        env_file = Path(d) / '.env'
        env_file.write_text('# 주석\nTYPECAST_API_KEY=abc\n\nTYPECAST_VOICES=tc_1:목소리1,tc_2:목소리2\nLLM_MODEL= m \n', encoding='utf-8')
        env = load_env(env_file)
        assert env == {'TYPECAST_API_KEY': 'abc', 'TYPECAST_VOICES': 'tc_1:목소리1,tc_2:목소리2', 'LLM_MODEL': 'm'}, env
        assert load_env(Path(d) / 'none') == {}
    configure(env)
    assert [v['id'] for v in CONFIG['voices']] == ['tc_1', 'tc_2'] and CONFIG['voices'][0]['label'] == '목소리1'
    assert health()['llm'] is False  # Claude 키 없음

    # 캐시 키: 같은 입력은 같고, 속도·목소리·문장이 다르면 다르다
    k = cache_key('tc_1', 0.9, '안녕하세요')
    assert k == cache_key('tc_1', 0.90, '안녕하세요') and len(k) == 64
    assert k != cache_key('tc_1', 0.8, '안녕하세요') and k != cache_key('tc_2', 0.9, '안녕하세요') and k != cache_key('tc_1', 0.9, '안녕')

    # 입력 검사
    assert check_tts({'text': '안녕하세요', 'voiceId': 'tc_1', 'tempo': 0.9, 'cache': True}) == ('안녕하세요', 'tc_1', 0.9, True)
    assert check_tts({'text': '', 'voiceId': 'tc_1', 'tempo': 0.9}) is None
    assert check_tts({'text': '가' * 301, 'voiceId': 'tc_1', 'tempo': 0.9}) is None
    assert check_tts({'text': '가' * 300, 'voiceId': 'tc_1', 'tempo': 0.9}) is not None
    assert check_tts({'text': '안녕', 'voiceId': 'tc_x', 'tempo': 0.9}) is None
    assert check_tts({'text': '안녕', 'voiceId': 'tc_1', 'tempo': 0.6}) is None
    assert check_tts({'text': '안녕', 'voiceId': 'tc_1', 'tempo': 1.1}) is None
    assert check_tts({'text': '안녕', 'voiceId': 'tc_1', 'tempo': True}) is None
    assert chat_prompt({'phase': 'chat', 'history': [{'role': 'system', 'text': 'x'}]}) is None
    assert chat_prompt({'phase': 'chat', 'history': [{'role': 'elder', 'text': '허리가 아파'}], 'summaries': [], 'remainingSec': 40})

    # 정적 파일 보호 + 오류 응답에 키가 없는지 (가짜 키, 접속 안 되는 주소로 실패를 만든다)
    global TYPECAST_URL, ANTHROPIC_URL
    secret_tc, secret_llm = 'tc-SECRET-0000-TEST', 'sk-ant-SECRET-0000-TEST'
    configure({'TYPECAST_API_KEY': secret_tc, 'ANTHROPIC_API_KEY': secret_llm, 'LLM_MODEL': 'test-model', 'TYPECAST_VOICES': 'tc_1:목소리1'})
    TYPECAST_URL = ANTHROPIC_URL = 'http://127.0.0.1:9/unreachable'
    Handler.log_message = lambda *a: None  # 검사 중에는 요청 기록을 찍지 않는다
    srv = make_server(0)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()

    def call(path, data=None):
        req = urllib.request.Request(f'http://127.0.0.1:{port}{path}', method='POST' if data is not None else 'GET',
                                     data=json.dumps(data).encode('utf-8') if data is not None else None,
                                     headers={'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()

    for p in ['/.env', '/.env.example', '/server.py', '/cache/tts/x.mp3', '/tools/a.js', '/.git/config', '/js/../.env', '/%2e%2e/x.js', '/CLAUDE.md']:
        assert call(p)[0] == 403, p
    assert call('/')[0] == 200 and call('/js/app.js')[0] == 200 and call('/style.css')[0] == 200
    bodies = [call('/api/health')[1], call('/api/tts', {'text': '안녕하세요', 'voiceId': 'tc_1', 'tempo': 0.9})[1],
              call('/api/chat', {'phase': 'chat', 'history': [], 'summaries': [], 'remainingSec': 40})[1],
              call('/api/summarize', {'history': [{'role': 'elder', 'text': '허리가 아파'}]})[1],
              call('/api/tts', {'text': '', 'voiceId': 'tc_1', 'tempo': 0.9})[1]]
    for b in bodies:
        assert secret_tc.encode() not in b and secret_llm.encode() not in b, b
    assert call('/api/tts', {'text': '안녕하세요', 'voiceId': 'tc_1', 'tempo': 0.9})[0] == 502
    assert call('/api/tts', {'text': '안녕하세요', 'voiceId': 'tc_x', 'tempo': 0.9})[0] == 400
    srv.shutdown()
    print('server selftest 통과')


if __name__ == '__main__':
    if '--selftest' in sys.argv:
        selftest()
        sys.exit(0)
    configure(load_env(ROOT / '.env'))
    h = health()
    print('I-ME 서버: http://localhost:%d' % PORT)
    print('AI 음성(Typecast): %s / AI 대화(Claude): %s' % ('사용' if h['tts'] else '미사용', '사용' if h['llm'] else '미사용'))
    try:
        srv = make_server()
    except OSError:
        print('8000번 포트를 다른 프로그램이 쓰고 있음. 열려 있는 다른 서버 창(python -m http.server 등)을 닫고 다시 실행.')
        sys.exit(1)
    print('이 창을 닫으면 서버가 꺼짐 (끄기: Ctrl+C)')
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
