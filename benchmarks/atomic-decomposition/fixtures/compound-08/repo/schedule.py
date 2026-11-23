from slots import overlaps


class Calendar:
    def __init__(self):
        self.items = []
        self.next_id = 1

    def book(self, room, start, end):
        wanted = {"room": room, "start": start, "end": end}
        if end <= start or any(overlaps(wanted, item) for item in self.items):
            return None
        wanted["id"] = self.next_id
        self.next_id += 1
        self.items.append(wanted)
        return wanted["id"]

    def cancel(self, booking_id):
        self.items = [item for item in self.items if item["id"] != booking_id]
