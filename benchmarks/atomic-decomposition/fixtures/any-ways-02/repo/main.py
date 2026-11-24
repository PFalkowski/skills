import dedupe
import feed
from writer import Writer

rows = sorted(feed.ROWS, key=lambda r: r["ts"])
writer = Writer(2)
writer.write(dedupe.drop_repeats(rows))
print([r["id"] for r in writer.out])
