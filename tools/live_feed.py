"""Publish only buffered simulation frames and the current experiment step."""
import base64
import io
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import urlopen

from PIL import Image

ORIGIN = "http://127.0.0.1:8876"
VIEWS = ("wrist", "belly", "top")
latest = None


def read(path):
    with urlopen(ORIGIN + path, timeout=2) as response:
        return response.read()


def capture():
    global latest
    while True:
        try:
            state = json.loads(read("/state"))
            vision = state.get("vision") or {}
            if vision:
                frame = read("/vision.jpg")
            else:
                strip = Image.new("RGB", (640, 1080))
                for i, name in enumerate(VIEWS):
                    with Image.open(io.BytesIO(read("/" + name + ".jpg"))) as view:
                        strip.paste(view, (0, i * 360))
                buffer = io.BytesIO()
                strip.save(buffer, "JPEG", quality=80)
                frame = buffer.getvalue()
            running = not vision["done"] if vision else state["status"] == "실행 중"
            packet = {
                "running": running,
                "action": vision.get("action") or str(state.get("mode") or "").strip("/"),
                "note": vision.get("note") or (state.get("pick") or {}).get("phase") or state["status"],
                "time": round(time.time() * 1000),
                "jpeg": base64.b64encode(frame).decode("ascii"),
            }
            latest = time.monotonic(), json.dumps(packet, ensure_ascii=False).encode()
            time.sleep(.18 if running else .8)
        except (OSError, ValueError, KeyError):
            time.sleep(1)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        if self.path.split("?")[0] != "/snapshot":
            self.send_error(404)
            return
        sample = latest
        ok = sample and time.monotonic() - sample[0] < 5
        body = sample[1] if ok else b'{"online":false}'
        self.send_response(200 if ok else 503)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass


if __name__ == "__main__":
    threading.Thread(target=capture, daemon=True).start()
    ThreadingHTTPServer(("127.0.0.1", 8877), Handler).serve_forever()
