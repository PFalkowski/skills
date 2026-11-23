from settings import ROOT_PAGES


def trail(entries=ROOT_PAGES):
    entries += ("end",)
    return "|".join(entries)
