from basket import Basket

ana = Basket("ana")
ben = Basket("ben")
ana.add("pen", 2)
ben.add("ink")
print(ana.owner, ana.lines, ana.total())
print(ben.owner, ben.lines, ben.total())
