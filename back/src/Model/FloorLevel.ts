/**
 * The player variable in which the browser of a player publishes the altitude of its avatar on the raised floors of
 * the map (pixels above the ground; see FloorProtocol in play).
 */
export const FLOOR_Z_VARIABLE = "_floorZ";

/** Two floors of a map are at least 12 px apart: within half of it, two altitudes are the same floor. */
const SAME_FLOOR_PX = 6;
const MAX_FLOOR_Z = 2000;

/** The altitude a player variable holds; the ground for anything that is not one. */
export function decodeFloorZ(value: string): number {
    let parsed: unknown;
    try {
        parsed = JSON.parse(value);
    } catch {
        return 0;
    }
    return typeof parsed === "number" && Number.isFinite(parsed) && parsed >= 0 && parsed <= MAX_FLOOR_Z ? parsed : 0;
}

/**
 * Whether two altitudes are the same floor. Halfway up a stair an avatar is on no floor: it talks with nobody, as
 * drawn over people it is not next to.
 */
export function sameFloor(z1: number, z2: number): boolean {
    return Math.abs(z1 - z2) < SAME_FLOOR_PX;
}
