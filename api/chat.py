# POST /api/chat → { say, end } (Claude, 안부 대화 한 턴)
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # Vercel은 이 파일을 경로로 불러와서 api 폴더가 import 경로에 없다
from _vercel import Handler


class handler(Handler):
    def do_POST(self):
        if not self.same_origin():
            return self.send(403, {'error': 'forbidden'})
        self.llm('/api/chat', self.read_json())
