import { TERRAIN_CELL, TILE_PX } from "../types";
import { cellOf } from "../Terrain/TerrainGrid";
import type { WaterWallSides } from "../Terrain/WaterGrid";
import { decodeZombieTerrain, ZOMBIE_PX_PER_METRE, ZOMBIE_WATER_PACE } from "./ZombieHorde";
import type { ZombieHorde } from "./ZombieHorde";

/**
 * The crowd of a horde of zombies, stepped the same everywhere: on the thread of the ground of the server (which
 * reads where it tramples) and in every browser (which draws it). Its state depends on the horde, the walls of the map
 * and the number of the step only, never on the time a step is taken at: a browser that steps image by image and a
 * ground that steps ten at a time every two seconds reach the same zombies at the same step. For that, the step uses
 * nothing but + - * /, Math.sqrt, Math.floor, Math.min, Math.max and Math.abs (exact in every engine), an integer luck
 * (mulberry32) and typed arrays filled in the same order: no sine, no exponential, no Math.hypot, no sort.
 *
 * The model, a crowd that emerges from rules each zombie follows, not a drawing moved along a track:
 * - Where to go: a potential over the cells of the map, the time to walk out by the far side, computed once by the
 *   fast marching method (Sethian 1996, PNAS 93) over the walls (doors closed) and the water (slower the deeper:
 *   ZOMBIE_WATER_PACE). Its exits lie along a line beyond the map, square to the heading: on open ground it sends
 *   every zombie straight on, the way of the horde; around a building or a lake, by the shortest way round (the
 *   "floor field" of crowd models, Kirchner and Schadschneider 2002, Physica A 312). Each zombie walks down its slope.
 * - How fast: its own pace (the horde paces itself on the duration asked), slowed in water and by the crowd around it
 *   by the fundamental diagram of Weidmann (1993, Schriftenreihe IVT 90): v = v0 (1 - exp(-1.913 (1/rho - 1/5.4))),
 *   rho the density within a metre ahead of it (the half disc it walks into: a zombie at the mouth of a jam, with room
 *   ahead, walks on). Where the horde squeezes through a gap it packs, slows and queues.
 * - Who is around: the social force of Helbing and Molnar (1995, Physical Review E 51): each zombie relaxes to the
 *   velocity it wants in 0.5 s and is pushed away by those near it, more by those ahead than behind (anisotropy,
 *   Johansson, Helbing and Shukla 2007, Advances in Complex Systems 10). Its exponential is replaced by a polynomial
 *   of the same reach, exact everywhere. A little alignment with the neighbours keeps it moving as one (Reynolds 1987,
 *   SIGGRAPH, "Flocks, herds and schools").
 * - Bodies do not overlap: their contacts are undone once a step, pair by pair in a fixed order (position-based
 *   dynamics, as in Weiss, Litteneker, Jiang and Terzopoulos 2017, "Position-Based Real-Time Simulation of Large
 *   Crowds"); a wall is never crossed.
 * - Each sways a little from its way (a slow random walk of its own): it shambles.
 */

/** A step of the crowd: ten a second. */
export const ZOMBIE_STEP_MS = 100;
const DT = ZOMBIE_STEP_MS / 1000;

const PX = ZOMBIE_PX_PER_METRE;
/** The radius of a body (Helbing, Farkas and Vicsek 2000 take 0.25 to 0.35 m). */
export const ZOMBIE_RADIUS_PX = 0.25 * PX;
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
/** The crowd around a zombie is counted within this radius (1 m: a disc of pi m²). */
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
/** A zombie never moves more than this in a step: it cannot jump over a cell (and its walls). */
const MOST_A_STEP_PX = TERRAIN_CELL * 0.9;

/** The horde comes in as a column this dense, this many times wider than deep. */
const MARCH_DENSITY = 1.6;
const FRONT_ASPECT = 3;
const LEAST_FRONT_PX = 12 * PX;
/** It never takes more than this share of its duration to come in. */
const MOST_EMIT_SHARE = 0.5;
/**
 * Its pace: its column (the crossing and its own depth) walked in its duration, this much faster for the detours and
 * the jams.
 */
const PACE_SLACK = 1.7;
/** A pace between a shamble and a run, m/s. */
const LEAST_PACE_PX = 0.3 * PX;
const MOST_PACE_PX = 3 * PX;
/** Each zombie walks this share faster or slower than the horde. */
const PACE_SPREAD = 0.12;
/** How far its sway turns it from its way (a share of its way), and how fast that sway wanders. */
const SWAY = 0.35;
const SWAY_WANDER = 0.08;
/**
 * The horde keeps together: a zombie with few others around it (fewer than KEEP_ALONE in the tiles around it) more
 * than half its column ahead of its middle (along the potential) slows, down to this share of its pace, waiting for
 * the others; one as far behind hurries, up to this share. A choice at the scale of the horde, as the members of a
 * group walk slower to stay together (Moussaid et al. 2010, PLoS ONE 5, "The walking behaviour of pedestrian social
 * groups"): without it the free zombies at its head walk off from its packed body. Those that come out of a gap in a
 * stream are not alone: they walk on.
 */
const KEEP_ALONE = 3;
const KEEP_SLOWEST = 0.75;
const KEEP_FASTEST = 1.25;
const LEAST_KEEP_PX = 10 * PX;
/** A tile has room for one more coming in under this many zombies. */
const ROOM_A_TILE = 3;
const ENTRY_TRIES = 4;

/** What a zombie is doing. */
export const ZOMBIE_WAITING = 0;
export const ZOMBIE_WALKING = 1;
export const ZOMBIE_GONE = 2;

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

/** The crowd of a horde, from the horde and the walls of the map (landWallsOf: the doors closed). */
export class ZombieCrowd {
    public readonly count: number;
    public readonly width: number;
    public readonly height: number;
    /** The water of each cell, as the horde read it when it began. */
    public readonly terrain: Uint8Array;
    /** Where each zombie is (map pixels), where it was a step before, its velocity (px/s) and what it is doing. */
    public readonly x: Float64Array;
    public readonly y: Float64Array;
    public readonly lastX: Float64Array;
    public readonly lastY: Float64Array;
    public readonly vx: Float64Array;
    public readonly vy: Float64Array;
    public readonly state: Uint8Array;
    /** The steps taken: the crowd is the horde at `startedAt + steps * ZOMBIE_STEP_MS`. */
    public steps = 0;
    /** At this step the horde is over: whoever is still on the map is gone. */
    public readonly lastStep: number;
    /** How many walk now. */
    public walking = 0;

    private readonly widthPx: number;
    private readonly heightPx: number;
    /** 1: the east side of a cell is closed; 2: its south side. */
    private readonly closed: Uint8Array;
    /** The time to walk out from each cell (fast marching), and the way down it. Infinity where none walks out. */
    public readonly potential: Float64Array;
    private readonly wayX: Float32Array;
    private readonly wayY: Float32Array;
    /** The cells of the edges a zombie walks out by: 1. */
    private readonly exits: Uint8Array;
    /** The cells the horde comes in by, in the order of the edge. */
    private readonly entries: Int32Array;
    private readonly pace: Float64Array;
    private readonly sway: Float64Array;
    private readonly nextVx: Float64Array;
    private readonly nextVy: Float64Array;
    /** At which step each zombie comes in, and the next to come. */
    private readonly emitSteps: number;
    private nextIn = 0;
    private readonly random: () => number;
    /** The zombies by tile of the map (32 px), filled at each step: the first of each tile, then the list. */
    private readonly tilesWide: number;
    private readonly tilesHigh: number;
    private readonly tileStart: Int32Array;
    private readonly tileList: Int32Array;
    private readonly tileOf: Int32Array;
    /** How many zombies went over each tile (in tiles walked) since it was last taken (takeTrample). */
    private readonly trampled: Float32Array;
    private trampledAny = false;
    /** Half the depth of its column (cells of potential), and the potential of its middle at this step. */
    private readonly keepCells: number;
    private middle = 0;

    constructor(
        public readonly horde: ZombieHorde,
        walls: WaterWallSides | undefined,
        terrain?: Uint8Array,
    ) {
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
        this.pace = new Float64Array(count);
        this.sway = new Float64Array(count);
        this.tileOf = new Int32Array(count);
        this.tileList = new Int32Array(count);
        this.tilesWide = Math.ceil(this.widthPx / TILE_PX);
        this.tilesHigh = Math.ceil(this.heightPx / TILE_PX);
        this.tileStart = new Int32Array(this.tilesWide * this.tilesHigh + 1);
        this.trampled = new Float32Array(this.tilesWide * this.tilesHigh);
        this.lastStep = Math.ceil(horde.durationMs / ZOMBIE_STEP_MS);
        this.random = mulberry32(horde.seed);

        this.closed = new Uint8Array(width * height);
        for (const [sides, bit] of [
            [walls?.east, 1],
            [walls?.south, 2],
        ] as const) {
            for (const key of sides ?? []) {
                const { x, y } = cellOf(key);
                if (x >= 0 && y >= 0 && x < width && y < height) this.closed[y * width + x] |= bit;
            }
        }
        this.exits = new Uint8Array(width * height);
        this.potential = new Float64Array(width * height);
        this.wayX = new Float32Array(width * height);
        this.wayY = new Float32Array(width * height);
        this.march();
        // Its front, as wide as its numbers make it, as wide as the edge it comes in by at most; its depth, so that
        // it comes in as dense as it marches.
        const frontPx = Math.max(LEAST_FRONT_PX, Math.sqrt((count * FRONT_ASPECT) / MARCH_DENSITY) * PX);
        this.entries = this.entryCells(frontPx);
        const frontMetres = Math.min(frontPx, Math.max(1, this.entries.length) * TERRAIN_CELL) / PX;
        const depthPx = (count / (frontMetres * MARCH_DENSITY)) * PX;
        // The pace of the horde: its column through the middle of the map, in its duration.
        const seconds = horde.durationMs / 1000;
        const pace = Math.min(
            MOST_PACE_PX,
            Math.max(
                LEAST_PACE_PX,
                seconds > 0 ? ((this.crossingPx() + depthPx) / seconds) * PACE_SLACK : LEAST_PACE_PX,
            ),
        );
        this.keepCells = Math.max(LEAST_KEEP_PX, depthPx / 2) / TERRAIN_CELL;
        // It comes in at that pace, its depth after its head.
        this.emitSteps = Math.max(
            1,
            Math.min(Math.floor(this.lastStep * MOST_EMIT_SHARE), Math.ceil(depthPx / pace / (ZOMBIE_STEP_MS / 1000))),
        );
        for (let zombie = 0; zombie < count; zombie++) {
            this.pace[zombie] = pace * (1 - PACE_SPREAD + 2 * PACE_SPREAD * this.random());
            this.sway[zombie] = (this.random() * 2 - 1) * SWAY;
        }
    }

    /** The pace of the horde on dry land, m/s, as its zombies walk it on average. */
    public paceMetres(): number {
        let sum = 0;
        for (let zombie = 0; zombie < this.count; zombie++) sum += this.pace[zombie];
        return this.count > 0 ? sum / this.count / PX : 0;
    }

    /** The water of the cell at a point (map pixels): ZOMBIE_DRY outside the map. */
    public waterAt(x: number, y: number): number {
        const cellX = Math.floor(x / TERRAIN_CELL);
        const cellY = Math.floor(y / TERRAIN_CELL);
        if (cellX < 0 || cellY < 0 || cellX >= this.width || cellY >= this.height) return 0;
        return this.terrain[cellY * this.width + cellX];
    }

    /** Whether the horde is over at this step: nobody walks any more, nobody will come. */
    public over(): boolean {
        return this.steps >= this.lastStep || (this.nextIn >= this.count && this.walking === 0 && this.steps > 0);
    }

    /**
     * Steps the crowd to the time `epoch` (ms, the time of the server): up to the step that holds it, `most` steps at
     * most (a browser spreads a long catch-up over its images). True once it is there.
     */
    public advanceTo(epoch: number, most = Number.POSITIVE_INFINITY): boolean {
        const target = this.stepFor(epoch);
        let taken = 0;
        while (this.steps < target && taken < most) {
            this.step();
            taken++;
        }
        return this.steps >= target;
    }

    /** The step whose state holds the time `epoch`: the one at or just after it. */
    public stepFor(epoch: number): number {
        if (!Number.isFinite(epoch)) return this.steps;
        const since = (epoch - this.horde.startedAt) / ZOMBIE_STEP_MS;
        return Math.min(this.lastStep, Math.max(0, Math.floor(since) + 1));
    }

    /** How far the time `epoch` is between the last step and the one before (0 to 1), to draw between them. */
    public between(epoch: number): number {
        const since = (epoch - this.horde.startedAt) / ZOMBIE_STEP_MS - (this.steps - 1);
        return Math.min(1, Math.max(0, since));
    }

    /**
     * The tiles the horde went over since this was last asked, each with how many zombies crossed it (tiles walked
     * there), and none left. Nothing when it went nowhere.
     */
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

    /** The tiles of the map across (32 px), as takeTrample numbers them. */
    public get tilesAcross(): number {
        return this.tilesWide;
    }

    /** A number for the whole state (positions, velocities, what each does, the step): two equal crowds, one number. */
    public checksum(): number {
        let hash = 0x811c9dc5;
        const mix = (array: Float64Array | Uint8Array): void => {
            const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
            for (let at = 0; at < bytes.length; at++) hash = Math.imul(hash ^ bytes[at], 0x01000193) >>> 0;
        };
        mix(this.x);
        mix(this.y);
        mix(this.vx);
        mix(this.vy);
        mix(this.state);
        hash = Math.imul(hash ^ this.steps, 0x01000193) >>> 0;
        return hash >>> 0;
    }

    /** One step of the crowd: ZOMBIE_STEP_MS later. */
    public step(): void {
        if (this.steps >= this.lastStep) return;
        this.steps++;
        const { count, state } = this;
        if (this.steps >= this.lastStep) {
            // The horde is over: whoever is still on the map is gone.
            for (let zombie = 0; zombie < count; zombie++) {
                this.lastX[zombie] = this.x[zombie];
                this.lastY[zombie] = this.y[zombie];
                state[zombie] = ZOMBIE_GONE;
            }
            this.nextIn = count;
            this.walking = 0;
            return;
        }
        this.fillTiles();
        this.findMiddle();
        this.comeIn();
        this.steer();
        this.move();
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
        // tileStart[tile] is now where the tile begins in tileList; it is moved along as the tile is filled, then put
        // back by one tile.
        for (let zombie = 0; zombie < count; zombie++) {
            const tile = tileOf[zombie];
            if (tile < 0) continue;
            tileList[tileStart[tile]++] = zombie;
        }
        for (let tile = tilesWide * tilesHigh; tile > 0; tile--) tileStart[tile] = tileStart[tile - 1];
        tileStart[0] = 0;
    }

    /** The potential of the middle of the horde: the mean of those walking, where they walk out from. */
    private findMiddle(): void {
        let sum = 0;
        let counted = 0;
        for (let zombie = 0; zombie < this.count; zombie++) {
            if (this.state[zombie] !== ZOMBIE_WALKING) continue;
            const here = this.potential[this.cellAt(this.x[zombie], this.y[zombie])];
            if (here === Number.POSITIVE_INFINITY) continue;
            sum += here;
            counted++;
        }
        this.middle = counted > 0 ? sum / counted : 0;
    }

    private cellAt(px: number, py: number): number {
        const cellX = Math.min(this.width - 1, Math.max(0, Math.floor(px / TERRAIN_CELL)));
        const cellY = Math.min(this.height - 1, Math.max(0, Math.floor(py / TERRAIN_CELL)));
        return cellY * this.width + cellX;
    }

    /** How a zombie paces itself to keep with the horde: slower ahead of its body, faster behind it. */
    private keepShare(px: number, py: number, alone: boolean): number {
        const here = this.potential[this.cellAt(px, py)];
        if (here === Number.POSITIVE_INFINITY) return 1;
        const ahead = (this.middle - here) / this.keepCells;
        if (ahead > 1 && alone) return Math.max(KEEP_SLOWEST, 1 - (1 - KEEP_SLOWEST) * (ahead - 1));
        if (ahead < -1) return Math.min(KEEP_FASTEST, 1 + (KEEP_FASTEST - 1) * (-ahead - 1));
        return 1;
    }

    /** How many zombies were in a tile at the start of the step. */
    private crowdOfTile(tile: number): number {
        return this.tileStart[tile + 1] - this.tileStart[tile];
    }

    /** The zombies whose time came walk in at the edge, where there is room: the others wait behind, in order. */
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

    /** The way wayAt found last. */
    private atX = 0;
    private atY = 0;

    /** The way down the potential at a point (atX, atY), between the four cells around it; the heading where there is none. */
    private wayAt(px: number, py: number): void {
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
            this.wayAt(zx, zy);
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
            for (let row = Math.max(0, tileY - 1); row <= Math.min(tilesHigh - 1, tileY + 1); row++) {
                for (let column = Math.max(0, tileX - 1); column <= Math.min(tilesWide - 1, tileX + 1); column++) {
                    const tile = row * tilesWide + column;
                    for (let at = tileStart[tile]; at < tileStart[tile + 1]; at++) {
                        const other = tileList[at];
                        if (other === zombie) continue;
                        const dx = x[other] - zx;
                        const dy = y[other] - zy;
                        const d2 = dx * dx + dy * dy;
                        if (d2 >= reach2 || d2 < 1e-9) continue;
                        const d = Math.sqrt(d2);
                        const nx = dx / d;
                        const ny = dy / d;
                        // Those in the half disc ahead of it, counted twice: the density of the disc it walks into.
                        if (d2 < density2 && wayX * nx + wayY * ny > 0) near += 2;
                        const gap = d - 2 * ZOMBIE_RADIUS_PX;
                        const share = gap <= 0 ? 1 : 1 - gap / SOCIAL_RANGE_PX;
                        // More from those it walks into than from those behind it.
                        const facing = ANISOTROPY + (1 - ANISOTROPY) * 0.5 * (1 + wayX * nx + wayY * ny);
                        const push = share * share * facing;
                        pushX -= push * nx;
                        pushY -= push * ny;
                        alongX += vx[other];
                        alongY += vy[other];
                        along++;
                    }
                }
            }
            // The water and the crowd ahead each hold it back; the stronger of the two does.
            const wanted =
                this.pace[zombie] *
                this.keepShare(zx, zy, along < KEEP_ALONE) *
                Math.min(ZOMBIE_WATER_PACE[this.terrainAt(zx, zy)], WEIDMANN[Math.min(WEIDMANN.length - 1, near)]);
            let ax = (wanted * wayX - vx[zombie]) / RELAX_SECONDS + SOCIAL_ACCEL * pushX;
            let ay = (wanted * wayY - vy[zombie]) / RELAX_SECONDS + SOCIAL_ACCEL * pushY;
            if (along > 0) {
                ax += ALIGNMENT * (alongX / along - vx[zombie]);
                ay += ALIGNMENT * (alongY / along - vy[zombie]);
            }
            let nvx = vx[zombie] + ax * DT;
            let nvy = vy[zombie] + ay * DT;
            // Never faster than a little over its own pace.
            const most = this.pace[zombie] * KEEP_FASTEST;
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

    private terrainAt(px: number, py: number): number {
        const cellX = Math.min(this.width - 1, Math.max(0, Math.floor(px / TERRAIN_CELL)));
        const cellY = Math.min(this.height - 1, Math.max(0, Math.floor(py / TERRAIN_CELL)));
        return this.terrain[cellY * this.width + cellX];
    }

    /** Each zombie moves, the contacts are undone, the walls hold, and those who walked out by the far side are gone. */
    private move(): void {
        const { count, state, x, y, lastX, lastY, vx, vy, nextVx, nextVy, tileStart, tileList, tilesWide, tilesHigh } =
            this;
        for (let zombie = 0; zombie < count; zombie++) {
            if (state[zombie] !== ZOMBIE_WALKING) continue;
            lastX[zombie] = x[zombie];
            lastY[zombie] = y[zombie];
            // Those just come in keep the velocity they came with (they were not steered).
            if (this.tileOf[zombie] >= 0) {
                vx[zombie] = nextVx[zombie];
                vy[zombie] = nextVy[zombie];
            }
            x[zombie] += vx[zombie] * DT;
            y[zombie] += vy[zombie] * DT;
        }
        // The contacts, pair by pair, in the order of the numbers.
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
                            // On top of each other: apart along the numbers, the same everywhere.
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
        // Then each against the walls and the edges, and what it trampled.
        for (let zombie = 0; zombie < count; zombie++) {
            if (state[zombie] !== ZOMBIE_WALKING) continue;
            const fromX = lastX[zombie];
            const fromY = lastY[zombie];
            let toX = fromX + Math.min(MOST_A_STEP_PX, Math.max(-MOST_A_STEP_PX, x[zombie] - fromX));
            let toY = fromY + Math.min(MOST_A_STEP_PX, Math.max(-MOST_A_STEP_PX, y[zombie] - fromY));
            const cellX = Math.floor(fromX / TERRAIN_CELL);
            const cellY = Math.floor(fromY / TERRAIN_CELL);
            // Across first, then down: a wall stops the part of the move that crosses it.
            const nextX = Math.floor(toX / TERRAIN_CELL);
            if (nextX !== cellX) {
                if (nextX < 0 || nextX >= this.width) {
                    if (this.exits[cellY * this.width + cellX] && this.outwards(nextX < 0 ? -1 : 1, 0)) {
                        this.leave(zombie);
                        continue;
                    }
                    toX = Math.min(this.widthPx - 0.5, Math.max(0.5, toX));
                } else if (this.closedBetween(cellX, cellY, nextX, cellY)) toX = fromX;
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
                } else if (this.closedBetween(columnNow, cellY, columnNow, nextY)) toY = fromY;
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
        this.walking--;
    }

    /** Whether going (dx, dy) out of the map goes the way of the horde (by an edge it walks out by). */
    private outwards(dx: number, dy: number): boolean {
        return dx * this.horde.dirX + dy * this.horde.dirY > 0.05;
    }

    /** Whether a wall closes the side between two cells next to each other. */
    private closedBetween(fromX: number, fromY: number, toX: number, toY: number): boolean {
        const { closed, width } = this;
        if (toX === fromX + 1 && toY === fromY) return (closed[fromY * width + fromX] & 1) !== 0;
        if (toX === fromX - 1 && toY === fromY) return (closed[fromY * width + toX] & 1) !== 0;
        if (toY === fromY + 1 && toX === fromX) return (closed[fromY * width + fromX] & 2) !== 0;
        if (toY === fromY - 1 && toX === fromX) return (closed[toY * width + fromX] & 2) !== 0;
        return true;
    }

    /** How far the map is crossed along the heading through the middle of the horde, pixels. */
    private crossingPx(): number {
        const { dirX, dirY } = this.horde;
        const inside =
            this.horde.anchorX >= 0 &&
            this.horde.anchorY >= 0 &&
            this.horde.anchorX <= this.widthPx &&
            this.horde.anchorY <= this.heightPx;
        const ax = inside ? this.horde.anchorX : this.widthPx / 2;
        const ay = inside ? this.horde.anchorY : this.heightPx / 2;
        const reach = (sign: number): number => {
            let best = Number.POSITIVE_INFINITY;
            const ex = sign * dirX;
            const ey = sign * dirY;
            if (ex > 1e-9) best = Math.min(best, (this.widthPx - ax) / ex);
            if (ex < -1e-9) best = Math.min(best, -ax / ex);
            if (ey > 1e-9) best = Math.min(best, (this.heightPx - ay) / ey);
            if (ey < -1e-9) best = Math.min(best, -ay / ey);
            return Number.isFinite(best) ? best : 0;
        };
        return reach(1) + reach(-1);
    }

    /**
     * The potential: the time (in cells walked on dry land) to walk out by the far side from each cell, by fast
     * marching. Its exits are the cells of the edges the heading goes out by, each worth its distance to a line
     * square to the heading: on open ground the potential is that distance, its slope the heading.
     */
    private march(): void {
        const { width, height, closed, potential, exits, terrain } = this;
        const { dirX, dirY } = this.horde;
        const size = width * height;
        potential.fill(Number.POSITIVE_INFINITY);
        const done = new Uint8Array(size);
        // A binary heap of cells by potential.
        const heap = new Int32Array(size * 4 + 4);
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
        // The exits.
        const exitBy = (cellX: number, cellY: number): boolean =>
            (cellX === 0 && -dirX > 0.05) ||
            (cellX === width - 1 && dirX > 0.05) ||
            (cellY === 0 && -dirY > 0.05) ||
            (cellY === height - 1 && dirY > 0.05);
        for (let cellY = 0; cellY < height; cellY++) {
            for (let cellX = 0; cellX < width; cellX++) {
                if (cellX !== 0 && cellY !== 0 && cellX !== width - 1 && cellY !== height - 1) continue;
                if (!exitBy(cellX, cellY)) continue;
                const cell = cellY * width + cellX;
                exits[cell] = 1;
                // Its distance to a line beyond the map, square to the heading, through no water: a cell of water
                // at the edge is slower to walk out of.
                const along = (cellX + 0.5) * dirX + (cellY + 0.5) * dirY;
                push(cell, -along + 1 / ZOMBIE_WATER_PACE[terrain[cell]]);
            }
        }
        // The time at a cell from its neighbours already known, through the sides that are open.
        const solve = (cell: number): number => {
            const cellX = cell % width;
            const cellY = (cell - cellX) / width;
            let a = Number.POSITIVE_INFINITY;
            let b = Number.POSITIVE_INFINITY;
            if (cellX > 0 && done[cell - 1] && (closed[cell - 1] & 1) === 0) a = potential[cell - 1];
            if (cellX < width - 1 && done[cell + 1] && (closed[cell] & 1) === 0) a = Math.min(a, potential[cell + 1]);
            if (cellY > 0 && done[cell - width] && (closed[cell - width] & 2) === 0) b = potential[cell - width];
            if (cellY < height - 1 && done[cell + width] && (closed[cell] & 2) === 0)
                b = Math.min(b, potential[cell + width]);
            const h = 1 / ZOMBIE_WATER_PACE[terrain[cell]];
            if (a === Number.POSITIVE_INFINITY && b === Number.POSITIVE_INFINITY) return a;
            if (a === Number.POSITIVE_INFINITY) return b + h;
            if (b === Number.POSITIVE_INFINITY) return a + h;
            const gap = a - b;
            if (gap >= h || gap <= -h) return Math.min(a, b) + h;
            return (a + b + Math.sqrt(2 * h * h - gap * gap)) / 2;
        };
        while (heapSize > 0) {
            const cell = pop();
            if (done[cell]) continue;
            done[cell] = 1;
            const cellX = cell % width;
            const cellY = (cell - cellX) / width;
            if (cellX > 0 && !done[cell - 1] && (closed[cell - 1] & 1) === 0) push(cell - 1, solve(cell - 1));
            if (cellX < width - 1 && !done[cell + 1] && (closed[cell] & 1) === 0) push(cell + 1, solve(cell + 1));
            if (cellY > 0 && !done[cell - width] && (closed[cell - width] & 2) === 0)
                push(cell - width, solve(cell - width));
            if (cellY < height - 1 && !done[cell + width] && (closed[cell] & 2) === 0)
                push(cell + width, solve(cell + width));
        }
        // The way down the potential at each cell: its slope across the open sides, towards the lower.
        for (let cellY = 0; cellY < height; cellY++) {
            for (let cellX = 0; cellX < width; cellX++) {
                const cell = cellY * width + cellX;
                const here = potential[cell];
                if (here === Number.POSITIVE_INFINITY) continue;
                const side = (other: number, open: boolean): number =>
                    open && potential[other] !== Number.POSITIVE_INFINITY ? potential[other] : here;
                const west = cellX > 0 ? side(cell - 1, (closed[cell - 1] & 1) === 0) : here;
                const east = cellX < width - 1 ? side(cell + 1, (closed[cell] & 1) === 0) : here;
                const north = cellY > 0 ? side(cell - width, (closed[cell - width] & 2) === 0) : here;
                const south = cellY < height - 1 ? side(cell + width, (closed[cell] & 2) === 0) : here;
                // Upwind: towards the lower side on each axis.
                const gx = Math.min(0, east - here) - Math.min(0, west - here);
                const gy = Math.min(0, south - here) - Math.min(0, north - here);
                const length = Math.sqrt(gx * gx + gy * gy);
                if (exits[cell]) {
                    // At the edge it walks out by, straight on, out.
                    this.wayX[cell] = dirX;
                    this.wayY[cell] = dirY;
                } else if (length > 1e-9) {
                    this.wayX[cell] = -gx / length;
                    this.wayY[cell] = -gy / length;
                }
            }
        }
    }

    /** The cells the horde comes in by: on the edges it comes from, across its front, where it can walk out. */
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
        for (let cellY = 0; cellY < height; cellY++) {
            for (let cellX = 0; cellX < width; cellX++) {
                if (cellX !== 0 && cellY !== 0 && cellX !== width - 1 && cellY !== height - 1) continue;
                const cell = cellY * width + cellX;
                if (!entryBy(cellX, cellY) || potential[cell] === Number.POSITIVE_INFINITY) continue;
                edge.push(cell);
                // Across the front: how far from the middle of the horde, square to its way.
                const across = ((cellX + 0.5) * TERRAIN_CELL - ax) * -dirY + ((cellY + 0.5) * TERRAIN_CELL - ay) * dirX;
                if (Math.abs(across) <= frontPx / 2) front.push(cell);
            }
        }
        return Int32Array.from(front.length > 0 ? front : edge);
    }
}
