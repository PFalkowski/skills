# Changes

## 0.4.0

- `restore` replaces the list from a JSON backup.
- `export` writes topics as a semicolon-separated column.

## 0.3.0

- Rows that share an email address are merged into one subscriber.
- Known issue: the merge step writes merged subscribers without the usual checks, so a
  merged subscriber with a blank email address could reach the list.

## 0.2.0

- `add` and `remove` commands.
- Email addresses are compared without case.

## 0.1.0

- First version: `import`, `list` and `export`.
