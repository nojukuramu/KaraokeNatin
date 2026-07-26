/**
 * Security utilities (client-side)
 */

/**
 * Base32-ish alphabet without visually ambiguous characters (0/O, 1/I/L).
 * Room ids can end up read aloud or typed by a guest, so ambiguity costs more
 * than the two bits of entropy dropping these characters loses.
 */
const ID_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * Draw `length` characters from ID_ALPHABET using the platform CSPRNG.
 *
 * Uses rejection sampling: `crypto.getRandomValues` yields bytes 0..255, and
 * taking `% 31` directly would bias toward the first few characters. Bytes
 * landing outside the largest exact multiple of the alphabet size are redrawn.
 */
function randomId(length: number): string {
    const alphabet = ID_ALPHABET;
    const limit = Math.floor(256 / alphabet.length) * alphabet.length;
    let out = '';
    while (out.length < length) {
        const bytes = new Uint8Array(length - out.length);
        crypto.getRandomValues(bytes);
        for (const b of bytes) {
            if (b < limit) out += alphabet[b % alphabet.length];
        }
    }
    return out;
}

/**
 * Room identifier. Short — it is only a lookup key on a host that serves one
 * room, and the join token is what actually authorises entry.
 */
export function generateRoomId(): string {
    return randomId(8);
}

/**
 * Join token. This is the credential that gates room entry, so it is sized for
 * brute-force resistance rather than readability: 26 characters over a
 * 31-character alphabet is ~128 bits.
 *
 * Previously both of these used `Math.random()`, which is not a CSPRNG and is
 * seeded predictably enough to be guessable.
 */
export function generateJoinToken(): string {
    return randomId(26);
}

export async function hashToken(token: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
