import contextlib
import io
import unittest

import main
from relay import routing
from relay.templates import render


class RoutingTests(unittest.TestCase):
    def test_routes(self):
        self.assertEqual(routing.channels_for("low"), ["chat"])
        self.assertEqual(routing.channels_for("high"), ["email", "sms"])

    def test_every_severity_has_a_route(self):
        for severity in routing.SEVERITIES:
            self.assertTrue(routing.channels_for(severity))

    def test_render_title(self):
        self.assertEqual(render("  disk   full ", "build-3"), "BUILD-3: disk full")

    def test_render_rejects_empty(self):
        with self.assertRaises(ValueError):
            render("   ")

    def test_send_prints_one_line_per_delivery(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            main.main(["send", "--severity", "normal", "Disk usage at 81%"])
        lines = out.getvalue().splitlines()
        self.assertEqual([line.split("\t")[0] for line in lines], ["chat", "email"])


if __name__ == "__main__":
    unittest.main()
