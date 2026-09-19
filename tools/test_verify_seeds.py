import io
import json
import unittest
import zipfile

from verify_seeds import parse_json, safe_path, sha, verify_archive


class SeedByteReviewTests(unittest.TestCase):
    def test_paths_reject_unsafe_or_noncanonical_forms(self):
        for path in ("", "/x", "../x", "a/../x", "a//x", "a\\x", "a/./x", "C:x", "x/"):
            with self.subTest(path=path), self.assertRaises(ValueError):
                safe_path(path)
        self.assertEqual(safe_path("data/example.json"), "data/example.json")

    def test_json_rejects_duplicate_keys_and_nonfinite_values(self):
        for raw in (b'{"a":1,"a":2}', b'{"x":NaN}', b'{"x":Infinity}'):
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                parse_json(raw)

    def make_package(self, extra=False):
        content = b'{"example":true}\n'
        item = {"path": "data.json", "bytes": len(content), "sha256": sha(content)}
        seed = (json.dumps({"inventory": [item]}) + "\n").encode()
        declared = [
            dict(item, content=content.decode()),
            {"path": "seed.json", "bytes": len(seed), "sha256": sha(seed), "content": seed.decode()},
        ]
        output = io.BytesIO()
        with zipfile.ZipFile(output, "w") as archive:
            archive.writestr("data.json", content)
            archive.writestr("seed.json", seed)
            if extra:
                archive.writestr("unexpected.txt", b"no")
        return output.getvalue(), declared

    def test_exact_package_passes(self):
        archive, declared = self.make_package()
        self.assertEqual(set(verify_archive(archive, declared)), {"data.json", "seed.json"})

    def test_unexpected_zip_file_fails(self):
        archive, declared = self.make_package(extra=True)
        with self.assertRaises(ValueError):
            verify_archive(archive, declared)

    def test_declared_digest_mismatch_fails(self):
        archive, declared = self.make_package()
        declared[0]["sha256"] = "0" * 64
        with self.assertRaises(ValueError):
            verify_archive(archive, declared)


if __name__ == "__main__":
    unittest.main()
