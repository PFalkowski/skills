# Retry runner

`run` gives up after 3 attempts. Between attempts it waits 1, 2, then 4
seconds: the wait doubles each time and never exceeds 10 seconds.
