# relay

Relay sends alerts to people through several channels: chat, email, SMS and pager.
Each alert has a severity. The severity picks the channels (see `routes.json`), and
every channel has its own settings in `channels.json`.

## Use

```
python3 main.py send --severity normal "Disk usage on build-3 is at 81%"
python3 main.py send --severity high --title "Backups" "Nightly backup did not finish"
python3 main.py batch alerts.txt
python3 main.py channels
python3 main.py routes
python3 main.py check
```

`send` prints one line per delivery: the channel, the recipient and the body that was
sent. Nothing leaves the machine; deliveries go to an in-memory outbox.

## Channels

| Channel | Recipient | Notes |
|---|---|---|
| chat | `#ops` | Plain text. |
| email | `ops@example.com` | Adds a signature. |
| sms | on-call phone | Short bodies only. |
| pager | on-call pager | Repeats until acknowledged. |

`max_length` in `channels.json` is the longest body a channel accepts. Longer text is
cut to fit.

## Quiet hours

With `--at HH:MM`, low and normal alerts skip chat and email between 22:00 and 07:00.
High and critical alerts always go out.

## Batches

`batch` reads one alert per line, `<severity> <text>`, and sends one digest per
severity, highest first. Lines starting with `#` are skipped.

## Templates

`--title` puts a title line in front of the text. Templates live in `relay/templates.py`.

## Tests

```
python3 -m unittest
```
