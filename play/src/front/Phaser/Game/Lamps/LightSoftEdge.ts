/**
 * How far the edge of the lights of the map (RGB lamps, torches) is softened, in map pixels: a personal setting, set
 * by the night (NightManager) and read by each light when it is drawn. A real lamp has a size: the edge of its shadows
 * is a penumbra, not a line.
 */
let softEdgePx = 0;
let version = 0;

export function setLightSoftEdgePx(px: number): void {
    if (px !== softEdgePx) {
        softEdgePx = px;
        version++;
    }
}

export function lightSoftEdgePxNow(): number {
    return softEdgePx;
}

/** Changes whenever the softening changes: the lights are then drawn again. */
export function lightSoftEdgeVersion(): number {
    return version;
}

/** The share of its light a wall sends back (see bounceSources), a personal setting too; 0: none. */
let bounceStrength = 0;

export function setLightBounceStrength(strength: number): void {
    if (strength !== bounceStrength) {
        bounceStrength = strength;
        // The same version as the softening: the lights are drawn again, with their bounces.
        version++;
    }
}

export function lightBounceStrengthNow(): number {
    return bounceStrength;
}
