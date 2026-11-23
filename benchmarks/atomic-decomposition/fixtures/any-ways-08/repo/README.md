# Invoice import

Reads invoices from a CSV file into the invoices table.
A reference can appear only once: the importer skips references already stored, and `schema.sql` makes the column unique.
Run `python3 importer.py invoices.csv`.
