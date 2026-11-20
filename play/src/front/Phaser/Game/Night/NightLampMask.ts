import type { RgbLampLight } from "../../../Stores/RgbLampStore";

/** A lamp whose light changed counts as moving for this many drawings of the veil: it may change again at the next. */
export const MOVING_DRAWINGS = 30;
/** Under this many steady lamps, a mask is not worth its own drawing: they are pierced one by one. */
export const MASK_FROM_LAMPS = 8;

const signatureOf = (lamp: RgbLampLight): string =>
    `${lamp.id}:${lamp.revision}:${lamp.x}:${lamp.y}:${lamp.size}:${lamp.textureKey}:${lamp.intensity ?? 1}`;

/**
 * Tells the lamps whose light stays the same from one drawing of the night veil to the next (`steady`) from the
 * ones that change (`moving`: a lamp that turns, a torch that flickers or is carried). The veil is pierced with the
 * light of every lamp; on a map of hundreds of lamps one turning lamp made every hole pierced again at every image.
 * The steady ones are pierced once into a mask that is kept (`key` changes when the mask must be made again); only
 * the moving ones are pierced again each time.
 */
export class LampSteadiness {
    /** For each lamp: its light as last seen, and how many more drawings it counts as moving. */
    private readonly seen = new Map<string, { signature: string; moving: number }>();

    public split(lamps: readonly RgbLampLight[]): { steady: RgbLampLight[]; moving: RgbLampLight[]; key: string } {
        const steady: RgbLampLight[] = [];
        const moving: RgbLampLight[] = [];
        const keys: string[] = [];
        const present = new Set<string>();
        for (const lamp of lamps) {
            present.add(lamp.id);
            const signature = signatureOf(lamp);
            const before = this.seen.get(lamp.id);
            let left = before ? Math.max(0, before.moving - 1) : 0;
            // A lamp never seen is steady until it changes: a map loads with all its lamps at once.
            if (before && before.signature !== signature) left = MOVING_DRAWINGS;
            this.seen.set(lamp.id, { signature, moving: left });
            if (left > 0) {
                moving.push(lamp);
            } else {
                steady.push(lamp);
                keys.push(signature);
            }
        }
        for (const id of this.seen.keys()) if (!present.has(id)) this.seen.delete(id);
        return { steady, moving, key: keys.join("|") };
    }

    public reset(): void {
        this.seen.clear();
    }
}
