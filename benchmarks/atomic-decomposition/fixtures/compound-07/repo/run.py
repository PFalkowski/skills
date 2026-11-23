from importer import read, report, totals

LINES = [
    "order,customer,amount",
    "1,ana,60.25",
    "2,bo,700",
    "3,zed,15",
    "4,cy,300",
    "5,ana,35.25",
    "6,bo,500",
    "7,cy,",
]

table, rejected = totals(read(LINES))
for name, total in report(table):
    print(name, total)
print("rejected", rejected)
