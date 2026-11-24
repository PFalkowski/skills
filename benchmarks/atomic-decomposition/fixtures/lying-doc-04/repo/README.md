# Service Settings

Settings come from `settings.json`. Environment variables named
`APP_<KEY>` are read as plain text and fill in only keys that the file
leaves out. Any non-empty value of a flag turns it on.

Run `python3 main.py` to print the settings in use.
