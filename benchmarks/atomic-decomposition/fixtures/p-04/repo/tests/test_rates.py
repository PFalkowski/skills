import unittest
from decimal import Decimal

from ship import postcodes, rates


class RateTests(unittest.TestCase):
    def test_minimum_applies(self):
        self.assertEqual(rates.price("economy", 1.0, "north"), Decimal("4.50"))

    def test_per_kg_and_surcharge(self):
        self.assertEqual(rates.price("standard", 5.0, "south"), Decimal("11.00"))

    def test_zones(self):
        self.assertEqual(postcodes.zone("4630"), "east")
        self.assertFalse(postcodes.valid("123"))
        with self.assertRaises(ValueError):
            postcodes.zone("9100")

    def test_clean_address(self):
        self.assertEqual(postcodes.clean_address(" 3,  Mill   Lane "), "3 Mill Lane")


if __name__ == "__main__":
    unittest.main()
