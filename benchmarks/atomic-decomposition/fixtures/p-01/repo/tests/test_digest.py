import os
import tempfile
import unittest

from relay import config, digest, routing


class DigestTests(unittest.TestCase):
    def write(self, text):
        handle = tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8")
        handle.write(text)
        handle.close()
        self.addCleanup(os.remove, handle.name)
        return handle.name

    def test_groups_by_severity_highest_first(self):
        path = self.write("low disk 70%\nhigh backup late\n# note\nlow disk 75%\n")
        result = digest.summarise(digest.read_alerts(path))
        self.assertEqual(result, [("high", "backup late"),
                                  ("low", "2 alerts\n- disk 70%\n- disk 75%")])

    def test_bad_line(self):
        with self.assertRaises(ValueError):
            digest.read_alerts(self.write("urgent fire\n"))

    def test_quiet_hours_skip_chat_and_email(self):
        self.assertEqual(routing.channels_for("normal", "23:30"), [])
        self.assertEqual(routing.channels_for("normal", "12:00"), ["chat", "email"])
        self.assertEqual(routing.channels_for("high", "23:30"), ["email", "sms"])

    def test_bad_time(self):
        with self.assertRaises(ValueError):
            routing.channels_for("normal", "25:00")

    def test_config_is_clean(self):
        self.assertEqual(config.check(routing.load_routes()), [])


if __name__ == "__main__":
    unittest.main()
