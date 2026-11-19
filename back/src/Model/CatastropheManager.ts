import { METEOR_COOLDOWN_MS, METEOR_FALL_MS, meteorShape, METEORS_PER_ROOM } from "@workadventure/map-editor";
import { CatastropheKind } from "@workadventure/messages";
import type { GameRoom } from "./GameRoom";

/**
 * The catastrophes of a room: a player launches a meteor at a point of the map, the room is told when it will hit
 * (so every browser draws the fall), and the water takes the impact once the fall is over. Nothing is kept: a
 * restart of the room forgets the meteors in flight.
 */
export class CatastropheManager {
    private nextId = 1;
    private stopped = false;
    /** When each player's last accepted launch was, by user id. */
    private readonly lastLaunch = new Map<number, number>();
    private readonly inFlight = new Set<ReturnType<typeof setTimeout>>();

    constructor(
        private readonly room: Pick<GameRoom, "sendSubMessageToRoom">,
        /** The size of the map in pixels; undefined until it is read. */
        private readonly mapSize: () => { width: number; height: number } | undefined,
        private readonly strike: (x: number, y: number, radiusTiles: number) => void,
        private readonly now: () => number = Date.now,
    ) {}

    /**
     * A player launches a catastrophe at a point of the map (pixels): a meteor whose crater is `radiusTiles` wide,
     * kept within what a meteor may be. False when it is refused.
     */
    public launch(userId: number, kind: CatastropheKind, x: number, y: number, radiusTiles: number): boolean {
        if (this.stopped || kind !== CatastropheKind.CATASTROPHE_METEOR) return false;
        const size = this.mapSize();
        if (!size || !Number.isFinite(x) || !Number.isFinite(y)) return false;
        if (x < 0 || y < 0 || x >= size.width || y >= size.height) return false;
        const now = this.now();
        const last = this.lastLaunch.get(userId);
        if (last !== undefined && now - last < METEOR_COOLDOWN_MS) return false;
        if (this.inFlight.size >= METEORS_PER_ROOM) return false;
        this.lastLaunch.set(userId, now);
        const tiles = meteorShape(radiusTiles).radiusTiles;
        this.room.sendSubMessageToRoom({
            message: {
                $case: "catastropheMessage",
                catastropheMessage: { id: this.nextId++, kind, x, y, impactInMs: METEOR_FALL_MS, radiusTiles: tiles },
            },
        });
        const timer = setTimeout(() => {
            this.inFlight.delete(timer);
            try {
                this.strike(x, y, tiles);
            } catch (error) {
                console.error("A meteor of the map could not strike", error);
            }
        }, METEOR_FALL_MS);
        // A meteor must never keep the process alive.
        timer.unref?.();
        this.inFlight.add(timer);
        return true;
    }

    public stop(): void {
        this.stopped = true;
        for (const timer of this.inFlight) clearTimeout(timer);
        this.inFlight.clear();
    }
}
