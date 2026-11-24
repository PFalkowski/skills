import contextlib
import io
import unittest

import report
from portfolio import budget, checks, loader
from portfolio.model import Project


class BudgetTests(unittest.TestCase):
    def test_by_owner(self):
        owners = budget.by_owner(loader.load())
        self.assertEqual(list(owners)[0], "A. Brandt")
        self.assertEqual(owners["M. Ilic"]["projects"], 3)

    def test_used_handles_zero_budget(self):
        self.assertEqual(Project("X", "x", "o", "PRO", 0, 0).used, 0)

    def test_totals_output(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            report.main(["--totals"])
        lines = out.getvalue().splitlines()
        self.assertTrue(lines[0].startswith("owner"))
        self.assertTrue(lines[-1].startswith("all"))
        self.assertIn("188,500", lines[-1])

    def test_nearly_spent_option(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            report.main(["--nearly-spent", "99"])
        self.assertTrue(out.getvalue().endswith("3 projects\n"))

    def test_shipped_data_is_clean(self):
        self.assertEqual(checks.run(loader.load()), [])

    def test_check_rules(self):
        bad = [Project("X1", "x", "o", "PRO", 10, 4), Project("X2", "y", "", "ACT", 10, 12)]
        self.assertEqual(checks.run(bad), ["X1: proposed but has spent 4",
                                           "X2: spent 12 of a 10 budget", "X2: no owner"])


if __name__ == "__main__":
    unittest.main()
