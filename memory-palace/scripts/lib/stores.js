'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PalaceError } = require('./errors.js');
const lock = require('./lock.js');

const MARKER = 'pending.';

const pageId = (seed, n) => crypto.createHash('sha256').update(`${seed}:${n}`).digest('hex').slice(0, 32);

function removeIfPresent(file) {
  try {
    fs.unlinkSync(file);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

function folderStore(dir) {
  const pagesDir = path.join(dir, 'pages');
  const metaFile = path.join(dir, 'meta');
  const metaTmp = path.join(dir, 'meta.tmp');
  const pageFile = (id) => path.join(pagesDir, id.slice(0, 2), id);
  const markerFile = (seed) => path.join(dir, `${MARKER}${seed}`);
  let held = null;
  let writing = null;
  let landed = false;

  function read(file, what) {
    try {
      return fs.readFileSync(file);
    } catch (err) {
      if (err.code === 'ENOENT') throw new PalaceError(`${what} is missing`);
      throw err;
    }
  }

  function dropUncommitted(seed) {
    for (let n = 0; fs.existsSync(pageFile(pageId(seed, n))); n++) fs.unlinkSync(pageFile(pageId(seed, n)));
    removeIfPresent(metaTmp);
  }

  const getMeta = () => read(metaFile, 'the meta page');

  return {
    lock: ({ waitMs, command }) => {
      held = lock.acquire(dir, { waitMs, command });
    },
    release: () => {
      const releasing = held;
      held = null;
      return releasing?.release();
    },
    get: (id) => read(pageFile(id), `page ${id}`),
    getMeta,
    begin: (seed) => {
      writing = seed;
      landed = false;
      fs.writeFileSync(markerFile(seed), '');
    },
    put: (id, bytes) => {
      fs.mkdirSync(path.dirname(pageFile(id)), { recursive: true });
      fs.writeFileSync(pageFile(id), bytes);
    },
    setMeta: (bytes) => {
      fs.writeFileSync(metaTmp, bytes);
      fs.renameSync(metaTmp, metaFile);
      landed = true;
    },
    free: (id) => removeIfPresent(pageFile(id)),
    end: () => {
      fs.unlinkSync(markerFile(writing));
      writing = null;
    },
    abort: () => {
      if (!landed) {
        dropUncommitted(writing);
        removeIfPresent(markerFile(writing));
      }
      writing = null;
    },
    repair: (decodeMeta) => {
      const markers = fs
        .readdirSync(dir)
        .filter((name) => name.startsWith(MARKER))
        .map((name) => ({ seed: name.slice(MARKER.length), age: fs.statSync(path.join(dir, name)).mtimeMs }))
        .sort((a, b) => a.age - b.age);
      for (const { seed } of markers) {
        const meta = decodeMeta(getMeta());
        if (meta.seed === seed) meta.free.forEach((id) => removeIfPresent(pageFile(id)));
        else dropUncommitted(seed);
        fs.unlinkSync(markerFile(seed));
      }
    },
    ids: () => (fs.existsSync(pagesDir) ? fs.readdirSync(pagesDir).flatMap((sub) => fs.readdirSync(path.join(pagesDir, sub))) : []),
    close: () => {},
  };
}

const SQLITE_BUSY = 5;
const SCHEMA = `CREATE TABLE IF NOT EXISTS pages (id TEXT PRIMARY KEY, data BLOB NOT NULL) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS meta (one INTEGER PRIMARY KEY CHECK (one = 1), data BLOB NOT NULL);`;

function requireSqlite() {
  try {
    return require('node:sqlite');
  } catch (err) {
    if (err.code !== 'ERR_UNKNOWN_BUILTIN_MODULE') throw err;
    throw new PalaceError(`this palace needs node:sqlite, which Node ${process.version} does not provide. Use a Node version that has it, or the folder backend. Nothing was changed.`);
  }
}

function sqliteStore(dir) {
  const { DatabaseSync } = requireSqlite();
  const file = path.join(dir, 'palace.db');
  let db = null;
  let writer = false;
  let open = false;

  const row = (sql, ...params) => db.prepare(sql).get(...params);
  const run = (sql, ...params) => db.prepare(sql).run(...params);
  const finish = (sql) => {
    db.exec(sql);
    open = false;
  };
  const beginWrite = () => {
    db.exec('BEGIN IMMEDIATE');
    open = true;
    writer = true;
    db.exec(SCHEMA);
  };
  const page = (found, what) => {
    if (!found) throw new PalaceError(`${what} is missing`);
    return Buffer.from(found.data);
  };

  const store = {
    lock: ({ write, waitMs }) => {
      db = new DatabaseSync(file);
      try {
        db.exec(`PRAGMA busy_timeout = ${Number(waitMs)}`);
        db.exec('PRAGMA journal_mode = DELETE');
        db.exec('PRAGMA secure_delete = ON');
        if (write) return beginWrite();
        db.exec('BEGIN');
        open = true;
        writer = false;
        row('SELECT one FROM meta');
      } catch (err) {
        db.close();
        db = null;
        open = false;
        throw err;
      }
    },
    release: () => {
      if (open) finish(writer ? 'ROLLBACK' : 'COMMIT');
    },
    get: (id) => page(row('SELECT data FROM pages WHERE id = ?', id), `page ${id}`),
    getMeta: () => page(row('SELECT data FROM meta WHERE one = 1'), 'the meta page'),
    begin: () => {
      if (!open) beginWrite();
    },
    put: (id, bytes) => run('INSERT INTO pages (id, data) VALUES (?, ?)', id, bytes),
    setMeta: (bytes) => run('INSERT OR REPLACE INTO meta (one, data) VALUES (1, ?)', bytes),
    free: (id) => run('DELETE FROM pages WHERE id = ?', id),
    end: () => finish('COMMIT'),
    abort: () => {
      if (open) finish('ROLLBACK');
    },
    repair: () => {},
    ids: () => db.prepare('SELECT id FROM pages').all().map(({ id }) => id),
    close: () => db?.close(),
  };

  return Object.fromEntries(
    Object.entries(store).map(([name, method]) => [
      name,
      (...args) => {
        try {
          return method(...args);
        } catch (err) {
          if (err.errcode === SQLITE_BUSY) throw new PalaceError(`busy: another memory-palace command is using ${file}. Nothing was changed. Retry later.`);
          throw err;
        }
      },
    ]),
  );
}

module.exports = { folderStore, sqliteStore, requireSqlite, pageId };
