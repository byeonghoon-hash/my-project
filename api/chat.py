# POST /api/chat → { say, end } (Claude, 안부 대화 한 턴)
from _vercel import Handler


class handler(Handler):
    def do_POST(self):
        if not self.same_origin():
            return self.send(403, {'error': 'forbidden'})
        self.llm('/api/chat', self.read_json())
