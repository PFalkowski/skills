from vault import MIN_LEN, Vault


def load(vault, lines):
    ok = [line for line in lines if len(line) >= MIN_LEN]
    for line in ok:
        vault.codes.add(line.rstrip())
    return len(ok)
