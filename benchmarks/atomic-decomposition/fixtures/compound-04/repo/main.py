from workload import run


def main():
    for max_size in (0, 8, 100):
        lookups, counted, size = run(max_size)
        print(max_size, lookups == counted, size <= max_size)


if __name__ == "__main__":
    main()
