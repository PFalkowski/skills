# rowcache

Keeps the most recent row sets in memory so reports do not hit the loader twice.
`Cache.get` hands each caller its own copy of the rows.
