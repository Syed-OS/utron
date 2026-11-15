// Unit tests for password hashing.

import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../src/services/passwords.js";

test("the hash is bcrypt with cost 12, and is not the password", async () => {
  const hash = await hashPassword("abcd-efgh-jkmn");
  assert.match(hash, /^\$2[ab]\$12\$/);
  assert.equal(hash.includes("abcd-efgh-jkmn"), false);
});

test("the same password hashes differently each time (random salt)", async () => {
  const first = await hashPassword("abcd-efgh-jkmn");
  const second = await hashPassword("abcd-efgh-jkmn");
  assert.notEqual(first, second);
});

test("verifyPassword accepts the right password and rejects a wrong one", async () => {
  const hash = await hashPassword("abcd-efgh-jkmn");
  assert.equal(await verifyPassword("abcd-efgh-jkmn", hash), true);
  assert.equal(await verifyPassword("abcd-efgh-jkmX", hash), false);
});
