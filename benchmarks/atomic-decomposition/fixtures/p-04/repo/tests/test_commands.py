import unittest

from tests.helpers import ROOT, ShipTest


class CommandTests(ShipTest):
    def test_list(self):
        code, out, _ = self.run_cli("list")
        self.assertEqual(code, 0)
        self.assertEqual(len(out.splitlines()), 3)

    def test_create_and_label(self):
        self.assertEqual(self.run_cli("create", "Ann", "1 Pier Road", "4520", "--weight", "4")[1],
                         "created S-1004\n")
        code, out, _ = self.run_cli("label", "S-1004", "--service", "express")
        self.assertEqual(out, "S-1004: label L-1004-EXP (express) 12.40\n")
        self.assertIn("LABEL L-1004-EXP", self.run_cli("show", "S-1004")[1])

    def test_address_on_draft(self):
        self.assertEqual(self.run_cli("address", "S-1003", "16 Quay St", "4512")[0], 0)
        self.assertIn("16 Quay St, 4512", self.run_cli("show", "S-1003")[1])

    def test_address_refused_when_labelled(self):
        code, _, err = self.run_cli("address", "S-1001", "5 Mill Lane", "4401")
        self.assertEqual(code, 1)
        self.assertIn("labelled", err)

    def test_bad_postcode(self):
        self.assertEqual(self.run_cli("address", "S-1003", "x", "9999")[0], 1)

    def test_amend_example(self):
        code, out, _ = self.run_cli("amend", str(ROOT / "examples" / "amend.csv"))
        self.assertEqual(code, 0)
        self.assertTrue(out.startswith("imported"))
        self.assertIn("16 Quay Street, 4512", self.run_cli("show", "S-1003")[1])

    def test_edit_reference(self):
        self.assertEqual(self.run_cli("edit", "S-1002", "--set", "reference=PO-6000")[1],
                         "S-1002: reference set\n")
        self.assertIn("reference: PO-6000", self.run_cli("show", "S-1002")[1])

    def test_relabel_changes_service(self):
        code, out, _ = self.run_cli("relabel", "S-1001", "--service", "economy")
        self.assertEqual(out, "S-1001: label L-1001-ECO reprinted 4.50\n")

    def test_track(self):
        self.assertEqual(self.run_cli("track", "S-1001")[1], "S-1001: accepted at depot 44\n")
        self.assertEqual(self.run_cli("track", "S-1003")[1], "S-1003: not labelled yet\n")


if __name__ == "__main__":
    unittest.main()
