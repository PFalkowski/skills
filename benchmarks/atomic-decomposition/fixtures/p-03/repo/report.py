import argparse
import sys

from portfolio import budget, checks, filters, loader, render, sorting, views


def build_parser(view_names):
    parser = argparse.ArgumentParser(prog="report")
    parser.add_argument("--sort", choices=sorting.FIELDS)
    parser.add_argument("--owner")
    parser.add_argument("--exclude-archived", action="store_true")
    parser.add_argument("--view", default="default", choices=view_names)
    parser.add_argument("--format", default="text", choices=render.FORMATS)
    parser.add_argument("--totals", action="store_true")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--nearly-spent", type=int, metavar="PERCENT")
    return parser


def select(projects, args, view):
    projects = views.apply(view, projects)
    if args.owner:
        projects = filters.by_owner(projects, args.owner)
    if args.exclude_archived:
        projects = filters.exclude_statuses(projects, ["archived"])
    if args.nearly_spent is not None:
        projects = budget.nearly_spent(projects, args.nearly_spent)
    return sorting.sort(projects, args.sort or view.sort)


def main(argv=None):
    all_views = views.load()
    args = build_parser(sorted(all_views)).parse_args(argv)
    if args.check:
        problems = checks.run(loader.load())
        for problem in problems:
            print(problem)
        return 1 if problems else 0
    view = all_views[args.view]
    projects = select(loader.load(), args, view)
    if args.totals:
        print(render.totals(budget.by_owner(projects), budget.totals(projects)), end="")
    else:
        print(render.render(projects, view.columns, args.format), end="")
    return 0


if __name__ == "__main__":
    sys.exit(main())
