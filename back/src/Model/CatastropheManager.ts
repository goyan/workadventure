import {
    BALL_LASTS_MS,
    COLD_LASTS_MS,
    coldCelsius,
    COLDS_PER_ROOM,
    coldTiles,
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
    HURRICANE_TELL_MS,
    hurricaneCrossing,
    hurricaneSpedUp,
    hurricaneTrack,
    METEOR_FALL_MS,
    meteorShape,
    METEORS_PER_ROOM,
    TILE_PX,
} from "@workadventure/map-editor";
import type { Ball, ColdMass, Downpour, Drain, Hurricane } from "@workadventure/map-editor";
import { CatastropheKind } from "@workadventure/messages";
import type { HurricaneTrackMessage } from "@workadventure/messages";
import type { GameRoom } from "./GameRoom";

/** The ice broken around a player who goes through it, in tiles: the hole they fall into. */
const ICE_BREAK_TILES = 1;

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

interface LiveCold extends ColdMass {
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
    /** The mass of cold air each player holds, by the id of the player. */
    private readonly chilling = new Map<number, LiveCold>();
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
    /** What breaks the ice under a player: given by the room (the ice the meadow keeps), as for the comets. */
    private breakIce: (x: number, y: number, radiusTiles: number) => void = () => undefined;
    /** What dispels the cold air lying on the map: given by the room (its ground), as what breaks the ice. */
    private calmGround: () => void = () => undefined;
    /** When each player last broke the ice: once a second at most. */
    private readonly iceBreaks = new Map<number, number>();
    private readonly inFlight = new Set<ReturnType<typeof setTimeout>>();
    /** The hurricane crossing the map, one a room, and what tells the room about it once a second. */
    private storm: Hurricane | undefined;
    private stormTimer: ReturnType<typeof setInterval> | undefined;
    /** Whether the map lies in the southern hemisphere (its hurricanes turn clockwise): given by the room. */
    private southern: () => boolean = () => false;
    /** How many times faster the hurricane goes (the speed of the map, hurricaneTimesOf): given by the room. */
    private hurricaneTimes: () => number = () => 1;

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
     * A player lays a mass of cold air around a point of the map (pixels), `radiusTiles` wide, its air at
     * `temperature` °C (both kept within what a cold snap may be): the mass of that player comes, or moves there
     * and goes on. The room is told each time. What freezes under it is the business of the meadow, which reads the
     * masses held (colds) and keeps those let go while they warm. False when it is refused.
     */
    public cold(userId: number, x: number, y: number, radiusTiles: number = 0, temperature?: number): boolean {
        if (this.stopped) return false;
        const size = this.mapSize();
        if (!size || !Number.isFinite(x) || !Number.isFinite(y)) return false;
        if (x < 0 || y < 0 || x >= size.width || y >= size.height) return false;
        const now = this.now();
        this.forgetCold(now);
        const held = this.chilling.get(userId);
        if (held ? now - held.toldAt < DOWNPOUR_MIN_REPORT_MS : this.chilling.size >= COLDS_PER_ROOM) return false;
        const mass: LiveCold = {
            id: held?.id ?? this.nextId++,
            x,
            y,
            radiusTiles: coldTiles(radiusTiles),
            temperature: coldCelsius(temperature),
            until: now + COLD_LASTS_MS,
            toldAt: now,
        };
        this.chilling.set(userId, mass);
        this.room.sendSubMessageToRoom({
            message: {
                $case: "catastropheMessage",
                catastropheMessage: {
                    id: mass.id,
                    kind: CatastropheKind.CATASTROPHE_COLD,
                    x,
                    y,
                    impactInMs: COLD_LASTS_MS,
                    radiusTiles: mass.radiusTiles,
                    wholeMap: false,
                    temperature: mass.temperature,
                },
            },
        });
        return true;
    }

    /** The masses of cold air the players hold now. */
    public colds(): ColdMass[] {
        this.forgetCold(this.now());
        return [...this.chilling.values()].map(({ id, x, y, radiusTiles, temperature }) => ({
            id,
            x,
            y,
            radiusTiles,
            temperature,
        }));
    }

    private forgetCold(now: number): void {
        for (const [userId, mass] of this.chilling) if (mass.until <= now) this.chilling.delete(userId);
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

    /** What dispels the cold air of the map is made after the catastrophes of a room (the meadow): it is given here. */
    public calmWith(calmGround: () => void): void {
        this.calmGround = calmGround;
    }

    /**
     * A player stops the cold snap of the room: nobody holds a mass of cold air any more (one still holding their
     * click lays a new one at their next message), the masses let go are dispelled, and the room is told. What they
     * froze stays, and thaws by itself. Anyone may stop it, as anyone may lay it. False once the room stopped.
     */
    public calm(): boolean {
        if (this.stopped) return false;
        this.chilling.clear();
        try {
            this.calmGround();
        } catch (error) {
            console.error("The cold air of the map could not be dispelled", error);
        }
        this.room.sendSubMessageToRoom({
            message: {
                $case: "catastropheMessage",
                catastropheMessage: {
                    id: this.nextId++,
                    kind: CatastropheKind.CATASTROPHE_COLD,
                    x: 0,
                    y: 0,
                    impactInMs: 0,
                    radiusTiles: 0,
                    wholeMap: false,
                },
            },
        });
        return true;
    }

    /** What breaks the ice is made after the catastrophes of a room (the meadow): it is given here. */
    public breakIceWith(breakIce: (x: number, y: number, radiusTiles: number) => void): void {
        this.breakIce = breakIce;
    }

    /**
     * The ice gives way under a player (too thin to bear them over deep water: their client felt it crack): it is
     * broken a tile around the point, and the room sees the hole open. False when refused: outside the map, or more
     * than once a second for a player.
     */
    public iceBreak(userId: number, x: number, y: number): boolean {
        if (this.stopped) return false;
        const size = this.mapSize();
        if (!size || !Number.isFinite(x) || !Number.isFinite(y)) return false;
        if (x < 0 || y < 0 || x >= size.width || y >= size.height) return false;
        const now = this.now();
        if (now - (this.iceBreaks.get(userId) ?? -Infinity) < 1000) return false;
        this.iceBreaks.set(userId, now);
        this.room.sendSubMessageToRoom({
            message: {
                $case: "catastropheMessage",
                catastropheMessage: {
                    id: this.nextId++,
                    kind: CatastropheKind.CATASTROPHE_ICE_BREAK,
                    x: Math.round(x),
                    y: Math.round(y),
                    impactInMs: 0,
                    radiusTiles: ICE_BREAK_TILES,
                    wholeMap: false,
                },
            },
        });
        try {
            this.breakIce(x, y, ICE_BREAK_TILES);
        } catch (error) {
            console.error("The ice of the map could not be broken", error);
        }
        return true;
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

    /** The speed of the map is read from its settings, made with the room: it is given here. */
    public hurricaneTimesWith(times: () => number): void {
        this.hurricaneTimes = times;
    }

    /** Where the map lies is read from its settings, made with the room: it is given here. */
    public southernWith(southern: () => boolean): void {
        this.southern = southern;
    }

    /**
     * A player sends a hurricane across the map, its eye over the point (x, y) (the middle of the map when outside it),
     * the way they chose (kept within what a hurricane may be): it begins now, its eye coming in at the edge of the map,
     * and lasts the time asked for its eye to cross the map. The room is told at once, then once a second
     * while it goes on, and once more when it ends; every browser computes its weather from that and the time of the
     * server, as the ground of the room does. One a room: false while one goes on, or once the room stopped.
     */
    public startHurricane(asked: HurricaneTrackMessage, x = -1, y = -1): boolean {
        if (this.stopped || this.hurricane()) return false;
        const size = this.mapSize();
        if (!size) return false;
        let southern = false;
        try {
            southern = this.southern();
        } catch (error) {
            console.error("The hemisphere of the map could not be read", error);
        }
        const track = hurricaneTrack(asked, southern);
        this.storm = {
            id: this.nextId++,
            startedAt: this.now(),
            ...track,
            ...hurricaneCrossing(size.width, size.height, x, y, track.heading),
        };
        this.speedUp();
        this.tellHurricane();
        if (!this.stormTimer) {
            this.stormTimer = setInterval(() => {
                try {
                    this.speedUp();
                    this.tellHurricane();
                } catch (error) {
                    console.error("The hurricane of the room could not be told", error);
                }
            }, HURRICANE_TELL_MS);
            // A hurricane must never keep the process alive.
            this.stormTimer.unref?.();
        }
        return true;
    }

    /** A player stops the hurricane of the room: it is gone at once, and the room is told. False when there is none. */
    public stopHurricane(): boolean {
        const storm = this.hurricane();
        if (!storm || this.stopped) return false;
        this.tellHurricane(storm, 0);
        this.endHurricane();
        return true;
    }

    /** The hurricane crossing the map now; undefined once it ended. */
    public hurricane(): Hurricane | undefined {
        const storm = this.storm;
        if (storm && this.now() >= storm.startedAt + storm.durationMs) return undefined;
        return storm;
    }

    /** The hurricane at the speed the map asks now: its eye goes on from where it is (hurricaneSpedUp). */
    private speedUp(): void {
        if (!this.storm) return;
        let times = 1;
        try {
            times = this.hurricaneTimes();
        } catch (error) {
            console.error("The speed of the map could not be read", error);
        }
        this.storm = hurricaneSpedUp(this.storm, times, this.now());
    }

    private endHurricane(): void {
        this.storm = undefined;
        if (this.stormTimer) clearInterval(this.stormTimer);
        this.stormTimer = undefined;
    }

    /** Tells the room the hurricane, and how long it still lasts: 0 once it ended, and then it is forgotten. */
    private tellHurricane(storm = this.storm, lastsMs?: number): void {
        if (!storm) return this.endHurricane();
        const left = lastsMs ?? Math.max(0, storm.startedAt + storm.durationMs - this.now());
        this.room.sendSubMessageToRoom({
            message: {
                $case: "catastropheMessage",
                catastropheMessage: {
                    id: storm.id,
                    kind: CatastropheKind.CATASTROPHE_HURRICANE,
                    x: 0,
                    y: 0,
                    impactInMs: left,
                    radiusTiles: 0,
                    wholeMap: true,
                    hurricane: {
                        category: storm.category,
                        minutes: Math.round((storm.durationMs * (storm.times ?? 1)) / 60_000),
                        heading: storm.heading,
                        southern: storm.southern,
                        startedAt: storm.startedAt,
                        fromX: storm.fromX,
                        fromY: storm.fromY,
                        toX: storm.toX,
                        toY: storm.toY,
                        anchorX: storm.anchorX,
                        anchorY: storm.anchorY,
                        durationMs: storm.durationMs,
                        times: storm.times ?? 1,
                        waterEffect: storm.waterEffect ?? 1,
                    },
                },
            },
        });
        if (left <= 0) this.endHurricane();
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
        temperature?: number,
        hurricane?: HurricaneTrackMessage,
    ): boolean {
        // A ball is let go, a cold snap and a hurricane are stopped: the others end by themselves.
        if (release) {
            if (kind === CatastropheKind.CATASTROPHE_COLD) return this.calm();
            if (kind === CatastropheKind.CATASTROPHE_HURRICANE) return this.stopHurricane();
            return kind === CatastropheKind.CATASTROPHE_BALL && this.release(userId);
        }
        if (kind === CatastropheKind.CATASTROPHE_DOWNPOUR) return this.rain(userId, x, y, radiusTiles, wholeMap);
        if (kind === CatastropheKind.CATASTROPHE_FIRE) return this.fire(userId, x, y, radiusTiles);
        if (kind === CatastropheKind.CATASTROPHE_DRAIN) return this.drain(userId, x, y, radiusTiles);
        if (kind === CatastropheKind.CATASTROPHE_BALL) return this.ball(userId, x, y, radiusTiles);
        if (kind === CatastropheKind.CATASTROPHE_ICE_BREAK) return this.iceBreak(userId, x, y);
        if (kind === CatastropheKind.CATASTROPHE_COLD) return this.cold(userId, x, y, radiusTiles, temperature);
        if (kind === CatastropheKind.CATASTROPHE_HURRICANE)
            return hurricane ? this.startHurricane(hurricane, x, y) : false;
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
        this.chilling.clear();
        this.holding.clear();
        this.endHurricane();
    }
}
