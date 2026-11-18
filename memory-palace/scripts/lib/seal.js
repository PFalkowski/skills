'use strict';

const crypto = require('node:crypto');

const VERSION = 1;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = 1 + NONCE_BYTES + TAG_BYTES;

function deriveKeys(passphrase, { N, r, p, salt }) {
  const bytes = crypto.scryptSync(passphrase, Buffer.from(salt, 'base64'), 64, { N, r, p, maxmem: 256 * N * r });
  return { aead: bytes.subarray(0, 32), check: bytes.subarray(32) };
}

const checkValue = (keys) => crypto.createHmac('sha256', keys.check).update('memory-palace/1/check').digest();

function seal(keys, aad, plain) {
  const nonce = crypto.randomBytes(NONCE_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', keys.aead, nonce).setAAD(Buffer.from(aad));
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([Buffer.of(VERSION), nonce, cipher.getAuthTag(), body]);
}

function open(keys, aad, sealed) {
  if (sealed.length < HEADER_BYTES || sealed[0] !== VERSION) throw new Error('not a sealed page');
  const decipher = crypto
    .createDecipheriv('aes-256-gcm', keys.aead, sealed.subarray(1, 1 + NONCE_BYTES))
    .setAAD(Buffer.from(aad))
    .setAuthTag(sealed.subarray(1 + NONCE_BYTES, HEADER_BYTES));
  return Buffer.concat([decipher.update(sealed.subarray(HEADER_BYTES)), decipher.final()]);
}

module.exports = { deriveKeys, checkValue, seal, open };
