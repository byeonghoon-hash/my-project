# POST /api/records → {get: true}면 종류별 검사 기록 전체, {put, remove}면 저장·삭제 (Upstash Redis)
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # Vercel은 이 파일을 경로로 불러와서 api 폴더가 import 경로에 없다
from _vercel import Handler, server


class handler(Handler):
    def do_POST(self):
        if not self.same_origin():
            return self.send(403, {'error': 'forbidden'})
        self.records(self.read_json(server.RECORDS_BODY_MAX))
