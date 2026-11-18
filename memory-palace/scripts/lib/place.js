'use strict';

const { PalaceError } = require('./errors.js');

const SEPARATOR = '\0';
const LIMITS = { place: 256, title: 120, summary: 400, text: 32000, kind: 32 };
const MAX_SEGMENTS = 16;

function parsePlace(place) {
  const nfc = place.normalize('NFC');
  if (nfc.startsWith('/') || nfc.endsWith('/')) throw new PalaceError('a place cannot start or end with /');
  const segments = nfc.split('/');
  for (const segment of segments) {
    if (segment === '') throw new PalaceError('a place cannot have an empty segment');
    if (segment === '.' || segment === '..') throw new PalaceError('a place segment cannot be . or ..');
    if (/[\u0000-\u001f\u007f]/.test(segment)) throw new PalaceError('a place cannot hold a control character');
  }
  if (nfc.length > LIMITS.place) throw new PalaceError(`place is longer than ${LIMITS.place} characters`);
  if (segments.length > MAX_SEGMENTS) throw new PalaceError(`place has more than ${MAX_SEGMENTS} segments`);
  return segments.join(SEPARATOR);
}

const showPlace = (key) => key.split(SEPARATOR).join('/');
const rangeOf = (key) => [key, `${key}\u0001`];
const childPrefix = (key) => `${key}${SEPARATOR}`;

function checkLimits(memory) {
  parsePlace(memory.place);
  for (const field of ['title', 'summary', 'text', 'kind']) {
    if (memory[field].normalize('NFC').length > LIMITS[field]) {
      throw new PalaceError(`${field} is longer than ${LIMITS[field]} characters`);
    }
  }
}

module.exports = { parsePlace, showPlace, rangeOf, childPrefix, checkLimits };
