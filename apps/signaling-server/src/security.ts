import { createHash } from 'crypto';

/**
 * Hash a join token using SHA-256
 */
export function hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

/**
 * Verify a join token against its hash
 */
export function verifyToken(token: string, hash: string): boolean {
    return hashToken(token) === hash;
}

/**
 * Generate a cryptographically secure room ID (21 chars, nanoid compatible)
 */
export function generateRoomId(): string {
    const { nanoid } = require('nanoid');
    return nanoid(21);
}

/**
 * Generate a cryptographically secure join token (32 chars)
 */
export function generateJoinToken(): string {
    const { nanoid } = require('nanoid');
    return nanoid(32);
}
