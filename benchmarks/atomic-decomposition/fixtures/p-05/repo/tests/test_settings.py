import os
import tempfile
import unittest

from mediahub import settings


class SettingsTests(unittest.TestCase):
    def test_defaults(self):
        config = settings.load({})
        self.assertEqual(config.retention_days, 30)
        self.assertEqual(config.max_batch, 500)
        self.assertEqual(config.index, settings.ROOT / "uploads" / "index.csv")

    def test_example_local_file(self):
        path = settings.ROOT / "config" / "example-local.ini"
        config = settings.load({"MEDIAHUB_CONFIG": str(path)})
        self.assertEqual(config.report, "json")
        self.assertEqual(config.retention_days, 30)

    def test_missing_override_file_is_an_error(self):
        with self.assertRaises(settings.SettingsError):
            settings.load({"MEDIAHUB_CONFIG": "/nonexistent/mediahub.ini"})

    def test_bad_value(self):
        handle = tempfile.NamedTemporaryFile("w", suffix=".ini", delete=False, encoding="utf-8")
        handle.write("[cleanup]\nretention_days = soon\n")
        handle.close()
        self.addCleanup(os.remove, handle.name)
        with self.assertRaises(settings.SettingsError):
            settings.load({"MEDIAHUB_CONFIG": handle.name})

    def test_json_report(self):
        import json

        from mediahub import report
        config = settings.load({"MEDIAHUB_CONFIG": str(settings.ROOT / "config" / "example-local.ini")})
        data = json.loads(report.render([], config, False))
        self.assertEqual(data, {"action": "would remove", "retention_days": 30, "uploads": [],
                                "bytes": 0})

    def test_relative_index_resolves_from_repo(self):
        handle = tempfile.NamedTemporaryFile("w", suffix=".ini", delete=False, encoding="utf-8")
        handle.write("[cleanup]\nindex = data/other.csv\n")
        handle.close()
        self.addCleanup(os.remove, handle.name)
        config = settings.load({"MEDIAHUB_CONFIG": handle.name})
        self.assertEqual(config.index, settings.ROOT / "data" / "other.csv")

    def test_settings_dump(self):
        import contextlib
        import io

        import settings_dump
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            settings_dump.main()
        self.assertIn("quota_mb = 50", out.getvalue().splitlines())


if __name__ == "__main__":
    unittest.main()
