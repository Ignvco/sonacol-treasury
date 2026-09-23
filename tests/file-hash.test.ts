import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { importFileHash } from "../src/import-engine/file-hash";
import type { ImportOverrides } from "../src/import-engine/types";

function previousIdentity(file: Uint8Array, overrides: ImportOverrides = {}) {
  const original = createHash("sha256").update(file).digest("hex");
  return createHash("sha256").update("BASE-DAILY-v7:" + original + JSON.stringify(overrides)).digest("hex");
}

test("file identity: portable hashing preserves native v7 SHA-256 for binary and large files", () => {
  for (const size of [0, 1, 55, 56, 63, 64, 65, 127, 128, 129, 3 * 1024 * 1024 + 1]) {
    const bytes = Uint8Array.from({ length: size }, (_, i) => (i * 31) % 256);
    assert.equal(importFileHash(bytes.buffer), previousIdentity(bytes), `size ${size}`);
  }
});

test("file identity: omitted and empty options match, changed file bytes stay distinct", () => {
  const bytes = new TextEncoder().encode("BASE · Proyección · $14.457.712,22");
  const original = importFileHash(bytes.buffer);
  assert.equal(original, previousIdentity(bytes));
  assert.equal(original, importFileHash(bytes.buffer, {}));
  bytes[0] ^= 1;
  assert.notEqual(original, importFileHash(bytes.buffer));
});

test("file identity: mapping options retain the previous serialized identity", () => {
  const bytes = new Uint8Array([0, 255, 80, 75, 3, 4]);
  const options: ImportOverrides = { BASE: { headerIndex: 4, numberLocale: "es-CL" } };
  assert.equal(importFileHash(bytes.buffer, options), previousIdentity(bytes, options));
  assert.notEqual(importFileHash(bytes.buffer, options), importFileHash(bytes.buffer));
});
