# POST /api/tts → mp3 (Typecast)
from _vercel import Handler


class handler(Handler):
    def do_POST(self):
        if not self.same_origin():
            return self.send(403, {'error': 'forbidden'})
        self.tts(self.read_json())
