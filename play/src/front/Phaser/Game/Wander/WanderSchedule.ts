import { mulberry32, wanderSeed } from "./WanderRandom";

export type Point = { x: number; y: number };
export type WanderDirection = "down" | "left" | "right" | "up";

export interface WanderPose {
    x: number;
    y: number;
    direction: WanderDirection;
    moving: boolean;
    /**
     * Time since the character stopped, 0 while moving. A leg spent at the same place counts as following a whole leg of
     * pause: the true length of the previous pause would depend on whether that leg was computed on this client.
     */
    pausedMs: number;
    /** Set while the character drinks at the water it is turned to (`direction`). */
    drinking?: true;
}

/** Where a character can drink (pixels, the centre of a dry tile by the water), and which way the water is. */
export interface Shore extends Point {
    toward: WanderDirection;
}

export interface WanderMap {
    /** Tile coordinates. Must return false outside the grid. */
    isWalkable(tile: Point): boolean;
    /** Pixel coordinates. Resolves to [] when the destination is unreachable. */
    findPath(from: Point, to: Point): Promise<Point[]>;
    /** Where the feet of a character sitting on each seat of the map are (pixels). The same on every client. */
    seats?(): Point[];
    /** Where the characters can drink now. The same on every client. */
    shores?(): Shore[];
    /** How long a character waits between two drinks. Without it, or without shores, nobody drinks. */
    drinkIntervalMs?(): number | undefined;
}

/**
 * A destination; for a seat (inside the hitbox of its object) the walkable spot next to it, reached first; for a
 * shore, which way the water to drink is.
 */
type Destination = Point & { approach?: Point; drink?: WanderDirection };

/** Share of the legs an animal spends on a seat, when one is within reach. */
export const SEAT_CHANCE = 0.35;

export const LEG_MS = 20_000;
export const MIN_PAUSE_MS = 3_000;
export const RADIUS_TILES = 10;
export const SPEED_PX_PER_S = 64;
export const MAX_ATTEMPTS = 8;
export const TILE_SIZE = 32;
/** A thirsty character chooses among that many of the shores nearest to its nest. */
export const DRINK_CANDIDATES = 6;

/**
 * Per entity shift of the leg boundaries, in [0, LEG_MS): the characters do not all start a new leg (and compute their
 * paths) in the same frame. It only depends on the entity id, so it is the same on every client.
 */
export function wanderLegOffset(entityId: string): number {
    return wanderSeed(entityId, 0, 0) % LEG_MS;
}

/**
 * Whether a character goes to drink on that leg: on the first leg of each interval, the intervals of a character
 * being shifted by its id so that the animals of a map do not all drink at once. Only depends on its arguments, so
 * it is the same on every client. An interval shorter than a leg is a drink on every leg.
 */
export function isDrinkLeg(entityId: string, leg: number, intervalMs: number): boolean {
    const interval = Math.max(LEG_MS, intervalMs);
    const start = leg * LEG_MS + (wanderSeed(entityId, 0, 2000) % interval);
    return Math.floor(start / interval) !== Math.floor((start - LEG_MS) / interval);
}

interface Leg {
    /** Set when the leg ends at a shore: the character drinks there, turned that way. */
    drink?: WanderDirection;
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
    private destinations = new Map<number, Promise<Destination>>();
    private readonly legOffset: number;

    constructor(
        private readonly entityId: string,
        private nest: Point,
        private readonly map: WanderMap,
        /** How far from the nest the destinations and the seats may be, in tiles. */
        private readonly radiusTiles: number = RADIUS_TILES,
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

    private destination(leg: number): Promise<Destination> {
        let promise = this.destinations.get(leg);
        if (!promise) {
            promise = this.computeDestination(leg);
            this.destinations.set(leg, promise);
        }
        return promise;
    }

    private async computeDestination(leg: number): Promise<Destination> {
        const nest = this.nest;
        const shore = await this.computeDrinkDestination(leg);
        if (shore) {
            return shore;
        }
        const seat = await this.computeSeatDestination(leg);
        if (seat) {
            return seat;
        }
        const nestTile = { x: Math.floor(nest.x / TILE_SIZE), y: Math.floor(nest.y / TILE_SIZE) };
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            const random = mulberry32(wanderSeed(this.entityId, leg, attempt));
            const dx = Math.floor(random() * (2 * this.radiusTiles + 1)) - this.radiusTiles;
            const dy = Math.floor(random() * (2 * this.radiusTiles + 1)) - this.radiusTiles;
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

    /**
     * Once in each interval the map tells, a character goes to drink: at one of the shores nearest to its nest
     * within its wandering radius, chosen from the leg number like the other destinations, so that every client sees
     * it at the same one. The first it can walk to wins.
     */
    private async computeDrinkDestination(leg: number): Promise<Destination | undefined> {
        const intervalMs = this.safeDrinkIntervalMs();
        if (intervalMs === undefined || !isDrinkLeg(this.entityId, leg, intervalMs)) return undefined;
        const nest = this.nest;
        const radius = this.radiusTiles * TILE_SIZE;
        const distance = (shore: Shore): number => (shore.x - nest.x) ** 2 + (shore.y - nest.y) ** 2;
        const shores = this.safeShores()
            .filter((shore) => Math.abs(shore.x - nest.x) <= radius && Math.abs(shore.y - nest.y) <= radius)
            .sort((a, b) => distance(a) - distance(b) || a.y - b.y || a.x - b.x)
            .slice(0, DRINK_CANDIDATES);
        if (shores.length === 0) return undefined;
        const first = Math.floor(mulberry32(wanderSeed(this.entityId, leg, 2000))() * shores.length);
        for (let attempt = 0; attempt < shores.length; attempt++) {
            const shore = shores[(first + attempt) % shores.length];
            // Attempts are sequential on purpose: the first valid one wins.
            // eslint-disable-next-line no-await-in-loop
            const path = await this.safeFindPath(nest, shore);
            if (path.length > 0) {
                return { x: shore.x, y: shore.y, drink: shore.toward };
            }
        }
        return undefined;
    }

    /**
     * Now and then, an animal goes to sit on a seat within its wandering radius: chosen from the leg number like the
     * other destinations, so that every client sees it on the same seat. The seat sits inside the hitbox of its
     * object: the path leads to a walkable spot next to it, then the animal hops on.
     */
    private async computeSeatDestination(leg: number): Promise<Destination | undefined> {
        const random = mulberry32(wanderSeed(this.entityId, leg, 1000));
        if (random() >= SEAT_CHANCE) return undefined;
        const radius = this.radiusTiles * TILE_SIZE;
        const seats = (this.map.seats?.() ?? [])
            .filter((seat) => Math.abs(seat.x - this.nest.x) <= radius && Math.abs(seat.y - this.nest.y) <= radius)
            .sort((a, b) => a.x - b.x || a.y - b.y);
        if (seats.length === 0) return undefined;
        const seat = seats[Math.floor(random() * seats.length)];
        for (const [dx, dy] of [
            [0, 1],
            [-1, 0],
            [1, 0],
            [0, -1],
        ]) {
            const approach = { x: seat.x + dx * TILE_SIZE, y: seat.y + dy * TILE_SIZE };
            if (
                !this.safeIsWalkable({ x: Math.floor(approach.x / TILE_SIZE), y: Math.floor(approach.y / TILE_SIZE) })
            ) {
                continue;
            }
            // Attempts are sequential on purpose: the first valid one wins.
            // eslint-disable-next-line no-await-in-loop
            const path = await this.safeFindPath(this.nest, approach);
            if (path.length > 0) {
                return { x: seat.x, y: seat.y, approach };
            }
        }
        return undefined;
    }

    private async computeLeg(leg: number): Promise<Leg> {
        const [startDestination, endDestination] = await Promise.all([
            this.destination(leg - 1),
            this.destination(leg),
        ]);
        // Off a seat first (to the spot next to it), and onto a seat last (from the spot next to it).
        const start: Point = startDestination.approach ?? startDestination;
        const end: Point = endDestination.approach ?? endDestination;
        const points: Point[] = [{ x: startDestination.x, y: startDestination.y }];
        if (startDestination.approach) points.push(startDestination.approach);
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
        if (endDestination.approach) points.push({ x: endDestination.x, y: endDestination.y });
        const distances = [0];
        for (let i = 1; i < points.length; i++) {
            distances.push(distances[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
        }
        const length = distances[distances.length - 1];
        const speed = Math.max(SPEED_PX_PER_S, length / ((LEG_MS - MIN_PAUSE_MS) / 1000));
        return { points, distances, speed, drink: endDestination.drink };
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
            const still: WanderPose = {
                x: points[0].x,
                y: points[0].y,
                direction: leg.drink ?? "down",
                moving: false,
                pausedMs: LEG_MS + elapsedMs,
            };
            if (leg.drink) still.drinking = true;
            return still;
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
        const pausedMs = moving ? 0 : Math.max(0, elapsedMs - (total / leg.speed) * 1000);
        const pose: WanderPose = { x: from.x + dx * ratio, y: from.y + dy * ratio, direction, moving, pausedMs };
        if (!moving && leg.drink) {
            // Arrived at the shore: turned to the water, whichever way it came.
            pose.direction = leg.drink;
            pose.drinking = true;
        }
        return pose;
    }

    private safeIsWalkable(tile: Point): boolean {
        try {
            return this.map.isWalkable(tile);
        } catch (e) {
            console.warn("Wander: isWalkable failed", e);
            return false;
        }
    }

    private safeShores(): Shore[] {
        try {
            return this.map.shores?.() ?? [];
        } catch (e) {
            console.warn("Wander: shores failed", e);
            return [];
        }
    }

    private safeDrinkIntervalMs(): number | undefined {
        try {
            const intervalMs = this.map.drinkIntervalMs?.();
            return intervalMs !== undefined && Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : undefined;
        } catch (e) {
            console.warn("Wander: drinkIntervalMs failed", e);
            return undefined;
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
