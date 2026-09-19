import io
import unittest
import zipfile

from check_public import inspect_blob, inspect_text


class PublicPayloadTests(unittest.TestCase):
    def test_public_article_url_is_not_a_home_path(self):
        url = "https://www.wix.com/press-room/" + "home/post/example"
        self.assertEqual(inspect_text("source.json", url.encode()), [])

    def test_home_and_private_session_locations_are_blocked(self):
        path = "/" + "Users" + "/example/" + ".copilot" + "/session-state/example"
        rules = {finding["rule"] for finding in inspect_text("record.json", path.encode())}
        self.assertIn("private-home-path", rules)
        self.assertIn("private-session-store", rules)

    def test_private_execution_identifier_is_blocked(self):
        identifier = "-".join(("12345678", "1234", "1234", "1234", "123456789abc"))
        rules = {finding["rule"] for finding in inspect_text("record.json", identifier.encode())}
        self.assertIn("private-execution-identifier", rules)

    def test_credential_is_never_echoed_in_findings(self):
        token = "ghp_" + "A" * 36
        findings = inspect_text("record.json", token.encode())
        self.assertEqual(findings, [{"path": "record.json", "rule": "credential-token"}])
        self.assertNotIn(token, str(findings))

    def test_credentials_in_url_are_blocked(self):
        url = "https://" + "user:example-password@" + "example.invalid/"
        self.assertIn("credentialed-url", {item["rule"] for item in inspect_text("record.txt", url.encode())})
        url = "https://example.invalid/?" + "access_token=" + "example"
        self.assertIn("credential-query", {item["rule"] for item in inspect_text("record.txt", url.encode())})

    def test_explicit_synthetic_userinfo_is_only_allowed_in_rejection_tests(self):
        url = "https://" + "synthetic:synthetic@" + "example.invalid/"
        self.assertEqual(inspect_text("projects/example/tests/model.test.mjs", url.encode()), [])
        self.assertIn("credentialed-url", {
            item["rule"] for item in inspect_text("projects/example/app.js", url.encode())
        })
        token_url = "https://example.invalid/" + "ghp_" + "A" * 36
        self.assertIn("credential-token", {
            item["rule"] for item in inspect_text("projects/example/tests/model.test.mjs", token_url.encode())
        })

    def test_zip_members_are_reviewed_without_execution(self):
        output = io.BytesIO()
        with zipfile.ZipFile(output, "w") as archive:
            archive.writestr("README.txt", "/" + "Users" + "/example/private")
        findings = inspect_blob("review.zip", output.getvalue())
        self.assertTrue(any(item["rule"] == "private-home-path" for item in findings))

    def test_zip_traversal_is_rejected(self):
        output = io.BytesIO()
        with zipfile.ZipFile(output, "w") as archive:
            archive.writestr("../outside.txt", "not executed")
        self.assertEqual(inspect_blob("review.zip", output.getvalue()),
                         [{"path": "review.zip", "rule": "invalid-archive"}])

    def test_private_filename_inside_zip_is_rejected(self):
        output = io.BytesIO()
        with zipfile.ZipFile(output, "w") as archive:
            archive.writestr(".env", "EXAMPLE=not-a-secret")
        self.assertEqual(inspect_blob("review.zip", output.getvalue()),
                         [{"path": "review.zip!.env", "rule": "private-or-generated-file"}])

    def test_safe_synthetic_artifact_passes(self):
        self.assertEqual(inspect_blob("projects/demo/result.json", b'{"classification":"synthetic"}'), [])
        self.assertEqual(inspect_blob(".env", b"EXAMPLE=not-a-secret")[0]["rule"],
                         "private-or-generated-file")


if __name__ == "__main__":
    unittest.main()
