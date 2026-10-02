# Vercel 함수 공통: server.py의 처리 코드를 그대로 쓴다. 키는 Vercel 환경 변수에서 읽는다.
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import server  # noqa: E402

server.configure(server.env_config())
Handler = server.Handler
