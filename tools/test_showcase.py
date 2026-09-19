import functools
import http.server
import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path

from run_checks import artifact_file, inspect_project, load_manifest
from serve import ShowcaseHandler, normalize_base_path, public_file


class ShowcaseTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        self.project = self.root / "projects/01-example"
        (self.project / "evidence").mkdir(parents=True)
        (self.root / "index.html").write_text("<h1>Local test</h1>")
        (self.project / "index.html").write_text("<h1>Project</h1>")
        (self.project / "evidence/result.json").write_text('{"stage":"work-produced"}')
        (self.project / "check.py").write_text("print('actual check')\n")
        self.spec = {"id": "01-example", "seedSlug": "example"}
        self.manifest = {
            "id": "01-example", "title": "Example", "seedSlug": "example",
            "entrypoint": "projects/01-example/index.html", "summary": "An original test",
            "checks": [["python3", "projects/01-example/check.py"]],
            "artifacts": ["projects/01-example/check.py"], "limitations": ["Synthetic test"],
            "stage": "work-produced",
        }
        self.save_manifest()

    def save_manifest(self):
        (self.project / "manifest.json").write_text(json.dumps(self.manifest))

    def test_manifest_and_actual_check(self):
        self.assertEqual(load_manifest(self.root, self.spec)["id"], "01-example")
        result = inspect_project(self.root, self.spec)
        self.assertEqual(result["status"], "passed")
        self.assertIn("actual check", result["commands"][0]["stdout"])
        self.assertEqual(len(result["artifacts"]), 4)
        self.assertTrue(all(len(item["sha256"]) == 64 for item in result["artifacts"]))

    def test_failure_is_not_success(self):
        (self.project / "check.py").write_text("raise SystemExit(7)\n")
        result = inspect_project(self.root, self.spec)
        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["commands"][0]["exitCode"], 7)

    def test_missing_artifact_fails_before_execution(self):
        self.manifest["artifacts"] = ["projects/01-example/missing.txt"]
        self.save_manifest()
        result = inspect_project(self.root, self.spec)
        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["commands"], [])

    def test_directory_artifact_records_each_regular_file(self):
        (self.project / "evidence/proof.json").write_text('{"observed":true}')
        self.manifest["artifacts"] = ["projects/01-example/evidence"]
        self.save_manifest()
        result = inspect_project(self.root, self.spec)
        self.assertEqual(result["status"], "passed")
        self.assertEqual(len(result["artifacts"]), 4)
        self.assertIn("projects/01-example/evidence/proof.json",
                      {item["path"] for item in result["artifacts"]})

    def test_directory_artifact_rejects_symbolic_links(self):
        (self.project / "evidence/link.json").symlink_to(self.project / "evidence/result.json")
        self.manifest["artifacts"] = ["projects/01-example/evidence"]
        self.save_manifest()
        result = inspect_project(self.root, self.spec)
        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["commands"], [])

    def test_external_entrypoint_and_untrusted_runner_rejected(self):
        self.manifest["entrypoint"] = "https://example.com/index.html"
        self.save_manifest()
        with self.assertRaises(ValueError):
            load_manifest(self.root, self.spec)
        self.manifest["entrypoint"] = "projects/01-example/index.html"
        self.manifest["checks"] = [["sh", "-c", "echo forbidden"]]
        self.save_manifest()
        with self.assertRaises(ValueError):
            load_manifest(self.root, self.spec)

    def test_artifact_traversal_is_rejected(self):
        for path in ("../outside", "/etc/passwd", ".git/config"):
            with self.subTest(path=path), self.assertRaises(ValueError):
                artifact_file(self.root, path)

    def test_public_routes_and_private_paths(self):
        self.assertEqual(public_file(self.root, "/"), self.root / "index.html")
        self.assertEqual(public_file(self.root, "/projects/01-example/?demo=1"), self.project / "index.html")
        for path in ("/.git/config", "/projects/../index.html", "/projects/%2e%2e/index.html"):
            with self.subTest(path=path), self.assertRaises(ValueError):
                public_file(self.root, path)
        for path in ("/tools/serve.py", "/projects/missing/index.html", "/evidence/"):
            with self.subTest(path=path), self.assertRaises(FileNotFoundError):
                public_file(self.root, path)

    def test_symlinks_not_served(self):
        (self.project / "linked.html").symlink_to(self.root / "index.html")
        with self.assertRaises(ValueError):
            public_file(self.root, "/projects/01-example/linked.html")

    def test_project_prefix_never_falls_back_to_host_root(self):
        prefix = "/hive-showcase"
        self.assertEqual(public_file(self.root, prefix + "/", prefix), self.root / "index.html")
        self.assertEqual(public_file(self.root, prefix + "/projects/01-example/", prefix),
                         self.project / "index.html")
        for route in ("/", "/projects/01-example/", "/hive-showcase-other/"):
            with self.subTest(route=route), self.assertRaises(FileNotFoundError):
                public_file(self.root, route, prefix)
        with self.assertRaises(ValueError):
            public_file(self.root, prefix + "/%2e%2e/index.html", prefix)
        for value in ("../outside", "bad?query", "bad\r\nheader", "bad%2fpath"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                normalize_base_path(value)

    def test_project_prefix_redirect_preserves_relative_asset_resolution(self):
        handler = functools.partial(ShowcaseHandler, root=self.root, base_path="/hive-showcase")
        with http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler) as server:
            thread = threading.Thread(target=server.serve_forever)
            thread.start()
            try:
                base = "http://127.0.0.1:%d" % server.server_port
                with urllib.request.urlopen(base + "/hive-showcase") as response:
                    self.assertEqual(response.geturl(), base + "/hive-showcase/")
                    self.assertIn(b"Local test", response.read())
                with self.assertRaises(urllib.error.HTTPError) as caught:
                    urllib.request.urlopen(base + "/projects/01-example/")
                self.assertEqual(caught.exception.code, 404)
            finally:
                server.shutdown()
                thread.join(timeout=5)
                self.assertFalse(thread.is_alive())

    def test_loopback_http_returns_artifact_and_rejects_private(self):
        handler = functools.partial(ShowcaseHandler, root=self.root)
        with http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler) as server:
            thread = threading.Thread(target=server.serve_forever)
            thread.start()
            try:
                base = "http://127.0.0.1:%d" % server.server_port
                with urllib.request.urlopen(base + "/") as response:
                    self.assertEqual(response.status, 200)
                    self.assertEqual(response.headers["Cache-Control"], "no-store")
                    self.assertIn(b"Local test", response.read())
                with self.assertRaises(urllib.error.HTTPError) as caught:
                    urllib.request.urlopen(base + "/.git/config")
                self.assertEqual(caught.exception.code, 400)
                with self.assertRaises(urllib.error.HTTPError) as caught:
                    urllib.request.urlopen(base + "/projects/nope/")
                self.assertEqual(caught.exception.code, 404)
            finally:
                server.shutdown()
                thread.join(timeout=5)
                self.assertFalse(thread.is_alive())


if __name__ == "__main__":
    unittest.main()
