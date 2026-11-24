def load(hall, lines):
    for line in lines:
        user, label = line.split(",")
        seat = label.strip().upper()
        if seat in hall.booked:
            raise ValueError("taken")
        hall.booked[seat] = user
