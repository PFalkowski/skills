import unittest

from dues import billing, members, money, plans, renewals
from dues.ledger import Ledger


class MoneyTests(unittest.TestCase):
    def test_to_cents(self):
        self.assertEqual(money.to_cents("12.50"), 1250)
        self.assertEqual(money.to_cents("$3"), 300)

    def test_rejects_fractions_of_a_cent(self):
        with self.assertRaises(ValueError):
            money.to_cents("1.005")

    def test_format(self):
        self.assertEqual(money.format_cents(1250), "$12.50")
        self.assertEqual(money.format_cents(-75), "-$0.75")

    def test_split(self):
        self.assertEqual(money.split_evenly(1000, 3), [334, 333, 333])


class BillingTests(unittest.TestCase):
    def setUp(self):
        self.roster, self.ledger = members.load(), Ledger()

    def test_guest_pass(self):
        entry = billing.guest_pass(self.roster.get("M-101"), self.ledger)
        self.assertEqual(entry.amount_cents, 1200)

    def test_overdue_member_cannot_buy_guest_pass(self):
        with self.assertRaises(billing.BillingError):
            billing.guest_pass(self.roster.get("M-102"), self.ledger)

    def test_prorated_renewal(self):
        entry = renewals.renew(self.roster.get("M-102"), self.ledger, days=12)
        self.assertEqual(entry.amount_cents, 1560)
        self.assertFalse(self.roster.get("M-102").overdue)

    def test_full_renewal_moves_paid_until(self):
        member = self.roster.get("M-104")
        renewals.renew(member, self.ledger)
        self.assertEqual(member.paid_until, "2026-02-28")
        self.assertEqual(self.ledger.balance("M-104"), plans.PLANS["monthly"].price_cents)

    def test_refund_limited_to_balance(self):
        member = self.roster.get("M-101")
        billing.guest_pass(member, self.ledger)
        with self.assertRaises(billing.BillingError):
            billing.refund(member, 5000, "goodwill", self.ledger)
        billing.refund(member, 1200, "goodwill", self.ledger)
        self.assertEqual(self.ledger.balance("M-101"), 0)


if __name__ == "__main__":
    unittest.main()
