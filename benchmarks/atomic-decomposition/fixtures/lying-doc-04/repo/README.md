# Stock

`Store.stock_of(sku)` raises KeyError for a SKU that was never stocked.

`available(store, sku)` is on-hand stock minus reservations. It raises
KeyError for an unknown SKU, like `stock_of`.
