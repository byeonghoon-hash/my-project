# GET /api/health → { tts, llm, voices, credits } (키가 있는지만 알려 준다)
from _vercel import Handler, server


class handler(Handler):
    def do_GET(self):
        self.send(200, server.health())
