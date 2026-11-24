import unittest

from dues import jobs, members, signup
from dues.ledger import Ledger


class SignupTests(unittest.TestCase):
    def setUp(self):
        self.roster, self.ledger = members.load(), Ledger()

    def test_join_charges_plan_and_joining_fee(self):
        member = signup.join(self.roster, self.ledger, "  Ada   Byrne ", "monthly")
        self.assertEqual(member.id, "M-105")
        self.assertEqual(member.name, "Ada Byrne")
        self.assertEqual(self.ledger.balance(member.id), 5900 + 2500)

    def test_unknown_plan(self):
        with self.assertRaises(ValueError):
            signup.join(self.roster, self.ledger, "Ada", "yearly")


class JobTests(unittest.TestCase):
    def setUp(self):
        self.roster, self.ledger = members.load(), Ledger()

    def test_schedule_loads(self):
        names = [job["name"] for job in jobs.load()]
        self.assertIn("card-reminder", names)

    def test_card_reminder_reaches_expiring_cards(self):
        job = {"name": "card-reminder", "action": "remind", "filter": "card_expiring",
               "text": "Card expires soon."}
        lines = jobs.run(job, self.roster, self.ledger)
        self.assertEqual([line.split("\t")[1] for line in lines], ["M-103"])
        self.assertEqual(self.ledger.entries, [])

    def test_day_one_runs_reminders_only(self):
        lines = jobs.run_all(self.roster, self.ledger, day=1)
        self.assertEqual(len(lines), 3)
        self.assertEqual(self.ledger.entries, [])

    def test_day_out_of_range(self):
        with self.assertRaises(ValueError):
            jobs.run_all(self.roster, self.ledger, day=31)

    def test_unknown_filter(self):
        with self.assertRaises(KeyError):
            jobs.run({"name": "x", "action": "remind", "filter": "nobody", "text": "t"},
                     self.roster, self.ledger)


if __name__ == "__main__":
    unittest.main()
