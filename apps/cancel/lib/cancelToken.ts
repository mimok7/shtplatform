import { createHash, randomBytes, createHmac, timingSafeEqual } from 'crypto';

const TOKEN_BYTES = 32;
const DEFAULT_TTL_MIN = 30;

export function generateRawToken(): string {
    return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashToken(raw: string): string {
    const pepper = process.env.CANCEL_TOKEN_PEPPER || '';
    return createHmac('sha256', pepper).update(raw).digest('hex');
}

export function getDefaultExpiry(minutes: number = DEFAULT_TTL_MIN): string {
    return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

export function safeEqualHex(a: string, b: string): boolean {
    if (!a || !b || a.length !== b.length) return false;
    try {
        return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
    } catch {
        return false;
    }
}

export function sha256Hex(input: string): string {
    return createHash('sha256').update(input).digest('hex');
}
