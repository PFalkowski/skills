import contextlib
import datetime
import io
import unittest

import cleanup
import os
import tempfile

import stats
from mediahub import index, policy, quota, settings


class PolicyTests(unittest.TestCase):
    def setUp(self):
        self.uploads = index.read(settings.load({}).index)

    def test_thirty_days(self):
        today = datetime.date(2026, 3, 1)
        ids = [u.id for u in policy.expired(self.uploads, today, 30)]
        self.assertEqual(ids, ["u-001", "u-002", "u-003"])

    def test_exactly_thirty_days_is_kept(self):
        today = datetime.date(2026, 3, 1)
        kept = [u for u in self.uploads if u.id == "u-004"]
        self.assertEqual(policy.expired(kept, today, 30), [])

    def test_future_dates_are_kept(self):
        self.assertEqual(policy.expired(self.uploads, datetime.date(2025, 1, 1), 1), [])

    def test_dry_run_output(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            cleanup.main(["--today", "2026-03-01"])
        self.assertTrue(out.getvalue().splitlines()[-1].startswith("would remove 3 upload(s)"))
        self.assertTrue(out.getvalue().rstrip().endswith("retention 30 days"))

    def test_owner_option(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            cleanup.main(["--today", "2026-03-01", "--owner", "omar"])
        self.assertEqual(out.getvalue().splitlines()[0].split("\t")[0], "u-003")


class IndexAndQuotaTests(unittest.TestCase):
    def write(self, text):
        handle = tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False, encoding="utf-8")
        handle.write(text)
        handle.close()
        self.addCleanup(os.remove, handle.name)
        return handle.name

    def test_duplicate_id(self):
        path = self.write("id,owner,name,size,uploaded\na,k,x,1,2026-01-01\na,k,y,1,2026-01-01\n")
        with self.assertRaises(ValueError):
            index.read(path)

    def test_bad_date(self):
        path = self.write("id,owner,name,size,uploaded\na,k,x,1,2026-13-01\n")
        with self.assertRaises(ValueError):
            index.read(path)

    def test_over_quota(self):
        uploads = index.read(settings.load({}).index)
        self.assertEqual([owner for owner, _ in quota.over(uploads, 50)], ["omar"])
        self.assertGreater(quota.headroom(uploads, "lena", 50), 0)

    def test_stats_human_sizes(self):
        self.assertEqual(stats.human(512), "512 B")
        self.assertEqual(stats.human(2048), "2.0 KB")


if __name__ == "__main__":
    unittest.main()
