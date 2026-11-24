import contextlib
import io
import os
import shutil
import tempfile
import unittest
from pathlib import Path

import shipctl

ROOT = Path(__file__).resolve().parent.parent


class ShipTest(unittest.TestCase):
    def setUp(self):
        folder = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, folder)
        self.data = Path(folder) / "shipments.json"
        shutil.copyfile(ROOT / "shipments.json", self.data)
        os.environ["SHIPCTL_DATA"] = str(self.data)
        self.addCleanup(os.environ.pop, "SHIPCTL_DATA", None)

    def run_cli(self, *argv):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = shipctl.main(list(argv))
        return code, out.getvalue(), err.getvalue()
