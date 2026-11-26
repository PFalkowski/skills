import contextlib
import io
import unittest

import report
from portfolio import budget, loader, sorting, views


def run(*argv):
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        report.main(list(argv))
    return out.getvalue()


class ReportTests(unittest.TestCase):
    def test_default_lists_every_project(self):
        self.assertTrue(run().endswith("10 projects\n"))

    def test_owner_filter(self):
        output = run("--owner", "m.  ilic")
        self.assertIn("Harbour lights", output)
        self.assertTrue(output.endswith("3 projects\n"))

    def test_sort_by_spent(self):
        names = [p.name for p in sorting.sort(loader.load(), "spent")][:2]
        self.assertEqual(names, ["Old intranet", "Harbour lights"])

    def test_finance_view_columns(self):
        header = run("--view", "finance").splitlines()[0].split()
        self.assertEqual(header, ["id", "name", "budget", "spent", "left", "used"])

    def test_csv(self):
        lines = run("--format", "csv").splitlines()
        self.assertEqual(lines[0], "id,name,owner,status,left")
        self.assertEqual(lines[1], "P-04,Bike racks,J. Kowal,paused,6800")

    def test_views_load(self):
        self.assertEqual(set(views.load()), {"default", "finance", "board"})

    def test_budget_totals(self):
        totals = budget.totals(loader.load())
        self.assertEqual(totals["budget"], 188500)
        self.assertEqual(totals["left"], totals["budget"] - totals["spent"])

    def test_nearly_spent(self):
        ids = [p.id for p in budget.nearly_spent(loader.load())]
        self.assertEqual(ids, ["P-02", "P-03", "P-06", "P-09"])


if __name__ == "__main__":
    unittest.main()
