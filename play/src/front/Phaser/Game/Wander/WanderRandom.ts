const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * FNV-1a (32 bits) of `${entityId}:${leg}:${attempt}`. Every client must get the same value, so only 32-bit integer
 * arithmetic is used (Math.imul, >>> 0).
 */
export function wanderSeed(entityId: string, leg: number, attempt: number): number {
    const text = `${entityId}:${leg}:${attempt}`;
    let hash = FNV_OFFSET_BASIS;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, FNV_PRIME);
    }
    return hash >>> 0;
}

/** mulberry32: small seeded PRNG returning numbers in [0, 1). */
export function mulberry32(seed: number): () => number {
    let state = seed | 0;
    return () => {
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
