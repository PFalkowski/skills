import sys

from units import parse


def main(argv):
    text = argv[1].strip().lower().rstrip("s")
    try:
        print(int(parse(text)))
    except ValueError:
        print("error")


if __name__ == "__main__":
    main(sys.argv)
