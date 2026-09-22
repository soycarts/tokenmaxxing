/**
 * Link codes: 8 characters from a 32-symbol alphabet with the lookalikes (0/O, 1/I) removed.
 * 256 is a multiple of 32, so taking a random byte modulo 32 has no bias.
 * The CLI generates the code; the site validates it and stores the row on confirm.
 */
export const LINK_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const LINK_CODE_LENGTH = 8;
const LINK_CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/;

export function generateLinkCode(
  random: (bytes: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b),
): string {
  const bytes = random(new Uint8Array(LINK_CODE_LENGTH));
  let code = "";
  for (const byte of bytes) code += LINK_CODE_ALPHABET[byte % LINK_CODE_ALPHABET.length];
  return code;
}

/** Uppercases and strips spaces/dashes so `abcd-2345` pasted by hand still works. */
export function normalizeLinkCode(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase().replace(/[\s-]/g, "");
  return LINK_CODE_RE.test(code) ? code : null;
}

export function isValidLinkCode(code: string): boolean {
  return LINK_CODE_RE.test(code);
}
