import unittest

from relay import config
from relay.channels import build
from relay.outbox import Outbox

LONG = "word " * 400


class ChannelTests(unittest.TestCase):
    def setUp(self):
        self.settings = config.load_channels()
        self.outbox = Outbox()

    def send(self, name, text):
        return build(name, self.settings[name], self.outbox).send(text)

    def test_chat_joins_lines(self):
        [d] = self.send("chat", "one\ntwo")
        self.assertEqual(d.body, "one / two")

    def test_chat_cuts_long_text(self):
        [d] = self.send("chat", LONG)
        self.assertEqual(len(d.body), self.settings["chat"]["max_length"])
        self.assertTrue(d.body.endswith("..."))

    def test_email_adds_signature(self):
        [d] = self.send("email", "Backups late")
        self.assertEqual(d.body, "Backups late\n\n-- relay")

    def test_email_cuts_long_text(self):
        [d] = self.send("email", LONG)
        self.assertLessEqual(len(d.body), self.settings["email"]["max_length"])

    def test_sms_is_ascii_and_short(self):
        [d] = self.send("sms", "Café fridge " + LONG)
        self.assertTrue(d.body.startswith("Cafe fridge"))
        self.assertLessEqual(len(d.body), self.settings["sms"]["max_length"])

    def test_pager_repeats_until_acknowledged(self):
        self.assertEqual(len(self.send("pager", "db down")), 3)
        self.outbox.acknowledge("pager:oncall")
        self.assertEqual(self.send("pager", "db down"), [])

    def test_unknown_channel(self):
        with self.assertRaises(KeyError):
            build("fax", {"recipient": "x", "max_length": 20}, self.outbox)


if __name__ == "__main__":
    unittest.main()
