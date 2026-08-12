import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const SCRYPT_PARAMS = Object.freeze({ N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
const PASSWORD_BYTES = 64;

export const normalizeUsername = value => String(value ?? '').trim().toLowerCase();
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const createOpaqueToken = () => randomBytes(32).toString('base64url');
export const createId = prefix => `${prefix}-${randomUUID()}`;

export function validatePasswordPolicy(password) {
  if (typeof password !== 'string' || password.length < 10) return false;
  if (password.length > 256) return false;
  return /[A-Za-z\p{L}]/u.test(password) && /\d/.test(password);
}

export async function derivePassword(password, saltHex = randomBytes(16).toString('hex')) {
  const derived = await scrypt(password, Buffer.from(saltHex, 'hex'), PASSWORD_BYTES, SCRYPT_PARAMS);
  return { saltHex, hashHex: Buffer.from(derived).toString('hex') };
}

export async function verifyPassword(password, saltHex, expectedHashHex) {
  try {
    const { hashHex } = await derivePassword(password, saltHex);
    const actual = Buffer.from(hashHex, 'hex');
    const expected = Buffer.from(expectedHashHex, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function parseCookies(header = '') {
  const output = {};
  for (const pair of header.split(';')) {
    const index = pair.indexOf('=');
    if (index < 0) continue;
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (key) output[key] = decodeURIComponent(value);
  }
  return output;
}

export function sessionCookie(token, { production, maxAgeSeconds }) {
  const secure = production ? '; Secure' : '';
  return `zhirox_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}${secure}`;
}

export function clearSessionCookie({ production }) {
  const secure = production ? '; Secure' : '';
  return `zhirox_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`;
}
