import { TILE_PX } from "@workadventure/map-editor";
import { tileSeed } from "./FlameShape";

/** A tile whose fire is out smokes and glows this long; one that water put out steams this long instead. */
export const SMOULDER_TILE_MS = 45_000;
export const STEAM_MS = 12_000;
/** The embers of a tile that smoulders. */
const EMBERS_A_TILE = 3;

export interface TileBounds {
    fromX: number;
    toX: number;
    fromY: number;
    toY: number;
}

export interface SmoulderingTile {
    x: number;
    y: number;
    /** What is left of it: 1 as the fire goes out, 0 at the end. */
    left: number;
    /** Water put the fire out: white steam, and no embers. */
    steam: boolean;
}

const keyOf = (x: number, y: number): string => `${x},${y}`;

/**
 * The ground a fire has just left, as this browser saw it: a tile whose fire went out between two looks smokes and
 * glows for a while, or steams when water put it out. Only the tiles looked at are followed (the view and around):
 * a tile that left the view is not taken for one whose fire went out. The server tells the fire, not how it ended;
 * this is drawn by each browser from what it saw.
 */
export class SmoulderingGround {
    private burning = new Map<string, { x: number; y: number }>();
    private readonly out = new Map<string, { x: number; y: number; at: number; steam: boolean }>();

    /**
     * Takes the tiles on fire among those looked at (`bounds`, both ends included) at `now`; `wetAt` tells whether
     * water lies on a tile or soaks it.
     */
    public see(
        burning: readonly { x: number; y: number }[],
        bounds: TileBounds,
        now: number,
        wetAt: (x: number, y: number) => boolean,
    ): void {
        const seen = new Map<string, { x: number; y: number }>();
        for (const tile of burning) {
            const key = keyOf(tile.x, tile.y);
            seen.set(key, { x: tile.x, y: tile.y });
            this.out.delete(key);
        }
        for (const [key, tile] of this.burning) {
            if (seen.has(key)) continue;
            const looked =
                tile.x >= bounds.fromX && tile.x <= bounds.toX && tile.y >= bounds.fromY && tile.y <= bounds.toY;
            if (looked) this.out.set(key, { ...tile, at: now, steam: wetAt(tile.x, tile.y) });
        }
        this.burning = seen;
    }

    /** The tiles that still smoulder or steam at `now`. */
    public tiles(now: number): SmoulderingTile[] {
        const tiles: SmoulderingTile[] = [];
        for (const [key, tile] of this.out) {
            const left = 1 - (now - tile.at) / (tile.steam ? STEAM_MS : SMOULDER_TILE_MS);
            if (left <= 0) this.out.delete(key);
            else tiles.push({ x: tile.x, y: tile.y, left: Math.min(1, left), steam: tile.steam });
        }
        return tiles;
    }

    public active(now: number): boolean {
        return this.tiles(now).length > 0;
    }

    /** Whether there is anything to follow: a tile seen on fire at the last look, or one that smoulders. */
    public watching(): boolean {
        return this.burning.size > 0 || this.out.size > 0;
    }

    public clear(): void {
        this.burning.clear();
        this.out.clear();
    }
}

/**
 * The embers of a tile that smoulders (map pixels, and how bright): a few red points, always at the same places for
 * a tile, that die one after another as `left` goes from 1 to 0.
 */
export function smoulderPoints(tileX: number, tileY: number, left: number): { x: number; y: number; alpha: number }[] {
    const points: { x: number; y: number; alpha: number }[] = [];
    const seed = tileSeed(tileX, tileY);
    for (let ember = 0; ember < EMBERS_A_TILE; ember++) {
        // Each lives a share of the smouldering: the first the whole of it, the last a third.
        const life = left - (ember / EMBERS_A_TILE) * 0.85;
        if (life <= 0) continue;
        points.push({
            x: (tileX + 0.15 + 0.7 * ((seed * (17 + ember * 13)) % 1)) * TILE_PX,
            y: (tileY + 0.3 + 0.6 * ((seed * (29 + ember * 7)) % 1)) * TILE_PX,
            alpha: Math.min(1, life * 2.5),
        });
    }
    return points;
}
