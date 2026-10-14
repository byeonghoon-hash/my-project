# POST /api/records → {get: true}면 종류별 검사 기록 전체, {put, remove}면 저장·삭제 (Upstash Redis)
from _vercel import Handler, server


class handler(Handler):
    def do_POST(self):
        if not self.same_origin():
            return self.send(403, {'error': 'forbidden'})
        self.records(self.read_json(server.RECORDS_BODY_MAX))
