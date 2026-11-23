from codes import is_valid


def accept(lines):
    return [line for line in lines if is_valid(line)]
