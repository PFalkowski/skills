import dataclasses
import sys

from mediahub import settings


def main():
    config = settings.load()
    for field in dataclasses.fields(config):
        print(f"{field.name} = {getattr(config, field.name)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
