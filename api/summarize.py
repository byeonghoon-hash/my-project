# POST /api/summarize → 통화 후 정리 JSON (Claude)
from _vercel import Handler


class handler(Handler):
    def do_POST(self):
        if not self.same_origin():
            return self.send(403, {'error': 'forbidden'})
        self.llm('/api/summarize', self.read_json())
