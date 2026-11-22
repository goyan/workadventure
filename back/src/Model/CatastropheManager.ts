import {
    BALL_LASTS_MS,
    BALL_MIN_REPORT_MS,
    ballRadiusPx,
    BALLS_PER_ROOM,
    ballTiles,
    DOWNPOUR_LASTS_MS,
    DOWNPOUR_MIN_REPORT_MS,
    downpourTiles,
    DOWNPOURS_PER_ROOM,
    DRAIN_LASTS_MS,
    DRAINS_PER_ROOM,
    drainTiles,
    FIRE_PATCH_LASTS_MS,
    FIRE_PATCHES_PER_SECOND,
    fireTiles,
    METEOR_FALL_MS,
    meteorShape,
    METEORS_PER_ROOM,
    TILE_PX,
} from "@workadventure/map-editor";
import type { Ball, Downpour, Drain } from "@workadventure/map-editor";
import { CatastropheKind } from "@workadventure/messages";
import type { GameRoom } from "./GameRoom";

/**
 * The catastrophes of a room: a player launches a meteor at a point of the map, the room is told when it will hit
 * (so every browser draws the fall), and the water takes the impact once the fall is over. Nothing is kept: a
 * restart of the room forgets the meteors in flight.
 *
 * A downpour is the other kind: it rains hard on a disc of the map (or on all of it) for as long as its player keeps
 * telling where, a second more at most. One for each player; the water and the meadow read those that are falling.
 *
 * A drain is its opposite: the water is taken hard from a disc of the map for as long as its player keeps telling
 * where. One for each player too; the water reads those that are open.
 *
 * A ball is a solid sphere held under the pointer of its player, its centre at the altitude 0 of the map. It is
 * there at once, whole, follows the pointer at each message, and is gone at once when its player lets go (or a
 * moment after their last message, when they left). The water reads where the balls are.
 */
interface LiveDownpour extends Downpour {
    until: number;
    toldAt: number;
}

interface LiveDrain extends Drain {
    until: number;
    toldAt: number;
}

interface LiveBall extends Ball {
    /** Until when it stands if its player says nothing more. */
    until: number;
    toldAt: number;
}

export class CatastropheManager {
    private nextId = 1;
    /** The ball each player holds, by the id of the player. */
    private readonly holding = new Map<number, LiveBall>();
    /** The downpour of each player, by the id of the player. */
    private readonly raining = new Map<number, LiveDownpour>();
    /** The drain of each player, by the id of the player. */
    private readonly draining = new Map<number, LiveDrain>();
    /** The level the water holds a ball at (see TerrainWaterManager.ballLevelAt): the altitude 0 until it is given. */
    private levelOf: (id: number, x: number, y: number) => number = () => 0;
    private stopped = false;
    /** When each player set their last patches of fire, within the last second. */
    private readonly patches = new Map<number, number[]>();
    /** The flame of each player who set fire, by the id the room is told: one flame a player, which follows them. */
    private readonly flames = new Map<number, number>();
    /** What a patch of fire lights: the meadow of the room, given once it is made. */
    private ignite: (x: number, y: number, radiusTiles: number) => void = () => undefined;
    /** What a fireball does where it lands: the water and the meadow of the room, given once they are made. */
    private burn: (x: number, y: number, radiusTiles: number, id: number) => void = () => undefined;
    private readonly inFlight = new Set<ReturnType<typeof setTimeout>>();

    constructor(
        private readonly room: Pick<GameRoom, "sendSubMessageToRoom">,
        /** The size of the map in pixels; undefined until it is read. */
        private readonly mapSize: () => { width: number; height: number } | undefined,
        private readonly strike: (x: number, y: number, radiusTiles: number) => void,
        /** What a downpour wets besides the water, told at each message of its player. */
        private soak: (downpour: Downpour) => void = () => undefined,
        private readonly now: () => number = Date.now,
    ) {}

    /**
     * A player makes it rain hard around a point of the map (pixels), or on the whole map: the downpour of that
     * player begins, or moves there and goes on. The room is told each time. False when it is refused.
     */
    public rain(userId: number, x: number, y: number, radiusTiles: number, wholeMap: boolean): boolean {
        if (this.stopped) return false;
        const size = this.mapSize();
        if (!size || !Number.isFinite(x) || !Number.isFinite(y)) return false;
        if (x < 0 || y < 0 || x >= size.width || y >= size.height) return false;
        const now = this.now();
        this.forgetEnded(now);
        const falling = this.raining.get(userId);
        if (falling ? now - falling.toldAt < DOWNPOUR_MIN_REPORT_MS : this.raining.size >= DOWNPOURS_PER_ROOM) {
            return false;
        }
        const downpour: LiveDownpour = {
            id: falling?.id ?? this.nextId++,
            x,
            y,
            radiusTiles: downpourTiles(radiusTiles),
            wholeMap: wholeMap === true,
            until: now + DOWNPOUR_LASTS_MS,
            toldAt: now,
        };
        this.raining.set(userId, downpour);
        this.room.sendSubMessageToRoom({
            message: {
                $case: "catastropheMessage",
                catastropheMessage: {
                    id: downpour.id,
                    kind: CatastropheKind.CATASTROPHE_DOWNPOUR,
                    x,
                    y,
                    impactInMs: DOWNPOUR_LASTS_MS,
                    radiusTiles: downpour.radiusTiles,
                    wholeMap: downpour.wholeMap,
                },
            },
        });
        try {
            this.soak(downpour);
        } catch (error) {
            console.error("A downpour of the map could not soak the ground", error);
        }
        return true;
    }

    /** What a downpour wets besides the water is made after the catastrophes of a room: it is given here. */
    public soakWith(soak: (downpour: Downpour) => void): void {
        this.soak = soak;
    }

    /** The downpours falling now. */
    public downpours(): Downpour[] {
        this.forgetEnded(this.now());
        return [...this.raining.values()];
    }

    private forgetEnded(now: number): void {
        for (const [userId, downpour] of this.raining) if (downpour.until <= now) this.raining.delete(userId);
    }

    /**
     * A player drains the water around a point of the map (pixels): the drain of that player opens, or moves there
     * and goes on. The room is told each time. False when it is refused.
     */
    public drain(userId: number, x: number, y: number, radiusTiles: number = 0): boolean {
        if (this.stopped) return false;
        const size = this.mapSize();
        if (!size || !Number.isFinite(x) || !Number.isFinite(y)) return false;
        if (x < 0 || y < 0 || x >= size.width || y >= size.height) return false;
        const now = this.now();
        this.forgetClosed(now);
        const open = this.draining.get(userId);
        if (open ? now - open.toldAt < DOWNPOUR_MIN_REPORT_MS : this.draining.size >= DRAINS_PER_ROOM) return false;
        const drain: LiveDrain = {
            id: open?.id ?? this.nextId++,
            x,
            y,
            radiusTiles: drainTiles(radiusTiles),
            until: now + DRAIN_LASTS_MS,
            toldAt: now,
        };
        this.draining.set(userId, drain);
        this.room.sendSubMessageToRoom({
            message: {
                $case: "catastropheMessage",
                catastropheMessage: {
                    id: drain.id,
                    kind: CatastropheKind.CATASTROPHE_DRAIN,
                    x,
                    y,
                    impactInMs: DRAIN_LASTS_MS,
                    radiusTiles: drain.radiusTiles,
                    wholeMap: false,
                },
            },
        });
        return true;
    }

    /** The drains open now. */
    public drains(): Drain[] {
        this.forgetClosed(this.now());
        return [...this.draining.values()];
    }

    private forgetClosed(now: number): void {
        for (const [userId, drain] of this.draining) if (drain.until <= now) this.draining.delete(userId);
    }

    /**
     * A player holds a ball at a point of the map (pixels), `diameterTiles` wide: their ball is there at once, whole,
     * or is now at that point. The room is told each time. False when it is refused.
     */
    public ball(userId: number, x: number, y: number, diameterTiles: number = 0): boolean {
        if (this.stopped) return false;
        const size = this.mapSize();
        if (!size || !Number.isFinite(x) || !Number.isFinite(y)) return false;
        if (x < 0 || y < 0 || x >= size.width || y >= size.height) return false;
        const now = this.now();
        this.forgetBalls(now);
        const held = this.holding.get(userId);
        if (held ? now - held.toldAt < BALL_MIN_REPORT_MS : this.holding.size >= BALLS_PER_ROOM) return false;
        const tiles = ballTiles(diameterTiles);
        const ball: LiveBall = {
            id: held?.id ?? this.nextId++,
            x,
            y,
            radiusPx: ballRadiusPx(tiles),
            until: now + BALL_LASTS_MS,
            toldAt: now,
        };
        this.holding.set(userId, ball);
        this.tellBall(userId, ball, tiles, BALL_LASTS_MS);
        return true;
    }

    /** What says the level a ball is held at is made after the catastrophes of a room: it is given here. */
    public levelWith(levelOf: (id: number, x: number, y: number) => number): void {
        this.levelOf = levelOf;
    }

    /** A player lets their ball go: it is gone at once, and the room is told. False when they held none. */
    public release(userId: number): boolean {
        const ball = this.holding.get(userId);
        if (!ball) return false;
        this.holding.delete(userId);
        if (this.stopped) return false;
        this.tellBall(userId, ball, Math.round((ball.radiusPx * 2) / TILE_PX), 0);
        return true;
    }

    private tellBall(userId: number, ball: LiveBall, tiles: number, lastsMs: number): void {
        this.room.sendSubMessageToRoom({
            message: {
                $case: "catastropheMessage",
                catastropheMessage: {
                    id: ball.id,
                    kind: CatastropheKind.CATASTROPHE_BALL,
                    x: ball.x,
                    y: ball.y,
                    impactInMs: lastsMs,
                    radiusTiles: tiles,
                    wholeMap: false,
                    userId,
                    ballLevel: this.levelOf(ball.id, ball.x, ball.y),
                },
            },
        });
    }

    /** The balls standing on the map now. */
    public balls(): Ball[] {
        this.forgetBalls(this.now());
        return [...this.holding.values()].map(({ id, x, y, radiusPx }) => ({ id, x, y, radiusPx }));
    }

    /** A ball whose player said nothing for too long (they left) is gone. */
    private forgetBalls(now: number): void {
        for (const [userId, ball] of this.holding) if (ball.until <= now) this.holding.delete(userId);
    }

    /** What a fireball burns is made after the catastrophes of a room: it is given here. */
    public burnWith(burn: (x: number, y: number, radiusTiles: number, id: number) => void): void {
        this.burn = burn;
    }

    /** What a patch of fire lights is made after the catastrophes of a room: it is given here. */
    public igniteWith(ignite: (x: number, y: number, radiusTiles: number) => void): void {
        this.ignite = ignite;
    }

    /**
     * A player sets a patch of fire around a point of the map (pixels), `radiusTiles` wide (kept within what a patch
     * may be). What burns is the business of the meadow. False when refused: outside the map, or too many in a second.
     */
    public fire(userId: number, x: number, y: number, radiusTiles: number): boolean {
        if (this.stopped) return false;
        const size = this.mapSize();
        if (!size || !Number.isFinite(x) || !Number.isFinite(y)) return false;
        if (x < 0 || y < 0 || x >= size.width || y >= size.height) return false;
        const now = this.now();
        const recent = (this.patches.get(userId) ?? []).filter((at) => now - at < 1000);
        if (recent.length >= FIRE_PATCHES_PER_SECOND) {
            this.patches.set(userId, recent);
            return false;
        }
        recent.push(now);
        this.patches.set(userId, recent);
        const tiles = fireTiles(radiusTiles);
        // The room sees the flame the player holds, whether or not anything takes fire under it.
        let flame = this.flames.get(userId);
        if (flame === undefined) {
            flame = this.nextId++;
            this.flames.set(userId, flame);
        }
        this.room.sendSubMessageToRoom({
            message: {
                $case: "catastropheMessage",
                catastropheMessage: {
                    id: flame,
                    kind: CatastropheKind.CATASTROPHE_FIRE,
                    x,
                    y,
                    impactInMs: FIRE_PATCH_LASTS_MS,
                    radiusTiles: tiles,
                    wholeMap: false,
                },
            },
        });
        try {
            this.ignite(x, y, tiles);
        } catch (error) {
            console.error("A patch of fire could not be set on the meadow of the map", error);
        }
        return true;
    }

    /** What a player asks for: the downpour, the drain or the ball that follows them, or a catastrophe thrown once. */
    public request(
        userId: number,
        kind: CatastropheKind,
        x: number,
        y: number,
        radiusTiles: number,
        wholeMap: boolean,
        release = false,
    ): boolean {
        // Only a ball is let go: the others end by themselves.
        if (release) return kind === CatastropheKind.CATASTROPHE_BALL && this.release(userId);
        if (kind === CatastropheKind.CATASTROPHE_DOWNPOUR) return this.rain(userId, x, y, radiusTiles, wholeMap);
        if (kind === CatastropheKind.CATASTROPHE_FIRE) return this.fire(userId, x, y, radiusTiles);
        if (kind === CatastropheKind.CATASTROPHE_DRAIN) return this.drain(userId, x, y, radiusTiles);
        if (kind === CatastropheKind.CATASTROPHE_BALL) return this.ball(userId, x, y, radiusTiles);
        return this.launch(kind, x, y, radiusTiles);
    }

    /**
     * A player launches a catastrophe at a point of the map (pixels): a meteor or a fireball whose crater is
     * `radiusTiles` wide, kept within what a meteor may be. After the fall, the water takes the impact of a meteor;
     * a fireball burns its crater instead. False when it is refused.
     */
    public launch(kind: CatastropheKind, x: number, y: number, radiusTiles: number): boolean {
        const burning = kind === CatastropheKind.CATASTROPHE_FIREBALL;
        if (this.stopped || (kind !== CatastropheKind.CATASTROPHE_METEOR && !burning)) return false;
        const size = this.mapSize();
        if (!size || !Number.isFinite(x) || !Number.isFinite(y)) return false;
        if (x < 0 || y < 0 || x >= size.width || y >= size.height) return false;
        // No pace for a player: only how many the room has falling at once, so that the server never runs too many
        // waves together.
        if (this.inFlight.size >= METEORS_PER_ROOM) return false;
        const tiles = meteorShape(radiusTiles).radiusTiles;
        const id = this.nextId++;
        this.room.sendSubMessageToRoom({
            message: {
                $case: "catastropheMessage",
                catastropheMessage: {
                    id,
                    kind,
                    x,
                    y,
                    impactInMs: METEOR_FALL_MS,
                    radiusTiles: tiles,
                    wholeMap: false,
                },
            },
        });
        const timer = setTimeout(() => {
            this.inFlight.delete(timer);
            try {
                if (burning) this.burn(x, y, tiles, id);
                else this.strike(x, y, tiles);
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
        this.raining.clear();
        this.draining.clear();
        this.holding.clear();
    }
}
