// Everything about passwords: hashing them and checking them.

import bcrypt from "bcryptjs";

// The bcrypt "cost". Each +1 doubles the work to compute one hash. 12 takes
// a fraction of a second per login, which a person never notices but which
// makes guessing millions of passwords from a stolen database impractical.
const COST = 12;

// bcrypt creates a random salt and stores it inside the hash string, so
// two students with the same password still get different hashes.
export function hashPassword(password) {
  return bcrypt.hash(password, COST);
}

// Re-hashes the attempt with the salt from the stored hash and compares.
export function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}
