def shares(cents, n):
    base = cents // n
    return [base] * (n - 1) + [cents - base * (n - 1)]
