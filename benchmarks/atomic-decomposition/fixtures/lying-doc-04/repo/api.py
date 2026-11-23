from lookup import on_hand


def available(store, sku):
    return max(0, on_hand(store, sku) - store.reserved.get(sku, 0))
