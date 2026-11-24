# listkeeper

Listkeeper keeps the subscriber list for a community newsletter. It imports sign-up
sheets, merges people who signed up twice, and exports the list for the mailer.

## Use

```
python3 lk.py import samples/signups.csv
python3 lk.py add "dee@example.org" --name "Dee Park"
python3 lk.py list
python3 lk.py export out.csv
python3 lk.py backup backup.json
python3 lk.py restore backup.json
python3 lk.py remove "dee@example.org"
```

The list lives in `subscribers.json`; `--store PATH` uses another file.

## Import

`import` reads a CSV file with the columns `email,name,city,topics`. It cleans every
row, merges rows that share an email address, and adds the result to the list. It
prints how many rows were added, merged and rejected.

```
$ python3 lk.py import samples/signups.csv
added 4, merged 2, rejected 1
```

## Merging

When the same address appears more than once, the merged subscriber takes the first
non-empty value of each field, and the topics of every row.

## Cleaning

Every imported row is cleaned first: the address is trimmed and lowercased, names and
cities get capital initials, and topics are split on `;`, trimmed, lowercased and
de-duplicated. A row is rejected when its address is missing or does not look like an
address.

## Export

`export` writes `email,name,city,topics`, one subscriber per line, sorted by address,
with topics joined by `;`. This is the file the mailer reads.

## Backups

`backup` writes the list as JSON. `restore` replaces the list with a backup.

## Tests

```
python3 -m unittest
```
