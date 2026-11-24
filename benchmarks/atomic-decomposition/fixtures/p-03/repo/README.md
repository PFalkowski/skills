# portfolio

A small report over the projects in `projects.csv`: who owns each one, its status,
its budget and what it has spent so far.

## Use

```
python3 report.py
python3 report.py --sort spent
python3 report.py --owner "M. Ilic"
python3 report.py --exclude-archived
python3 report.py --view finance
python3 report.py --format csv
python3 report.py --totals
```

Example:

```
$ python3 report.py --owner "S. Noor" --view finance
id    name             budget   spent    left  used
P-05  Tram stop signs  22,000       0  22,000    0%
P-10  River clean-up   26,000   9,800  16,200   38%
P-02  Library app      15,000  14,920      80   99%
3 projects
```

## Options

| Option | Effect |
|---|---|
| `--sort FIELD` | Sort by `name`, `owner`, `budget`, `spent` or `left`. Default `name`. |
| `--owner NAME` | Only projects with this owner. |
| `--exclude-archived` | Leave archived projects out. |
| `--view NAME` | Use a view from `views.ini`. Default `default`. |
| `--format text\|csv` | Output format. Default `text`. |
| `--check` | Print data problems instead of the list; exit 1 if there are any. |
| `--totals` | Print budget and spending per owner instead of the list. |
| `--nearly-spent PERCENT` | Only projects that have used at least this share of their budget. |

## Views

A view in `views.ini` names the columns to show and their order. `finance` shows the
money columns, for example. Add a section to make your own.

## Data

`projects.csv` has one row per project. Status codes: `ACT` active, `PAU` paused,
`PRO` proposed, `ARC` archived. Amounts are whole euros.

## Tests

```
python3 -m unittest
```
