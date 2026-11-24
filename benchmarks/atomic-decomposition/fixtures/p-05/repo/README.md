# mediahub

Mediahub stores files that users upload and keeps an index of them in
`uploads/index.csv`. This repository holds the cleanup job and the tools around it.

## Cleanup

`cleanup.py` removes uploads that are older than `retention_days`. It runs every night
on the server (see `deploy/`). Without `--apply` it only lists what it would remove.

```
python3 cleanup.py --today 2026-03-01
python3 cleanup.py --today 2026-03-01 --apply
```

`--today` is the date the job treats as today, so runs are repeatable. `--owner NAME`
limits a run to one owner. At most `max_batch` uploads go in one run; the oldest go
first.

Example:

```
$ python3 cleanup.py --today 2026-03-01
u-001	kira	holiday.jpg	2026-01-02
u-002	kira	receipt.pdf	2026-01-20
u-003	omar	demo.mp4	2026-01-28
would remove 3 upload(s), 50608761 bytes, retention 30 days
```

An upload exactly `retention_days` old is kept.

With `report = json` the job prints one line instead:

```
{"action": "would remove", "retention_days": 30, "uploads": ["u-001", "u-002", "u-003"], "bytes": 50608761}
```

## The index

`uploads/index.csv` has the columns `id,owner,name,size,uploaded`. Sizes are bytes and
dates are `YYYY-MM-DD`. Ids must be unique. Cleanup rewrites the file when it removes
uploads.

## Settings

Settings are read from `config/defaults.ini`. A second file can override any of them;
see `mediahub/settings.py`.

| Setting | Default | Meaning |
|---|---|---|
| `retention_days` | 30 | Uploads older than this many days are removed. |
| `index` | `uploads/index.csv` | The upload index. |
| `max_batch` | 500 | Most uploads removed in one run. |
| `report` | `text` | `text` or `json` output. |
| `quota_mb` | 50 | Space each owner may use before `stats.py --over-quota` lists them. |

## Other tools

```
python3 stats.py
python3 stats.py --over-quota
python3 settings_dump.py
```

`stats.py` prints counts and sizes per owner. `settings_dump.py` prints the settings
the job would use.

## Deploying

`deploy/install.sh` copies the code to `/opt/mediahub`, installs the systemd service
and timer from `deploy/`, and starts the timer. The timer runs the service at 03:15
every night.

## Tests

```
python3 -m unittest
```
