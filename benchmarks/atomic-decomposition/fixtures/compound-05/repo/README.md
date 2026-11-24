# retry

call_with_retry runs a function up to four times in total. Between tries the
wait doubles, starting at one second. Client errors such as 404 are not retried.
