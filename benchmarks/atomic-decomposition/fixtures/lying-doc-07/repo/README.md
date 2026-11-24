# Settings

Values come from built-in defaults, then the JSON config file, then the
environment. A variable named `APP_<KEY>` overrides the file and is
converted to the type of that key's default. For yes/no keys, `APP_DEBUG=0`
or `APP_DEBUG=false` turns the key off.
