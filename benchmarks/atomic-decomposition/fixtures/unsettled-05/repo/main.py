import config
import sender


def always_down(message):
    raise ConnectionError("down")


cfg = config.load()
print("attempts", sender.send("invoice 42 is due", always_down, cfg))
