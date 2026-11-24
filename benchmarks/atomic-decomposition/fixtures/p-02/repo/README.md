# dues

Membership billing for a small climbing gym. It keeps members, plans and a ledger of
charges and refunds. All money inside the program is kept in whole cents.

## Use

```
python3 main.py members
python3 main.py signup "Ada Byrne" monthly
python3 main.py renew M-102 --days 12
python3 main.py guest M-101
python3 main.py jobs
python3 main.py ledger
```

Every command starts from the data in `members.json`, applies its change in memory and
prints the ledger lines it added. Nothing is written back.

## Money

`dues/money.py` turns text such as `"12.50"` into cents and back. `billing.charge`
and `billing.refund` take amounts in cents and write ledger entries.

## Scheduled jobs

`schedule.json` lists the jobs `python3 main.py jobs` runs, such as the reminder for
members whose card is about to expire. A job with a `day` runs only on that day of the
month; `--day` picks the day (default 1). A job without one runs every day.

```
$ python3 main.py jobs
card-reminder	M-103	to Lena Oduya: Your card expires soon.
overdue-reminder	M-102	to Tom Achebe: Your membership is overdue.
overdue-reminder	M-104	to Piet Varga: Your membership is overdue.
```

## Plans

| Plan | Price |
|---|---|
| monthly | 59.00 |
| student | 39.00 |
| off-peak | 45.00 |

New members also pay a joining fee of 25.00.

## Tests

```
python3 -m unittest
```
