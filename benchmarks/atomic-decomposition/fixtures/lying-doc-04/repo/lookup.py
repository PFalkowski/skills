def on_hand(store, sku):
    try:
        return store.stock_of(sku)
    except KeyError:
        return 0
