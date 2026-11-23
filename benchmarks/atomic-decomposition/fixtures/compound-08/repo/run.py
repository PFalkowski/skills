from schedule import Calendar

cal = Calendar()
print(cal.book("blue", 9, 10))
print(cal.book("blue", 10, 11))
print(cal.book("blue", 9, 11))
print(cal.book("red", 9, 10))
cal.cancel(1)
print(cal.book("blue", 9, 10))
