/** Side of a tile of the ground, the grain of the fire of the grass, in map pixels. */
const TILE_PX = 32;
/** An animal of the land sees a fire from this far, in map pixels: five tiles. */
export const FIRE_FEAR_PX = 5 * TILE_PX;

/**
 * The fire of a map as the animals see it: the grass that burns, tile by tile, and the trees on fire. Read by the
 * life of the server (Population, Gulls); the water does not burn, so only the animals of the land and the gulls
 * that land look at it.
 */
export interface LifeFire {
    /**
     * The nearest thing on fire within `reachPx` of a point (FIRE_FEAR_PX when absent), in map pixels; undefined
     * when nothing burns there.
     */
    near(x: number, y: number, reachPx?: number): { x: number; y: number } | undefined;
    /** Whether the ground burns at this point. */
    burning(x: number, y: number): boolean;
}

/**
 * The fire the animals see, from the ground (`fireAt` a tile: above 0 when it burns) and the trees on fire (map
 * pixels). A tile on fire counts by its middle.
 */
export function lifeFireOf(
    ground: { fireAt(tileX: number, tileY: number): number },
    trees: () => readonly { x: number; y: number }[] = () => [],
): LifeFire {
    return {
        near(x, y, reachPx = FIRE_FEAR_PX) {
            const reach = Math.ceil(reachPx / TILE_PX);
            let best: { x: number; y: number } | undefined;
            let least = reachPx;
            const tileX = Math.floor(x / TILE_PX);
            const tileY = Math.floor(y / TILE_PX);
            for (let dy = -reach; dy <= reach; dy++) {
                for (let dx = -reach; dx <= reach; dx++) {
                    if (ground.fireAt(tileX + dx, tileY + dy) <= 0) continue;
                    const middleX = (tileX + dx + 0.5) * TILE_PX;
                    const middleY = (tileY + dy + 0.5) * TILE_PX;
                    const far = Math.hypot(middleX - x, middleY - y);
                    if (far < least) {
                        least = far;
                        best = { x: middleX, y: middleY };
                    }
                }
            }
            for (const tree of trees()) {
                const far = Math.hypot(tree.x - x, tree.y - y);
                if (far < least) {
                    least = far;
                    best = { x: tree.x, y: tree.y };
                }
            }
            return best;
        },
        burning(x, y) {
            return ground.fireAt(Math.floor(x / TILE_PX), Math.floor(y / TILE_PX)) > 0;
        },
    };
}
