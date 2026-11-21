import { afterEach, describe, expect, it, vi } from "vitest";
import { BlockPaintPool, PAINT_TIMEOUT_MS } from "../../../../../src/front/Phaser/Game/Terrain/BlockPaintPool";
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
    /** Answers its last job with `size` × `size` pixels of the value `fill`. */
    public answer(size = 2, fill = 9): void {
        const job = this.posted[this.posted.length - 1].message.job;
        const pixels = new ArrayBuffer(size * size * 4);
        new Uint8Array(pixels).fill(fill);
        this.onmessage?.({ data: { id: job.id, pixels, size } });
    }
}

function job(id: number): BlockJob {
    return {
        id,
        blockX: 0,
        blockY: 0,
        texel: 4,
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

    it("gives a block to each idle worker, one each at a time", () => {
        const { painters, workers } = pool();
        expect(painters.usable()).toBe(true);
        expect(painters.idle()).toBe(2);
        painters.post(job(1), () => undefined);
        expect(painters.idle()).toBe(1);
        painters.post(job(2), () => undefined);
        expect(painters.idle()).toBe(0);
        expect(workers.map((worker) => worker.posted.length)).toEqual([1, 1]);
        expect(() => painters.post(job(3), () => undefined)).toThrow();
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
        expect(painters.idle()).toBe(2);
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
                painters.check(1000);
                painters.check(1000 + PAINT_TIMEOUT_MS);
                expect(painters.usable()).toBe(true);
                painters.check(1001 + PAINT_TIMEOUT_MS);
            },
        ],
    ];
    for (const [name, fail] of failures) {
        it(`breaks down for good on ${name}: the blocks in flight are given back unpainted`, () => {
            const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
            const { painters, workers } = pool();
            const first = vi.fn();
            const second = vi.fn();
            painters.post(job(1), first);
            painters.post(job(2), second);
            fail(workers[0], painters);
            expect(painters.usable()).toBe(false);
            expect(painters.idle()).toBe(0);
            expect(first).toHaveBeenCalledWith(undefined);
            expect(second).toHaveBeenCalledWith(undefined);
            expect(workers.every((worker) => worker.terminated)).toBe(true);
            expect(warn).toHaveBeenCalledTimes(1);
            // Once broken, it stays so: nothing more is warned, nor called.
            workers[1].onerror?.(new Error("again"));
            expect(warn).toHaveBeenCalledTimes(1);
            expect(first).toHaveBeenCalledTimes(1);
        });
    }

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
        expect(painters.idle()).toBe(0);
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
