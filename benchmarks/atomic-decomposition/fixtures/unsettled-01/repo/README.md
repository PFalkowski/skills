# Cleanup job

Removes old records from the store. Scheduled from deploy/cron.txt on the job host.
It takes the store file and today's date, and rewrites the store with the records it keeps.
To see it on the sample data, work on a copy:
`cp sample.json /tmp/demo.json && python3 cleanup.py /tmp/demo.json 2026-01-31`
