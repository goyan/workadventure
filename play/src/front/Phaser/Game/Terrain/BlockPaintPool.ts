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

/** A worker that has not answered a block for this long is taken as broken down. */
export const PAINT_TIMEOUT_MS = 5000;

interface Slot {
    worker: WorkerLike;
    /** The block it paints; `since`: when the pool was first asked to check on it. */
    flying?: { id: number; done: (pixels: Uint8ClampedArray | undefined) => void; since?: number };
}

/**
 * The workers that paint the blocks of the terrain off the thread of the game: a block each at a time. Started at the
 * first block. One error, one unreadable message or one worker silent for PAINT_TIMEOUT_MS, and the pool breaks down
 * for good: its workers are stopped, the blocks in flight are given back unpainted (`done(undefined)`), and the game
 * paints its blocks itself.
 */
export class BlockPaintPool {
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

    /** How many of its workers wait for a block. */
    public idle(): number {
        if (this.broken) return 0;
        if (!this.started) return this.workers;
        return this.slots.filter((slot) => !slot.flying).length;
    }

    /**
     * Gives a block to an idle worker (there must be one: see `idle`). `done` is called with its pixels, or with
     * undefined if the pool breaks down meanwhile. The arrays of the job are handed over: they are no longer the game's.
     */
    public post(job: BlockJob, done: (pixels: Uint8ClampedArray | undefined) => void): void {
        if (!this.started && !this.broken) this.start();
        if (this.broken) {
            done(undefined);
            return;
        }
        const slot = this.slots.find((each) => !each.flying);
        if (!slot) throw new Error("No worker is idle: a block is posted only when one is.");
        slot.flying = { id: job.id, done };
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
        if (this.broken || this.spare.length >= this.workers * 2) return;
        this.spare.push(pixels.buffer as ArrayBuffer);
    }

    /** To call at every image, with the time: a worker silent for too long breaks the pool down. */
    public check(now: number): void {
        for (const slot of this.slots) {
            const flying = slot.flying;
            if (!flying) continue;
            if (flying.since === undefined) flying.since = now;
            else if (now - flying.since > PAINT_TIMEOUT_MS) {
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
                const slot: Slot = { worker: this.spawn() };
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
        const flying = slot.flying;
        // Not the block it was given last: nothing waits for it.
        if (!flying || flying.id !== response.id) return;
        slot.flying = undefined;
        flying.done(new Uint8ClampedArray(response.pixels, 0, response.size * response.size * 4));
    }

    /** Breaks down for good: the blocks in flight go back to the game, unpainted. */
    private fail(reason: unknown): void {
        if (this.broken) return;
        this.broken = true;
        console.warn("The workers that paint the terrain broke down: it is painted on the thread of the game.", reason);
        const flying = this.slots.flatMap((slot) => (slot.flying ? [slot.flying] : []));
        this.stop();
        for (const each of flying) each.done(undefined);
    }

    private stop(): void {
        for (const slot of this.slots) {
            slot.flying = undefined;
            slot.worker.onmessage = null;
            slot.worker.onerror = null;
            slot.worker.onmessageerror = null;
            slot.worker.terminate();
        }
        this.spare.length = 0;
    }
}
