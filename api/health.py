# GET /api/health → { tts, llm, voices, credits } (키가 있는지만 알려 준다)
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # Vercel은 이 파일을 경로로 불러와서 api 폴더가 import 경로에 없다
from _vercel import Handler, server


class handler(Handler):
    def do_GET(self):
        self.send(200, server.health())
