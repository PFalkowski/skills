import re
import unittest
from pathlib import Path

SKILL = Path(__file__).resolve().parents[1] / "benchmark-skill" / "SKILL.md"


class PilotGateTest(unittest.TestCase):
    def test_pilot_precedes_held_out_authoring(self):
        text = re.sub(r"\s+", " ", SKILL.read_text(encoding="utf-8").lower())
        self.assertIn("before authoring the held-out", text)
        self.assertIn("pilot", text)
        self.assertIn("about six development cases", text)
        self.assertIn("control at the ceiling", text)
        self.assertIn("a key that marks correct answers wrong", text)


if __name__ == "__main__":
    unittest.main()
