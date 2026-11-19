'use strict';

class PalaceError extends Error {}

function parseJson(text, what) {
  try {
    return JSON.parse(text);
  } catch {
    throw new PalaceError(`${what} is not valid JSON`);
  }
}

function describe(err) {
  if (err instanceof PalaceError) return err.message;
  return ['internal error:', err?.name, err?.code, err?.syscall, err?.path].filter(Boolean).join(' ');
}

module.exports = { PalaceError, parseJson, describe };
