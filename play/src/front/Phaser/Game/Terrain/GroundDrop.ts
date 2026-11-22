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
