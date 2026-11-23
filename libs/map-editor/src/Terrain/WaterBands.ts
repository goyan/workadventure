import { affordPass, depthsPass, fluxPass, scalePass } from "./WaterKernel";
import type { InertiaMove } from "./WaterKernel";
import { WasmWaterKernel } from "./WaterKernelWasm";

/**
 * A pass of a move of the water with inertia, shared between several threads: the rows of the grid are cut in
 * slices, and each thread claims a slice, computes it, claims the next one, until none is left. Who leads the pass
 * (the thread of the water) works like the others, then waits only for the slices the others claimed and have not
 * finished.
 *
 * The water is the same, to the bit, whoever computes which slice and in whatever order: a pass writes, for a row,
 * nothing but the cells of that row, and reads in the other rows only arrays it does not write (see WaterKernel);
 * what the rows lose is added up row after row by who leads.
 *
 * So a thread that is slow to wake, or that has no core for itself, does not hold the step back: its slices are
 * taken by the others. A thread that is gone claims nothing: the pass ends right without it. Only a thread lost in
 * the middle of a slice cannot be made up for (three of the four passes write in place): who leads waits for it a
 * while, then fails (WaterBandsLost).
 *
 * Nobody spins: who follows sleeps on the turn of the board (Atomics.wait) until a pass is opened, who leads sleeps
 * on the count of the slices done.
 */

/** The four passes of a move, in their order: the flows, what each cell affords, the flows cut down, the depths. */
export type WaterPass = 0 | 1 | 2 | 3;

/** The rows from `rowFrom` to `rowTo` (left out) of a pass. Returns whether it moved water. */
export function runWaterPass(
    pass: WaterPass,
    move: InertiaMove,
    rowFrom: number,
    rowTo: number,
    rowLost: Float64Array,
): boolean {
    // The passes of the compiled kernel of the grid, when it has one: the same figures, to the bit.
    const compiled = move.compiled;
    if (pass === 0) {
        if (compiled) compiled.fluxPass(move, rowFrom, rowTo);
        else fluxPass(move, rowFrom, rowTo);
        return false;
    }
    if (pass === 1) {
        if (compiled) compiled.affordPass(move, rowFrom, rowTo);
        else affordPass(move, rowFrom, rowTo);
        return false;
    }
    if (pass === 2) return compiled ? compiled.scalePass(move, rowFrom, rowTo) : scalePass(move, rowFrom, rowTo);
    return compiled ? compiled.depthsPass(move, rowFrom, rowTo, rowLost) : depthsPass(move, rowFrom, rowTo, rowLost);
}

/**
 * What runs the passes of the moves of a grid in its place (WaterGrid.flowWithInertia), when the grids of a thread
 * are given one: `begin` at each step, with the move and where the rows write what they lose, then `run` for each
 * pass, over all the rows.
 */
export interface WaterPassRunner {
    begin(key: object, move: InertiaMove, rowLost: Float64Array): void;
    run(pass: WaterPass): boolean;
    /** A grid is gone (its map was edited, its room closed): what was kept for it may be let go. */
    forget(key: object): void;
}

let usualRunner: WaterPassRunner | undefined;

/**
 * What runs the passes of the grids of this thread from now on, those whose arrays are in a memory threads share
 * (WaterArrays): nothing (undefined), each grid runs its own.
 */
export function setWaterPassRunner(runner: WaterPassRunner | undefined): void {
    usualRunner = runner;
}

export function waterPassRunner(): WaterPassRunner | undefined {
    return usualRunner;
}

/** What the threads of a pass share, in an Int32Array: the words of the board. */
const TURN = 0;
/** The slices claimed: the turn they belong to in its high bits, how many were claimed in its low ones. */
const CLAIM = 1;
const DONE = 2;
const PASS = 3;
const SLICES = 4;
const MOVED = 5;
/** Whether the speeds of the move have changed places since the step began (they do at each move). */
const SWAPPED = 6;
/** Which grid the pass is for: who follows knows its arrays by this number. */
const GRID = 7;
const FAILED = 8;
const WORDS = 16;

/** The most slices a pass is cut in: the low bits of a claim. */
export const MOST_SLICES = 1024;
const CLAIM_BITS = 10;
/** The turns come round after this many: a thread could only be mistaken by one late by exactly as many. */
const TURNS = 1 << 20;
/** The claim between two steps: no turn has it, nobody claims. */
const NO_CLAIM = -1;
/** The turn that tells who follows to stop. */
const STOP = -1;

/** The figures of a step, in doubles next to the board, in the order of FIGURES. */
const FIGURES = [
    "width",
    "height",
    "dt",
    "swiftest",
    "pull",
    "pulled",
    "edgeShare",
    "top",
    "roughness",
    "damping",
    "breaking",
    "carried",
    "pressed",
] as const;

/** What the threads of a pass share: made by who leads, given to who follows. */
export interface WaterBandsBoard {
    words: Int32Array;
    figures: Float64Array;
}

export function makeWaterBandsBoard(): WaterBandsBoard {
    const board = {
        words: new Int32Array(new SharedArrayBuffer(4 * WORDS)),
        figures: new Float64Array(new SharedArrayBuffer(8 * FIGURES.length)),
    };
    board.words[CLAIM] = NO_CLAIM;
    return board;
}

/** The arrays of a grid, as who follows is given them once: all in a memory the threads share. */
export type WaterBandsArrays = Pick<
    InertiaMove,
    | "depth"
    | "ground"
    | "spill"
    | "closed"
    | "hollow"
    | "rough"
    | "powers"
    | "east"
    | "south"
    | "afford"
    | "speedEast"
    | "speedSouth"
    | "nextSpeedEast"
    | "nextSpeedSouth"
    | "head"
> & {
    rowLost: Float64Array;
    /** The memory of the compiled kernel of the grid, when it has one: who follows joins it to run its passes. */
    memory?: WebAssembly.Memory;
};

/** What who follows must be told before the next pass: the arrays of a grid, or that a grid is gone (no arrays). */
export interface WaterBandsNews {
    grid: number;
    arrays: WaterBandsArrays | undefined;
}

const ARRAYS = [
    "depth",
    "ground",
    "spill",
    "closed",
    "hollow",
    "rough",
    "powers",
    "east",
    "south",
    "afford",
    "head",
] as const;

/** The slice `slice` of `slices` of the rows of a grid: where it starts. */
function sliceStart(slice: number, slices: number, height: number): number {
    return Math.round((slice * height) / slices);
}

/**
 * Claims slices of the turn `turn` and computes them until none is left, or until the turn is over. Returns how
 * many it computed.
 */
function work(
    words: Int32Array,
    turn: number,
    pass: WaterPass,
    move: InertiaMove,
    rowLost: Float64Array,
    most = MOST_SLICES,
): number {
    const slices = words[SLICES];
    const mine = turn << CLAIM_BITS;
    let computed = 0;
    for (;;) {
        const claim = Atomics.load(words, CLAIM);
        // Another turn, or none: what this thread read of the pass may be of the past.
        if (claim >> CLAIM_BITS !== turn || claim < 0) return computed;
        const slice = claim - mine;
        if (slice >= slices || computed >= most) return computed;
        if (Atomics.compareExchange(words, CLAIM, claim, claim + 1) !== claim) continue;
        // For who waits to see a slice claimed (waitForAClaim): nothing when nobody does.
        Atomics.notify(words, CLAIM);
        if (
            runWaterPass(
                pass,
                move,
                sliceStart(slice, slices, move.height),
                sliceStart(slice + 1, slices, move.height),
                rowLost,
            )
        ) {
            Atomics.or(words, MOVED, 1);
        }
        computed++;
        Atomics.add(words, DONE, 1);
        Atomics.notify(words, DONE);
    }
}

/** What the errors that lose a step of the water to its bands all say: who starts the thread again counts them. */
export const WATER_BANDS_ERROR = "of the bands of the water";

/** A thread lost in the middle of a slice: the pass cannot be finished right. */
export class WaterBandsLost extends Error {
    constructor(waitedMs: number) {
        super(`A thread of the bands of the water did not finish its slice in ${waitedMs} ms: the step is lost`);
    }
}

/**
 * The wait of who leads, over the passes of one step, beyond which the machine has no core for the bands (ms): a
 * thread that claimed a slice and lost its core is waited for at the end of the pass, and nothing can take its slice
 * in its place (it is half written). Who leads then computes alone for BAND_ALONE_MS, and tries the bands again.
 * A step waits under a millisecond in all when the threads have their cores (measured: 14 ms at most over 1 800
 * steps on a saturated machine).
 */
export const BAND_SLOW_WAIT_MS = 20;
export const BAND_ALONE_MS = 10_000;

/** How long who leads waits for a slice another thread claimed before it gives the step up (ms). */
export const BAND_PATIENCE_MS = 1000;

/**
 * Who leads the passes of the water of a thread: the thread of the water itself. It opens each pass, works at it
 * like the others, and returns once all its slices are done.
 */
export class WaterBandsLead {
    public readonly board = makeWaterBandsBoard();
    private turn = 0;
    private move: InertiaMove | undefined;
    private rowLost: Float64Array | undefined;
    /** The speeds who follows holds as those of the move before: they change places at each move. */
    private firstSpeed: Float32Array | undefined;
    /** What who follows was told of each grid: its number there, and its arrays. */
    private readonly told = new WeakMap<object, { grid: number; arrays: WaterBandsArrays }>();
    private grids = 0;
    /** The grids that are gone, to tell who follows. */
    private readonly gone: number[] = [];
    /** The slices computed here and by the others, since the beginning. */
    private readonly counts = { here: 0, others: 0 };
    /** Whether the passes of the step that runs are shared, and how long this thread has waited for the others in it. */
    private sharing = false;
    private stepWaitMs = 0;
    /** Until when this thread computes alone, the others having made it wait (on its clock). */
    private aloneUntil = -Infinity;
    private watch: ((waitedMs: number, alone: boolean) => void) | undefined;

    constructor(
        /** How many threads follow: a pass is cut in four slices for each thread, who leads being one. */
        private followers: number,
        /** Sleeps on a word of the board until it changes or the time is over (Atomics.wait where threads follow). */
        private readonly sleep: (words: Int32Array, index: number, value: number, ms: number) => void = (
            words,
            index,
            value,
            ms,
        ) => {
            Atomics.wait(words, index, value, ms);
        },
        private readonly patienceMs = BAND_PATIENCE_MS,
        /** A clock in ms, for the patience. */
        private readonly clock: () => number = () => performance.now(),
        /** Called once a pass is opened, before this thread works at it (where who follows is on this thread). */
        private readonly opened?: () => void,
    ) {}

    /**
     * Told after each step whose passes were shared: how long this thread waited in it for slices the others had
     * claimed, and whether that was too long, so that it computes alone for a while.
     */
    public watchedBy(watch: (waitedMs: number, alone: boolean) => void): void {
        this.watch = watch;
    }

    /** Whether this thread computes alone for now, the others having made it wait. */
    public alone(): boolean {
        return this.clock() < this.aloneUntil;
    }

    /** The step that ran is over: its wait is told, and decides whether the next ones are shared. */
    private closeStep(): void {
        if (!this.sharing) return;
        this.sharing = false;
        const slow = this.stepWaitMs > BAND_SLOW_WAIT_MS;
        if (slow) this.aloneUntil = this.clock() + BAND_ALONE_MS;
        this.watch?.(this.stepWaitMs, slow);
    }

    /** How many threads follow from now on (one of them was lost, or came back). */
    public followedBy(followers: number): void {
        this.followers = Math.max(0, followers);
    }

    /**
     * The claims of the pass that is open: a number that changes each time a slice is claimed, by this thread or by
     * another, and each time a pass opens or ends.
     */
    public claims(): number {
        return Atomics.load(this.board.words, CLAIM);
    }

    /**
     * Sleeps until a slice of the pass that is open is claimed, `ms` at most: called as a pass opens (`opened`), it
     * lets the threads that follow take their part whatever the machine does. For the tests. Returns whether a
     * slice was claimed: when none was, no thread follows, and who asked had better not wait again.
     */
    public waitForAClaim(ms: number): boolean {
        const { words } = this.board;
        return Atomics.wait(words, CLAIM, Atomics.load(words, CLAIM), ms) !== "timed-out";
    }

    /** A grid is gone: who follows is told to forget its arrays at the next step of any grid. */
    public forget(key: object): void {
        const known = this.told.get(key);
        if (!known) return;
        this.told.delete(key);
        this.gone.push(known.grid);
    }

    /** The slices computed by this thread and by those that follow, since the beginning. */
    public computed(): { here: number; others: number } {
        return { ...this.counts };
    }

    /**
     * A step begins on the grid `key` (any object that lasts as long as the grid): its figures are written for who
     * follows. Returns what who follows must be told before the first pass: the arrays of this grid if they are new
     * or have changed, and the grids that are gone. Nobody works before a pass.
     */
    public begin(key: object, move: InertiaMove, rowLost: Float64Array): WaterBandsNews[] {
        const { words, figures } = this.board;
        this.closeStep();
        this.stepWaitMs = 0;
        // Shared unless nobody follows, or the others made this thread wait not long ago: they sleep meanwhile.
        this.sharing = this.followers > 0 && !this.alone();
        // Nobody claims any more before the figures change: who read them for a turn of the past finds it over.
        Atomics.store(words, CLAIM, NO_CLAIM);
        for (let index = 0; index < FIGURES.length; index++) figures[index] = move[FIGURES[index]];
        const news: WaterBandsNews[] = this.gone.splice(0).map((grid) => ({ grid, arrays: undefined }));
        let known = this.told.get(key);
        const speeds = known && [
            known.arrays.speedEast,
            known.arrays.speedSouth,
            known.arrays.nextSpeedEast,
            known.arrays.nextSpeedSouth,
        ];
        const same =
            known !== undefined &&
            speeds !== undefined &&
            known.arrays.rowLost === rowLost &&
            ARRAYS.every((name) => known?.arrays[name] === move[name]) &&
            // The speeds change places at each move: the same four, in one order or the other.
            ((move.speedEast === speeds[0] && move.nextSpeedEast === speeds[2]) ||
                (move.speedEast === speeds[2] && move.nextSpeedEast === speeds[0])) &&
            ((move.speedSouth === speeds[1] && move.nextSpeedSouth === speeds[3]) ||
                (move.speedSouth === speeds[3] && move.nextSpeedSouth === speeds[1]));
        if (!known || !same) {
            // Other arrays are another grid for who follows: none of them works on those of the past.
            if (known) news.push({ grid: known.grid, arrays: undefined });
            const grid = ++this.grids;
            const arrays: WaterBandsArrays = {
                depth: move.depth,
                ground: move.ground,
                spill: move.spill,
                closed: move.closed,
                hollow: move.hollow,
                rough: move.rough,
                powers: move.powers,
                east: move.east,
                south: move.south,
                afford: move.afford,
                speedEast: move.speedEast,
                speedSouth: move.speedSouth,
                nextSpeedEast: move.nextSpeedEast,
                nextSpeedSouth: move.nextSpeedSouth,
                head: move.head,
                rowLost,
                memory: move.compiled?.threadMemory(),
            };
            if (known) {
                known.grid = grid;
                known.arrays = arrays;
            } else {
                known = { grid, arrays };
                this.told.set(key, known);
            }
            news.push({ grid, arrays });
        }
        words[GRID] = known.grid;
        this.move = move;
        this.rowLost = rowLost;
        this.firstSpeed = known.arrays.speedEast;
        return news;
    }

    /** A pass over all the rows of the grid of the step. Returns whether it moved water. */
    public run(pass: WaterPass): boolean {
        const move = this.move;
        const rowLost = this.rowLost;
        if (!move || !rowLost) throw new Error("A pass of the water was asked before its step began");
        const { words } = this.board;
        const followers = this.sharing ? this.followers : 0;
        const slices = Math.max(1, Math.min(move.height, MOST_SLICES - 1, (followers + 1) * 4));
        this.turn = (this.turn + 1) % TURNS;
        const turn = this.turn;
        // The claim first: nobody works for the pass before, and its words may change.
        Atomics.store(words, CLAIM, NO_CLAIM);
        words[PASS] = pass;
        words[SLICES] = slices;
        words[SWAPPED] = move.speedEast === this.firstSpeed ? 0 : 1;
        Atomics.store(words, MOVED, 0);
        Atomics.store(words, DONE, 0);
        Atomics.store(words, CLAIM, turn << CLAIM_BITS);
        // Who follows wakes on the turn: left as it was, they sleep, and this thread claims every slice.
        if (followers > 0) {
            Atomics.store(words, TURN, turn);
            Atomics.notify(words, TURN);
        }
        this.opened?.();
        const here = work(words, turn, pass, move, rowLost);
        this.counts.here += here;
        this.counts.others += slices - here;
        // The slices the others claimed.
        let waited: number | undefined;
        for (;;) {
            const done = Atomics.load(words, DONE);
            if (done >= slices) break;
            const now = this.clock();
            waited ??= now;
            if (now - waited >= this.patienceMs) {
                Atomics.store(words, CLAIM, NO_CLAIM);
                throw new WaterBandsLost(this.patienceMs);
            }
            this.sleep(words, DONE, done, Math.max(1, this.patienceMs - (now - waited)));
            this.stepWaitMs += this.clock() - now;
        }
        Atomics.store(words, CLAIM, NO_CLAIM);
        if (Atomics.load(words, FAILED) !== 0)
            throw new Error("A pass failed on a thread of the bands of the water: the step is lost");
        return Atomics.load(words, MOVED) !== 0;
    }

    /** Tells who follows to stop: their threads end by themselves. */
    public stop(): void {
        const { words } = this.board;
        Atomics.store(words, CLAIM, NO_CLAIM);
        Atomics.store(words, TURN, STOP);
        Atomics.notify(words, TURN);
    }
}

/**
 * Who follows the passes of the water of a thread: a thread of its own, that knows the arrays of each grid by the
 * number who leads gave it.
 */
export class WaterBandsFollower {
    private readonly grids = new Map<number, { move: InertiaMove; rowLost: Float64Array; speeds: Float32Array[] }>();
    private seen = 0;

    constructor(private readonly board: WaterBandsBoard) {}

    /** The arrays of a grid, given once by who leads; the arrays of a grid that is gone are forgotten (undefined). */
    public know(grid: number, arrays: WaterBandsArrays | undefined): void {
        if (!arrays) {
            this.grids.delete(grid);
            return;
        }
        const { rowLost, memory, ...shared } = arrays;
        // Written at once, with all its fields in the order of the move of WaterGrid: the passes read it fast.
        const move: InertiaMove = {
            width: 0,
            height: 0,
            depth: shared.depth,
            ground: shared.ground,
            spill: shared.spill,
            closed: shared.closed,
            hollow: shared.hollow,
            rough: shared.rough,
            powers: shared.powers,
            east: shared.east,
            south: shared.south,
            afford: shared.afford,
            speedEast: shared.speedEast,
            speedSouth: shared.speedSouth,
            nextSpeedEast: shared.nextSpeedEast,
            nextSpeedSouth: shared.nextSpeedSouth,
            dt: 0,
            swiftest: 0,
            pull: 0,
            pulled: 0,
            edgeShare: 0,
            top: 0,
            roughness: 0,
            damping: 0,
            breaking: 0,
            carried: 0,
            head: shared.head,
            pressed: 0,
            // The compiled kernel of the grid, on its memory: this thread has its own instance of it there.
            compiled: memory ? WasmWaterKernel.join(memory) : undefined,
        };
        this.grids.set(grid, {
            move,
            rowLost,
            speeds: [shared.speedEast, shared.speedSouth, shared.nextSpeedEast, shared.nextSpeedSouth],
        });
    }

    /**
     * Sleeps until a pass is opened (or `ms` have passed), then works at it. Returns false once told to stop.
     * `learn` is called on waking, before the pass is read: there the arrays of the new grids are taken in.
     */
    public follow(learn?: () => void, ms?: number): boolean {
        const { words } = this.board;
        Atomics.wait(words, TURN, this.seen, ms);
        return this.workOnce(learn);
    }

    /** Works at the pass that is open, if any, without sleeping. Returns false once told to stop. */
    public workOnce(learn?: () => void, most = MOST_SLICES): boolean {
        const { words, figures } = this.board;
        const turn = Atomics.load(words, TURN);
        if (turn === STOP) return false;
        if (turn === this.seen) return true;
        this.seen = turn;
        learn?.();
        // Read before the claim: if the claim is then taken for this turn, these words were those of this turn.
        const pass = words[PASS] as WaterPass;
        const swapped = words[SWAPPED] === 1;
        const known = this.grids.get(words[GRID]);
        // A grid whose arrays have not come yet: who leads does without this thread.
        if (!known) return true;
        const { move, rowLost, speeds } = known;
        for (let index = 0; index < FIGURES.length; index++) move[FIGURES[index]] = figures[index];
        move.speedEast = swapped ? speeds[2] : speeds[0];
        move.speedSouth = swapped ? speeds[3] : speeds[1];
        move.nextSpeedEast = swapped ? speeds[0] : speeds[2];
        move.nextSpeedSouth = swapped ? speeds[1] : speeds[3];
        // The pass before swapped the speeds for the three that follow it: fluxPass reads those of the move before.
        try {
            work(words, turn, pass, move, rowLost, most);
        } catch (error) {
            Atomics.store(words, FAILED, 1);
            Atomics.add(words, DONE, 1);
            Atomics.notify(words, DONE);
            throw error;
        }
        return true;
    }
}
