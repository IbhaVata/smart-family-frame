import { randomInt } from 'node:crypto';

/** A secure 6-digit numeric code (e.g. "482913"), matching the example in every V2 UI mock. */
export function generateSixDigitCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}
