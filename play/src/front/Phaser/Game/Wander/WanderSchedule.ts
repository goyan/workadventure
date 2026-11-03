import { mulberry32, wanderSeed } from "./WanderRandom";

export type Point = { x: number; y: number };
export type WanderDirection = "down" | "left" | "right" | "up";

export interface WanderPose {
    x: number;
    y: number;
    direction: WanderDirection;
    moving: boolean;
}

export interface WanderMap {
    /** Tile coordinates. Must return false outside the grid. */
    isWalkable(tile: Point): boolean;
    /** Pixel coordinates. Resolves to [] when the destination is unreachable. */
    findPath(from: Point, to: Point): Promise<Point[]>;
}

export const LEG_MS = 20_000;
export const MIN_PAUSE_MS = 3_000;
export const RADIUS_TILES = 10;
export const SPEED_PX_PER_S = 64;
export const MAX_ATTEMPTS = 8;
export const TILE_SIZE = 32;

/**
 * Per entity shift of the leg boundaries, in [0, LEG_MS): the characters do not all start a new leg (and compute their
 * paths) in the same frame. It only depends on the entity id, so it is the same on every client.
 */
export function wanderLegOffset(entityId: string): number {
    return wanderSeed(entityId, 0, 0) % LEG_MS;
}

interface Leg {
    points: Point[];
    // Cumulative distance of each point from the first one.
    distances: number[];
    speed: number;
}

/**
 * Deterministic wandering around a nest. The timeline is cut into legs of LEG_MS, shifted by a per entity offset; the
 * destination of a leg only depends on (entityId, leg number, nest, map), so every client computes the same positions
 * without any network exchange.
 * Leg k walks from destination(k - 1) to destination(k), then pauses.
 */
export class WanderSchedule {
    private generation = 0;
    private legs = new Map<number, Leg | "pending">();
    private destinations = new Map<number, Promise<Point>>();
    private readonly legOffset: number;

    constructor(
        private readonly entityId: string,
        private nest: Point,
        private readonly map: WanderMap,
    ) {
        this.legOffset = wanderLegOffset(entityId);
    }

    /**
     * Synchronous and never throws. Returns undefined while the current leg is being computed (the computation is
     * started here): the caller keeps the sprite where it is.
     */
    public poseAt(nowMs: number): WanderPose | undefined {
        // Leg k runs from k * LEG_MS - legOffset to (k + 1) * LEG_MS - legOffset.
        const shiftedMs = nowMs + this.legOffset;
        const leg = Math.floor(shiftedMs / LEG_MS);
        const entry = this.legs.get(leg);
        if (entry === undefined) {
            this.compute(leg);
            return undefined;
        }
        if (entry === "pending") {
            return undefined;
        }
        // Prefetch the next leg so that the transition does not wait for the pathfinding.
        if (!this.legs.has(leg + 1)) {
            this.compute(leg + 1);
        }
        return this.poseOnLeg(entry, shiftedMs - leg * LEG_MS);
    }

    public setNest(nest: Point): void {
        this.nest = nest;
        this.reset();
    }

    public reset(): void {
        this.generation++;
        this.legs.clear();
        this.destinations.clear();
    }

    private compute(leg: number): void {
        const generation = this.generation;
        this.prune(leg);
        this.legs.set(leg, "pending");
        this.computeLeg(leg).then(
            (result) => {
                // A reset happened meanwhile: the result is based on stale data.
                if (generation === this.generation) {
                    this.legs.set(leg, result);
                }
            },
            () => {
                if (generation === this.generation) {
                    // Retry on the next poseAt.
                    this.legs.delete(leg);
                }
            },
        );
    }

    // Keeps at most the legs leg - 1, leg and leg + 1.
    private prune(leg: number): void {
        for (const map of [this.legs, this.destinations] as Map<number, unknown>[]) {
            for (const key of [...map.keys()]) {
                if (key < leg - 1 || key > leg + 1) {
                    map.delete(key);
                }
            }
        }
    }

    private destination(leg: number): Promise<Point> {
        let promise = this.destinations.get(leg);
        if (!promise) {
            promise = this.computeDestination(leg);
            this.destinations.set(leg, promise);
        }
        return promise;
    }

    private async computeDestination(leg: number): Promise<Point> {
        const nest = this.nest;
        const nestTile = { x: Math.floor(nest.x / TILE_SIZE), y: Math.floor(nest.y / TILE_SIZE) };
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            const random = mulberry32(wanderSeed(this.entityId, leg, attempt));
            const dx = Math.floor(random() * (2 * RADIUS_TILES + 1)) - RADIUS_TILES;
            const dy = Math.floor(random() * (2 * RADIUS_TILES + 1)) - RADIUS_TILES;
            const tile = { x: nestTile.x + dx, y: nestTile.y + dy };
            if (!this.safeIsWalkable(tile)) {
                continue;
            }
            if (dx === 0 && dy === 0) {
                return nest;
            }
            const centre = { x: tile.x * TILE_SIZE + TILE_SIZE / 2, y: tile.y * TILE_SIZE + TILE_SIZE / 2 };
            // Attempts are sequential on purpose: the first valid one wins.
            // eslint-disable-next-line no-await-in-loop
            const path = await this.safeFindPath(nest, centre);
            if (path.length > 0) {
                return centre;
            }
        }
        return nest;
    }

    private async computeLeg(leg: number): Promise<Leg> {
        const [start, end] = await Promise.all([this.destination(leg - 1), this.destination(leg)]);
        const points: Point[] = [start];
        if (start.x !== end.x || start.y !== end.y) {
            const path = await this.safeFindPath(start, end);
            if (path.length > 0) {
                points.push(...path);
                const last = points[points.length - 1];
                if (last.x !== end.x || last.y !== end.y) {
                    // Make sure the leg ends exactly where the next one starts.
                    points.push(end);
                }
            }
        }
        const distances = [0];
        for (let i = 1; i < points.length; i++) {
            distances.push(distances[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
        }
        const length = distances[distances.length - 1];
        const speed = Math.max(SPEED_PX_PER_S, length / ((LEG_MS - MIN_PAUSE_MS) / 1000));
        return { points, distances, speed };
    }

    private poseOnLeg(leg: Leg, elapsedMs: number): WanderPose {
        const { points, distances } = leg;
        const total = distances[distances.length - 1];
        const travelled = (leg.speed * elapsedMs) / 1000;
        const moving = travelled < total;
        const target = moving ? travelled : total;

        // Index of the segment [i, i + 1] containing the target distance, skipping zero-length segments.
        let segment = -1;
        for (let i = 0; i < points.length - 1; i++) {
            if (distances[i + 1] === distances[i]) {
                continue;
            }
            segment = i;
            if (target < distances[i + 1]) {
                break;
            }
        }

        if (segment === -1) {
            return { x: points[0].x, y: points[0].y, direction: "down", moving: false };
        }
        const from = points[segment];
        const to = points[segment + 1];
        const ratio = moving ? (target - distances[segment]) / (distances[segment + 1] - distances[segment]) : 1;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        let direction: WanderDirection;
        if (Math.abs(dx) >= Math.abs(dy)) {
            direction = dx < 0 ? "left" : "right";
        } else {
            direction = dy < 0 ? "up" : "down";
        }
        return { x: from.x + dx * ratio, y: from.y + dy * ratio, direction, moving };
    }

    private safeIsWalkable(tile: Point): boolean {
        try {
            return this.map.isWalkable(tile);
        } catch (e) {
            console.warn("Wander: isWalkable failed", e);
            return false;
        }
    }

    private async safeFindPath(from: Point, to: Point): Promise<Point[]> {
        try {
            return await this.map.findPath(from, to);
        } catch (e) {
            console.warn("Wander: findPath failed", e);
            return [];
        }
    }
}
