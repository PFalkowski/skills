def numeric_key(version):
    major, *rest = version.split(".")
    return (int(major), *rest)
