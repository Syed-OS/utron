// Everything about passwords: making them, hashing them, checking them.

import crypto from "node:crypto";
import bcrypt from "bcryptjs";

// No 0/O, 1/l/I: students copy this out of an email, and those
// characters are easy to misread.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

// The bcrypt "cost". Each +1 doubles the work to compute one hash. 12 takes
// a fraction of a second per login, which a person never notices but which
// makes guessing millions of passwords from a stolen database impractical.
const COST = 12;

// Returns a password shaped like "aB3d-Ef5G-hJ7k".
export function generatePassword() {
  let characters = "";
  for (let i = 0; i < 12; i++) {
    // crypto.randomInt is cryptographically secure. Math.random is not:
    // its output can be predicted, so it must never be used for secrets.
    characters += ALPHABET[crypto.randomInt(ALPHABET.length)];
  }
  // Groups of four are easier to read and type.
  return `${characters.slice(0, 4)}-${characters.slice(4, 8)}-${characters.slice(8, 12)}`;
}

// bcrypt creates a random salt and stores it inside the hash string, so
// two students with the same password still get different hashes.
export function hashPassword(password) {
  return bcrypt.hash(password, COST);
}

// Re-hashes the attempt with the salt from the stored hash and compares.
export function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}
