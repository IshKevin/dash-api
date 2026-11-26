import { normalizePhone } from '../services/surveyParser';

/**
 * Rwandan mobile number in any common spelling (0788 123 456, 788123456,
 * +250 788-123-456, 250788123456) → +250788123456, the one format phones are
 * stored and looked up in. Returns null when it is not a Rwandan mobile number.
 */
export function toRwandaPhone(input: unknown): string | null {
  return normalizePhone(input) ?? null;
}

/** Normalise when recognisable, otherwise keep what was typed (non-Rwandan numbers). */
export function normalizePhoneForStorage(input: unknown): string | null {
  if (input === null || input === undefined || String(input).trim() === '') return null;
  return toRwandaPhone(input) ?? String(input).trim();
}

export const looksLikePhone = (s: string) => !s.includes('@') && /^[+\d][\d\s\-()]{7,}$/.test(s.trim());
