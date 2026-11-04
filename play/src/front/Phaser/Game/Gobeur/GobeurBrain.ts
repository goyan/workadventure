import type { GobeurLevel } from "@workadventure/map-editor";
import type { Point } from "../Wander/WanderSchedule";
import type { GobeurDirection } from "./GobeurProtocol";

export const GOBEUR_LEVELS: Record<
    GobeurLevel,
    { speedFactor: number; detectionTiles: number | null; repathMs: number }
> = {
    beginner: { speedFactor: 0.7, detectionTiles: 6, repathMs: 1500 },
    intermediate: { speedFactor: 0.95, detectionTiles: 10, repathMs: 800 },
    hard: { speedFactor: 1.15, detectionTiles: null, repathMs: 400 },
};

export const GOBEUR_CATCH_DISTANCE_PX = 16;
export const GOBEUR_WANDER_RADIUS_TILES = 5;
const WANDER_ATTEMPTS = 8;

export type GobeurTarget = { uuid: string; x: number; y: number; safe: boolean };

export interface GobeurBrainMap {
    /** Tile coordinates. */
    isWalkable(tile: Point): boolean;
    /** Pixel coordinates. Resolves to [] when the destination is unreachable. */
    findPath(from: Point, to: Point): Promise<Point[]>;
}

interface PendingRequest {
    // undefined for a wandering request.
    uuid: string | undefined;
    result?: Point[];
}

/**
 * Chase logic of the Gobeur. Pure (no Phaser), runs only in the game master's browser.
 * update() is synchronous: a path search is started when due and applied by a later update.
 */
export class GobeurBrain {
    private x: number;
    private y: number;
    private direction: GobeurDirection = "down";
    private path: Point[] = [];
    private currentTarget: string | undefined;
    private pending: PendingRequest | undefined;
    private lastRepathAt = Number.NEGATIVE_INFINITY;
    // Targets whose last path was empty: skipped by the next target choice only.
    private excluded = new Set<string>();
    private readonly params: { speedFactor: number; detectionTiles: number | null; repathMs: number };

    constructor(
        private readonly start: Point,
        level: GobeurLevel,
        private readonly map: GobeurBrainMap,
        private readonly walkSpeedPxPerS: number,
        private readonly random: () => number,
        private readonly tileSize = 32,
    ) {
        this.x = start.x;
        this.y = start.y;
        this.params = GOBEUR_LEVELS[level];
        this.isHard = level === "hard";
    }

    private readonly isHard: boolean;

    get targetUuid(): string | undefined {
        return this.currentTarget;
    }

    public update(
        now: number,
        deltaMs: number,
        targets: GobeurTarget[],
    ): { x: number; y: number; direction: GobeurDirection; caught: string[] } {
        this.applyResult(targets);
        this.maybeRepath(now, targets);
        this.move(deltaMs);

        const caught = targets
            .filter((t) => !t.safe && Math.hypot(t.x - this.x, t.y - this.y) < GOBEUR_CATCH_DISTANCE_PX)
            .map((t) => t.uuid);
        return { x: this.x, y: this.y, direction: this.direction, caught };
    }

    private applyResult(targets: GobeurTarget[]): void {
        const request = this.pending;
        if (!request || request.result === undefined) {
            return;
        }
        this.pending = undefined;
        if (request.uuid === undefined) {
            if (this.currentTarget === undefined) {
                this.path = this.dropWaypointsBehind(request.result);
            }
            return;
        }
        // Stale: the target changed or disappeared while the path was computed.
        if (this.currentTarget !== request.uuid || !targets.some((t) => t.uuid === request.uuid && !t.safe)) {
            return;
        }
        if (request.result.length === 0) {
            this.excluded.add(request.uuid);
            this.currentTarget = undefined;
            this.path = [];
            return;
        }
        this.path = this.dropWaypointsBehind(request.result);
    }

    /**
     * The path starts where the Gobeur was when it was requested; it has moved since. Drop the leading waypoints it
     * has already passed so it does not step back.
     */
    private dropWaypointsBehind(path: Point[]): Point[] {
        let first = 0;
        while (first < path.length - 1) {
            const a = path[first];
            const b = path[first + 1];
            if ((b.x - a.x) * (this.x - a.x) + (b.y - a.y) * (this.y - a.y) > 0) {
                first++;
            } else {
                break;
            }
        }
        return path.slice(first);
    }

    private maybeRepath(now: number, targets: GobeurTarget[]): void {
        if (this.pending || now - this.lastRepathAt < this.params.repathMs) {
            return;
        }
        const chosen = this.chooseTarget(targets);
        this.excluded.clear();
        if (chosen) {
            this.currentTarget = chosen.uuid;
            this.lastRepathAt = now;
            this.request(chosen.uuid, { x: chosen.x, y: chosen.y });
            return;
        }
        if (this.currentTarget !== undefined) {
            // The target is lost (safe, out of range, gone): stop walking the chase path.
            this.path = [];
        }
        this.currentTarget = undefined;
        // Wandering: only pick a new destination once the previous one is reached.
        if (this.path.length > 0) {
            return;
        }
        const destination = this.pickWanderDestination();
        this.lastRepathAt = now;
        if (destination) {
            this.request(undefined, destination);
        }
    }

    private chooseTarget(targets: GobeurTarget[]): GobeurTarget | undefined {
        const candidates = targets.filter((t) => !t.safe && !this.excluded.has(t.uuid));
        if (this.isHard && this.currentTarget !== undefined) {
            const kept = candidates.find((t) => t.uuid === this.currentTarget);
            if (kept) {
                return kept;
            }
        }
        const range = this.params.detectionTiles === null ? Infinity : this.params.detectionTiles * this.tileSize;
        let best: GobeurTarget | undefined;
        let bestDistance = Infinity;
        for (const t of candidates) {
            const d = Math.hypot(t.x - this.x, t.y - this.y);
            if (d <= range && d < bestDistance) {
                best = t;
                bestDistance = d;
            }
        }
        return best;
    }

    private pickWanderDestination(): Point | undefined {
        const startTile = { x: Math.floor(this.start.x / this.tileSize), y: Math.floor(this.start.y / this.tileSize) };
        const span = 2 * GOBEUR_WANDER_RADIUS_TILES + 1;
        for (let i = 0; i < WANDER_ATTEMPTS; i++) {
            const tile = {
                x: startTile.x + Math.floor(this.random() * span) - GOBEUR_WANDER_RADIUS_TILES,
                y: startTile.y + Math.floor(this.random() * span) - GOBEUR_WANDER_RADIUS_TILES,
            };
            if (this.map.isWalkable(tile)) {
                return {
                    x: tile.x * this.tileSize + this.tileSize / 2,
                    y: tile.y * this.tileSize + this.tileSize / 2,
                };
            }
        }
        return undefined;
    }

    private request(uuid: string | undefined, to: Point): void {
        const request: PendingRequest = { uuid };
        this.pending = request;
        this.map
            .findPath({ x: this.x, y: this.y }, to)
            .then((path) => {
                request.result = path;
            })
            .catch((e) => {
                console.warn("Gobeur path search failed", e);
                request.result = [];
            });
    }

    private move(deltaMs: number): void {
        let budget = (this.walkSpeedPxPerS * this.params.speedFactor * deltaMs) / 1000;
        const fromX = this.x;
        const fromY = this.y;
        while (budget > 0 && this.path.length > 0) {
            const wp = this.path[0];
            const d = Math.hypot(wp.x - this.x, wp.y - this.y);
            if (d <= budget) {
                this.x = wp.x;
                this.y = wp.y;
                budget -= d;
                this.path.shift();
            } else {
                this.x += ((wp.x - this.x) / d) * budget;
                this.y += ((wp.y - this.y) / d) * budget;
                budget = 0;
            }
        }
        const dx = this.x - fromX;
        const dy = this.y - fromY;
        if (dx === 0 && dy === 0) {
            return;
        }
        this.direction = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
    }
}
