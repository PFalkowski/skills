import datetime


def parse(text):
    try:
        return datetime.date.fromisoformat(text.strip())
    except ValueError:
        raise ValueError(f"expected YYYY-MM-DD, got {text!r}") from None


def age_in_days(uploaded, today):
    if uploaded > today:
        return 0
    return (today - uploaded).days
