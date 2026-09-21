import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";

export const PASSWORD_MIN_LENGTH = 10;
const BCRYPT_ROUNDS = 12;

export function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// Look-alike characters (0/O, 1/l/I) removed — the Owner shares these by hand.
const SETS = [
  "ABCDEFGHJKLMNPQRSTUVWXYZ",
  "abcdefghijkmnopqrstuvwxyz",
  "23456789",
  "@#$%&*!?",
];

export function generatePassword(length = 14) {
  const all = SETS.join("");
  const chars = SETS.map((set) => set[randomInt(set.length)]);
  while (chars.length < length) chars.push(all[randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

let placeholderHash;
/** Compared against when an account doesn't exist, so response time doesn't reveal valid IDs. */
export async function getPlaceholderHash() {
  placeholderHash ||= await hashPassword("placeholder-for-timing-safety");
  return placeholderHash;
}
