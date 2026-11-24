# Upload store

Files live under /srv/uploads. `target` rejects any name whose resolved
path does not start with the uploads folder, and every write goes
through it.
