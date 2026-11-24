import handler
import inbox

calls = []


def flaky(msg):
    calls.append(msg)
    if len(calls) == 1:
        raise ConnectionError("down")


box = inbox.Inbox(3)
box.put("order-5")
box.drain(lambda m: handler.deliver(m, flaky))
print(calls)
print(box.log)
