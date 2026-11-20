'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PalaceError } = require('./errors.js');
const lock = require('./lock.js');

const MARKER = 'pending.';

const pageId = (seed, n) => crypto.createHash('sha256').update(`${seed}:${n}`).digest('hex').slice(0, 32);

function checkId(id) {
  if (typeof id !== 'string' || !/^[0-9a-f]{32}$/.test(id)) {
    throw new PalaceError(`page id ${JSON.stringify(String(id).slice(0, 40))} is not valid: the palace is damaged or altered.`);
  }
  return id;
}

function folderStore(dir) {
  const pagesDir = path.join(dir, 'pages');
  const metaFile = path.join(dir, 'meta');
  const metaTmp = path.join(dir, 'meta.tmp');
  const pageFile = (id) => path.join(pagesDir, checkId(id).slice(0, 2), id);
  const markerFile = (seed) => path.join(dir, `${MARKER}${seed}`);
  let held = null;
  let writer = false;
  let writing = null;
  let landed = false;

  function read(file, what) {
    const stat = fs.lstatSync(file, { throwIfNoEntry: false });
    if (!stat) throw new PalaceError(`${what} is missing`);
    if (!stat.isFile()) throw new PalaceError(`${what} is not a regular file: the palace is damaged or altered.`);
    return fs.readFileSync(file);
  }

  function dropUncommitted(seed) {
    for (let n = 0; fs.existsSync(pageFile(pageId(seed, n))); n++) fs.unlinkSync(pageFile(pageId(seed, n)));
    fs.rmSync(metaTmp, { force: true });
  }

  const getMeta = () => read(metaFile, 'the meta page');

  return {
    lock: ({ write, waitMs, command }) => {
      writer = write;
      held = lock.acquire(dir, { waitMs, command });
    },
    release: () => {
      const releasing = held;
      held = null;
      return releasing?.release();
    },
    checkLock: () => held.check(),
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
      held.check();
      fs.writeFileSync(metaTmp, bytes);
      fs.renameSync(metaTmp, metaFile);
      landed = true;
    },
    free: (id) => fs.rmSync(pageFile(id), { force: true }),
    end: () => {
      fs.unlinkSync(markerFile(writing));
      writing = null;
    },
    abort: () => {
      if (!landed && held.owned()) {
        dropUncommitted(writing);
        fs.rmSync(markerFile(writing), { force: true });
      }
      writing = null;
      return landed;
    },
    repair: (decodeMeta, recordLanded = () => {}, beforeMarkers = () => {}) => {
      const seeds = fs.readdirSync(dir).filter((name) => name.startsWith(MARKER)).map((name) => name.slice(MARKER.length));
      if (seeds.length > 0) beforeMarkers();
      for (const seed of seeds) {
        const meta = decodeMeta(getMeta());
        if (meta.seed === seed) {
          meta.free.forEach((id) => fs.rmSync(pageFile(id), { force: true }));
          recordLanded();
        } else if (writer) {
          dropUncommitted(seed);
        } else {
          continue;
        }
        fs.unlinkSync(markerFile(seed));
      }
    },
    ids: () => (fs.existsSync(pagesDir) ? fs.readdirSync(pagesDir).flatMap((sub) => fs.readdirSync(path.join(pagesDir, sub))) : []),
    close: () => {},
  };
}

module.exports = { folderStore, pageId, checkId };
