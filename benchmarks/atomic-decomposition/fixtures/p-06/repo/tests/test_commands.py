import contextlib
import io
import json
import shutil
import tempfile
import unittest
from pathlib import Path

import lk

ROOT = Path(__file__).resolve().parent.parent


class CommandTests(unittest.TestCase):
    def setUp(self):
        self.folder = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.folder)
        self.store = str(self.folder / "subscribers.json")

    def run_cli(self, *argv):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = lk.main(["--store", self.store, *argv])
        return code, out.getvalue(), err.getvalue()

    def test_import_and_list(self):
        self.assertEqual(self.run_cli("import", str(ROOT / "samples" / "signups.csv"))[1],
                         "added 4, merged 2, rejected 1\n")
        self.assertEqual(len(self.run_cli("list")[1].splitlines()), 4)

    def test_add_and_remove(self):
        self.assertEqual(self.run_cli("add", "Dee@Example.org", "--name", "Dee")[1],
                         "added dee@example.org\n")
        self.assertEqual(self.run_cli("add", "dee@example.org")[0], 1)
        self.assertEqual(self.run_cli("remove", "DEE@example.org")[0], 0)
        self.assertEqual(self.run_cli("list")[1], "")

    def test_add_rejects_bad_address(self):
        code, _, err = self.run_cli("add", "dee at example")
        self.assertEqual(code, 1)
        self.assertIn("bad email", err)

    def test_backup_and_restore(self):
        self.run_cli("import", str(ROOT / "samples" / "signups.csv"))
        backup = str(self.folder / "b.json")
        self.run_cli("backup", backup)
        self.run_cli("remove", "ana@example.org")
        self.assertEqual(self.run_cli("restore", backup)[1], "restored 4 subscriber(s)\n")
        self.assertEqual(len(self.run_cli("list")[1].splitlines()), 4)

    def test_restore_rejects_other_files(self):
        path = self.folder / "x.json"
        path.write_text(json.dumps([1, 2]), encoding="utf-8")
        self.assertEqual(self.run_cli("restore", str(path))[0], 1)

    def test_export(self):
        self.run_cli("import", str(ROOT / "samples" / "signups.csv"))
        out = self.folder / "out.csv"
        self.run_cli("export", str(out))
        lines = out.read_text(encoding="utf-8").splitlines()
        self.assertEqual(lines[1], "ana@example.org,Ana Ruiz,Lisbon,gardens;events;repair cafe")


if __name__ == "__main__":
    unittest.main()
