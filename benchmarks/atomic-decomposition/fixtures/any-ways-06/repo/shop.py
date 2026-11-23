import orders

if __name__ == "__main__":
    print(orders.place({"sku": "pen", "qty": 4}))
    print(orders.place_bulk([{"sku": "pen", "qty": 2}]))
