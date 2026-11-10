/**
 * Milestone 0 owner gate (PRD v2 FR-001, FR-032, §13 Security).
 * Call this inside every server-side handler, before reading input or data.
 */
import { createHash, timingSafeEqual } from "node:crypto";

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * True only when `provided` equals the configured secret. Compares fixed-size
 * digests in constant time, so neither length nor content leaks through timing.
 * An unset or empty configured secret rejects every request.
 */
export function isOwnerSecret(
  provided: string | null | undefined,
  expected: string | undefined,
): boolean {
  if (!expected || !provided) return false;
  return timingSafeEqual(digest(provided), digest(expected));
}
