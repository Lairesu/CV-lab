import hmac
import json
import os
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

WORKER_KEY = os.environ.get("SMART_CANTEEN_WORKER_KEY", "")

SCRIPT = (
    "/workspace/projects/canteen-vision/"
    "timed_video_publisher.py"
)

if not WORKER_KEY:
    raise RuntimeError("Worker key is missing")

state = {"status": "idle", "error": None}
lock = threading.Lock()


def run_analysis():
    """Run YOLO without blocking the HTTP server."""
    try:
        subprocess.run(
            ["python", "-u", SCRIPT],
            check=True,
            timeout=300,
        )

        with lock:
            state["status"] = "completed"

    except Exception as error:
        with lock:
            state["status"] = "failed"
            state["error"] = str(error)

        print("Analysis failed:", error, flush=True)


class WorkerHandler(BaseHTTPRequestHandler):

    def respond(self, status, data):
        body = json.dumps(data).encode("utf-8")

        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            self.respond(200, {"status": "ok"})

        elif self.path == "/status":
            with lock:
                self.respond(200, state.copy())

        else:
            self.respond(404, {"error": "Not found"})

    def do_POST(self):
        if self.path != "/internal/start":
            self.respond(404, {"error": "Not found"})
            return

        supplied_key = self.headers.get("X-Worker-Key", "")

        if not hmac.compare_digest(supplied_key.encode(), WORKER_KEY.encode()):
            self.respond(401, {"error": "Unauthorized"})
            return

        with lock:
            if state["status"] == "running":
                self.respond(409, {"error": "Already running"})
                return

            state["status"] = "running"
            state["error"] = None

        threading.Thread(
            target=run_analysis,
            daemon=True,
        ).start()

        self.respond(202, {"status": "started"})


print("YOLO analysis worker listening on port 8098", flush=True)

ThreadingHTTPServer(
    ("0.0.0.0", 8098),
    WorkerHandler,
).serve_forever()
