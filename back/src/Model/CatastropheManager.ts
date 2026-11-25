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
    TERRAIN_CELL,
    TILE_PX,
    TSUNAMI_TELL_MS,
    tsunamiLastsMs,
    tsunamiMetres,
    tsunamiMinutes,
    decodeZombieTerrain,
    encodeZombieLog,
    encodeZombieTerrain,
    zombieAsk,
    zombieDirection,
    zombieHordeGoing,
    zombieMsLeft,
    zombieSpedUp,
    zombieStepAt,
    zombieTerrainHash,
    ZOMBIE_INPUT_DELAY_MS,
    ZOMBIE_GRENADE_FUSE_STEPS,
    zombieGrenadeAim,
    ZOMBIE_MOST_AVATARS,
    ZOMBIE_STEP_MS,
    ZOMBIE_TELL_MS,
    ZOMBIE_TERRAIN_TELL_MS,
    ZOMBIE_ASK_WHOLE_MS,
    zombieDartAim,
    zombieDartFits,
    zombieDartFlightEnd,
    zombieDartStride,
} from "@workadventure/map-editor";
import type {
    Ball,
    ColdMass,
    Downpour,
    Drain,
    Hurricane,
    Tsunami,
    ZombieHorde,
    ZombieLogEntry,
} from "@workadventure/map-editor";
import { CatastropheKind } from "@workadventure/messages";
import type {
    HurricaneTrackMessage,
    TsunamiMessage,
    CatastropheMessage,
    ZombieDartMessage,
    ZombieGrenadeMessage,
    ZombieHordeMessage,
} from "@workadventure/messages";

/**
 * A player shoots a grenade once a second at most, as many as they like while the horde goes on (a choice of the
 * user): with a fuse of 4 s, four of theirs at most are in the air.
 */
const ZOMBIE_GRENADE_PACE_MS = 1000;
/**
 * A player is answered the whole horde once in this long at most: a little less than the browser waits between two
 * asks (ZOMBIE_ASK_WHOLE_MS), so that a second ask that comes a little early, by the network, is not refused.
 */
const ZOMBIE_ANSWER_WHOLE_MS = (ZOMBIE_ASK_WHOLE_MS * 3) / 4;
/**
 * The grenades in the air at once in a horde, at most: four a player for as many players as a horde follows. A shot
 * past it is refused. A fuse burns 40 steps at least: so a horde takes 128 shots in 40 steps at most, 28 800 over its
 * 9 000 steps (15 minutes at the speed of reality), whatever the speed of the map. At the speed of reality, 32 a
 * second; on a map sped up (its steps closer, a shot going off once every browser can have it), up to some 64.
 */
const ZOMBIE_GRENADES_IN_FLIGHT = 4 * ZOMBIE_MOST_AVATARS;
/**
 * Each second the room is told the entries of the log of the horde written in the last this many ms, the whole log
 * with its ground only (every ZOMBIE_TERRAIN_TELL_MS): a log that keeps growing with the shots is not told whole each
 * second. A browser that missed more than this waits for the whole log.
 */
const ZOMBIE_LOG_TAIL_MS = 10_000;
/**
 * A player shoots a dart of the Nerf into the horde every 250 ms at most: their Nerf fires every 300 ms
 * (NERF_COOLDOWN_MS of play), and a shot that comes a little early, by the network, is not refused. Every dart one
 * sees may kill: at one a second, two darts of three would go through the zombies they reach.
 */
const ZOMBIE_DART_PACE_MS = 250;
/**
 * The darts a horde takes in a second, at most, whoever shoots: ten players who fire as fast as their Nerf does (33 a
 * second) and some more. A dart past it is refused. So a horde takes 43 200 darts at most over its 15 minutes.
 */
const ZOMBIE_DARTS_A_SECOND = 48;
/**
 * A dart is shot at the step the browser of its player was at: taken when that step is at most this long before the
 * step of the server (the network, a browser a little behind), or two steps after it (a clock a little ahead).
 */
const ZOMBIE_DART_LATE_MS = 500;
const ZOMBIE_DART_EARLY_STEPS = 2;
/** A dart leaves the barrel of its player: within this of where the server last knows their avatar (px). */
const ZOMBIE_DART_REACH_PX = 96;
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
    /** The tsunami coming in from the sea, one a room, and what tells the room about it once a second. */
    private wave: Tsunami | undefined;
    private waveTimer: ReturnType<typeof setInterval> | undefined;
    /** How many times faster the hurricane goes (the speed of the map, hurricaneTimesOf): given by the room. */
    private hurricaneTimes: () => number = () => 1;
    /** The horde of zombies crossing the map, one a room, what tells the room about it, and when its water was told. */
    private horde: ZombieHorde | undefined;
    private hordeTimer: ReturnType<typeof setInterval> | undefined;
    private hordeTerrainToldAt = Number.NEGATIVE_INFINITY;
    /** The hash of the ground of the horde, computed once: each message carries it, and a message goes at each shot. */
    private hordeTerrainHash = 0;
    /** The ground of each cell of the map as a horde reads it when it begins (zombieTerrainOf): given by the room. */
    private zombieTerrain: (
        solid: (tileX: number, tileY: number) => boolean,
    ) => { widthCells: number; heightCells: number; cells: Uint8Array } | undefined = () => undefined;
    /** Where the avatars stand, by a key of their own: given by the room. */
    private zombieAvatars: () => readonly { key: number; x: number; y: number }[] = () => [];
    private zombieTimes: () => number = () => 1;
    /**
     * The log of where the avatars stood and of the grenades shot, when each entry was written (ms), their slots by
     * key, and the tile each slot was last told on.
     */
    private hordeLog: ZombieLogEntry[] = [];
    private hordeLogAt: number[] = [];
    /**
     * Whether `horde.avatars` misses entries written since: the whole log is written out when read (zombies(), ten
     * times a second by the ground, and with the ground every few seconds), not at each shot.
     */
    private hordeLogStale = false;
    private hordeSlots = new Map<number, number>();
    private hordeTiles: number[] = [];
    /**
     * When each player last shot a grenade, by their uuid (the same for every connection of theirs: two tabs shoot no
     * faster than one), and the steps the grenades in the air go off at, in order.
     */
    private readonly grenadeShots = new Map<string, number>();
    private grenadesInFlight: number[] = [];
    /**
     * When each player last shot a dart, by their uuid; when the darts of the last second were taken; the step the
     * last dart is applied at (those after it never before).
     */
    private readonly dartShots = new Map<string, number>();
    private dartsTakenAt: number[] = [];
    private lastDartStep = 0;
    /** When each player last asked for the whole horde, by their uuid. */
    private readonly wholeAsked = new Map<string, number>();

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
        // A hurricane sped up starts at a fraction of a millisecond: the message carries whole milliseconds (int32),
        // a fraction there fails its encoding and cuts the room from its players.
        const left = Math.round(lastsMs ?? Math.max(0, storm.startedAt + storm.durationMs - this.now()));
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

    /**
     * A player sends a tsunami to the coast of the map (its east edge), as high and for as long as they chose (kept
     * within what a tsunami may be): its front reaches the coast now. The room is told at once, then once a second
     * while it goes on, its backwash included, and once more when it ends; the water of the room reads the sea it
     * holds at the coast (tsunami). One a room: false while one goes on, or once the room stopped.
     */
    public startTsunami(asked: TsunamiMessage): boolean {
        if (this.stopped || this.tsunami()) return false;
        if (!this.mapSize()) return false;
        this.wave = {
            id: this.nextId++,
            startedAt: this.now(),
            metres: tsunamiMetres(asked.metres),
            durationMs: tsunamiMinutes(asked.minutes) * 60_000,
        };
        this.tellTsunami();
        if (!this.waveTimer) {
            this.waveTimer = setInterval(() => {
                try {
                    this.tellTsunami();
                } catch (error) {
                    console.error("The tsunami of the room could not be told", error);
                }
            }, TSUNAMI_TELL_MS);
            // A tsunami must never keep the process alive.
            this.waveTimer.unref?.();
        }
        return true;
    }

    /** A player stops the tsunami of the room: the sea is gone from the coast at once, and the room is told. */
    public stopTsunami(): boolean {
        const wave = this.tsunami();
        if (!wave || this.stopped) return false;
        this.tellTsunami(wave, 0);
        this.endTsunami();
        return true;
    }

    /** The tsunami coming in now, its backwash included; undefined once it ended. */
    public tsunami(): Tsunami | undefined {
        const wave = this.wave;
        if (wave && this.now() >= wave.startedAt + tsunamiLastsMs(wave)) return undefined;
        return wave;
    }

    private endTsunami(): void {
        this.wave = undefined;
        if (this.waveTimer) clearInterval(this.waveTimer);
        this.waveTimer = undefined;
    }

    /** Tells the room the tsunami, and how long it still lasts: 0 once it ended, and then it is forgotten. */
    private tellTsunami(wave = this.wave, lastsMs?: number): void {
        if (!wave) return this.endTsunami();
        const left = lastsMs ?? Math.max(0, wave.startedAt + tsunamiLastsMs(wave) - this.now());
        this.room.sendSubMessageToRoom({
            message: {
                $case: "catastropheMessage",
                catastropheMessage: {
                    id: wave.id,
                    kind: CatastropheKind.CATASTROPHE_TSUNAMI,
                    x: 0,
                    y: 0,
                    impactInMs: left,
                    radiusTiles: 0,
                    wholeMap: true,
                    tsunami: {
                        metres: wave.metres,
                        minutes: Math.round(wave.durationMs / 60_000),
                        startedAt: wave.startedAt,
                        durationMs: wave.durationMs,
                    },
                },
            },
        });
        if (left <= 0) this.endTsunami();
    }

    /** The ground of the map as a horde reads it is made with the room (its ground): it is given here. */
    public zombieTerrainWith(
        terrain: (
            solid: (tileX: number, tileY: number) => boolean,
        ) => { widthCells: number; heightCells: number; cells: Uint8Array } | undefined,
    ): void {
        this.zombieTerrain = terrain;
    }

    /** Where the avatars of the room stand (by a key of their own) is read from the room: it is given here. */
    public zombieAvatarsWith(avatars: () => readonly { key: number; x: number; y: number }[]): void {
        this.zombieAvatars = avatars;
    }

    /** How many times faster the horde goes (the speed of the map): given by the room, as for the hurricane. */
    public zombieTimesWith(times: () => number): void {
        this.zombieTimes = times;
    }

    /**
     * A player sends a horde of zombies across the map, the way, the numbers and the time they chose (kept within what
     * a horde may be), with the collisions of the map as their browser reads them (a tile a bit): it begins now at
     * the edge it comes from. The ground of the map is frozen now, once: its water, its walls (doors open), those
     * collisions; the crowd goes round them as they are now, in every browser and on the ground alike. The room is
     * told at once, then once a second with where the avatars stand (its ground every few seconds), and once more
     * when it ends. One a room: false while one goes on, or once the room stopped.
     */
    public startZombies(asked: ZombieHordeMessage): boolean {
        if (this.stopped || this.goingHorde()) return false;
        let terrain: { widthCells: number; heightCells: number; cells: Uint8Array } | undefined;
        try {
            terrain = this.zombieTerrain(this.collisionsOf(asked));
        } catch (error) {
            console.error("The ground of the map could not be read for a horde", error);
        }
        if (!terrain || terrain.widthCells <= 0 || terrain.heightCells <= 0) return false;
        const ask = zombieAsk(asked);
        const now = Math.round(this.now());
        this.horde = {
            id: this.nextId++,
            ...ask,
            seed: Math.floor(Math.random() * 0x1_0000_0000) >>> 0,
            startedAt: now,
            anchorStep: 0,
            anchorAt: now,
            msPerStep: ZOMBIE_STEP_MS,
            ...zombieDirection(ask.heading),
            // Its middle over the middle of the map.
            anchorX: (terrain.widthCells * TERRAIN_CELL) / 2,
            anchorY: (terrain.heightCells * TERRAIN_CELL) / 2,
            widthCells: terrain.widthCells,
            heightCells: terrain.heightCells,
            terrain: encodeZombieTerrain(terrain.cells),
            avatars: "",
            safeStep: -1,
        };
        this.hordeLog = [];
        this.hordeLogStale = false;
        this.hordeLogAt = [];
        this.grenadeShots.clear();
        this.grenadesInFlight = [];
        this.dartShots.clear();
        this.dartsTakenAt = [];
        this.lastDartStep = 0;
        this.wholeAsked.clear();
        this.hordeSlots = new Map();
        this.hordeTiles = [];
        this.hordeTerrainToldAt = Number.NEGATIVE_INFINITY;
        this.hordeTerrainHash = zombieTerrainHash(this.horde.terrain);
        this.speedUpZombies();
        this.readAvatars();
        this.tellZombies();
        if (!this.hordeTimer) {
            this.hordeTimer = setInterval(() => {
                try {
                    this.speedUpZombies();
                    this.readAvatars();
                    this.tellZombies();
                } catch (error) {
                    console.error("The horde of the room could not be told", error);
                }
            }, ZOMBIE_TELL_MS);
            // A horde must never keep the process alive.
            this.hordeTimer.unref?.();
        }
        return true;
    }

    /** The collisions a player sent with their horde, a tile a bit: none when they do not fit the map. */
    private collisionsOf(asked: ZombieHordeMessage): (tileX: number, tileY: number) => boolean {
        const size = this.mapSize();
        if (!size || !asked.collisions) return () => false;
        const tilesWide = Math.ceil(size.width / TILE_PX);
        const tilesHigh = Math.ceil(size.height / TILE_PX);
        if (asked.collisionsWidth !== tilesWide || asked.collisionsHeight !== tilesHigh) return () => false;
        const tiles = decodeZombieTerrain(asked.collisions, tilesWide * tilesHigh);
        return (tileX, tileY) =>
            tileX >= 0 &&
            tileY >= 0 &&
            tileX < tilesWide &&
            tileY < tilesHigh &&
            tiles[tileY * tilesWide + tileX] !== 0;
    }

    /** The horde at the speed the map asks now: it goes on from the same step, its steps faster or slower. */
    private speedUpZombies(): void {
        if (!this.horde) return;
        let times = 1;
        try {
            times = this.zombieTimes();
        } catch (error) {
            console.error("The speed of the map could not be read", error);
        }
        this.horde = zombieSpedUp(this.horde, times, this.now());
    }

    /**
     * Where the avatars stand now, a tile each, into the log of the horde: what changed since the last reading,
     * applied ZOMBIE_INPUT_DELAY_MS from now (every browser has it by then), never before a step already promised.
     * The log is then complete to the step before that.
     */
    private readAvatars(): void {
        const horde = this.horde;
        if (!horde) return;
        let avatars: readonly { key: number; x: number; y: number }[] = [];
        try {
            avatars = this.zombieAvatars();
        } catch (error) {
            console.error("The avatars of the room could not be read for a horde", error);
        }
        const tilesWide = Math.ceil((horde.widthCells * TERRAIN_CELL) / TILE_PX);
        const tilesHigh = Math.ceil((horde.heightCells * TERRAIN_CELL) / TILE_PX);
        const seen = new Set<number>();
        const changes: { slot: number; tile: number }[] = [];
        for (const avatar of avatars) {
            if (!Number.isFinite(avatar.x) || !Number.isFinite(avatar.y)) continue;
            let slot = this.hordeSlots.get(avatar.key);
            if (slot === undefined) {
                if (this.hordeSlots.size >= ZOMBIE_MOST_AVATARS) continue;
                slot = this.hordeSlots.size;
                this.hordeSlots.set(avatar.key, slot);
            }
            const tileX = Math.floor(avatar.x / TILE_PX);
            const tileY = Math.floor(avatar.y / TILE_PX);
            const tile =
                tileX >= 0 && tileY >= 0 && tileX < tilesWide && tileY < tilesHigh ? tileY * tilesWide + tileX : -1;
            seen.add(slot);
            if ((this.hordeTiles[slot] ?? -1) !== tile) changes.push({ slot, tile });
        }
        for (const slot of this.hordeSlots.values()) {
            if (!seen.has(slot) && (this.hordeTiles[slot] ?? -1) !== -1) changes.push({ slot, tile: -1 });
        }
        changes.sort((a, b) => a.slot - b.slot);
        const delayed = Math.ceil(zombieStepAt(horde, this.now() + ZOMBIE_INPUT_DELAY_MS));
        const applyStep = Math.max(delayed, horde.safeStep + 1);
        if (changes.length > 0) {
            for (const change of changes) this.hordeTiles[change.slot] = change.tile;
            this.hordeLog.push({ applyStep, changes });
            this.hordeLogAt.push(this.now());
        }
        this.horde = { ...horde, safeStep: applyStep - 1 };
        this.hordeLogStale ||= changes.length > 0;
    }

    /**
     * A player who holds the grenade launcher shoots a grenade into the horde, from a point to a point (map pixels):
     * it goes off when its fuse has burnt (ZOMBIE_GRENADE_FUSE_STEPS steps), or later if every browser could not have
     * it by then; it goes in the log of the horde, and the room is told it at once. Once a second at most for a player,
     * as many as they like (`shooter`: their uuid). False when refused: no horde, a point off the map, too soon, or
     * ZOMBIE_GRENADES_IN_FLIGHT grenades in the air already.
     */
    public zombieGrenade(shooter: string, shot: ZombieGrenadeMessage): boolean {
        const horde = this.goingHorde();
        const size = this.mapSize();
        if (!horde || !size || this.stopped) return false;
        const inside = (x: number, y: number): boolean =>
            Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 && x < size.width && y < size.height;
        if (!inside(shot.fromX, shot.fromY) || !inside(shot.toX, shot.toY)) return false;
        const now = this.now();
        if (now - (this.grenadeShots.get(shooter) ?? Number.NEGATIVE_INFINITY) < ZOMBIE_GRENADE_PACE_MS) return false;
        const step = Math.ceil(zombieStepAt(horde, now));
        let gone = 0;
        while (gone < this.grenadesInFlight.length && this.grenadesInFlight[gone] <= step) gone++;
        if (gone > 0) this.grenadesInFlight = this.grenadesInFlight.slice(gone);
        if (this.grenadesInFlight.length >= ZOMBIE_GRENADES_IN_FLIGHT) return false;
        this.grenadeShots.set(shooter, now);
        const aimed = zombieGrenadeAim({
            fromX: Math.round(shot.fromX),
            fromY: Math.round(shot.fromY),
            toX: Math.round(shot.toX),
            toY: Math.round(shot.toY),
        });
        const explodeStep = Math.max(step + ZOMBIE_GRENADE_FUSE_STEPS, horde.safeStep + 1);
        this.grenadesInFlight.push(explodeStep);
        this.hordeLog.push({
            applyStep: explodeStep,
            changes: [],
            grenades: [
                {
                    fromX: Math.round(aimed.fromX),
                    fromY: Math.round(aimed.fromY),
                    toX: Math.round(aimed.toX),
                    toY: Math.round(aimed.toY),
                },
            ],
        });
        this.hordeLogAt.push(now);
        this.hordeLogStale = true;
        // The room is told this shot alone: a browser that missed an entry before waits for the next message.
        this.tellZombies(horde, undefined, this.hordeLog.length - 1);
        return true;
    }

    /**
     * A player shoots a dart of their Nerf into the horde, from its barrel to where its range ends (map pixels), at the
     * step their browser was at (`shotStep`): it goes in the log of the horde, applied once its flight is over and
     * every browser could have it, and the room is told it at once. Every browser and the ground find the zombie it met
     * first, as the crowd was when it flew, and kill it (ZombieDart). Every 250 ms at most for a player (`shooter`: by
     * their uuid), as many as they like. False when refused: no horde, a player in Basique (it does not exist for
     * them), a barrel off the map or away from their avatar, too soon, a step too far from the server's, past
     * ZOMBIE_DARTS_A_SECOND darts in the last second, or a wait longer than the crowd remembers.
     */
    public zombieDart(
        shooter: { uuid: string; basic: boolean; x: number; y: number },
        shot: ZombieDartMessage,
    ): boolean {
        const horde = this.goingHorde();
        const size = this.mapSize();
        if (!horde || !size || this.stopped || shooter.basic) return false;
        const { fromX, fromY, toX, toY, shotStep } = shot;
        if (![fromX, fromY, toX, toY, shotStep].every(Number.isFinite) || !Number.isInteger(shotStep)) return false;
        if (fromX < 0 || fromY < 0 || fromX >= size.width || fromY >= size.height) return false;
        const offX = fromX - shooter.x;
        const offY = fromY - shooter.y;
        if (offX * offX + offY * offY > ZOMBIE_DART_REACH_PX * ZOMBIE_DART_REACH_PX) return false;
        const now = this.now();
        if (now - (this.dartShots.get(shooter.uuid) ?? Number.NEGATIVE_INFINITY) < ZOMBIE_DART_PACE_MS) return false;
        const step = Math.ceil(zombieStepAt(horde, now));
        const late = Math.ceil(ZOMBIE_DART_LATE_MS / horde.msPerStep);
        if (shotStep < step - late || shotStep > step + ZOMBIE_DART_EARLY_STEPS) return false;
        let gone = 0;
        while (gone < this.dartsTakenAt.length && this.dartsTakenAt[gone] <= now - 1000) gone++;
        if (gone > 0) this.dartsTakenAt = this.dartsTakenAt.slice(gone);
        if (this.dartsTakenAt.length >= ZOMBIE_DARTS_A_SECOND) return false;
        const aimed = zombieDartAim({ fromX, fromY, toX, toY });
        if (!aimed) return false;
        const dart = { ...aimed, shotStep, stride: zombieDartStride(horde.msPerStep) };
        // Once its flight is over, never before a step already promised, nor before a dart told before it: the darts
        // are applied in the order they were told (a dart passes by the zombie a dart before met).
        const applyStep = Math.max(zombieDartFlightEnd(dart), horde.safeStep + 1, this.lastDartStep);
        if (!zombieDartFits(dart, applyStep)) return false;
        this.dartShots.set(shooter.uuid, now);
        this.dartsTakenAt.push(now);
        this.lastDartStep = applyStep;
        this.hordeLog.push({ applyStep, changes: [], darts: [dart] });
        this.hordeLogAt.push(now);
        this.hordeLogStale = true;
        // The room is told this shot alone, as a grenade.
        this.tellZombies(horde, undefined, this.hordeLog.length - 1);
        return true;
    }

    /** A player stops the horde of the room: it is gone at once, and the room is told. False when there is none. */
    public stopZombies(): boolean {
        const horde = this.goingHorde();
        if (!horde || this.stopped) return false;
        this.tellZombies(horde, 0);
        this.endZombies();
        return true;
    }

    /** The horde crossing the map now; undefined once it ended. */
    public zombies(): ZombieHorde | undefined {
        const horde = this.wholeHorde();
        return horde && zombieHordeGoing(horde, this.now()) ? horde : undefined;
    }

    /** The horde crossing the map now, its log as last written out: what the room checks without writing it. */
    private goingHorde(): ZombieHorde | undefined {
        const horde = this.horde;
        return horde && zombieHordeGoing(horde, this.now()) ? horde : undefined;
    }

    /** The horde with its whole log written out, once a while after entries were written. */
    private wholeHorde(): ZombieHorde | undefined {
        if (this.horde && this.hordeLogStale) {
            this.horde = { ...this.horde, avatars: encodeZombieLog(this.hordeLog) };
            this.hordeLogStale = false;
        }
        return this.horde;
    }

    private endZombies(): void {
        this.horde = undefined;
        if (this.hordeTimer) clearInterval(this.hordeTimer);
        this.hordeTimer = undefined;
    }

    /**
     * Tells the room the horde, and how long it still lasts: 0 once it ended, and then it is forgotten. Its log from
     * the entry `from` on (by default those written in the last ZOMBIE_LOG_TAIL_MS), whole with its ground.
     */
    private tellZombies(horde = this.horde, lastsMs?: number, from?: number): void {
        if (!horde) return this.endZombies();
        const now = this.now();
        const left = lastsMs ?? zombieMsLeft(horde, now);
        // Its ground and its whole log at once, then every 30 s in case a browser lost a message: the other messages
        // carry the hash of the ground and the last entries of the log only. Who joins asks for them (wholeZombies).
        const withTerrain = left > 0 && now - this.hordeTerrainToldAt >= ZOMBIE_TERRAIN_TELL_MS;
        if (withTerrain) this.hordeTerrainToldAt = now;
        let logFrom = 0;
        if (!withTerrain) {
            logFrom = from ?? this.hordeLogAt.length;
            while (from === undefined && logFrom > 0 && this.hordeLogAt[logFrom - 1] >= now - ZOMBIE_LOG_TAIL_MS) {
                logFrom--;
            }
            logFrom = Math.max(0, Math.min(logFrom, this.hordeLog.length));
        }
        this.room.sendSubMessageToRoom({
            message: {
                $case: "catastropheMessage",
                catastropheMessage: this.zombiesMessage(horde, left, withTerrain, logFrom),
            },
        });
        if (left <= 0) this.endZombies();
    }

    /**
     * The whole horde, its ground and its whole log, for a player whose browser asks for it (it joined, or lost a
     * message): once in ZOMBIE_ANSWER_WHOLE_MS at most for a player (`asker`, their uuid). Undefined when there is none,
     * or too soon.
     */
    public wholeZombies(asker: string): CatastropheMessage | undefined {
        const horde = this.goingHorde();
        if (!horde || this.stopped) return undefined;
        const now = this.now();
        if (now - (this.wholeAsked.get(asker) ?? Number.NEGATIVE_INFINITY) < ZOMBIE_ANSWER_WHOLE_MS) return undefined;
        this.wholeAsked.set(asker, now);
        return this.zombiesMessage(horde, zombieMsLeft(horde, now), true, 0);
    }

    /** The message of the horde: its ground or only its hash, its log from the entry `logFrom` on (the whole by 0). */
    private zombiesMessage(
        horde: ZombieHorde,
        left: number,
        withTerrain: boolean,
        logFrom: number,
    ): CatastropheMessage {
        return {
            id: horde.id,
            kind: CatastropheKind.CATASTROPHE_ZOMBIES,
            x: 0,
            y: 0,
            impactInMs: Math.round(left),
            radiusTiles: 0,
            wholeMap: true,
            zombies: {
                count: horde.count,
                minutes: Math.round(horde.durationMs / 60_000),
                heading: horde.heading,
                seed: horde.seed,
                startedAt: horde.startedAt,
                durationMs: horde.durationMs,
                dirX: horde.dirX,
                dirY: horde.dirY,
                anchorX: horde.anchorX,
                anchorY: horde.anchorY,
                widthCells: horde.widthCells,
                heightCells: horde.heightCells,
                terrain: withTerrain ? horde.terrain : "",
                terrainHash: this.hordeTerrainHash,
                collisions: "",
                collisionsWidth: 0,
                collisionsHeight: 0,
                anchorStep: horde.anchorStep,
                anchorAt: horde.anchorAt,
                msPerStep: horde.msPerStep,
                avatars:
                    logFrom > 0
                        ? encodeZombieLog(this.hordeLog.slice(logFrom))
                        : (this.wholeHorde()?.avatars ?? horde.avatars),
                logFrom,
                safeStep: horde.safeStep,
            },
        };
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
        tsunami?: TsunamiMessage,
    ): boolean {
        // A ball is let go, a cold snap, a hurricane and a tsunami are stopped: the others end by themselves.
        if (release) {
            if (kind === CatastropheKind.CATASTROPHE_COLD) return this.calm();
            if (kind === CatastropheKind.CATASTROPHE_HURRICANE) return this.stopHurricane();
            if (kind === CatastropheKind.CATASTROPHE_TSUNAMI) return this.stopTsunami();
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
        if (kind === CatastropheKind.CATASTROPHE_TSUNAMI) return tsunami ? this.startTsunami(tsunami) : false;
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
        this.endTsunami();
        this.endZombies();
    }
}
