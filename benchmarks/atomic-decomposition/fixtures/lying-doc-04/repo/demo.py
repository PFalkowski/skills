from api import available
from store import Store

store = Store({"a1": 5})
store.reserve("a1", 2)
print(available(store, "a1"))
