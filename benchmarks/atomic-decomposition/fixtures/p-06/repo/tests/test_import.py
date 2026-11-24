import os
import shutil
import tempfile
import unittest
from pathlib import Path

from listkeeper import clean, importer, merge
from listkeeper.store import Store

ROOT = Path(__file__).resolve().parent.parent


class ImportTests(unittest.TestCase):
    def setUp(self):
        folder = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, folder)
        self.store = Store(Path(folder) / "subscribers.json")

    def test_sample(self):
        result = importer.import_file(self.store, ROOT / "samples" / "signups.csv")
        self.assertEqual((result.added, result.merged, result.rejected), (4, 2, 1))
        ben = self.store.get("ben@example.org")
        self.assertEqual(ben, {"email": "ben@example.org", "name": "Ben Okoro", "city": "Porto",
                               "topics": ["events", "repair cafe"]})

    def test_second_import_merges_into_existing(self):
        importer.import_file(self.store, ROOT / "samples" / "signups.csv")
        rows = [{"email": "cleo@example.org", "name": "", "city": "", "topics": "gardens"},
                {"email": "CLEO@example.org", "name": "", "city": "", "topics": ""}]
        importer.import_rows(self.store, rows)
        self.assertEqual(self.store.get("cleo@example.org")["topics"], ["gardens"])
        self.assertEqual(self.store.get("cleo@example.org")["name"], "Cleo Marsh")

    def test_bad_address_is_rejected(self):
        rows = [{"email": "not-an-address", "name": "X", "city": "", "topics": ""}]
        self.assertEqual(importer.import_rows(self.store, rows).rejected, 1)

    def test_clean_row(self):
        row = {"email": " Eve@Example.ORG ", "name": "eve  stone", "city": "faro",
               "topics": "Events; events ;gardens"}
        self.assertEqual(clean.clean_row(row), {"email": "eve@example.org", "name": "Eve Stone",
                                                "city": "Faro", "topics": ["events", "gardens"]})

    def test_merge_takes_first_non_empty(self):
        rows = [{"email": "a@b.co", "name": "", "city": "X", "topics": ["t"]},
                {"email": "a@b.co", "name": "Al", "city": "Y", "topics": ["u", "t"]}]
        self.assertEqual(merge.merge(rows), {"email": "a@b.co", "name": "Al", "city": "X",
                                             "topics": ["t", "u"]})


if __name__ == "__main__":
    unittest.main()
