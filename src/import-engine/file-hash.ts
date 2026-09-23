import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { ImportOverrides, BaseReadingSummary } from "./types";

/** Confirming the detected date must not create a second copy of that snapshot. */
export function importIdentityOverrides(
  overrides: ImportOverrides,
  detected: { name: string; reading?: BaseReadingSummary }[],
): ImportOverrides {
  const result = structuredClone(overrides);
  for (const sheet of detected) {
    const choice = result[sheet.name];
    if (choice?.cutoffDate !== undefined && choice.cutoffDate === sheet.reading?.cutoff) {
      delete choice.cutoffDate;
      if (Object.keys(choice).length === 0) delete result[sheet.name];
    }
  }
  return result;
}

/** Keep the v7 file identity byte-for-byte, without requiring Web Crypto/HTTPS.
 * Runs in the Excel worker so hashing a large file cannot block the interface.
 */
export function importFileHash(file: ArrayBuffer, overrides: ImportOverrides = {}): string {
  const originalHash = bytesToHex(sha256(new Uint8Array(file)));
  const identity = new TextEncoder().encode("BASE-DAILY-v7:" + originalHash + JSON.stringify(overrides));
  return bytesToHex(sha256(identity));
}
