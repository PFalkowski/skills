from orders import parse_order
from samples_v1 import MESSAGES


def main():
    for message in MESSAGES:
        try:
            print("ok", parse_order(message))
        except (ValueError, KeyError) as error:
            print("rejected", message["item"], type(error).__name__)


if __name__ == "__main__":
    main()
