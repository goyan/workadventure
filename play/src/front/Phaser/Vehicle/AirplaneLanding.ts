export interface LandingPoint {
    x: number;
    y: number;
}

/** Search nearby tile centres; the callback checks the whole aircraft footprint and access rights. */
export function findLandingZone(
    origin: LandingPoint,
    tile: { width: number; height: number },
    clear: (point: LandingPoint) => boolean,
): LandingPoint | undefined {
    if (clear(origin)) return origin;
    const col = Math.floor(origin.x / tile.width);
    const row = Math.floor(origin.y / tile.height);
    // Bound work on maps with no safe ground: retry later while holding altitude.
    for (let radius = 1; radius <= 32; radius++) {
        let nearest: LandingPoint | undefined;
        let distance = Infinity;
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
                const point = { x: (col + dx + 0.5) * tile.width, y: (row + dy + 0.5) * tile.height };
                const squared = (point.x - origin.x) ** 2 + (point.y - origin.y) ** 2;
                if (squared < distance && clear(point)) {
                    nearest = point;
                    distance = squared;
                }
            }
        }
        if (nearest) return nearest;
    }
    return undefined;
}
