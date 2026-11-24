from redeem import redeem

used = set()
for code in ["ABC-1234", "abc-1234", "XYZ-99", "QRS-5678\n", "QRS-5678"]:
    print(repr(code), redeem(code, used))
