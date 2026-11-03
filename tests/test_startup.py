"""start-nextword.cmd's tutor check: it must tell 'nothing listening' (safe to start the launcher) from
'something listening' (leave it alone, because the launcher would stop it)."""

import json
import socket
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from nextword.lab import startup


def serve(models):
    class H(BaseHTTPRequestHandler):
        def do_GET(self):
            if models is None:
                self.send_response(503)
                self.end_headers()
                return
            body = json.dumps({"data": [{"id": m} for m in models]}).encode()
            self.send_response(200)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *a):
            pass

    srv = ThreadingHTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


class TutorStateTests(unittest.TestCase):
    def url(self, srv):
        self.addCleanup(srv.shutdown)
        return f"http://127.0.0.1:{srv.server_address[1]}/v1"

    def test_a_serving_colibri_is_reused(self):
        self.assertEqual(startup.ai_state(self.url(serve(["qwen3-4b-instruct-2507-q4km"]))), ("READY", "qwen3-4b-instruct-2507-q4km"))

    def test_a_port_in_use_without_a_model_is_left_alone(self):
        self.assertEqual(startup.ai_state(self.url(serve(None)))[0], "LOADING")
        self.assertEqual(startup.ai_state(self.url(serve([])))[0], "LOADING")

    def test_nothing_listening_is_off(self):
        s = socket.socket()
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
        s.close()
        self.assertEqual(startup.ai_state(f"http://127.0.0.1:{port}/v1", timeout=0.5), ("OFF", ""))


if __name__ == "__main__":
    unittest.main()


class LabPortTests(unittest.TestCase):
    def test_a_second_lab_cannot_share_the_port(self):
        from nextword.lab import server
        first = server.LabServer(("127.0.0.1", 0), server.LabHandler)
        self.addCleanup(first.server_close)
        with self.assertRaises(OSError):
            server.LabServer(("127.0.0.1", first.server_address[1]), server.LabHandler)
