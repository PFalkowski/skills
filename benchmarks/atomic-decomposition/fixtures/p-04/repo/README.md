# shipctl

A small command line for parcel shipments: create them, buy labels, fix addresses and
track them. Shipments are kept in `shipments.json` next to `shipctl.py`.

## Use

```
python3 shipctl.py list
python3 shipctl.py show S-1003
python3 shipctl.py create "Mira Holt" "14 Quay Street" 4512 --weight 2.5
python3 shipctl.py label S-1003 --service express
python3 shipctl.py address S-1003 "16 Quay Street" 4512
python3 shipctl.py amend examples/amend.csv
python3 shipctl.py edit S-1003 --set reference=PO-7781
python3 shipctl.py relabel S-1001 --service economy
python3 shipctl.py track S-1001
```

## Shipment life

A shipment starts as `draft`. `label` buys a label and moves it to `labelled`.
`track` shows the scan events for labelled shipments.

## Addresses

`address` sets the delivery address and postcode of one shipment. `amend` reads a CSV
file with the columns `id,address,postcode` and applies every row, so a batch of
corrections from customer service can go in at once:

```
$ python3 shipctl.py amend examples/amend.csv
imported examples/amend.csv: 1 row(s)
```

Postcodes are four digits.

## Editing other fields

`edit ID --set key=value` changes a field such as `reference` or `instructions`.
Give `--set` more than once to change several.

## Services

| Service | Price per kg | Minimum |
|---|---|---|
| economy | 1.20 | 4.50 |
| standard | 1.80 | 6.00 |
| express | 3.10 | 9.50 |

## Tests

```
python3 -m unittest
```
