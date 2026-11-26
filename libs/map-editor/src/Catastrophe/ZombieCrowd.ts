import { TERRAIN_CELL, TILE_PX } from "../types";
import {
    decodeZombieLog,
    decodeZombieLogFrom,
    decodeZombieTerrain,
    ZOMBIE_EAST,
    ZOMBIE_PX_PER_METRE,
    ZOMBIE_SOLID,
    ZOMBIE_SOUTH,
    ZOMBIE_STEP_MS,
    ZOMBIE_WATER,
    zombieLastStep,
    zombieLogBytes,
    zombieLogInOrder,
    zombieLogInsert,
    zombieStepAt,
} from "./ZombieHorde";
import {
    ZOMBIE_GRENADE_BLAST_M,
    ZOMBIE_GRENADE_FUSE_STEPS,
    ZOMBIE_GRENADE_LETHAL_M,
    zombieGrenadePath,
} from "./ZombieGrenade";
import type { ZombieGrenadePath, ZombieGrenadeShot } from "./ZombieGrenade";
import {
    ZOMBIE_DART_FALL_STEPS,
    ZOMBIE_DART_HALF_WIDTH_PX,
    ZOMBIE_DART_BODY_PX,
    ZOMBIE_DART_HISTORY_STEPS,
    ZOMBIE_DART_RECOIL_PX,
    ZOMBIE_DART_TICKS,
    zombieDartBody,
    zombieDartEnters,
    zombieDartFits,
    zombieDartReach,
    zombieDartWay,
} from "./ZombieDart";
import type { ZombieDart, ZombieDartHit } from "./ZombieDart";
import { zombieImpactRadii } from "./ZombieImpact";
import type { ZombieHorde, ZombieLogEntry } from "./ZombieHorde";

/**
 * The crowd of a horde of zombies, stepped the same everywhere: on the thread of the ground of the server (which
 * reads where it tramples) and in every browser (which draws it). Its state depends on the horde (its ground frozen
 * by the server, the log of the avatars) and on the number of the step only, never on the time a step is taken at.
 * For that, the step uses nothing but + - * /, Math.sqrt, Math.floor, Math.min, Math.max and Math.abs (exact in every
 * engine), an integer luck (mulberry32) and typed arrays filled in the same order: no sine, no exponential, no
 * Math.hypot, no sort. It never steps past the last step the log of the avatars is complete to (`safeStep`): a lost
 * message stalls it, never sends it another way.
 *
 * The model, a crowd that emerges from rules each zombie follows, not a drawing moved along a track:
 * - Where to go: out by the far side, down a potential over the cells of the map (the time to run out), computed once
 *   by the fast marching method (Sethian 1996, PNAS 93). Its exits lie along a line beyond the map, square to the
 *   heading: on open ground it sends every zombie straight on; around a building, a lake or a river, by the shortest
 *   way round, over the bridges, through the doors (the "floor field" of crowd models, Kirchner and Schadschneider
 *   2002, Physica A 312). Water, walls and the collisions of the map are never entered.
 * - Or towards an avatar: the horde senses every avatar of the map, wherever it is, through the walls (a choice of
 *   the user: the avatars are nearly always in the buildings). Each zombie runs to the avatar nearest to it by the way
 *   the plan of the map allows: one distance field from all the avatars at once (a multi-source Dijkstra over the
 *   cells, through the doors and over the bridges), each cell knowing the avatar it is nearest to; made again only
 *   when an avatar changes tile. Every zombie runs to it, however many they are, and sticks to it (a choice of the
 *   user): it follows it wherever it goes, round it in the crowd that packs there, and never gives up on it while it
 *   can reach it. One that cannot reach any avatar goes on its way. When its time runs short, the way out wins over
 *   any avatar.
 * - How fast: it runs, at its own pace (3 to 5 m/s: endurance running of humans, 2.3 to 6.5 m/s, Bramble and
 *   Lieberman 2004, Nature 432), held back by the crowd ahead of it by the fundamental diagram of Weidmann (1993,
 *   Schriftenreihe IVT 90): v = v0 (1 - exp(-1.913 (1/rho - 1/5.4))), rho the density within a metre ahead of it.
 *   Where it squeezes through a door or onto a bridge it packs, pushes and queues.
 * - Who is around: the social force of Helbing and Molnar (1995, Physical Review E 51) and its body forces at speed
 *   (Helbing, Farkas and Vicsek 2000, Nature 407): each zombie relaxes to the velocity it wants in 0.5 s, so that it
 *   turns wide at a run, and is pushed away by those near it (and by the avatars, which stand in its way), more by
 *   those ahead than behind (anisotropy, Johansson, Helbing and Shukla 2007). Its exponential is replaced by a
 *   polynomial of the same reach, exact everywhere. A little alignment keeps it running with the others (Reynolds
 *   1987, SIGGRAPH).
 * - Bodies do not overlap: their contacts are undone once a step, pair by pair in a fixed order (position-based
 *   dynamics, Weiss et al. 2017); a wall is never crossed.
 */

/** A step of the crowd at the speed of reality: ten a second (a sped up horde takes its steps faster). */
const DT = ZOMBIE_STEP_MS / 1000;

const PX = ZOMBIE_PX_PER_METRE;
/** The radius of a body (Helbing, Farkas and Vicsek 2000 take 0.25 to 0.35 m), and that of an avatar. */
export const ZOMBIE_RADIUS_PX = 0.25 * PX;
const AVATAR_RADIUS_PX = 0.3 * PX;
/** Beyond touching, a zombie feels another this far (m), the most when touching, nothing at the end. */
const SOCIAL_RANGE_PX = 0.5 * PX;
/** How hard the others push a zombie away when they touch it, m/s². */
const SOCIAL_ACCEL = 1.5 * PX;
/** How much less those behind count than those ahead (lambda; 1 is as much). */
const ANISOTROPY = 0.3;
/** How long a zombie takes to get to the velocity it wants (tau, s). */
const RELAX_SECONDS = 0.5;
/** How fast it matches the velocity of its neighbours, a share a second. */
const ALIGNMENT = 0.3;
/** The crowd ahead of a zombie is counted within this radius (1 m). */
const DENSITY_RADIUS_PX = 1 * PX;
/**
 * The share of its pace a zombie keeps with `n` others within a metre: Weidmann (1993) at rho = (n + 1) / pi,
 * computed once and written out, so that no engine computes it with an exponential of its own.
 */
const WEIDMANN: readonly number[] = [
    0.9965, 0.9294, 0.8078, 0.6828, 0.5716, 0.4766, 0.3961, 0.3276, 0.2691, 0.2186, 0.1748, 0.1363, 0.1024, 0.0723,
    0.0453, 0.0211, 0,
];
/** Contacts are undone this much at a step (1 is entirely). */
const CONTACT_STIFFNESS = 0.8;
/** A zombie never moves more than this in a step: under a cell, it cannot jump over one (and its walls). */
const MOST_A_STEP_PX = TERRAIN_CELL - 0.5;

/** Its pace: a run, from this to this (m/s), each zombie its own. */
const SLOWEST_RUN_PX = 3 * PX;
const FASTEST_RUN_PX = 5 * PX;
/** It comes in as a column this dense, this many times wider than deep. */
const MARCH_DENSITY = 1.6;
const FRONT_ASPECT = 3;
const LEAST_FRONT_PX = 12 * PX;
/** It comes in over this share of its duration: a horde that keeps coming, wave after wave. */
const EMIT_SHARE = 0.4;
/** How far its sway turns it from its way (a share of its way), and how fast that sway wanders. */
const SWAY = 0.25;
const SWAY_WANDER = 0.06;
/** A tile has room for one more coming in under this many zombies. */
const ROOM_A_TILE = 3;
const ENTRY_TRIES = 4;

/**
 * Within this of its avatar by the way of the map (under 3 cells, in the units of the fields), a zombie runs straight
 * at it (the field is flat on its tile); within ARRIVE_PX of it, slower and slower: it sticks to it without overrunning
 * it.
 */
const CLOSE_FIELD = 30;
const ARRIVE_PX = 1 * PX;
/**
 * The way to the avatars costs more through a crowd (a dynamic floor field, Burstedde et al. 2001, Physica A 295;
 * the congestion term of Hughes 2002, Transportation Research B 36): a cell of a tile where more than CROWD_FREE
 * zombies stand costs CROWD_COST more for each one more, CROWD_MOST at most (a free cell costs 10). The field is
 * made again every CROWD_REFIELD_STEPS steps while a tile is crowded: a queue at a narrow bridge or a door sends those
 * behind by another way when there is one, the crowd round an avatar spreads round it.
 */
const CROWD_FREE = 2;
const CROWD_COST = 10;
const CROWD_MOST = 240;
const CROWD_REFIELD_STEPS = 20;
/** The way out wins once the time to run out, this much longer, is more than the time left. */
const URGENCY_MARGIN = 1.6;
/**
 * The whole horde runs out once the time left is under the time its furthest zombie needs to run out, this much
 * longer and a few seconds more: no avatar holds it past that (a jam at a door would hold it otherwise).
 */
const RUSH_MARGIN = 2;
const RUSH_SECONDS = 10;
/**
 * A crowd gets out of a narrow passage (a door, a narrow bridge) at so many a second for each metre of its width (the
 * specific flow of a bottleneck, about 1.3 persons/(m s): Weidmann 1993, Seyfried et al. 2009, Transportation
 * Science 43). The zombies whose way out goes through a passage narrower than NARROW_CELLS cells on each side of its
 * middle wait their turn there: the whole horde runs out early enough for the slowest passage to let its own through,
 * by no more than DRAIN_SHARE of its time. Those still in at the end fall to dust with the others.
 */
const BOTTLENECK_FLOW = 1.3;
const NARROW_CELLS = 4;
const DRAIN_SHARE = 0.5;
/** A zombie that overlaps an avatar wholly shoves it at this speed (px/s), and carries it this share of its own. */
const SHOVE_PX_S = 3 * PX;
const SHOVE_CARRY = 0.5;
/** An avatar is never shoved faster than a human is when pushed in a crowd (m/s). */
export const ZOMBIE_SHOVE_MOST_M_S = 2.5;
/** The avatars a horde follows, at most (the first seen). */
export const ZOMBIE_MOST_AVATARS = 32;
/** The distance field counts 10 a cell across, 14 a cell on the diagonal; this is "out of reach". */
const FAR = 0x7fffffff;

/** What a zombie is doing. */
export const ZOMBIE_WAITING = 0;
export const ZOMBIE_WALKING = 1;
export const ZOMBIE_GONE = 2;
/** Thrown by a grenade, burning: it falls, burns, and is gone at its step `dieAt`. */
export const ZOMBIE_DYING = 3;
/** Met by a dart of the Nerf: it recoils, falls, lies, and is gone at its step `dieAt` (it does not burn). */
export const ZOMBIE_SHOT = 4;
/** Thrown by a comet that landed by it: it falls as one a grenade threw, dead, without burning; gone at `dieAt`. */
export const ZOMBIE_THROWN = 5;

/** Where a zombie that did not walk at a step was (ZombieCrowd remembers where its zombies walked, in half pixels). */
const PAST_NONE = 0xffff;
const NEVER = 0x7fffffff;

/**
 * A dart told by the log, as far as its flight is known now (ZombieCrowd.dartsSeen): what a browser draws, the zombies
 * it went through falling, before the log applies it. The log applies it as it is seen.
 */
export interface ZombieDartSeen {
    dart: ZombieDart;
    applyStep: number;
    /** Its unit vector. */
    ux: number;
    uy: number;
    /** The zombies it went through so far (it kills every one, and flies on). */
    hits: ZombieDartHit[];
    /** Its flight is known to its end. */
    over: boolean;
}

interface DartRecord extends ZombieDartSeen {
    /** The next tick of its flight to check, and how far it flies before a wall. */
    tick: number;
    reach: number;
    length: number;
    /** The zombies it may meet (dartCandidates) and the first still waiting to come in when it was shot, once read. */
    candidates: Int32Array | undefined;
    cameIn: number;
}

/**
 * What the blast of a grenade does to a zombie: thrown up and away, the more the nearer (m/s, a choice of the order of
 * what the blast of a few hundred grams of explosive gives a body at a few metres), then it burns this long and is gone.
 * Beyond the radius of fatality, within that of casualties, it is only shoved.
 */
const BLAST_UP_M_S = 7;
const BLAST_AWAY_M_S = 9;
const SHOVE_AWAY_M_S = 5;
export const ZOMBIE_BURN_STEPS = 40;
/** A meteor throws the zombies of its crater higher and further than a grenade: a rock of tonnes, not 400 g. */
const IMPACT_POWER = 1.5;
/** A body thrown bounces off the ground keeping this share of its speed downwards, and slides to a stop. */
const BODY_BOUNCE = 0.25;
const BODY_SLIDE_BRAKE = 6;
const G_PX_S2 = 9.81 * ZOMBIE_PX_PER_METRE;

/** A grenade of the log, by the step it goes off at and its points: the same in every message that tells it. */
function shotKey(explodeStep: number, shot: ZombieGrenadeShot): string {
    return `${explodeStep}:${shot.fromX}:${shot.fromY}:${shot.toX}:${shot.toY}`;
}

/** A dart of the log, by the step it is applied at and all it is told with. */
function dartKey(applyStep: number, dart: ZombieDart): string {
    return `${applyStep}:${dart.fromX}:${dart.fromY}:${dart.toX}:${dart.toY}:${dart.shotStep}:${dart.stride}`;
}

function mulberry32(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** The crowd of a horde. */
export class ZombieCrowd {
    public readonly count: number;
    public readonly width: number;
    public readonly height: number;
    /** The ground of each cell, as the server froze it (ZOMBIE_WATER, ZOMBIE_EAST, ZOMBIE_SOUTH, ZOMBIE_SOLID). */
    public readonly terrain: Uint8Array;
    /** Where each zombie is (map pixels), where it was a step before, its velocity (px/s) and what it is doing. */
    public readonly x: Float64Array;
    public readonly y: Float64Array;
    public readonly lastX: Float64Array;
    public readonly lastY: Float64Array;
    public readonly vx: Float64Array;
    public readonly vy: Float64Array;
    public readonly state: Uint8Array;
    /** How high a zombie thrown by a blast is (px), how fast it rises, the step it is gone at. */
    public readonly z: Float64Array;
    public readonly vz: Float64Array;
    public readonly dieAt: Int32Array;
    /** The avatar each zombie runs to (its slot), -1 when it runs out. */
    public readonly target: Int8Array;
    /** The steps taken: the crowd is the horde at its step `steps`. */
    public steps = 0;
    /** At this step the horde is over: whoever is still on the map is gone. */
    public readonly lastStep: number;
    /** How many walk now, and how many burn, thrown by a blast. */
    public walking = 0;
    public dying = 0;
    /** The time to run out from each cell (fast marching, in cells), Infinity where none runs out. */
    public readonly potential: Float64Array;
    /** The tile each avatar stands on (its slot), -1 where none. */
    public readonly avatarTile = new Int32Array(ZOMBIE_MOST_AVATARS).fill(-1);

    private readonly widthPx: number;
    private readonly heightPx: number;
    private readonly tilesWide: number;
    private readonly tilesHigh: number;
    private readonly wayX: Float32Array;
    private readonly wayY: Float32Array;
    private readonly exits: Uint8Array;
    /**
     * How narrow the way out of each cell gets at its narrowest (cells from the middle of the passage to its side,
     * NARROW_CELLS where it never gets narrower): computed once with the potential.
     */
    private readonly narrowOut: Uint8Array;
    /** The tile of the narrowest passage on the way out of each cell (-1 where none is narrow), and who waits there. */
    private readonly narrowAt: Int32Array;
    private readonly waiting: Float64Array;
    private readonly entries: Int32Array;
    private readonly pace: Float64Array;
    private readonly sway: Float64Array;
    private readonly nextVx: Float64Array;
    private readonly nextVy: Float64Array;
    private readonly emitSteps: number;
    private nextIn = 0;
    private readonly random: () => number;
    private readonly tileStart: Int32Array;
    private readonly tileList: Int32Array;
    private readonly tileOf: Int32Array;
    private readonly trampled: Float32Array;
    private trampledAny = false;
    /** Running out, whatever it hears: its time runs short. */
    private readonly leaving: Uint8Array;
    /** The whole horde runs out. */
    private rushing = false;
    /**
     * The distance by the way of the map from each cell to the nearest avatar, and that avatar (its slot, -1 out of
     * reach); made again at the step an avatar changes tile (`fieldStale`). Undefined while there is no avatar.
     */
    private field: Int32Array | undefined;
    private owner: Int8Array | undefined;
    private fieldStale = false;
    /** The ways out of each cell (waysOf), made the first time the field is. */
    private ways: Uint8Array | undefined;
    /** What the crowd of its tile adds to a step into each cell (spread). */
    private readonly crowdCost: Int32Array;
    /**
     * The buckets of the Dijkstra, by distance modulo 256 (a step adds 10 or 14, and the crowd of the tile it goes
     * into, CROWD_MOST at most): kept from one making to the next.
     */
    private readonly buckets: number[][] = Array.from({ length: 256 }, () => []);
    /**
     * The grenades told that have not gone off yet (and those of the last step, drawn until it), by their entry
     * (shotKey), with their paths once computed; the blasts not yet taken.
     */
    private shots = new Map<string, { explodeStep: number; shot: ZombieGrenadeShot; path?: ZombieGrenadePath }>();
    private explosions: { x: number; y: number; step: number; killed: number }[] = [];
    /** How many zombies the comets and the burning meteors that landed in the horde killed (ZombieImpact). */
    private impactKills = 0;
    /**
     * Where each zombie walked at each of the last ZOMBIE_DART_HISTORY_STEPS steps (in half pixels, PAST_NONE where it
     * did not walk), a step after the other in a ring: where the darts the log applies met them. Written at one place,
     * at the end of each step (and when the crowd is made), the same everywhere.
     */
    private readonly pastX: Uint16Array;
    private readonly pastY: Uint16Array;
    /** The first zombie still waiting to come in at each of those steps (they come in in the order of their numbers). */
    private readonly pastIn = new Int32Array(ZOMBIE_DART_HISTORY_STEPS);
    /** The step a dart met each zombie at (NEVER when none): a dart told after it passes its fallen body by. */
    private readonly claimedAt: Int32Array;
    /** The step the dart that killed each zombie met it at (NEVER when none): the view draws its fall from it. */
    public readonly hitStep: Int32Array;
    /** The darts as far as their flight is known (dartsSeen), and the log they were read from. */
    private seen: DartRecord[] = [];
    private seenVersion = -1;
    private seenSteps = -1;
    /** The log of the avatars, the next entry to apply, and the last step it is complete to. */
    private log: ZombieLogEntry[] = [];
    private logAt = 0;
    /** The text of the log last read: told again (the server reads it ten times a second), it is nothing new. */
    private logText: string | undefined;
    /** The bytes that text holds, and how many times the log changed (what dartsSeen reads again). */
    private logBytes = 0;
    /** The entries last read as they were told (setLogEntries), and how many of them. */
    private toldEntries: readonly ZombieLogEntry[] | undefined;
    private toldRead = 0;
    private logVersion = 0;
    private safeStep: number;
    private atX = 0;
    private atY = 0;
    /** The lowest potential of the exits: what is left to run out from a cell is its potential over this. */
    private exitLevel = Number.POSITIVE_INFINITY;

    /** The horde, its clock as last told (setClock). */
    public readonly horde: ZombieHorde;

    constructor(horde: ZombieHorde, terrain?: Uint8Array) {
        this.horde = { ...horde };
        const width = Math.max(1, Math.floor(horde.widthCells));
        const height = Math.max(1, Math.floor(horde.heightCells));
        this.width = width;
        this.height = height;
        this.widthPx = width * TERRAIN_CELL;
        this.heightPx = height * TERRAIN_CELL;
        this.terrain = terrain ?? decodeZombieTerrain(horde.terrain, width * height);
        const count = Math.max(0, Math.floor(horde.count));
        this.count = count;
        this.x = new Float64Array(count);
        this.y = new Float64Array(count);
        this.lastX = new Float64Array(count);
        this.lastY = new Float64Array(count);
        this.vx = new Float64Array(count);
        this.vy = new Float64Array(count);
        this.nextVx = new Float64Array(count);
        this.nextVy = new Float64Array(count);
        this.state = new Uint8Array(count);
        this.z = new Float64Array(count);
        this.vz = new Float64Array(count);
        this.dieAt = new Int32Array(count);
        this.pastX = new Uint16Array(count * ZOMBIE_DART_HISTORY_STEPS);
        this.pastY = new Uint16Array(count * ZOMBIE_DART_HISTORY_STEPS);
        this.claimedAt = new Int32Array(count).fill(NEVER);
        this.hitStep = new Int32Array(count).fill(NEVER);
        this.target = new Int8Array(count).fill(-1);
        this.pace = new Float64Array(count);
        this.sway = new Float64Array(count);
        this.leaving = new Uint8Array(count);
        this.tileOf = new Int32Array(count);
        this.tileList = new Int32Array(count);
        this.tilesWide = Math.ceil(this.widthPx / TILE_PX);
        this.tilesHigh = Math.ceil(this.heightPx / TILE_PX);
        this.tileStart = new Int32Array(this.tilesWide * this.tilesHigh + 1);
        this.crowdCost = new Int32Array(width * height);
        this.trampled = new Float32Array(this.tilesWide * this.tilesHigh);
        this.lastStep = zombieLastStep(horde);
        this.random = mulberry32(horde.seed);
        this.exits = new Uint8Array(width * height);
        this.narrowOut = new Uint8Array(width * height);
        this.narrowAt = new Int32Array(width * height).fill(-1);
        this.waiting = new Float64Array(this.tilesWide * this.tilesHigh);
        this.potential = new Float64Array(width * height);
        this.wayX = new Float32Array(width * height);
        this.wayY = new Float32Array(width * height);
        this.march();
        this.narrowWays();
        const frontPx = Math.max(LEAST_FRONT_PX, Math.sqrt((count * FRONT_ASPECT) / MARCH_DENSITY) * PX);
        this.entries = this.entryCells(frontPx);
        this.emitSteps = Math.max(1, Math.floor(this.lastStep * EMIT_SHARE));
        for (let zombie = 0; zombie < count; zombie++) {
            this.pace[zombie] = SLOWEST_RUN_PX + (FASTEST_RUN_PX - SLOWEST_RUN_PX) * this.random();
            this.sway[zombie] = (this.random() * 2 - 1) * SWAY;
        }
        this.safeStep = -1;
        if (horde.log) this.setLogEntries(horde.log, horde.safeStep);
        else this.setLog(horde.avatars, horde.safeStep);
        this.recordPast();
    }

    /**
     * The log of the avatars as the server tells it now: the same entries again and those that came since, and the
     * last step it is complete to. A log that disagrees with what was applied already is not taken.
     */
    public setLog(text: string, safeStep: number): void {
        if (text === this.logText) {
            if (Number.isFinite(safeStep) && safeStep > this.safeStep) this.safeStep = safeStep;
            return;
        }
        // The log read before and entries after it (as it grows): only those are read, each put in its place as if the
        // whole log was read again. Another log (a whole one after a lost message): read whole.
        const added = this.addedTo(text);
        if (!this.takeLog(added ?? decodeZombieLog(text), added !== undefined, safeStep)) return;
        this.logText = text;
        this.logBytes = zombieLogBytes(text);
        this.toldEntries = undefined;
    }

    /**
     * The log as its entries, in the order they were told (a browser glues them as they come): the same array grown
     * since it was last read gives its new entries only, another array is read whole. The same as setLog of its text.
     */
    public setLogEntries(entries: readonly ZombieLogEntry[], safeStep: number): void {
        const grown = entries === this.toldEntries && entries.length >= this.toldRead;
        if (grown && entries.length === this.toldRead) {
            if (Number.isFinite(safeStep) && safeStep > this.safeStep) this.safeStep = safeStep;
            return;
        }
        if (!this.takeLog(grown ? entries.slice(this.toldRead) : entries, grown, safeStep)) return;
        this.toldEntries = entries;
        this.toldRead = entries.length;
        this.logText = undefined;
    }

    /**
     * Entries of the log, after those read before (`added`) or the whole log: false when they disagree with what was
     * applied already (an entry before those applied), and nothing is taken.
     */
    private takeLog(entries: readonly ZombieLogEntry[], added: boolean, safeStep: number): boolean {
        if (added) {
            const applied = this.logAt > 0 ? this.log[this.logAt - 1].applyStep : Number.NEGATIVE_INFINITY;
            for (const entry of entries) if (entry.applyStep < applied) return false;
            for (const entry of entries) zombieLogInsert(this.log, entry);
        } else {
            const ordered = zombieLogInOrder(entries);
            for (let at = 0; at < this.logAt; at++) {
                if (at >= ordered.length || ordered[at].applyStep !== this.log[at].applyStep) return false;
            }
            this.log = ordered;
        }
        this.logVersion++;
        if (Number.isFinite(safeStep) && safeStep > this.safeStep) this.safeStep = safeStep;
        // The grenades not gone off yet (and those of the last step, still drawn): their paths, made when first asked
        // for, kept from the log read before. Those gone off long ago are not looked at again.
        const log = this.log;
        const shots = new Map<string, { explodeStep: number; shot: ZombieGrenadeShot; path?: ZombieGrenadePath }>();
        let from = log.length;
        while (from > 0 && log[from - 1].applyStep >= this.steps - 1) from--;
        for (let at = from; at < log.length; at++) {
            const entry = log[at];
            for (const shot of entry.grenades ?? []) {
                const key = shotKey(entry.applyStep, shot);
                shots.set(key, this.shots.get(key) ?? { explodeStep: entry.applyStep, shot });
            }
        }
        this.shots = shots;
        return true;
    }

    /**
     * The entries `text` holds after the log read before, when it is that log with entries after it; undefined when it
     * is another log. Its whole groups of three bytes compared as text, the bytes before them as bytes.
     */
    private addedTo(text: string): ZombieLogEntry[] | undefined {
        const known = this.logText;
        if (known === undefined || text.length < known.length) return undefined;
        const whole = Math.floor(this.logBytes / 3) * 4;
        if (!text.startsWith(whole === known.length ? known : known.slice(0, whole))) return undefined;
        const read = decodeZombieLogFrom(text, this.logBytes);
        if (whole < known.length) {
            const before = decodeZombieLogFrom(known, this.logBytes).before;
            if (before.length !== read.before.length || before.some((byte, at) => byte !== read.before[at])) {
                return undefined;
            }
        }
        return read.entries;
    }

    /** The path of a grenade over the ground of the horde. */
    private pathOf(grenade: { shot: ZombieGrenadeShot; path?: ZombieGrenadePath }): ZombieGrenadePath {
        grenade.path ??= zombieGrenadePath(grenade.shot, {
            width: this.width,
            height: this.height,
            terrain: this.terrain,
        });
        return grenade.path;
    }

    /**
     * The grenades in the air or on the ground at `step` (a fractional step, to draw between two): where each is, how
     * high, and the step it goes off at.
     */
    public grenadesAt(step: number): { x: number; y: number; z: number; explodeStep: number }[] {
        const flying: { x: number; y: number; z: number; explodeStep: number }[] = [];
        for (const grenade of this.shots.values()) {
            const since = step - (grenade.explodeStep - ZOMBIE_GRENADE_FUSE_STEPS);
            if (since < 0 || since >= ZOMBIE_GRENADE_FUSE_STEPS) continue;
            const path = this.pathOf(grenade);
            const at = Math.floor(since);
            const between = since - at;
            const next = Math.min(ZOMBIE_GRENADE_FUSE_STEPS, at + 1);
            flying.push({
                x: path.x[at] + (path.x[next] - path.x[at]) * between,
                y: path.y[at] + (path.y[next] - path.y[at]) * between,
                z: path.z[at] + (path.z[next] - path.z[at]) * between,
                explodeStep: grenade.explodeStep,
            });
        }
        return flying;
    }

    /** How many zombies the comets and the burning meteors that landed in the horde killed so far. */
    public get killedByImpacts(): number {
        return this.impactKills;
    }

    /** The blasts since this was last asked: where, and how many zombies each killed. */
    public takeExplosions(): { x: number; y: number; step: number; killed: number }[] {
        const taken = this.explosions;
        this.explosions = [];
        return taken;
    }

    /**
     * The clock of the horde as the server tells it now (sped up or slowed down by the speed of the map): the steps
     * stay the same, only the time they fall at changes.
     */
    public setClock(clock: Pick<ZombieHorde, "anchorStep" | "anchorAt" | "msPerStep">): void {
        if (!(clock.msPerStep > 0)) return;
        this.horde.anchorStep = clock.anchorStep;
        this.horde.anchorAt = clock.anchorAt;
        this.horde.msPerStep = clock.msPerStep;
    }

    /**
     * How the zombies running over a point shove an avatar standing there (px/s): out of each body it touches, by
     * how far they overlap, and carried a little along with it (the body force and the sliding friction of Helbing,
     * Farkas and Vicsek 2000), at a human pace at most (ZOMBIE_SHOVE_MOST_M_S). Not part of the steps of the crowd:
     * the browser of the player shoves its own avatar, which moves as it always does.
     */
    public shoveAt(px: number, py: number): { x: number; y: number } {
        const touch = ZOMBIE_RADIUS_PX + AVATAR_RADIUS_PX;
        let sx = 0;
        let sy = 0;
        // A zombie a dart met is drawn falling: it shoves nobody, though it walks on until the log applies the dart.
        const fallen = new Set<number>();
        for (const seen of this.dartsSeen()) {
            for (const hit of seen.hits) if (hit.step <= this.steps) fallen.add(hit.zombie);
        }
        for (let zombie = 0; zombie < this.count; zombie++) {
            if (this.state[zombie] !== ZOMBIE_WALKING || fallen.has(zombie)) continue;
            const dx = px - this.x[zombie];
            const dy = py - this.y[zombie];
            const d2 = dx * dx + dy * dy;
            if (d2 >= touch * touch) continue;
            const d = Math.sqrt(d2);
            const overlap = (touch - d) / touch;
            if (d > 1e-6) {
                sx += (dx / d) * overlap * SHOVE_PX_S;
                sy += (dy / d) * overlap * SHOVE_PX_S;
            }
            sx += this.vx[zombie] * overlap * SHOVE_CARRY;
            sy += this.vy[zombie] * overlap * SHOVE_CARRY;
        }
        const speed = Math.sqrt(sx * sx + sy * sy);
        const most = ZOMBIE_SHOVE_MOST_M_S * PX;
        if (speed > most) {
            sx *= most / speed;
            sy *= most / speed;
        }
        return { x: sx, y: sy };
    }

    /** The pace of the horde, m/s, as its zombies run it on average. */
    public paceMetres(): number {
        let sum = 0;
        for (let zombie = 0; zombie < this.count; zombie++) sum += this.pace[zombie];
        return this.count > 0 ? sum / this.count / PX : 0;
    }

    /** Whether the horde is over at this step: nobody walks any more, nobody will come. */
    public over(): boolean {
        return (
            this.steps >= this.lastStep ||
            (this.nextIn >= this.count && this.walking === 0 && this.dying === 0 && this.steps > 0)
        );
    }

    /**
     * Steps the crowd to the time `epoch` (ms, the time of the server), `most` steps at most, and never past the last
     * step the log of the avatars is complete to. True once it is there.
     */
    public advanceTo(epoch: number, most = Number.POSITIVE_INFINITY): boolean {
        const target = this.stepFor(epoch);
        let taken = 0;
        while (this.steps < target && taken < most && this.steps <= this.safeStep) {
            this.step();
            taken++;
        }
        return this.steps >= target;
    }

    /** Whether the crowd waits for the log of the avatars (it would step further otherwise). */
    public stalled(epoch: number): boolean {
        return this.steps < this.stepFor(epoch) && this.steps > this.safeStep;
    }

    /** The step whose state holds the time `epoch`: the one at or just after it. */
    public stepFor(epoch: number): number {
        if (!Number.isFinite(epoch)) return this.steps;
        return Math.min(this.lastStep, Math.max(0, Math.floor(zombieStepAt(this.horde, epoch)) + 1));
    }

    /** How far the time `epoch` is between the last step and the one before (0 to 1), to draw between them. */
    public between(epoch: number): number {
        return Math.min(1, Math.max(0, zombieStepAt(this.horde, epoch) - (this.steps - 1)));
    }

    /** The tiles the horde went over since this was last asked, each with how many zombies crossed it. */
    public takeTrample(): { tileX: number; tileY: number; passes: number }[] {
        if (!this.trampledAny) return [];
        const taken: { tileX: number; tileY: number; passes: number }[] = [];
        for (let tile = 0; tile < this.trampled.length; tile++) {
            const passes = this.trampled[tile];
            if (passes <= 0) continue;
            taken.push({ tileX: tile % this.tilesWide, tileY: Math.floor(tile / this.tilesWide), passes });
            this.trampled[tile] = 0;
        }
        this.trampledAny = false;
        return taken;
    }

    public get tilesAcross(): number {
        return this.tilesWide;
    }

    /** A number for the whole state (positions, velocities, what each does, the step): two equal crowds, one number. */
    public checksum(): number {
        let hash = 0x811c9dc5;
        const mix = (array: Float64Array | Uint8Array | Int8Array): void => {
            const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
            for (let at = 0; at < bytes.length; at++) hash = Math.imul(hash ^ bytes[at], 0x01000193) >>> 0;
        };
        mix(this.x);
        mix(this.y);
        mix(this.vx);
        mix(this.vy);
        mix(this.state);
        mix(this.target);
        mix(this.z);
        hash = Math.imul(hash ^ this.steps, 0x01000193) >>> 0;
        return hash >>> 0;
    }

    /** One step of the crowd. Its caller makes sure the log is complete to it (advanceTo). */
    public step(): void {
        if (this.steps >= this.lastStep) return;
        this.applyLog();
        this.makeFields();
        this.steps++;
        const { count, state } = this;
        if (this.steps >= this.lastStep) {
            for (let zombie = 0; zombie < count; zombie++) {
                this.lastX[zombie] = this.x[zombie];
                this.lastY[zombie] = this.y[zombie];
                state[zombie] = ZOMBIE_GONE;
            }
            this.nextIn = count;
            this.walking = 0;
            this.dying = 0;
            this.recordPast();
            return;
        }
        this.fillTiles();
        this.comeIn();
        this.choose();
        this.steer();
        this.move();
        this.fly();
        this.recordPast();
    }

    /** Where each zombie walks at this step, into the ring of the steps before (pastX, pastY). */
    private recordPast(): void {
        const { count, state, x, y, pastX, pastY } = this;
        const base = (this.steps % ZOMBIE_DART_HISTORY_STEPS) * count;
        this.pastIn[this.steps % ZOMBIE_DART_HISTORY_STEPS] = this.nextIn;
        for (let zombie = 0; zombie < count; zombie++) {
            if (state[zombie] !== ZOMBIE_WALKING) {
                pastX[base + zombie] = PAST_NONE;
                continue;
            }
            pastX[base + zombie] = Math.min(PAST_NONE - 1, Math.max(0, Math.round(x[zombie] * 2)));
            pastY[base + zombie] = Math.min(PAST_NONE - 1, Math.max(0, Math.round(y[zombie] * 2)));
        }
    }

    /** The entries of the log whose step came: the avatars move, leave, come. */
    private applyLog(): void {
        while (this.logAt < this.log.length && this.log[this.logAt].applyStep <= this.steps) {
            const entry = this.log[this.logAt];
            for (const { slot, tile } of entry.changes) {
                if (slot < 0 || slot >= ZOMBIE_MOST_AVATARS) continue;
                const told = tile >= 0 && tile < this.tilesWide * this.tilesHigh ? tile : -1;
                if (told !== this.avatarTile[slot]) this.fieldStale = true;
                this.avatarTile[slot] = told;
            }
            for (const shot of entry.grenades ?? []) {
                const grenade = this.shots.get(shotKey(entry.applyStep, shot)) ?? { shot };
                const path = this.pathOf(grenade);
                const px = path.x[ZOMBIE_GRENADE_FUSE_STEPS];
                const py = path.y[ZOMBIE_GRENADE_FUSE_STEPS];
                const killed = this.blow(px, py, ZOMBIE_GRENADE_LETHAL_M * PX, ZOMBIE_GRENADE_BLAST_M * PX, true);
                this.explosions.push({ x: px, y: py, step: this.steps, killed });
            }
            // The darts whose flight is over: every zombie each went through, as the zombies walked then, is killed.
            for (const dart of entry.darts ?? []) {
                if (!zombieDartFits(dart, entry.applyStep) || entry.applyStep !== this.steps) continue;
                const way = this.wayOf(dart);
                const hits: ZombieDartHit[] = [];
                const candidates = this.dartCandidates(dart, way);
                const passed = (zombie: number, step: number): boolean => this.claimedAt[zombie] <= step;
                const cameIn = this.pastIn[dart.shotStep % ZOMBIE_DART_HISTORY_STEPS];
                this.meet(dart, way, candidates, cameIn, 0, ZOMBIE_DART_TICKS, passed, hits);
                for (const hit of hits) this.shoot(hit, way.ux, way.uy);
            }
            // The comets and the burning meteors that land now: their own burst is drawn by the meteor, their fire set
            // by the server; they are not blasts of grenades. A comet throws, a burning meteor throws and burns.
            for (const impact of entry.impacts ?? []) {
                const { lethal, blast } = zombieImpactRadii(impact);
                this.impactKills += this.blow(impact.x, impact.y, lethal, blast, impact.burning, IMPACT_POWER);
            }
            this.logAt++;
        }
    }

    /** The way of a dart over the ground of the horde: its unit vector, its length, how far it flies before a wall. */
    private wayOf(dart: ZombieDart): { ux: number; uy: number; length: number; reach: number } {
        const way = zombieDartWay(dart);
        const reach = zombieDartReach(dart, { width: this.width, height: this.height, terrain: this.terrain });
        return { ...way, reach };
    }

    /**
     * The zombies a dart may meet, from where they walked when it was shot: a zombie moves MOST_A_STEP_PX at most along
     * each axis in a step, so one that walked then further from its way than it can run while it flies is never met.
     * Those that come in while it flies are looked at on their own (meet). In the order of their numbers.
     */
    private dartCandidates(
        dart: ZombieDart,
        way: { ux: number; uy: number; length: number; reach: number },
    ): Int32Array {
        const { count, pastX, pastY } = this;
        const end = Math.min(way.reach, way.length);
        const run = MOST_A_STEP_PX * ZOMBIE_DART_TICKS * dart.stride + 1;
        // In half pixels, as the ring keeps them: the box of its way, as far as a zombie it meets can have run from.
        const endX = dart.fromX + way.ux * end;
        const endY = dart.fromY + way.uy * end;
        const left = (Math.min(dart.fromX, endX) - ZOMBIE_DART_HALF_WIDTH_PX - run) * 2;
        const right = (Math.max(dart.fromX, endX) + ZOMBIE_DART_HALF_WIDTH_PX + run) * 2;
        const top = (Math.min(dart.fromY, endY) - run) * 2;
        const bottom = (Math.max(dart.fromY, endY) + ZOMBIE_DART_BODY_PX + run) * 2;
        const base = (dart.shotStep % ZOMBIE_DART_HISTORY_STEPS) * count;
        const found: number[] = [];
        for (let zombie = 0; zombie < count; zombie++) {
            const px = pastX[base + zombie];
            if (px === PAST_NONE || px < left || px > right) continue;
            const py = pastY[base + zombie];
            if (py >= top && py <= bottom) found.push(zombie);
        }
        return Int32Array.from(found);
    }

    /**
     * The ticks `from` to `to` (excluded) of the flight of a dart, against the bodies of the zombies as they ran during
     * each tick, from where they were at its start to where they were at its end (pastX, pastY: a zombie drawn between
     * two steps, which the dart drawn crosses, is met): each it enters is added to `hits` (in the order of their numbers within a
     * tick), and it flies on through them. Only the `candidates` (dartCandidates) and those that came in since it was
     * shot are looked at. A zombie in `hits` already, or `passed` (met by a dart told before, at that step or before:
     * it falls), is passed by. True once its flight is over: its range or a wall reached.
     */
    private meet(
        dart: ZombieDart,
        way: { ux: number; uy: number; length: number; reach: number },
        candidates: Int32Array,
        cameIn: number,
        from: number,
        to: number,
        passed: (zombie: number, step: number) => boolean,
        hits: ZombieDartHit[],
    ): boolean {
        const { count, pastX, pastY, pastIn } = this;
        const mine = new Set<number>();
        for (const hit of hits) mine.add(hit.zombie);
        for (let tick = from; tick < to; tick++) {
            const near = (way.length * tick) / ZOMBIE_DART_TICKS;
            if (near >= way.reach) return true;
            const far = Math.min(way.reach, (way.length * (tick + 1)) / ZOMBIE_DART_TICKS);
            const ax = dart.fromX + way.ux * near;
            const ay = dart.fromY + way.uy * near;
            const bx = dart.fromX + way.ux * far;
            const by = dart.fromY + way.uy * far;
            // In half pixels: what is out of these bounds at the start of the tick cannot be entered during it (a
            // zombie runs MOST_A_STEP_PX at most along each axis in a step).
            const run = MOST_A_STEP_PX * dart.stride + 1;
            const left = (Math.min(ax, bx) - ZOMBIE_DART_HALF_WIDTH_PX - run) * 2;
            const right = (Math.max(ax, bx) + ZOMBIE_DART_HALF_WIDTH_PX + run) * 2;
            const top = (Math.min(ay, by) - run) * 2;
            const bottom = (Math.max(ay, by) + ZOMBIE_DART_BODY_PX + run) * 2;
            const step = dart.shotStep + tick * dart.stride;
            const base = (step % ZOMBIE_DART_HISTORY_STEPS) * count;
            const end = ((step + dart.stride) % ZOMBIE_DART_HISTORY_STEPS) * count;
            const look = (zombie: number): void => {
                // Where it walked at the start of the tick and at its end; one of them only when it came in or fell.
                let x0 = pastX[base + zombie];
                let y0 = pastY[base + zombie];
                let x1 = pastX[end + zombie];
                let y1 = pastY[end + zombie];
                if (x0 === PAST_NONE) {
                    if (x1 === PAST_NONE) return;
                    x0 = x1;
                    y0 = y1;
                } else if (x1 === PAST_NONE) {
                    x1 = x0;
                    y1 = y0;
                }
                if (x0 < left || x0 > right || y0 < top || y0 > bottom || mine.has(zombie) || passed(zombie, step))
                    return;
                // The dart as the zombie sees it, both moving through the tick: from A less where the zombie was, to B
                // less where it is at the end. It is met as it is drawn, between two steps.
                const zx0 = x0 / 2;
                const zy0 = y0 / 2;
                const zx1 = x1 / 2;
                const zy1 = y1 / 2;
                // Facing the way it runs, as it is drawn; either way when it hardly moves.
                const facing = zx1 - zx0 > 0.3 ? 1 : zx1 - zx0 < -0.3 ? -1 : 0;
                const at = zombieDartEnters(
                    ax - zx0,
                    ay - zy0,
                    bx - zx1,
                    by - zy1,
                    0,
                    0,
                    zombieDartBody(zombie, facing),
                );
                if (at < 0) return;
                mine.add(zombie);
                hits.push({
                    zombie,
                    step,
                    x: zx0 + (zx1 - zx0) * at,
                    y: zy0 + (zy1 - zy0) * at,
                    distance: near + (far - near) * at,
                });
            };
            for (const zombie of candidates) look(zombie);
            // Those that came in since it was shot, by the end of the tick: numbered after all the others.
            const inNow = pastIn[(step + dart.stride) % ZOMBIE_DART_HISTORY_STEPS];
            for (let zombie = cameIn; zombie < inNow; zombie++) look(zombie);
        }
        return to >= ZOMBIE_DART_TICKS;
    }

    /**
     * A dart met a zombie: it is killed (when it still walks), laid where the dart met it, recoiled a little along the
     * dart (never through a wall), and lies there until ZOMBIE_DART_FALL_STEPS after the step it was met at.
     */
    private shoot(hit: ZombieDartHit, ux: number, uy: number): void {
        const zombie = hit.zombie;
        if (this.claimedAt[zombie] > hit.step) this.claimedAt[zombie] = hit.step;
        if (this.state[zombie] !== ZOMBIE_WALKING) return;
        this.state[zombie] = ZOMBIE_SHOT;
        this.walking--;
        this.dying++;
        this.target[zombie] = -1;
        this.z[zombie] = 0;
        this.vz[zombie] = 0;
        this.vx[zombie] = 0;
        this.vy[zombie] = 0;
        let toX = Math.min(this.widthPx - 0.5, Math.max(0.5, hit.x + ux * ZOMBIE_DART_RECOIL_PX));
        let toY = Math.min(this.heightPx - 0.5, Math.max(0.5, hit.y + uy * ZOMBIE_DART_RECOIL_PX));
        const cellX = Math.floor(hit.x / TERRAIN_CELL);
        const cellY = Math.floor(hit.y / TERRAIN_CELL);
        const nextX = Math.floor(toX / TERRAIN_CELL);
        if (nextX !== cellX && !this.canGoFlying(cellY * this.width + cellX, nextX - cellX, 0)) toX = hit.x;
        const column = Math.floor(toX / TERRAIN_CELL);
        const nextY = Math.floor(toY / TERRAIN_CELL);
        if (nextY !== cellY && !this.canGoFlying(cellY * this.width + column, 0, nextY - cellY)) toY = hit.y;
        this.x[zombie] = toX;
        this.y[zombie] = toY;
        this.lastX[zombie] = toX;
        this.lastY[zombie] = toY;
        this.hitStep[zombie] = hit.step;
        this.dieAt[zombie] = Math.max(this.steps + 1, hit.step + ZOMBIE_DART_FALL_STEPS);
    }

    /**
     * The darts the log tells whose zombies may still be drawn falling: those it did not apply yet and those it applied
     * in the last ZOMBIE_DART_FALL_STEPS steps (when they were seen before), in the order of the log, each with the
     * zombies it went through as far as its flight is known at this step. The log applies each as it is seen here: a
     * browser draws its zombies falling as soon as it knows of them. Read by the view only, never by a step.
     */
    public dartsSeen(): readonly ZombieDartSeen[] {
        if (this.seenVersion !== this.logVersion) {
            // Read again from the log: the records of the darts kept as long as no dart the log did not apply yet came
            // before them (a dart is told after those before it: it comes at the end). Only the end of the log is read,
            // those it applies from ZOMBIE_DART_FALL_STEPS steps ago on (it is in the order of the steps).
            const old = new Map<string, DartRecord>();
            for (const record of this.seen) old.set(dartKey(record.applyStep, record.dart), record);
            const records: DartRecord[] = [];
            let same = true;
            let first = this.log.length;
            while (first > 0 && this.log[first - 1].applyStep >= this.steps - ZOMBIE_DART_FALL_STEPS) first--;
            for (let at = first; at < this.log.length; at++) {
                const entry = this.log[at];
                for (const dart of entry.darts ?? []) {
                    if (!zombieDartFits(dart, entry.applyStep)) continue;
                    const key = dartKey(entry.applyStep, dart);
                    const kept = same ? old.get(key) : undefined;
                    if (kept) {
                        old.delete(key);
                        records.push(kept);
                        continue;
                    }
                    // Applied already: drawn by the state of its zombie, its flight not checked again.
                    if (entry.applyStep < this.steps) continue;
                    same = false;
                    const way = this.wayOf(dart);
                    records.push({
                        dart,
                        applyStep: entry.applyStep,
                        ux: way.ux,
                        uy: way.uy,
                        hits: [],
                        over: false,
                        tick: 0,
                        reach: way.reach,
                        length: way.length,
                        candidates: undefined,
                        cameIn: 0,
                    });
                }
            }
            this.seen = records;
            this.seenVersion = this.logVersion;
            this.seenSteps = -1;
        }
        if (this.seenSteps !== this.steps) {
            this.seenSteps = this.steps;
            // Each dart as far as the steps taken, in the order of the log: a zombie met by a dart before is passed by.
            const metBefore = new Map<number, number>();
            const passed = (zombie: number, step: number): boolean =>
                this.claimedAt[zombie] <= step || (metBefore.get(zombie) ?? NEVER) <= step;
            const kept: DartRecord[] = [];
            for (const record of this.seen) {
                if (record.applyStep < this.steps - ZOMBIE_DART_FALL_STEPS) continue;
                kept.push(record);
                if (!record.over) {
                    // The ticks whose end is stepped already.
                    const last = Math.min(
                        ZOMBIE_DART_TICKS,
                        Math.floor((this.steps - record.dart.shotStep) / record.dart.stride),
                    );
                    if (
                        this.steps - (record.dart.shotStep + record.tick * record.dart.stride) >=
                        ZOMBIE_DART_HISTORY_STEPS
                    ) {
                        // Too long ago for this crowd to know: its zombie is drawn by its state once applied.
                        record.over = true;
                    } else if (last > record.tick) {
                        if (!record.candidates) {
                            record.candidates = this.dartCandidates(record.dart, record);
                            record.cameIn = this.pastIn[record.dart.shotStep % ZOMBIE_DART_HISTORY_STEPS];
                        }
                        record.over = this.meet(
                            record.dart,
                            record,
                            record.candidates,
                            record.cameIn,
                            record.tick,
                            last,
                            passed,
                            record.hits,
                        );
                        if (record.over) record.candidates = undefined;
                        record.tick = last;
                    }
                }
                if (record.applyStep >= this.steps) {
                    for (const hit of record.hits) {
                        const before = metBefore.get(hit.zombie) ?? NEVER;
                        if (hit.step < before) metBefore.set(hit.zombie, hit.step);
                    }
                }
            }
            this.seen = kept;
        }
        return this.seen;
    }

    /**
     * A blast at a point (a grenade that goes off, a meteor that lands): the zombies within `lethal` (map pixels) are
     * thrown up and away, dead, `burning` or not, and are gone; those within `blast` are shoved away, the more the
     * nearer; those it kills `power` times as fast as a grenade throws them. How many it killed.
     */
    private blow(px: number, py: number, lethal: number, blast: number, burning: boolean, power = 1): number {
        let killed = 0;
        for (let zombie = 0; zombie < this.count; zombie++) {
            if (this.state[zombie] !== ZOMBIE_WALKING) continue;
            const dx = this.x[zombie] - px;
            const dy = this.y[zombie] - py;
            const d2 = dx * dx + dy * dy;
            if (d2 >= blast * blast) continue;
            const d = Math.sqrt(d2);
            const nx = d > 1e-6 ? dx / d : 1;
            const ny = d > 1e-6 ? dy / d : 0;
            const falloff = (1 - d / blast) * (1 - d / blast);
            if (d < lethal) {
                this.state[zombie] = burning ? ZOMBIE_DYING : ZOMBIE_THROWN;
                this.walking--;
                this.dying++;
                this.target[zombie] = -1;
                this.z[zombie] = 0;
                this.vz[zombie] = (BLAST_UP_M_S * (1 - d / lethal) + 2) * PX * power;
                this.vx[zombie] = nx * BLAST_AWAY_M_S * falloff * PX * power;
                this.vy[zombie] = ny * BLAST_AWAY_M_S * falloff * PX * power;
                this.dieAt[zombie] = this.steps + ZOMBIE_BURN_STEPS;
                killed++;
            } else {
                this.vx[zombie] += nx * SHOVE_AWAY_M_S * falloff * PX;
                this.vy[zombie] += ny * SHOVE_AWAY_M_S * falloff * PX;
            }
        }
        return killed;
    }

    /**
     * The zombies thrown by a blast fly, bounce, slide to a stop against the walls, burn, and are gone; those met by a
     * dart lie where they fell, and are gone.
     */
    private fly(): void {
        const { count, state, x, y, lastX, lastY, vx, vy } = this;
        for (let zombie = 0; zombie < count; zombie++) {
            if (state[zombie] === ZOMBIE_SHOT) {
                lastX[zombie] = x[zombie];
                lastY[zombie] = y[zombie];
                if (this.steps >= this.dieAt[zombie]) {
                    state[zombie] = ZOMBIE_GONE;
                    this.dying--;
                }
                continue;
            }
            if (state[zombie] !== ZOMBIE_DYING && state[zombie] !== ZOMBIE_THROWN) continue;
            lastX[zombie] = x[zombie];
            lastY[zombie] = y[zombie];
            if (this.steps >= this.dieAt[zombie]) {
                state[zombie] = ZOMBIE_GONE;
                this.dying--;
                continue;
            }
            this.vz[zombie] -= G_PX_S2 * DT;
            this.z[zombie] += this.vz[zombie] * DT;
            if (this.z[zombie] <= 0) {
                this.z[zombie] = 0;
                this.vz[zombie] = this.vz[zombie] < -1 * PX ? -this.vz[zombie] * BODY_BOUNCE : 0;
                // On the ground: it slides to a stop.
                const along = Math.sqrt(vx[zombie] * vx[zombie] + vy[zombie] * vy[zombie]);
                const slowed = Math.max(0, along - BODY_SLIDE_BRAKE * PX * DT);
                if (along > 1e-9) {
                    vx[zombie] = (vx[zombie] / along) * slowed;
                    vy[zombie] = (vy[zombie] / along) * slowed;
                }
            }
            const fromX = x[zombie];
            const fromY = y[zombie];
            let toX = fromX + Math.min(MOST_A_STEP_PX, Math.max(-MOST_A_STEP_PX, vx[zombie] * DT));
            let toY = fromY + Math.min(MOST_A_STEP_PX, Math.max(-MOST_A_STEP_PX, vy[zombie] * DT));
            toX = Math.min(this.widthPx - 0.5, Math.max(0.5, toX));
            toY = Math.min(this.heightPx - 0.5, Math.max(0.5, toY));
            const cellX = Math.floor(fromX / TERRAIN_CELL);
            const cellY = Math.floor(fromY / TERRAIN_CELL);
            const nextX = Math.floor(toX / TERRAIN_CELL);
            if (nextX !== cellX && !this.canGoFlying(cellY * this.width + cellX, nextX - cellX, 0)) {
                toX = fromX;
                vx[zombie] = 0;
            }
            const column = Math.floor(toX / TERRAIN_CELL);
            const nextY = Math.floor(toY / TERRAIN_CELL);
            if (nextY !== cellY && !this.canGoFlying(cellY * this.width + column, 0, nextY - cellY)) {
                toY = fromY;
                vy[zombie] = 0;
            }
            x[zombie] = toX;
            y[zombie] = toY;
        }
    }

    /** Whether a body thrown goes from a cell to its neighbour: no wall nor collision between; water it falls into. */
    private canGoFlying(cell: number, dx: number, dy: number): boolean {
        const { terrain, width } = this;
        if (dx === 1) return (terrain[cell] & ZOMBIE_EAST) === 0 && (terrain[cell + 1] & ZOMBIE_SOLID) === 0;
        if (dx === -1) return (terrain[cell - 1] & (ZOMBIE_EAST | ZOMBIE_SOLID)) === 0;
        if (dy === 1) return (terrain[cell] & ZOMBIE_SOUTH) === 0 && (terrain[cell + width] & ZOMBIE_SOLID) === 0;
        return (terrain[cell - width] & (ZOMBIE_SOUTH | ZOMBIE_SOLID)) === 0;
    }

    /**
     * The field of the avatars, made again when one changed tile (at the step its change is applied), and every
     * CROWD_REFIELD_STEPS steps while a tile holds a crowd (from where the zombies stood at the step before).
     */
    private makeFields(): void {
        if (!this.fieldStale && !(this.field && this.steps % CROWD_REFIELD_STEPS === 0 && this.crowded())) return;
        this.fieldStale = false;
        const field = this.field ?? new Int32Array(this.width * this.height);
        const owner = this.owner ?? new Int8Array(this.width * this.height);
        const seeded = this.spread(field, owner);
        this.field = seeded ? field : undefined;
        this.owner = seeded ? owner : undefined;
    }

    /**
     * The distance from the avatars to each cell (10 a cell across, 14 on a diagonal, more through a crowd), by the
     * open sides of the cells, round the water and the collisions, through the doors, and the avatar each cell is
     * nearest to (`owner`): a Dijkstra from all of them at once, its queue in buckets (Dial 1969). The
     * same everywhere: the avatars are seeded in the order of their slots, the buckets read in the order they were
     * filled, and a cell keeps the first avatar to reach it at its distance. False when no avatar stands anywhere.
     */
    private spread(field: Int32Array, owner: Int8Array): boolean {
        const { width, height, buckets } = this;
        let seeded = false;
        field.fill(FAR);
        owner.fill(-1);
        for (const bucket of buckets) bucket.length = 0;
        let queued = 0;
        const cellsATile = TILE_PX / TERRAIN_CELL;
        for (let slot = 0; slot < ZOMBIE_MOST_AVATARS; slot++) {
            const tile = this.avatarTile[slot];
            if (tile < 0) continue;
            const tileX = tile % this.tilesWide;
            const tileY = (tile - tileX) / this.tilesWide;
            for (let dy = 0; dy < cellsATile; dy++) {
                for (let dx = 0; dx < cellsATile; dx++) {
                    const cellX = tileX * cellsATile + dx;
                    const cellY = tileY * cellsATile + dy;
                    const cell = cellY * width + cellX;
                    if (cellX >= width || cellY >= height || this.blockedCell(cell) || field[cell] === 0) continue;
                    field[cell] = 0;
                    owner[cell] = slot;
                    buckets[0].push(cell);
                    queued++;
                    seeded = true;
                }
            }
        }
        if (!seeded) return false;
        // The buckets in turn, by growing distance: each holds the cells at a distance with these last eight bits.
        const ways = this.waysOf();
        const steps = [1, -1, width, -width, width + 1, width - 1, -width + 1, -width - 1];
        const costs = [10, 10, 10, 10, 14, 14, 14, 14];
        // What the crowd of each tile adds to a step into one of its cells.
        const { tileStart, tilesWide } = this;
        const crowdCost = this.crowdCost;
        crowdCost.fill(0);
        for (let tile = 0; tile < tilesWide * this.tilesHigh; tile++) {
            const over = tileStart[tile + 1] - tileStart[tile] - CROWD_FREE;
            if (over <= 0) continue;
            const cost = Math.min(CROWD_MOST, over * CROWD_COST);
            const tileX = tile % tilesWide;
            const tileY = (tile - tileX) / tilesWide;
            for (let dy = 0; dy < cellsATile; dy++) {
                for (let dx = 0; dx < cellsATile; dx++) {
                    const cellX = tileX * cellsATile + dx;
                    const cellY = tileY * cellsATile + dy;
                    if (cellX < width && cellY < height) crowdCost[cellY * width + cellX] = cost;
                }
            }
        }
        for (let distance = 0; queued > 0; distance++) {
            const bucket = buckets[distance & 255];
            for (let at = 0; at < bucket.length; at++) {
                const cell = bucket[at];
                queued--;
                if (field[cell] !== distance) continue;
                const slot = owner[cell];
                const open = ways[cell];
                for (let way = 0; way < 8; way++) {
                    if ((open & (1 << way)) === 0) continue;
                    const next = cell + steps[way];
                    const reached = distance + costs[way] + crowdCost[next];
                    if (reached >= field[next]) continue;
                    field[next] = reached;
                    owner[next] = slot;
                    buckets[reached & 255].push(next);
                    queued++;
                }
            }
            bucket.length = 0;
        }
        return true;
    }

    /**
     * The ways out of each cell (bits: east, west, south, north, then the diagonals south-east, south-west, north-east,
     * north-west), by the open sides of the cells; a diagonal only where both sides round its corner are open. The
     * ground is frozen for the horde: made once.
     */
    private waysOf(): Uint8Array {
        if (this.ways) return this.ways;
        const { width, height } = this;
        const ways = new Uint8Array(width * height);
        for (let cell = 0; cell < width * height; cell++) {
            const cellX = cell % width;
            const cellY = (cell - cellX) / width;
            const east = cellX < width - 1 && this.canGo(cell, 1, 0);
            const west = cellX > 0 && this.canGo(cell, -1, 0);
            const south = cellY < height - 1 && this.canGo(cell, 0, 1);
            const north = cellY > 0 && this.canGo(cell, 0, -1);
            let open = (east ? 1 : 0) | (west ? 2 : 0) | (south ? 4 : 0) | (north ? 8 : 0);
            if (east && south && this.canGo(cell + 1, 0, 1) && this.canGo(cell + width, 1, 0)) open |= 16;
            if (west && south && this.canGo(cell - 1, 0, 1) && this.canGo(cell + width, -1, 0)) open |= 32;
            if (east && north && this.canGo(cell + 1, 0, -1) && this.canGo(cell - width, 1, 0)) open |= 64;
            if (west && north && this.canGo(cell - 1, 0, -1) && this.canGo(cell - width, -1, 0)) open |= 128;
            ways[cell] = open;
        }
        this.ways = ways;
        return ways;
    }

    private blockedCell(cell: number): boolean {
        return (this.terrain[cell] & (ZOMBIE_WATER | ZOMBIE_SOLID)) !== 0;
    }

    /** Whether one goes from a cell to its neighbour (dx, dy, one of them 0): no wall between, not into the blocked. */
    private canGo(cell: number, dx: number, dy: number): boolean {
        const { terrain, width } = this;
        let next: number;
        if (dx === 1) {
            if (terrain[cell] & ZOMBIE_EAST) return false;
            next = cell + 1;
        } else if (dx === -1) {
            next = cell - 1;
            if (terrain[next] & ZOMBIE_EAST) return false;
        } else if (dy === 1) {
            if (terrain[cell] & ZOMBIE_SOUTH) return false;
            next = cell + width;
        } else {
            next = cell - width;
            if (terrain[next] & ZOMBIE_SOUTH) return false;
        }
        return !this.blockedCell(next);
    }

    /** The zombies walking now, by tile: counting first, then each in its place, in the order of their numbers. */
    private fillTiles(): void {
        const { tileStart, tileList, tileOf, count, state, x, y, tilesWide, tilesHigh } = this;
        tileStart.fill(0);
        for (let zombie = 0; zombie < count; zombie++) {
            if (state[zombie] !== ZOMBIE_WALKING) {
                tileOf[zombie] = -1;
                continue;
            }
            const tileX = Math.min(tilesWide - 1, Math.max(0, Math.floor(x[zombie] / TILE_PX)));
            const tileY = Math.min(tilesHigh - 1, Math.max(0, Math.floor(y[zombie] / TILE_PX)));
            const tile = tileY * tilesWide + tileX;
            tileOf[zombie] = tile;
            tileStart[tile + 1]++;
        }
        for (let tile = 0; tile < tilesWide * tilesHigh; tile++) tileStart[tile + 1] += tileStart[tile];
        for (let zombie = 0; zombie < count; zombie++) {
            const tile = tileOf[zombie];
            if (tile < 0) continue;
            tileList[tileStart[tile]++] = zombie;
        }
        for (let tile = tilesWide * tilesHigh; tile > 0; tile--) tileStart[tile] = tileStart[tile - 1];
        tileStart[0] = 0;
    }

    /** Whether a tile holds more than CROWD_FREE zombies (at the step before). */
    private crowded(): boolean {
        const { tileStart } = this;
        for (let tile = 0; tile < this.tilesWide * this.tilesHigh; tile++) {
            if (tileStart[tile + 1] - tileStart[tile] > CROWD_FREE) return true;
        }
        return false;
    }

    private crowdOfTile(tile: number): number {
        return this.tileStart[tile + 1] - this.tileStart[tile];
    }

    /** The zombies whose time came run in at the edge, where there is room: the others wait behind, in order. */
    private comeIn(): void {
        const { entries, count } = this;
        if (entries.length === 0) {
            this.nextIn = count;
            return;
        }
        while (this.nextIn < count && Math.floor((this.nextIn * this.emitSteps) / count) < this.steps) {
            let placed = false;
            for (let attempt = 0; attempt < ENTRY_TRIES && !placed; attempt++) {
                const cell = entries[Math.min(entries.length - 1, Math.floor(this.random() * entries.length))];
                const cellX = cell % this.width;
                const cellY = (cell - cellX) / this.width;
                const px = (cellX + 0.5) * TERRAIN_CELL + (this.random() - 0.5) * (TERRAIN_CELL - 2);
                const py = (cellY + 0.5) * TERRAIN_CELL + (this.random() - 0.5) * (TERRAIN_CELL - 2);
                const tile =
                    Math.min(this.tilesHigh - 1, Math.floor(py / TILE_PX)) * this.tilesWide +
                    Math.min(this.tilesWide - 1, Math.floor(px / TILE_PX));
                if (this.crowdOfTile(tile) >= ROOM_A_TILE) continue;
                const zombie = this.nextIn;
                this.x[zombie] = px;
                this.y[zombie] = py;
                this.lastX[zombie] = px;
                this.lastY[zombie] = py;
                this.vx[zombie] = this.wayX[cell] * this.pace[zombie];
                this.vy[zombie] = this.wayY[cell] * this.pace[zombie];
                this.state[zombie] = ZOMBIE_WALKING;
                this.walking++;
                placed = true;
            }
            if (!placed) return;
            this.nextIn++;
        }
    }

    private cellAt(px: number, py: number): number {
        const cellX = Math.min(this.width - 1, Math.max(0, Math.floor(px / TERRAIN_CELL)));
        const cellY = Math.min(this.height - 1, Math.max(0, Math.floor(py / TERRAIN_CELL)));
        return cellY * this.width + cellX;
    }

    /**
     * What each zombie runs to: the avatar nearest to it by the way of the map (the owner of its cell in the field of
     * the avatars), every zombie, however many run to it already, for as long as it can reach one; else its way. Once
     * its time runs short (or the whole horde's), out, whatever it hears.
     */
    private choose(): void {
        const { count, state, x, y, target, steps } = this;
        const remainingSeconds = (this.lastStep - steps) * DT;
        if (!this.rushing) {
            // The time the furthest zombie needs to run out.
            let furthest = 0;
            for (let zombie = 0; zombie < count; zombie++) {
                if (state[zombie] !== ZOMBIE_WALKING) continue;
                const out = this.potential[this.cellAt(x[zombie], y[zombie])] - this.exitLevel;
                if (out !== Number.POSITIVE_INFINITY) {
                    furthest = Math.max(furthest, (out * TERRAIN_CELL) / this.pace[zombie]);
                }
            }
            // Those still to come in have the whole crossing to run.
            if (this.nextIn < count) furthest = Math.max(furthest, this.widthPx / SLOWEST_RUN_PX);
            const needed = Math.max(furthest * RUSH_MARGIN, furthest + this.drainSeconds()) + RUSH_SECONDS;
            if (needed >= remainingSeconds) this.rushing = true;
        }
        const field = this.field;
        const owner = this.owner;
        for (let zombie = 0; zombie < count; zombie++) {
            if (state[zombie] !== ZOMBIE_WALKING) continue;
            const cell = this.cellAt(x[zombie], y[zombie]);
            if (this.rushing && !this.leaving[zombie]) this.leaving[zombie] = 1;
            if (!this.leaving[zombie]) {
                const out = this.potential[cell] - this.exitLevel;
                const secondsOut = (out * TERRAIN_CELL) / this.pace[zombie];
                if (out !== Number.POSITIVE_INFINITY && secondsOut * URGENCY_MARGIN + 2 >= remainingSeconds) {
                    this.leaving[zombie] = 1;
                }
            }
            target[zombie] = !this.leaving[zombie] && owner && field && field[cell] !== FAR ? owner[cell] : -1;
        }
    }

    /**
     * How long the zombies wait their turn at the narrow passage on their way out that lets its own through the
     * slowest (BOTTLENECK_FLOW): DRAIN_SHARE of the time of the horde at most.
     */
    private drainSeconds(): number {
        const { count, state, x, y, narrowOut, narrowAt, waiting } = this;
        waiting.fill(0);
        let seconds = 0;
        for (let zombie = 0; zombie < count; zombie++) {
            if (state[zombie] !== ZOMBIE_WALKING) continue;
            const cell = this.cellAt(x[zombie], y[zombie]);
            const at = narrowAt[cell];
            if (at < 0) continue;
            const metres = ((2 * narrowOut[cell] - 1) * TERRAIN_CELL) / PX;
            waiting[at] += 1 / (BOTTLENECK_FLOW * metres);
            seconds = Math.max(seconds, waiting[at]);
        }
        return Math.min(seconds, this.lastStep * DT * DRAIN_SHARE);
    }

    /** The way down the potential at a point (atX, atY), between the four cells around it; the heading where none. */
    private wayOut(px: number, py: number): void {
        const { width, height, wayX, wayY } = this;
        const u = px / TERRAIN_CELL - 0.5;
        const v = py / TERRAIN_CELL - 0.5;
        const left = Math.floor(u);
        const top = Math.floor(v);
        const fx = u - left;
        const fy = v - top;
        let sx = 0;
        let sy = 0;
        for (let corner = 0; corner < 4; corner++) {
            const cellX = Math.min(width - 1, Math.max(0, left + (corner & 1)));
            const cellY = Math.min(height - 1, Math.max(0, top + (corner >> 1)));
            const weight = ((corner & 1) === 1 ? fx : 1 - fx) * (corner >> 1 === 1 ? fy : 1 - fy);
            const cell = cellY * width + cellX;
            sx += wayX[cell] * weight;
            sy += wayY[cell] * weight;
        }
        const length = Math.sqrt(sx * sx + sy * sy);
        if (length > 1e-6) {
            this.atX = sx / length;
            this.atY = sy / length;
        } else {
            this.atX = this.horde.dirX;
            this.atY = this.horde.dirY;
        }
    }

    /** The way to an avatar from a point (atX, atY): down the slope across the four sides of its cell, by the open ones. */
    private wayTo(field: Int32Array, px: number, py: number): boolean {
        const { width, height } = this;
        const cell = this.cellAt(px, py);
        const cellX = cell % width;
        const cellY = (cell - cellX) / width;
        const here = field[cell];
        if (here === FAR) return false;
        let gx = 0;
        let gy = 0;
        // The slope across the open sides (upwind: towards the lower side on each axis).
        const east = cellX < width - 1 && this.canGo(cell, 1, 0) ? field[cell + 1] : here;
        const west = cellX > 0 && this.canGo(cell, -1, 0) ? field[cell - 1] : here;
        const south = cellY < height - 1 && this.canGo(cell, 0, 1) ? field[cell + width] : here;
        const north = cellY > 0 && this.canGo(cell, 0, -1) ? field[cell - width] : here;
        gx = Math.min(0, east - here) - Math.min(0, west - here);
        gy = Math.min(0, south - here) - Math.min(0, north - here);
        const length = Math.sqrt(gx * gx + gy * gy);
        if (length < 1e-9) return this.wayToCorner(field, cell, here);
        this.atX = -gx / length;
        this.atY = -gy / length;
        return true;
    }

    /**
     * Where no side of its cell is lower (the field reached it by a diagonal, round a crowd that costs its sides more):
     * by the lowest open diagonal (waysOf), if one is lower.
     */
    private wayToCorner(field: Int32Array, cell: number, here: number): boolean {
        const { width } = this;
        const open = this.waysOf()[cell];
        const corners = [width + 1, width - 1, -width + 1, -width - 1];
        let best = -1;
        let lowest = here;
        for (let corner = 0; corner < 4; corner++) {
            if ((open & (1 << (corner + 4))) === 0) continue;
            const value = field[cell + corners[corner]];
            if (value < lowest) {
                lowest = value;
                best = corner;
            }
        }
        if (best < 0) return false;
        this.atX = (best === 0 || best === 2 ? 1 : -1) * Math.SQRT1_2;
        this.atY = (best < 2 ? 1 : -1) * Math.SQRT1_2;
        return true;
    }

    /** The velocity each zombie wants and gets from those around it (from the velocities of the step before). */
    private steer(): void {
        const { count, state, x, y, vx, vy, nextVx, nextVy, tileStart, tileList, tilesWide, tilesHigh } = this;
        const reach = 2 * ZOMBIE_RADIUS_PX + SOCIAL_RANGE_PX;
        const reach2 = reach * reach;
        const density2 = DENSITY_RADIUS_PX * DENSITY_RADIUS_PX;
        for (let zombie = 0; zombie < count; zombie++) {
            if (state[zombie] !== ZOMBIE_WALKING) continue;
            const zx = x[zombie];
            const zy = y[zombie];
            // Down the field of the avatars to the nearest, straight at it once close (its tile is flat in the field),
            // else out.
            const slot = this.target[zombie];
            const field = slot < 0 ? undefined : this.field;
            let arrive = 1;
            if (field && field[this.cellAt(zx, zy)] < CLOSE_FIELD) {
                const tile = this.avatarTile[slot];
                const dx = ((tile % tilesWide) + 0.5) * TILE_PX - zx;
                const dy = (Math.floor(tile / tilesWide) + 0.5) * TILE_PX - zy;
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d > 1e-6) {
                    this.atX = dx / d;
                    this.atY = dy / d;
                } else {
                    this.atX = this.horde.dirX;
                    this.atY = this.horde.dirY;
                }
                arrive = Math.min(1, d / ARRIVE_PX);
            } else if (!field || !this.wayTo(field, zx, zy)) this.wayOut(zx, zy);
            // It sways from its way, a slow wander of its own: its way turned by a share of its square.
            let sway = this.sway[zombie] + (this.random() * 2 - 1) * SWAY_WANDER;
            sway = Math.min(SWAY, Math.max(-SWAY, sway));
            this.sway[zombie] = sway;
            let wayX = this.atX - sway * this.atY;
            let wayY = this.atY + sway * this.atX;
            const wayLength = Math.sqrt(wayX * wayX + wayY * wayY);
            wayX /= wayLength;
            wayY /= wayLength;

            const tileX = Math.min(tilesWide - 1, Math.max(0, Math.floor(zx / TILE_PX)));
            const tileY = Math.min(tilesHigh - 1, Math.max(0, Math.floor(zy / TILE_PX)));
            let pushX = 0;
            let pushY = 0;
            let near = 0;
            let alongX = 0;
            let alongY = 0;
            let along = 0;
            const feel = (dx: number, dy: number, touch: number, ofOther: number): void => {
                const d2 = dx * dx + dy * dy;
                if (d2 >= (touch + SOCIAL_RANGE_PX) * (touch + SOCIAL_RANGE_PX) || d2 < 1e-9) return;
                const d = Math.sqrt(d2);
                const nx = dx / d;
                const ny = dy / d;
                // Those in the half disc ahead of it, counted twice: the density of the disc it runs into.
                if (d2 < density2 && wayX * nx + wayY * ny > 0) near += 2;
                const gap = d - touch;
                const share = gap <= 0 ? 1 : 1 - gap / SOCIAL_RANGE_PX;
                const facing = ANISOTROPY + (1 - ANISOTROPY) * 0.5 * (1 + wayX * nx + wayY * ny);
                const push = share * share * facing * ofOther;
                pushX -= push * nx;
                pushY -= push * ny;
            };
            for (let row = Math.max(0, tileY - 1); row <= Math.min(tilesHigh - 1, tileY + 1); row++) {
                for (let column = Math.max(0, tileX - 1); column <= Math.min(tilesWide - 1, tileX + 1); column++) {
                    const tile = row * tilesWide + column;
                    for (let at = tileStart[tile]; at < tileStart[tile + 1]; at++) {
                        const other = tileList[at];
                        if (other === zombie) continue;
                        const dx = x[other] - zx;
                        const dy = y[other] - zy;
                        if (dx * dx + dy * dy >= reach2) continue;
                        feel(dx, dy, 2 * ZOMBIE_RADIUS_PX, 1);
                        alongX += vx[other];
                        alongY += vy[other];
                        along++;
                    }
                }
            }
            // The avatars stand in its way: it goes round them, and pushes against them in a press.
            for (let other = 0; other < ZOMBIE_MOST_AVATARS; other++) {
                const tile = this.avatarTile[other];
                if (tile < 0) continue;
                const ax = ((tile % tilesWide) + 0.5) * TILE_PX - zx;
                const ay = (Math.floor(tile / tilesWide) + 0.5) * TILE_PX - zy;
                if (ax * ax + ay * ay < reach2 * 4) feel(ax, ay, ZOMBIE_RADIUS_PX + AVATAR_RADIUS_PX, 2);
            }
            const wanted = this.pace[zombie] * WEIDMANN[Math.min(WEIDMANN.length - 1, near)] * arrive;
            let ax = (wanted * wayX - vx[zombie]) / RELAX_SECONDS + SOCIAL_ACCEL * pushX;
            let ay = (wanted * wayY - vy[zombie]) / RELAX_SECONDS + SOCIAL_ACCEL * pushY;
            if (along > 0) {
                ax += ALIGNMENT * (alongX / along - vx[zombie]);
                ay += ALIGNMENT * (alongY / along - vy[zombie]);
            }
            let nvx = vx[zombie] + ax * DT;
            let nvy = vy[zombie] + ay * DT;
            const most = this.pace[zombie] * 1.15;
            const speed2 = nvx * nvx + nvy * nvy;
            if (speed2 > most * most) {
                const scale = most / Math.sqrt(speed2);
                nvx *= scale;
                nvy *= scale;
            }
            nextVx[zombie] = nvx;
            nextVy[zombie] = nvy;
        }
    }

    /** Each zombie moves, the contacts are undone, the walls hold, and those who ran out by the far side are gone. */
    private move(): void {
        const { count, state, x, y, lastX, lastY, vx, vy, nextVx, nextVy, tileStart, tileList, tilesWide, tilesHigh } =
            this;
        for (let zombie = 0; zombie < count; zombie++) {
            if (state[zombie] !== ZOMBIE_WALKING) continue;
            lastX[zombie] = x[zombie];
            lastY[zombie] = y[zombie];
            if (this.tileOf[zombie] >= 0) {
                vx[zombie] = nextVx[zombie];
                vy[zombie] = nextVy[zombie];
            }
            x[zombie] += vx[zombie] * DT;
            y[zombie] += vy[zombie] * DT;
        }
        const touch = 2 * ZOMBIE_RADIUS_PX;
        const touch2 = touch * touch;
        for (let zombie = 0; zombie < count; zombie++) {
            const tile = this.tileOf[zombie];
            if (tile < 0 || state[zombie] !== ZOMBIE_WALKING) continue;
            const tileX = tile % tilesWide;
            const tileY = (tile - tileX) / tilesWide;
            for (let row = Math.max(0, tileY - 1); row <= Math.min(tilesHigh - 1, tileY + 1); row++) {
                for (let column = Math.max(0, tileX - 1); column <= Math.min(tilesWide - 1, tileX + 1); column++) {
                    const near = row * tilesWide + column;
                    for (let at = tileStart[near]; at < tileStart[near + 1]; at++) {
                        const other = tileList[at];
                        if (other <= zombie || state[other] !== ZOMBIE_WALKING) continue;
                        const dx = x[other] - x[zombie];
                        const dy = y[other] - y[zombie];
                        const d2 = dx * dx + dy * dy;
                        if (d2 >= touch2) continue;
                        let nx: number;
                        let ny: number;
                        let d: number;
                        if (d2 < 1e-9) {
                            nx = 1;
                            ny = 0;
                            d = 0;
                        } else {
                            d = Math.sqrt(d2);
                            nx = dx / d;
                            ny = dy / d;
                        }
                        const half = 0.5 * CONTACT_STIFFNESS * (touch - d);
                        x[zombie] -= nx * half;
                        y[zombie] -= ny * half;
                        x[other] += nx * half;
                        y[other] += ny * half;
                    }
                }
            }
        }
        for (let zombie = 0; zombie < count; zombie++) {
            if (state[zombie] !== ZOMBIE_WALKING) continue;
            const fromX = lastX[zombie];
            const fromY = lastY[zombie];
            let toX = fromX + Math.min(MOST_A_STEP_PX, Math.max(-MOST_A_STEP_PX, x[zombie] - fromX));
            let toY = fromY + Math.min(MOST_A_STEP_PX, Math.max(-MOST_A_STEP_PX, y[zombie] - fromY));
            const cellX = Math.floor(fromX / TERRAIN_CELL);
            const cellY = Math.floor(fromY / TERRAIN_CELL);
            const nextX = Math.floor(toX / TERRAIN_CELL);
            if (nextX !== cellX) {
                if (nextX < 0 || nextX >= this.width) {
                    if (this.exits[cellY * this.width + cellX] && this.outwards(nextX < 0 ? -1 : 1, 0)) {
                        this.leave(zombie);
                        continue;
                    }
                    toX = Math.min(this.widthPx - 0.5, Math.max(0.5, toX));
                } else if (!this.canGo(cellY * this.width + cellX, nextX - cellX, 0)) toX = fromX;
            }
            const columnNow = Math.floor(toX / TERRAIN_CELL);
            const nextY = Math.floor(toY / TERRAIN_CELL);
            if (nextY !== cellY) {
                if (nextY < 0 || nextY >= this.height) {
                    if (this.exits[cellY * this.width + columnNow] && this.outwards(0, nextY < 0 ? -1 : 1)) {
                        this.leave(zombie);
                        continue;
                    }
                    toY = Math.min(this.heightPx - 0.5, Math.max(0.5, toY));
                } else if (!this.canGo(cellY * this.width + columnNow, 0, nextY - cellY)) toY = fromY;
            }
            x[zombie] = toX;
            y[zombie] = toY;
            vx[zombie] = (toX - fromX) / DT;
            vy[zombie] = (toY - fromY) / DT;
            const dx = toX - fromX;
            const dy = toY - fromY;
            const walked = Math.sqrt(dx * dx + dy * dy);
            if (walked > 0) {
                const tileX = Math.min(tilesWide - 1, Math.max(0, Math.floor((fromX + toX) / 2 / TILE_PX)));
                const tileY = Math.min(tilesHigh - 1, Math.max(0, Math.floor((fromY + toY) / 2 / TILE_PX)));
                this.trampled[tileY * tilesWide + tileX] += walked / TILE_PX;
                this.trampledAny = true;
            }
        }
    }

    private leave(zombie: number): void {
        this.state[zombie] = ZOMBIE_GONE;
        this.target[zombie] = -1;
        this.walking--;
    }

    private outwards(dx: number, dy: number): boolean {
        return dx * this.horde.dirX + dy * this.horde.dirY > 0.05;
    }

    /**
     * The potential: the time (in cells run) to run out by the far side from each cell, by fast marching through the
     * open sides of the cells that are neither water nor collision. Its exits are the cells of the edges the heading
     * goes out by, each worth its distance to a line square to the heading.
     */
    private march(): void {
        const { width, height, potential, exits } = this;
        const { dirX, dirY } = this.horde;
        const size = width * height;
        potential.fill(Number.POSITIVE_INFINITY);
        const done = new Uint8Array(size);
        const heap = new Int32Array(size + 4);
        const where = new Int32Array(size).fill(-1);
        let heapSize = 0;
        const less = (a: number, b: number): boolean =>
            potential[a] < potential[b] || (potential[a] === potential[b] && a < b);
        const swap = (i: number, j: number): void => {
            const a = heap[i];
            heap[i] = heap[j];
            heap[j] = a;
            where[heap[i]] = i;
            where[heap[j]] = j;
        };
        const up = (i: number): void => {
            while (i > 0) {
                const parent = (i - 1) >> 1;
                if (!less(heap[i], heap[parent])) break;
                swap(i, parent);
                i = parent;
            }
        };
        const down = (i: number): void => {
            for (;;) {
                const left = 2 * i + 1;
                const right = left + 1;
                let best = i;
                if (left < heapSize && less(heap[left], heap[best])) best = left;
                if (right < heapSize && less(heap[right], heap[best])) best = right;
                if (best === i) break;
                swap(i, best);
                i = best;
            }
        };
        const push = (cell: number, value: number): void => {
            if (value >= potential[cell]) return;
            potential[cell] = value;
            if (where[cell] < 0) {
                heap[heapSize] = cell;
                where[cell] = heapSize;
                heapSize++;
                up(heapSize - 1);
            } else up(where[cell]);
        };
        const pop = (): number => {
            const top = heap[0];
            heapSize--;
            where[top] = -1;
            if (heapSize > 0) {
                heap[0] = heap[heapSize];
                where[heap[0]] = 0;
                down(0);
            }
            return top;
        };
        const exitBy = (cellX: number, cellY: number): boolean =>
            (cellX === 0 && -dirX > 0.05) ||
            (cellX === width - 1 && dirX > 0.05) ||
            (cellY === 0 && -dirY > 0.05) ||
            (cellY === height - 1 && dirY > 0.05);
        for (let cellY = 0; cellY < height; cellY++) {
            for (let cellX = 0; cellX < width; cellX++) {
                if (cellX !== 0 && cellY !== 0 && cellX !== width - 1 && cellY !== height - 1) continue;
                const cell = cellY * width + cellX;
                if (!exitBy(cellX, cellY) || this.blockedCell(cell)) continue;
                exits[cell] = 1;
                const value = -((cellX + 0.5) * dirX + (cellY + 0.5) * dirY) + 1;
                this.exitLevel = Math.min(this.exitLevel, value);
                push(cell, value);
            }
        }
        const solve = (cell: number): number => {
            const cellX = cell % width;
            const cellY = (cell - cellX) / width;
            let a = Number.POSITIVE_INFINITY;
            let b = Number.POSITIVE_INFINITY;
            if (cellX > 0 && done[cell - 1] && this.canGo(cell, -1, 0)) a = potential[cell - 1];
            if (cellX < width - 1 && done[cell + 1] && this.canGo(cell, 1, 0)) a = Math.min(a, potential[cell + 1]);
            if (cellY > 0 && done[cell - width] && this.canGo(cell, 0, -1)) b = potential[cell - width];
            if (cellY < height - 1 && done[cell + width] && this.canGo(cell, 0, 1))
                b = Math.min(b, potential[cell + width]);
            if (a === Number.POSITIVE_INFINITY && b === Number.POSITIVE_INFINITY) return a;
            if (a === Number.POSITIVE_INFINITY) return b + 1;
            if (b === Number.POSITIVE_INFINITY) return a + 1;
            const gap = a - b;
            if (gap >= 1 || gap <= -1) return Math.min(a, b) + 1;
            return (a + b + Math.sqrt(2 - gap * gap)) / 2;
        };
        while (heapSize > 0) {
            const cell = pop();
            if (done[cell]) continue;
            done[cell] = 1;
            const cellX = cell % width;
            const cellY = (cell - cellX) / width;
            // Spread to the neighbours one can come from (the move is the same either way: walls and blocked cells).
            const open = (other: number, dx: number, dy: number): boolean =>
                !done[other] && !this.blockedCell(other) && this.canGo(other, dx, dy);
            if (cellX > 0 && open(cell - 1, 1, 0)) push(cell - 1, solve(cell - 1));
            if (cellX < width - 1 && open(cell + 1, -1, 0)) push(cell + 1, solve(cell + 1));
            if (cellY > 0 && open(cell - width, 0, 1)) push(cell - width, solve(cell - width));
            if (cellY < height - 1 && open(cell + width, 0, -1)) push(cell + width, solve(cell + width));
        }
        for (let cellY = 0; cellY < height; cellY++) {
            for (let cellX = 0; cellX < width; cellX++) {
                const cell = cellY * width + cellX;
                const here = potential[cell];
                if (here === Number.POSITIVE_INFINITY) continue;
                const side = (other: number, open: boolean): number =>
                    open && potential[other] !== Number.POSITIVE_INFINITY ? potential[other] : here;
                const west = cellX > 0 ? side(cell - 1, this.canGo(cell, -1, 0)) : here;
                const east = cellX < width - 1 ? side(cell + 1, this.canGo(cell, 1, 0)) : here;
                const north = cellY > 0 ? side(cell - width, this.canGo(cell, 0, -1)) : here;
                const south = cellY < height - 1 ? side(cell + width, this.canGo(cell, 0, 1)) : here;
                const gx = Math.min(0, east - here) - Math.min(0, west - here);
                const gy = Math.min(0, south - here) - Math.min(0, north - here);
                const length = Math.sqrt(gx * gx + gy * gy);
                if (exits[cell]) {
                    this.wayX[cell] = dirX;
                    this.wayY[cell] = dirY;
                } else if (length > 1e-9) {
                    this.wayX[cell] = -gx / length;
                    this.wayY[cell] = -gy / length;
                }
            }
        }
    }

    /**
     * How narrow the way out of each cell gets (narrowOut): the room each cell has, in cells to the nearest closed side
     * (a wall, water, a collision; NARROW_CELLS at most), then from the exits inwards the widest way's narrowest room
     * (a widest path, the widest first, in buckets by room).
     */
    private narrowWays(): void {
        const { width, height, exits, narrowOut, narrowAt } = this;
        const cellsATile = TILE_PX / TERRAIN_CELL;
        const size = width * height;
        const room = new Uint8Array(size);
        let ring: number[] = [];
        const sides: [number, number][] = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
        ];
        const inside = (cellX: number, cellY: number): boolean =>
            cellX >= 0 && cellY >= 0 && cellX < width && cellY < height;
        for (let cell = 0; cell < size; cell++) {
            if (this.blockedCell(cell)) continue;
            const cellX = cell % width;
            const cellY = (cell - cellX) / width;
            for (const [dx, dy] of sides) {
                if (!inside(cellX + dx, cellY + dy)) continue;
                if (!this.canGo(cell, dx, dy) || this.blockedCell(cell + dy * width + dx)) {
                    room[cell] = 1;
                    ring.push(cell);
                    break;
                }
            }
        }
        for (let reach = 2; reach <= NARROW_CELLS && ring.length > 0; reach++) {
            const next: number[] = [];
            for (const cell of ring) {
                const cellX = cell % width;
                const cellY = (cell - cellX) / width;
                for (const [dx, dy] of sides) {
                    if (!inside(cellX + dx, cellY + dy) || !this.canGo(cell, dx, dy)) continue;
                    const other = cell + dy * width + dx;
                    if (room[other] !== 0 || this.blockedCell(other)) continue;
                    room[other] = reach;
                    next.push(other);
                }
            }
            ring = next;
        }
        for (let cell = 0; cell < size; cell++)
            if (room[cell] === 0 && !this.blockedCell(cell)) room[cell] = NARROW_CELLS;
        const buckets: number[][] = Array.from({ length: NARROW_CELLS + 1 }, () => []);
        narrowOut.fill(0);
        for (let cell = 0; cell < size; cell++) {
            if (!exits[cell]) continue;
            narrowOut[cell] = room[cell];
            buckets[room[cell]].push(cell);
        }
        for (let wide = NARROW_CELLS; wide >= 1; wide--) {
            const bucket = buckets[wide];
            for (let at = 0; at < bucket.length; at++) {
                const cell = bucket[at];
                if (narrowOut[cell] !== wide) continue;
                const cellX = cell % width;
                const cellY = (cell - cellX) / width;
                for (const [dx, dy] of sides) {
                    if (!inside(cellX + dx, cellY + dy)) continue;
                    const other = cell + dy * width + dx;
                    // One comes from the other cell into this one.
                    if (this.blockedCell(other) || !this.canGo(other, -dx, -dy)) continue;
                    const through = Math.min(wide, room[other]);
                    if (through <= narrowOut[other]) continue;
                    narrowOut[other] = through;
                    // Narrower here than on the way beyond: this is the passage; else that of the way beyond.
                    const otherX = other % width;
                    narrowAt[other] =
                        through >= NARROW_CELLS
                            ? -1
                            : room[other] < wide
                              ? Math.floor((other - otherX) / width / cellsATile) * this.tilesWide +
                                Math.floor(otherX / cellsATile)
                              : narrowAt[cell];
                    buckets[through].push(other);
                }
            }
        }
    }

    /** The cells the horde comes in by: on the edges it comes from, across its front, where it can run out from. */
    private entryCells(frontPx: number): Int32Array {
        const { width, height, potential } = this;
        const { dirX, dirY } = this.horde;
        const inside =
            this.horde.anchorX >= 0 &&
            this.horde.anchorY >= 0 &&
            this.horde.anchorX <= this.widthPx &&
            this.horde.anchorY <= this.heightPx;
        const ax = inside ? this.horde.anchorX : this.widthPx / 2;
        const ay = inside ? this.horde.anchorY : this.heightPx / 2;
        const entryBy = (cellX: number, cellY: number): boolean =>
            (cellX === 0 && dirX > 0.05) ||
            (cellX === width - 1 && -dirX > 0.05) ||
            (cellY === 0 && dirY > 0.05) ||
            (cellY === height - 1 && -dirY > 0.05);
        const edge: number[] = [];
        const front: number[] = [];
        const anyEdge: number[] = [];
        for (let cellY = 0; cellY < height; cellY++) {
            for (let cellX = 0; cellX < width; cellX++) {
                if (cellX !== 0 && cellY !== 0 && cellX !== width - 1 && cellY !== height - 1) continue;
                const cell = cellY * width + cellX;
                if (potential[cell] === Number.POSITIVE_INFINITY || this.blockedCell(cell)) continue;
                anyEdge.push(cell);
                if (!entryBy(cellX, cellY)) continue;
                edge.push(cell);
                const across = ((cellX + 0.5) * TERRAIN_CELL - ax) * -dirY + ((cellY + 0.5) * TERRAIN_CELL - ay) * dirX;
                if (Math.abs(across) <= frontPx / 2) front.push(cell);
            }
        }
        // Out of the water and the walls, across its front where it can; anywhere on its edge, or on any edge, else.
        for (const cells of [front, edge, anyEdge]) {
            if (cells.length > 0) return Int32Array.from(cells);
        }
        return new Int32Array(0);
    }
}
