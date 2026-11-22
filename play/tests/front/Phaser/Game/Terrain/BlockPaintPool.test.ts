import { afterEach, describe, expect, it, vi } from "vitest";
import {
    BlockPaintPool,
    PAINT_TIMEOUT_MS,
    WORK_AN_IMAGE,
} from "../../../../../src/front/Phaser/Game/Terrain/BlockPaintPool";
import type { WorkerLike } from "../../../../../src/front/Phaser/Game/Terrain/BlockPaintPool";
import type { PaintRequest, PaintResponse } from "../../../../../src/front/Phaser/Game/Terrain/BlockPaintWorker";
import type { BlockJob } from "../../../../../src/front/Phaser/Game/Terrain/Pixel/BlockPainter";

/** A worker answered by hand. */
class FakeWorker implements WorkerLike {
    public onmessage: ((event: { data: PaintResponse }) => void) | null = null;
    public onerror: ((event: unknown) => void) | null = null;
    public onmessageerror: ((event: unknown) => void) | null = null;
    public readonly posted: { message: PaintRequest; transfer: ArrayBuffer[] }[] = [];
    public terminated = false;
    public postMessage(message: PaintRequest, transfer: ArrayBuffer[]): void {
        this.posted.push({ message, transfer });
    }
    public terminate(): void {
        this.terminated = true;
    }
    private answered = 0;
    /** Answers its oldest job not answered yet (a worker paints them in turn) with `size` × `size` pixels of `fill`. */
    public answer(size = 2, fill = 9): void {
        const job = this.posted[this.answered++].message.job;
        const pixels = new ArrayBuffer(size * size * 4);
        new Uint8Array(pixels).fill(fill);
        this.onmessage?.({ data: { id: job.id, pixels, size } });
    }
}

function job(id: number, texel: 1 | 2 | 4 = 4): BlockJob {
    return {
        id,
        blockX: 0,
        blockY: 0,
        texel,
        projected: true,
        seeThrough: false,
        withLayout: true,
        season: undefined,
        heights: new Float32Array(4),
        waters: new Uint8Array(4),
        covers: new Uint8Array(4),
        dense: undefined,
    };
}

function pool(count = 2) {
    const workers: FakeWorker[] = [];
    const painters = new BlockPaintPool(() => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
    }, count);
    return { painters, workers };
}

describe("the pool of workers that paint the blocks of the terrain", () => {
    afterEach(() => vi.restoreAllMocks());

    it("gives each block at once to the worker with the least work: each paints its own in turn, without the game", () => {
        const { painters, workers } = pool();
        expect(painters.usable()).toBe(true);
        expect(painters.room()).toBe(2 * WORK_AN_IMAGE);
        const done = vi.fn();
        for (const id of [1, 2, 3, 4]) painters.post(job(id), done);
        // Nothing waits for the thread of the game to hand it over: the game answers only between two images.
        expect(workers.map((worker) => worker.posted.map((each) => each.message.job.id))).toEqual([
            [1, 3],
            [2, 4],
        ]);
        // A sharp block (16 times the work) to the first: the next ones go to the other.
        painters.post(job(5, 1), done);
        painters.post(job(6), done);
        painters.post(job(7), done);
        expect(workers[0].posted.map((each) => each.message.job.id)).toEqual([1, 3, 5]);
        expect(workers[1].posted.map((each) => each.message.job.id)).toEqual([2, 4, 6, 7]);
        workers[1].answer();
        workers[1].answer();
        expect(done).toHaveBeenCalledTimes(2);
    });

    it("takes about two images of work a worker ahead: four sharp blocks, or 64 coarse ones", () => {
        expect(WORK_AN_IMAGE).toBe(64);
        const sharp = pool();
        for (const id of [1, 2, 3]) sharp.painters.post(job(id, 1), () => undefined);
        expect(sharp.painters.room()).toBe(2 * 64 - 3 * 16);
        for (const id of [4, 5, 6, 7, 8]) sharp.painters.post(job(id, 1), () => undefined);
        expect(sharp.painters.room()).toBe(0);
        const coarse = pool();
        for (let id = 1; id <= 120; id++) coarse.painters.post(job(id, 4), () => undefined);
        expect(coarse.painters.room()).toBe(8);
        const mid = pool(1);
        mid.painters.post(job(1, 2), () => undefined);
        expect(mid.painters.room()).toBe(60);
        // Painted: its room is free again.
        mid.workers[0].answer();
        expect(mid.painters.room()).toBe(64);
    });

    it("hands the arrays of the job over, not a copy", () => {
        const { painters, workers } = pool();
        const posted = job(1);
        painters.post(posted, () => undefined);
        expect(workers[0].posted[0].transfer).toEqual([
            posted.heights.buffer,
            posted.covers.buffer,
            posted.waters?.buffer,
        ]);
    });

    it("gives the pixels answered to the one who asked, and the worker is idle again", () => {
        const { painters, workers } = pool();
        const done = vi.fn();
        painters.post(job(1), done);
        workers[0].answer(2, 9);
        expect(done).toHaveBeenCalledTimes(1);
        const pixels = done.mock.calls[0][0] as Uint8ClampedArray;
        expect(pixels.length).toBe(16);
        expect([...pixels].every((value) => value === 9)).toBe(true);
        expect(painters.room()).toBe(2 * WORK_AN_IMAGE);
    });

    it("sends a buffer given back along with the next job, to be painted into", () => {
        const { painters, workers } = pool(1);
        const done = vi.fn();
        painters.post(job(1), done);
        workers[0].answer();
        const pixels = done.mock.calls[0][0] as Uint8ClampedArray;
        painters.release(pixels);
        painters.post(job(2), () => undefined);
        expect(workers[0].posted[1].message.recycle).toBe(pixels.buffer);
        expect(workers[0].posted[1].transfer).toContain(pixels.buffer);
    });

    const failures: [string, (worker: FakeWorker, painters: BlockPaintPool) => void][] = [
        ["an error of a worker", (worker) => worker.onerror?.(new Error("boom"))],
        ["a message it cannot read", (worker) => worker.onmessageerror?.({})],
        ["a job it could not paint", (worker) => worker.onmessage?.({ data: { id: 1, error: "bad job" } })],
        [
            "a worker silent for more than 5 s",
            (_worker, painters) => {
                // Checked at every image (here every 100 ms), without an answer.
                for (let now = 1000; now <= 1000 + PAINT_TIMEOUT_MS; now += 100) painters.check(now);
                expect(painters.usable()).toBe(true);
                painters.check(1100 + PAINT_TIMEOUT_MS);
                expect(painters.usable()).toBe(false);
            },
        ],
    ];
    for (const [name, fail] of failures) {
        it(`breaks down for good on ${name}: the blocks in flight are given back unpainted`, () => {
            const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
            const { painters, workers } = pool();
            const first = vi.fn();
            const second = vi.fn();
            // Two blocks with the same worker: both given back.
            const third = vi.fn();
            painters.post(job(1), first);
            painters.post(job(2), second);
            painters.post(job(3), third);
            fail(workers[0], painters);
            expect(painters.usable()).toBe(false);
            expect(painters.room()).toBe(0);
            expect(first).toHaveBeenCalledWith(undefined);
            expect(second).toHaveBeenCalledWith(undefined);
            expect(third).toHaveBeenCalledWith(undefined);
            expect(workers.every((worker) => worker.terminated)).toBe(true);
            expect(warn).toHaveBeenCalledTimes(1);
            // Once broken, it stays so: nothing more is warned, nor called.
            workers[1].onerror?.(new Error("again"));
            expect(warn).toHaveBeenCalledTimes(1);
            expect(first).toHaveBeenCalledTimes(1);
        });
    }

    it("is not broken by a worker that keeps answering, however long its blocks wait behind one another", () => {
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const { painters, workers } = pool(1);
        for (const id of [1, 2, 3]) painters.post(job(id), () => undefined);
        const checkUntil = (from: number, to: number) => {
            for (let now = from; now <= to; now += 100) painters.check(now);
        };
        checkUntil(0, 4000);
        workers[0].answer();
        checkUntil(4100, 8000);
        workers[0].answer();
        // 5 s and more since the first check, yet it answered meanwhile: the wait counts from its last answer.
        checkUntil(8100, 12_000);
        expect(painters.usable()).toBe(true);
        // Its last block, and no answer for more than 5 s.
        checkUntil(12_100, 13_300);
        expect(painters.usable()).toBe(false);
    });

    it("does not take the game frozen for a while (tab asleep, debugger) for a worker that does not answer", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const { painters, workers } = pool(1);
        const done = vi.fn();
        painters.post(job(1), done);
        painters.check(0);
        painters.check(16);
        // The game is back after a minute without an image: nothing is counted of that minute.
        painters.check(60_016);
        painters.check(60_032);
        expect(painters.usable()).toBe(true);
        expect(warn).not.toHaveBeenCalled();
        workers[0].answer();
        expect(done).toHaveBeenCalledTimes(1);
        // A worker really silent, the game running: 5 s of images later, it is broken down.
        painters.post(job(2), done);
        for (let now = 60_048; now <= 60_048 + PAINT_TIMEOUT_MS + 100; now += 16) painters.check(now);
        expect(painters.usable()).toBe(false);
    });

    it("is not usable when its workers cannot be started", () => {
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const painters = new BlockPaintPool(() => {
            throw new Error("no worker here");
        }, 2);
        const done = vi.fn();
        expect(() => painters.post(job(1), done)).not.toThrow();
        expect(painters.usable()).toBe(false);
        expect(done).toHaveBeenCalledWith(undefined);
    });

    it("ignores the answer to a block it no longer waits for", () => {
        const { painters, workers } = pool(1);
        const done = vi.fn();
        painters.post(job(1), done);
        workers[0].onmessage?.({ data: { id: 99, pixels: new ArrayBuffer(16), size: 2 } });
        expect(done).not.toHaveBeenCalled();
        expect(painters.room()).toBe(WORK_AN_IMAGE - 1);
    });

    it("stops its workers when destroyed, and calls no one any more", () => {
        const { painters, workers } = pool();
        const done = vi.fn();
        painters.post(job(1), done);
        painters.destroy();
        expect(workers.every((worker) => worker.terminated)).toBe(true);
        workers[0].answer();
        expect(done).not.toHaveBeenCalled();
        expect(painters.usable()).toBe(false);
    });
});
