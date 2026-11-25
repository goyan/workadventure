import { TERRAIN_CELL, TILE_PX } from "../types";
import {
    decodeZombieLog,
    decodeZombieTerrain,
    ZOMBIE_EAST,
    ZOMBIE_PX_PER_METRE,
    ZOMBIE_SOLID,
    ZOMBIE_SOUTH,
    ZOMBIE_STEP_MS,
    ZOMBIE_WATER,
    zombieLastStep,
    zombieLogInOrder,
    zombieStepAt,
} from "./ZombieHorde";
import {
    ZOMBIE_GRENADE_BLAST_M,
    ZOMBIE_GRENADE_FUSE_STEPS,
    ZOMBIE_GRENADE_LETHAL_M,
    zombieGrenadePath,
} from "./ZombieGrenade";
import type { ZombieGrenadePath, ZombieGrenadeShot } from "./ZombieGrenade";
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
 *   when an avatar changes tile. It runs until it is within ZOMBIE_SATISFIED_TILES tiles of it; then it is done with
 *   that avatar for a while (ZOMBIE_FORGET_STEPS), and goes on its way. One that gets no nearer for a while (a jam at a
 *   door) gives up on it too. When its time runs short, the way out wins over any avatar.
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

/** Within this many tiles of an avatar, a zombie is done with it. */
export const ZOMBIE_SATISFIED_TILES = 5;
const SATISFIED_PX = ZOMBIE_SATISFIED_TILES * TILE_PX;
/** A zombie done with an avatar does not run after it again for this many steps (60 s of the horde). */
export const ZOMBIE_FORGET_STEPS = 600;
/** One that got no nearer an avatar for this many steps (5 s) gives up on it. */
const GIVE_UP_STEPS = 50;
/** Getting nearer is getting this much nearer (2 cells, in the units of the fields). */
const NEARER = 20;
/**
 * Within this many tiles of its avatar, in a press (this many others in the metre ahead, counted twice), a zombie is
 * done with it: it is in the crowd round it, it will get no nearer.
 */
const PRESS_TILES = 12;
const PRESS_NEAR = 6;
/** Each zombie looks again for an avatar to run to every this many steps, in turn. */
const RETARGET_STEPS = 10;
/** The way out wins once the time to run out, this much longer, is more than the time left. */
const URGENCY_MARGIN = 1.6;
/**
 * The whole horde runs out once the time left is under the time its furthest zombie needs to run out, this much
 * longer and a few seconds more: no avatar holds it past that (a jam at a door would hold it otherwise).
 */
const RUSH_MARGIN = 2;
/**
 * A zombie runs to an avatar that fewer than this many others run to already: those round it make a press, the
 * others hear it is taken and go on (a choice: without it the whole horde would pack into the room of one avatar,
 * and never get out by its door in time).
 */
const MOST_ON_ONE = 40;
const RUSH_SECONDS = 10;
/** A zombie that overlaps an avatar wholly shoves it at this speed (px/s), and carries it this share of its own. */
const SHOVE_PX_S = 3 * PX;
const SHOVE_CARRY = 0.5;
/** An avatar is never shoved faster than a human is when pushed in a crowd (m/s). */
export const ZOMBIE_SHOVE_MOST_M_S = 2.5;
/** The avatars a horde follows, at most (the first seen). */
export const ZOMBIE_MOST_AVATARS = 32;
/** The fields of single avatars made at one step, at most: one asked for waits its turn. */
const OWN_FIELDS_A_STEP = 1;
/** The distance field counts 10 a cell across, 14 a cell on the diagonal; this is "out of reach". */
const FAR = 0x7fffffff;

/** What a zombie is doing. */
export const ZOMBIE_WAITING = 0;
export const ZOMBIE_WALKING = 1;
export const ZOMBIE_GONE = 2;
/** Thrown by a grenade, burning: it falls, burns, and is gone at its step `dieAt`. */
export const ZOMBIE_DYING = 3;

/**
 * What the blast of a grenade does to a zombie: thrown up and away, the more the nearer (m/s, a choice of the order of
 * what the blast of a few hundred grams of explosive gives a body at a few metres), then it burns this long and is gone.
 * Beyond the radius of fatality, within that of casualties, it is only shoved.
 */
const BLAST_UP_M_S = 7;
const BLAST_AWAY_M_S = 9;
const SHOVE_AWAY_M_S = 5;
export const ZOMBIE_BURN_STEPS = 40;
/** A body thrown bounces off the ground keeping this share of its speed downwards, and slides to a stop. */
const BODY_BOUNCE = 0.25;
const BODY_SLIDE_BRAKE = 6;
const G_PX_S2 = 9.81 * ZOMBIE_PX_PER_METRE;

/** A grenade of the log, by the step it goes off at and its points: the same in every message that tells it. */
function shotKey(explodeStep: number, shot: ZombieGrenadeShot): string {
    return `${explodeStep}:${shot.fromX}:${shot.fromY}:${shot.toX}:${shot.toY}`;
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
    /** How many others were in the metre ahead of each zombie at the last step (counted twice). */
    private readonly press: Uint8Array;
    /** The whole horde runs out. */
    private rushing = false;
    private readonly onOne = new Int32Array(ZOMBIE_MOST_AVATARS);
    /** Until which step each zombie is done with each avatar (zombie * ZOMBIE_MOST_AVATARS + slot). */
    private readonly doneUntil: Int32Array;
    /** How near it got to its avatar (its distance field), and at which step it last got nearer. */
    private readonly nearest: Int32Array;
    private readonly nearestAt: Int32Array;
    /**
     * The distance by the way of the map from each cell to the nearest avatar, and that avatar (its slot, -1 out of
     * reach); made again at the step an avatar changes tile (`fieldStale`). Undefined while there is no avatar.
     */
    private field: Int32Array | undefined;
    private owner: Int8Array | undefined;
    private fieldStale = false;
    /**
     * The field of a single avatar, for a zombie whose nearest avatar is one it is done with or that has its share of
     * zombies already: made when such a zombie asks for it (`wanted`, a bit a slot), OWN_FIELDS_A_STEP at most, and
     * again when it is asked for after its avatar moved (`ownTile`, the tile it was made from).
     */
    private readonly own: (Int32Array | undefined)[] = new Array<Int32Array | undefined>(ZOMBIE_MOST_AVATARS);
    private readonly ownTile = new Int32Array(ZOMBIE_MOST_AVATARS).fill(-1);
    private wanted = 0;
    /** The ways out of each cell (waysOf), made the first time the field is. */
    private ways: Uint8Array | undefined;
    /** The buckets of the Dijkstra, by distance modulo 16 (a step adds 10 or 14): kept from one making to the next. */
    private readonly buckets: number[][] = Array.from({ length: 16 }, () => []);
    /**
     * The grenades told that have not gone off yet (and those of the last step, drawn until it), by their entry
     * (shotKey), with their paths once computed; the blasts not yet taken.
     */
    private shots = new Map<string, { explodeStep: number; shot: ZombieGrenadeShot; path?: ZombieGrenadePath }>();
    private explosions: { x: number; y: number; step: number; killed: number }[] = [];
    /** The log of the avatars, the next entry to apply, and the last step it is complete to. */
    private log: ZombieLogEntry[] = [];
    private logAt = 0;
    /** The text of the log last read: told again (the server reads it ten times a second), it is nothing new. */
    private logText: string | undefined;
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
        this.target = new Int8Array(count).fill(-1);
        this.pace = new Float64Array(count);
        this.sway = new Float64Array(count);
        this.leaving = new Uint8Array(count);
        this.press = new Uint8Array(count);
        this.doneUntil = new Int32Array(count * ZOMBIE_MOST_AVATARS);
        this.nearest = new Int32Array(count).fill(FAR);
        this.nearestAt = new Int32Array(count);
        this.tileOf = new Int32Array(count);
        this.tileList = new Int32Array(count);
        this.tilesWide = Math.ceil(this.widthPx / TILE_PX);
        this.tilesHigh = Math.ceil(this.heightPx / TILE_PX);
        this.tileStart = new Int32Array(this.tilesWide * this.tilesHigh + 1);
        this.trampled = new Float32Array(this.tilesWide * this.tilesHigh);
        this.lastStep = zombieLastStep(horde);
        this.random = mulberry32(horde.seed);
        this.exits = new Uint8Array(width * height);
        this.potential = new Float64Array(width * height);
        this.wayX = new Float32Array(width * height);
        this.wayY = new Float32Array(width * height);
        this.march();
        const frontPx = Math.max(LEAST_FRONT_PX, Math.sqrt((count * FRONT_ASPECT) / MARCH_DENSITY) * PX);
        this.entries = this.entryCells(frontPx);
        this.emitSteps = Math.max(1, Math.floor(this.lastStep * EMIT_SHARE));
        for (let zombie = 0; zombie < count; zombie++) {
            this.pace[zombie] = SLOWEST_RUN_PX + (FASTEST_RUN_PX - SLOWEST_RUN_PX) * this.random();
            this.sway[zombie] = (this.random() * 2 - 1) * SWAY;
        }
        this.safeStep = -1;
        this.setLog(horde.avatars, horde.safeStep);
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
        const entries = zombieLogInOrder(decodeZombieLog(text));
        for (let at = 0; at < this.logAt; at++) {
            if (at >= entries.length || entries[at].applyStep !== this.log[at].applyStep) return;
        }
        this.log = entries;
        this.logText = text;
        if (Number.isFinite(safeStep) && safeStep > this.safeStep) this.safeStep = safeStep;
        // The grenades not gone off yet (and those of the last step, still drawn): their paths, made when first asked
        // for, kept from the log read before. Those gone off long ago are not looked at again.
        const shots = new Map<string, { explodeStep: number; shot: ZombieGrenadeShot; path?: ZombieGrenadePath }>();
        let from = entries.length;
        while (from > 0 && entries[from - 1].applyStep >= this.steps - 1) from--;
        for (let at = from; at < entries.length; at++) {
            const entry = entries[at];
            for (const shot of entry.grenades ?? []) {
                const key = shotKey(entry.applyStep, shot);
                shots.set(key, this.shots.get(key) ?? { explodeStep: entry.applyStep, shot });
            }
        }
        this.shots = shots;
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
        for (let zombie = 0; zombie < this.count; zombie++) {
            if (this.state[zombie] !== ZOMBIE_WALKING) continue;
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
            return;
        }
        this.fillTiles();
        this.comeIn();
        this.choose();
        this.steer();
        this.move();
        this.fly();
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
                this.explode(path.x[ZOMBIE_GRENADE_FUSE_STEPS], path.y[ZOMBIE_GRENADE_FUSE_STEPS]);
            }
            this.logAt++;
        }
    }

    /**
     * A grenade goes off at a point: the zombies within ZOMBIE_GRENADE_LETHAL_M are thrown up and away, burning, and
     * are gone; those within ZOMBIE_GRENADE_BLAST_M are shoved away, the more the nearer.
     */
    private explode(px: number, py: number): void {
        const lethal = ZOMBIE_GRENADE_LETHAL_M * PX;
        const blast = ZOMBIE_GRENADE_BLAST_M * PX;
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
                this.state[zombie] = ZOMBIE_DYING;
                this.walking--;
                this.dying++;
                this.target[zombie] = -1;
                this.z[zombie] = 0;
                this.vz[zombie] = (BLAST_UP_M_S * (1 - d / lethal) + 2) * PX;
                this.vx[zombie] = nx * BLAST_AWAY_M_S * falloff * PX;
                this.vy[zombie] = ny * BLAST_AWAY_M_S * falloff * PX;
                this.dieAt[zombie] = this.steps + ZOMBIE_BURN_STEPS;
                killed++;
            } else {
                this.vx[zombie] += nx * SHOVE_AWAY_M_S * falloff * PX;
                this.vy[zombie] += ny * SHOVE_AWAY_M_S * falloff * PX;
            }
        }
        this.explosions.push({ x: px, y: py, step: this.steps, killed });
    }

    /** The zombies thrown by a blast fly, bounce, slide to a stop against the walls, burn, and are gone. */
    private fly(): void {
        const { count, state, x, y, lastX, lastY, vx, vy } = this;
        for (let zombie = 0; zombie < count; zombie++) {
            if (state[zombie] !== ZOMBIE_DYING) continue;
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
     * The field of the avatars, made again when one changed tile (at the step its change is applied); then the fields
     * of single avatars the zombies asked for at the step before.
     */
    private makeFields(): void {
        if (this.fieldStale) {
            this.fieldStale = false;
            const field = this.field ?? new Int32Array(this.width * this.height);
            const owner = this.owner ?? new Int8Array(this.width * this.height);
            const seeded = this.spread(field, owner, -1);
            this.field = seeded ? field : undefined;
            this.owner = seeded ? owner : undefined;
        }
        let made = 0;
        for (let slot = 0; slot < ZOMBIE_MOST_AVATARS && this.wanted !== 0 && made < OWN_FIELDS_A_STEP; slot++) {
            const bit = 1 << slot;
            if ((this.wanted & bit) === 0) continue;
            this.wanted &= ~bit;
            const tile = this.avatarTile[slot];
            if (tile < 0 || (this.own[slot] && this.ownTile[slot] === tile)) continue;
            const own = this.own[slot] ?? new Int32Array(this.width * this.height);
            this.own[slot] = this.spread(own, undefined, slot) ? own : undefined;
            this.ownTile[slot] = tile;
            made++;
        }
    }

    /**
     * The distance from the avatars (all, or the one of slot `only`) to each cell (10 a cell across, 14 on a
     * diagonal), by the open sides of the cells, round the water and the collisions, through the doors, and the avatar
     * each cell is nearest to (`owner`): a Dijkstra from all of them at once, its queue in buckets (Dial 1969). The
     * same everywhere: the avatars are seeded in the order of their slots, the buckets read in the order they were
     * filled, and a cell keeps the first avatar to reach it at its distance. False when no avatar stands anywhere.
     */
    private spread(field: Int32Array, owner: Int8Array | undefined, only: number): boolean {
        const { width, height, buckets } = this;
        let seeded = false;
        field.fill(FAR);
        owner?.fill(-1);
        for (const bucket of buckets) bucket.length = 0;
        let queued = 0;
        const cellsATile = TILE_PX / TERRAIN_CELL;
        for (let slot = 0; slot < ZOMBIE_MOST_AVATARS; slot++) {
            const tile = this.avatarTile[slot];
            if (tile < 0 || (only >= 0 && slot !== only)) continue;
            const tileX = tile % this.tilesWide;
            const tileY = (tile - tileX) / this.tilesWide;
            for (let dy = 0; dy < cellsATile; dy++) {
                for (let dx = 0; dx < cellsATile; dx++) {
                    const cellX = tileX * cellsATile + dx;
                    const cellY = tileY * cellsATile + dy;
                    const cell = cellY * width + cellX;
                    if (cellX >= width || cellY >= height || this.blockedCell(cell) || field[cell] === 0) continue;
                    field[cell] = 0;
                    if (owner) owner[cell] = slot;
                    buckets[0].push(cell);
                    queued++;
                    seeded = true;
                }
            }
        }
        if (!seeded) return false;
        // The buckets in turn, by growing distance: each holds the cells at a distance with these last four bits.
        const ways = this.waysOf();
        const steps = [1, -1, width, -width, width + 1, width - 1, -width + 1, -width - 1];
        const costs = [10, 10, 10, 10, 14, 14, 14, 14];
        for (let distance = 0; queued > 0; distance++) {
            const bucket = buckets[distance & 15];
            for (let at = 0; at < bucket.length; at++) {
                const cell = bucket[at];
                queued--;
                if (field[cell] !== distance) continue;
                const slot = owner ? owner[cell] : only;
                const open = ways[cell];
                for (let way = 0; way < 8; way++) {
                    if ((open & (1 << way)) === 0) continue;
                    const next = cell + steps[way];
                    const reached = distance + costs[way];
                    if (reached >= field[next]) continue;
                    field[next] = reached;
                    if (owner) owner[next] = slot;
                    buckets[reached & 15].push(next);
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
     * Each zombie, in its turn (every RETARGET_STEPS steps), chooses where it runs: to the nearest avatar it hears and
     * is not done with, by the way the map allows, or out. Every step it checks whether it reached its avatar (then
     * it is done with it), gave up on it, or must run out now.
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
            if (furthest * RUSH_MARGIN + RUSH_SECONDS >= remainingSeconds) this.rushing = true;
        }
        // How many run to each avatar, from the step before: counted as the choices change.
        const onOne = this.onOne;
        onOne.fill(0);
        for (let zombie = 0; zombie < count; zombie++) if (target[zombie] >= 0) onOne[target[zombie]]++;
        for (let zombie = 0; zombie < count; zombie++) {
            if (state[zombie] !== ZOMBIE_WALKING) continue;
            const cell = this.cellAt(x[zombie], y[zombie]);
            if (this.rushing && !this.leaving[zombie]) {
                this.leaving[zombie] = 1;
                target[zombie] = -1;
            }
            if (!this.leaving[zombie]) {
                const out = this.potential[cell] - this.exitLevel;
                const secondsOut = (out * TERRAIN_CELL) / this.pace[zombie];
                if (out !== Number.POSITIVE_INFINITY && secondsOut * URGENCY_MARGIN + 2 >= remainingSeconds) {
                    this.leaving[zombie] = 1;
                    target[zombie] = -1;
                }
            }
            const slot = target[zombie];
            const field = this.field;
            const owner = this.owner;
            if (slot >= 0) {
                const tile = this.avatarTile[slot];
                if (tile < 0 || !field) {
                    target[zombie] = -1;
                } else {
                    const ax = ((tile % this.tilesWide) + 0.5) * TILE_PX;
                    const ay = (Math.floor(tile / this.tilesWide) + 0.5) * TILE_PX;
                    const dx = ax - x[zombie];
                    const dy = ay - y[zombie];
                    // Nearer by the way of the map, where the field leads to it; else as the crow flies.
                    const own = this.own[slot];
                    const distance =
                        owner?.[cell] === slot
                            ? field[cell]
                            : own
                              ? own[cell]
                              : Math.floor((Math.sqrt(dx * dx + dy * dy) / TERRAIN_CELL) * 10);
                    if (distance + NEARER <= this.nearest[zombie]) {
                        this.nearest[zombie] = distance;
                        this.nearestAt[zombie] = steps;
                    }
                    const d2 = dx * dx + dy * dy;
                    // Reached (within 5 tiles), in the press round it, or no nearer for a while: done with it.
                    if (
                        d2 < SATISFIED_PX * SATISFIED_PX ||
                        (d2 < PRESS_TILES * PRESS_TILES * TILE_PX * TILE_PX && this.press[zombie] >= PRESS_NEAR) ||
                        steps - this.nearestAt[zombie] > GIVE_UP_STEPS
                    ) {
                        this.doneUntil[zombie * ZOMBIE_MOST_AVATARS + slot] = steps + ZOMBIE_FORGET_STEPS;
                        target[zombie] = -1;
                    }
                }
            }
            if (this.leaving[zombie] || (zombie + steps) % RETARGET_STEPS !== 0) continue;
            // The avatar nearest to it by the way it would run: that of its cell, unless it is done with it or too many
            // run to it already; then the nearest of the others, by their own fields (asked for, made at the next
            // steps); none within reach, and it goes on its way.
            const nearestOne = owner && field && field[cell] !== FAR ? owner[cell] : -1;
            const free = (slot: number): boolean =>
                this.doneUntil[zombie * ZOMBIE_MOST_AVATARS + slot] <= steps &&
                (slot === target[zombie] || onOne[slot] < MOST_ON_ONE);
            let best = nearestOne >= 0 && free(nearestOne) ? nearestOne : -1;
            if (nearestOne >= 0 && best < 0) {
                let bestDistance = FAR;
                for (let other = 0; other < ZOMBIE_MOST_AVATARS; other++) {
                    if (other === nearestOne || this.avatarTile[other] < 0 || !free(other)) continue;
                    const own = this.own[other];
                    if (!own || this.ownTile[other] !== this.avatarTile[other]) this.wanted |= 1 << other;
                    if (own && own[cell] < bestDistance) {
                        bestDistance = own[cell];
                        best = other;
                    }
                }
            }
            if (best !== target[zombie]) {
                if (target[zombie] >= 0) onOne[target[zombie]]--;
                if (best >= 0) onOne[best]++;
                target[zombie] = best;
                this.nearest[zombie] = FAR;
                this.nearestAt[zombie] = steps;
            }
        }
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
        if (length < 1e-9) return false;
        this.atX = -gx / length;
        this.atY = -gy / length;
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
            // Down the field of the avatars while it runs to the nearest, that of its avatar alone while it runs to
            // another (made from where it stood, until made again), else out.
            const slot = this.target[zombie];
            const field =
                slot < 0
                    ? undefined
                    : this.owner?.[this.cellAt(zx, zy)] === slot
                      ? this.field
                      : (this.own[slot] ?? this.field);
            if (!field || !this.wayTo(field, zx, zy)) this.wayOut(zx, zy);
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
            this.press[zombie] = Math.min(255, near);
            const wanted = this.pace[zombie] * WEIDMANN[Math.min(WEIDMANN.length - 1, near)];
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
