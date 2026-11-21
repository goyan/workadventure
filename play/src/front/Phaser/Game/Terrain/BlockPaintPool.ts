import type { PaintRequest, PaintResponse } from "./BlockPaintWorker";
import type { BlockJob } from "./Pixel/BlockPainter";

/** What the pool needs of a worker (a Worker, or a fake one in the tests). */
export interface WorkerLike {
    postMessage(message: PaintRequest, transfer: ArrayBuffer[]): void;
    onmessage: ((event: { data: PaintResponse }) => void) | null;
    onerror: ((event: unknown) => void) | null;
    onmessageerror: ((event: unknown) => void) | null;
    terminate(): void;
}

/** What the terrain needs of the workers that paint its blocks (BlockPaintPool, or fake ones in the tests). */
export interface BlockPainters {
    usable(): boolean;
    /** How much work it still takes (see WORK_AN_IMAGE): more than 0, it takes a block. */
    room(): number;
    post(job: BlockJob, done: (pixels: Uint8ClampedArray | undefined) => void): void;
    release(pixels: Uint8ClampedArray): void;
    check(now: number): void;
}

/**
 * The work a worker is given ahead, counted in coarse blocks (a point every 4 px): 4 sharp blocks or 64 coarse ones,
 * about two images of it. The blocks go straight to the worker, which paints them in turn on its own: the thread of
 * the game hands blocks over, and reads the answers, only between two of its images.
 */
export const WORK_AN_IMAGE = 64;

/** The work of a block, in coarse blocks: by the points it is made of. */
function workOf(job: BlockJob): number {
    return 16 / (job.texel * job.texel);
}

/** A worker that has not answered a block for this long is taken as broken down. */
export const PAINT_TIMEOUT_MS = 5000;

/** A block given to a worker: what it weighs in its work, and who waits for its pixels. */
interface Given {
    id: number;
    work: number;
    done: (pixels: Uint8ClampedArray | undefined) => void;
}

interface Slot {
    worker: WorkerLike;
    /** The blocks it was given and has not answered yet, in turn. */
    given: Given[];
    /** The work of those blocks. */
    load: number;
    /** When the pool was first asked to check on it since its last answer; undefined while it has nothing to paint. */
    waitingSince: number | undefined;
}

/**
 * The workers that paint the blocks of the terrain off the thread of the game. Each is given its blocks ahead (about
 * two images of work) and paints them in turn. Started at the first block. One error, one unreadable message or one
 * worker silent for PAINT_TIMEOUT_MS, and the pool breaks down for good: its workers are stopped, the blocks not
 * answered are given back unpainted (`done(undefined)`), and the game paints its blocks itself.
 */
export class BlockPaintPool implements BlockPainters {
    private readonly slots: Slot[] = [];
    private started = false;
    private broken = false;
    /** Buffers of pixels handed back by the game: each goes with a next job, to be painted into. */
    private readonly spare: ArrayBuffer[] = [];

    constructor(
        private readonly spawn: () => WorkerLike,
        private readonly workers: number,
    ) {}

    /** Whether blocks can be given to it: not once it broke down, nor destroyed. */
    public usable(): boolean {
        return !this.broken;
    }

    /** How much work it still takes ahead (WORK_AN_IMAGE a worker): more than 0, a block can be given to it. */
    public room(): number {
        if (this.broken) return 0;
        let load = 0;
        for (const slot of this.slots) load += slot.load;
        return Math.max(0, this.workers * WORK_AN_IMAGE - load);
    }

    /**
     * Gives a block to the worker with the least work. `done` is called with its pixels, or with undefined if the pool
     * breaks down meanwhile. The arrays of the job are handed over: they are no longer the game's.
     */
    public post(job: BlockJob, done: (pixels: Uint8ClampedArray | undefined) => void): void {
        if (!this.started && !this.broken) this.start();
        if (this.broken) {
            done(undefined);
            return;
        }
        let slot = this.slots[0];
        for (const each of this.slots) if (each.load < slot.load) slot = each;
        const given = { id: job.id, work: workOf(job), done };
        slot.given.push(given);
        slot.load += given.work;
        const recycle = this.spare.pop();
        const transfer = [job.heights.buffer, job.covers.buffer, job.waters?.buffer, job.dense?.buffer, recycle].filter(
            (buffer): buffer is ArrayBuffer => buffer !== undefined,
        );
        try {
            slot.worker.postMessage({ job, recycle }, transfer);
        } catch (error) {
            this.fail(error);
        }
    }

    /** A buffer of pixels the game is done with: painted into by a next block, instead of a new one. */
    public release(pixels: Uint8ClampedArray): void {
        if (this.broken || this.spare.length >= this.workers * 4) return;
        this.spare.push(pixels.buffer as ArrayBuffer);
    }

    /** To call at every image, with the time: a worker silent for too long breaks the pool down. */
    public check(now: number): void {
        for (const slot of this.slots) {
            if (slot.given.length === 0) continue;
            if (slot.waitingSince === undefined) slot.waitingSince = now;
            else if (now - slot.waitingSince > PAINT_TIMEOUT_MS) {
                this.fail(new Error(`no answer for ${PAINT_TIMEOUT_MS} ms`));
                return;
            }
        }
    }

    /** Stops the workers; no one is called any more. */
    public destroy(): void {
        this.broken = true;
        this.stop();
    }

    private start(): void {
        this.started = true;
        try {
            for (let index = 0; index < this.workers; index++) {
                const slot: Slot = { worker: this.spawn(), given: [], load: 0, waitingSince: undefined };
                slot.worker.onmessage = (event) => this.answered(slot, event.data);
                slot.worker.onerror = (event) => this.fail(event);
                slot.worker.onmessageerror = (event) => this.fail(event);
                this.slots.push(slot);
            }
        } catch (error) {
            this.fail(error);
        }
    }

    private answered(slot: Slot, response: PaintResponse): void {
        if (this.broken) return;
        if ("error" in response) {
            this.fail(new Error(response.error));
            return;
        }
        const index = slot.given.findIndex((each) => each.id === response.id);
        // Not a block it was given: nothing waits for it.
        if (index < 0) return;
        const [given] = slot.given.splice(index, 1);
        slot.load -= given.work;
        // It answers: the wait for its next block starts again.
        slot.waitingSince = undefined;
        given.done(new Uint8ClampedArray(response.pixels, 0, response.size * response.size * 4));
    }

    /** Breaks down for good: the blocks not answered go back to the game, unpainted. */
    private fail(reason: unknown): void {
        if (this.broken) return;
        this.broken = true;
        console.warn("The workers that paint the terrain broke down: it is painted on the thread of the game.", reason);
        const given = this.slots.flatMap((slot) => slot.given);
        this.stop();
        for (const each of given) each.done(undefined);
    }

    private stop(): void {
        for (const slot of this.slots) {
            slot.given = [];
            slot.load = 0;
            slot.worker.onmessage = null;
            slot.worker.onerror = null;
            slot.worker.onmessageerror = null;
            slot.worker.terminate();
        }
        this.spare.length = 0;
    }
}
