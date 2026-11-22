import type { TerrainData } from "@workadventure/map-editor";
import { heightAtPoint, shiftOfHeight } from "./ReliefProjection";

/**
 * How much lower than its place what stands or lies on the ground is drawn, with the relief seen in 3/4
 * (ReliefProjection): as much as the ground under its foot, negative on a mount (drawn higher). The ground alone: what
 * floats takes the drop of the surface of the water (surfaceDropAt). Only the drawing moves: the place of a thing, its
 * collisions, its depth and what the server knows never do.
 */
export function groundDropOf(terrain: TerrainData | undefined, x: number, y: number): number {
    if (!terrain) return 0;
    return shiftOfHeight(heightAtPoint(terrain, x, y));
}

/**
 * The drops of the things that do not move at each image (the objects of a map: thousands), kept until the thing
 * moves or the relief changes (`version`).
 */
export class DropCache<K> {
    private readonly kept = new Map<K, { x: number; y: number; version: number; drop: number }>();

    public dropOf(key: K, x: number, y: number, version: number, read: (x: number, y: number) => number): number {
        const kept = this.kept.get(key);
        if (kept && kept.x === x && kept.y === y && kept.version === version) return kept.drop;
        const drop = read(x, y);
        this.kept.set(key, { x, y, version, drop });
        return drop;
    }

    public forget(key: K): void {
        this.kept.delete(key);
    }

    public clear(): void {
        this.kept.clear();
    }
}

/**
 * Whether an object of the map stands on the ground, and so follows it where the relief is seen in 3/4: a tree, a
 * desk, a bench. Not the pieces of the Carte tool (floors, walls, slabs, stairs, bridges: a building moved piece by
 * piece would tear, and the tiles under it never move), nor what is always under or over everything (a rug, a
 * ceiling lamp), nor what is above the ground (on a raised floor, hung on a wall: it passes over the relief).
 */
export function standsOnGround(thing: { cartePiece: boolean; layer: string | undefined; elevation: number }): boolean {
    if (thing.cartePiece || thing.elevation > 0) return false;
    return thing.layer !== "floor" && thing.layer !== "overhead";
}

/** Where an object stands: the middle of its bottom edge (its place is its top left corner). */
export function footOf(thing: { x: number; y: number; displayWidth: number; displayHeight: number }): {
    x: number;
    y: number;
} {
    return { x: thing.x + thing.displayWidth / 2, y: thing.y + thing.displayHeight };
}

/** An object of the map as its drop is kept (an `Entity` fits). */
export interface PlacedThing {
    x: number;
    y: number;
    displayWidth: number;
    displayHeight: number;
    standsOnGround(): boolean;
    setGroundDrop(drop: number): void;
    getGroundDrop(): number;
}

/** A thing that moved, or one added by another player, is seen within this long. */
const REREAD_MS = 500;

/**
 * The drops of the objects of a map: read when the relief or the mode changes, and again twice a second (an object
 * moved or added by another player), each one kept while it stays in place. Only the objects whose drop is not
 * nothing are listed (`moved`): on a map of thousands of objects, a few stand on a relief.
 */
export class PlacedDrops<T extends PlacedThing> {
    private readonly cache = new DropCache<T>();
    private list: T[] = [];
    private readAt = -Infinity;
    private readVersion: number | undefined;

    constructor(
        private readonly deps: {
            things: () => Iterable<T>;
            version: () => number;
            /** Whether the relief is shown in 3/4: else nothing is moved, and nothing is read. */
            shown: () => boolean;
            dropAt: (x: number, y: number) => number;
        },
    ) {}

    public update(now: number): void {
        const version = this.deps.version();
        const changed = version !== this.readVersion;
        const shown = this.deps.shown();
        if (!changed && (!shown || now - this.readAt < REREAD_MS)) return;
        this.readVersion = version;
        this.readAt = now;
        if (changed) this.cache.clear();
        if (!shown) {
            for (const thing of this.list) thing.setGroundDrop(0);
            this.list = [];
            return;
        }
        const list: T[] = [];
        for (const thing of this.deps.things()) {
            let drop = 0;
            if (thing.standsOnGround()) {
                const foot = footOf(thing);
                drop = this.cache.dropOf(thing, foot.x, foot.y, version, this.deps.dropAt);
            }
            if (drop !== thing.getGroundDrop()) thing.setGroundDrop(drop);
            if (drop !== 0) list.push(thing);
        }
        this.list = list;
    }

    /** The objects drawn lower or higher than their place now. */
    public moved(): readonly T[] {
        return this.list;
    }

    public destroy(): void {
        for (const thing of this.list) thing.setGroundDrop(0);
        this.list = [];
        this.cache.clear();
    }
}

/**
 * The hit test of an object drawn lower than its place: Phaser tests the pointer against the place of the object,
 * which never moves; the rows it gives (in the pixels of the object) are brought back by its drop, so that the object
 * is clicked where it is seen.
 */
export function hitWhereDrawn<A, O extends { scaleY: number }>(
    test: (area: A, x: number, y: number, object: O) => boolean,
    drop: () => number,
): (area: A, x: number, y: number, object: O) => boolean {
    return (area, x, y, object) => {
        const by = drop();
        return test(area, x, by === 0 ? y : y - by / (object.scaleY || 1), object);
    };
}
