# Job Runner

A failing job is retried up to 3 times. The pause before retry n is
`base * 2**n` seconds, so with the default base of 1 the pauses are
1, 2 and 4 seconds.

Run `python3 main.py` for a demo with a job that never succeeds.
