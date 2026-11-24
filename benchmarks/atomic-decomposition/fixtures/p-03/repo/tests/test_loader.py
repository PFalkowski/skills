import os
import tempfile
import unittest

from portfolio import loader


class LoaderTests(unittest.TestCase):
    def write(self, text):
        handle = tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False, encoding="utf-8")
        handle.write(text)
        handle.close()
        self.addCleanup(os.remove, handle.name)
        return handle.name

    def test_loads_shipped_data(self):
        projects = loader.load()
        self.assertEqual(len(projects), 10)
        self.assertEqual(projects[0].status, "active")
        self.assertEqual(projects[0].left, 42000 - 18350)

    def test_lowercase_status_code_is_accepted(self):
        path = self.write("id,name,owner,status,budget,spent\nP-1,A,B,act,10,5\n")
        self.assertEqual(loader.load(path)[0].status_code, "ACT")

    def test_unknown_status(self):
        path = self.write("id,name,owner,status,budget,spent\nP-1,A,B,DONE,10,5\n")
        with self.assertRaises(loader.DataError):
            loader.load(path)

    def test_bad_amount(self):
        path = self.write("id,name,owner,status,budget,spent\nP-1,A,B,ACT,1.5,0\n")
        with self.assertRaises(loader.DataError):
            loader.load(path)

    def test_duplicate_ids(self):
        path = self.write("id,name,owner,status,budget,spent\nP-1,A,B,ACT,1,0\nP-1,C,D,ACT,1,0\n")
        with self.assertRaises(loader.DataError):
            loader.load(path)


if __name__ == "__main__":
    unittest.main()
