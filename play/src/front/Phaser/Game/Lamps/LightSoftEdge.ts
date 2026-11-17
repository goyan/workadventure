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
