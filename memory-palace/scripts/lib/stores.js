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
      fs.writeFileSync(markerFile(seed), '');
    },
    put: (id, bytes) => {
      fs.mkdirSync(path.dirname(pageFile(id)), { recursive: true });
      fs.writeFileSync(pageFile(id), bytes);
    },
    setMeta: (bytes) => {
      fs.writeFileSync(metaTmp, bytes);
      fs.renameSync(metaTmp, metaFile);
    },
    free: (id) => removeIfPresent(pageFile(id)),
    end: () => {
      fs.unlinkSync(markerFile(writing));
      writing = null;
    },
    abort: () => {
      dropUncommitted(writing);
      removeIfPresent(markerFile(writing));
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

module.exports = { folderStore, pageId };
