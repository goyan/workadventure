import { describe, expect, it } from "vitest";
import { answer } from "../../../../../src/front/Phaser/Game/Terrain/BlockPaintWorker";
import { BlockPainter, COVER_INDEX } from "../../../../../src/front/Phaser/Game/Terrain/Pixel/BlockPainter";
import type { BlockJob } from "../../../../../src/front/Phaser/Game/Terrain/Pixel/BlockPainter";
import { blockCellWindow } from "../../../../../src/front/Phaser/Game/Terrain/Pixel/BlockWindow";

/** A job for the block 1,1: sand, a mount 128 px high in its middle. */
function job(id: number, texel: 1 | 2 | 4 = 4): BlockJob {
    const window = blockCellWindow(1, 1);
    const heights = new Float32Array(window.width * window.height);
    for (let row = 0; row < window.height; row++) {
        for (let column = 0; column < window.width; column++) {
            const x = window.x + column;
            const y = window.y + row;
            heights[row * window.width + column] = x >= 20 && x <= 27 && y >= 20 && y <= 27 ? 128 : 0;
        }
    }
    return {
        id,
        blockX: 1,
        blockY: 1,
        texel,
        projected: true,
        seeThrough: false,
        withLayout: true,
        season: undefined,
        heights,
        waters: undefined,
        covers: new Uint8Array(window.width * window.height).fill(COVER_INDEX.sand),
        dense: undefined,
    };
}

const same = (a: ArrayBuffer, b: Uint8ClampedArray, bytes: number) =>
    Buffer.from(a, 0, bytes).equals(Buffer.from(b.buffer, b.byteOffset, bytes));

describe("what the worker answers to a block to paint", () => {
    it("the pixels of the block, handed over, the same as painted on the thread of the game", () => {
        const { response, transfer } = answer(new BlockPainter(), { job: job(7) });
        if ("error" in response) throw new Error(response.error);
        expect(response.id).toBe(7);
        expect(response.size).toBe(64);
        expect(response.pixels.byteLength).toBe(64 * 64 * 4);
        expect(transfer).toEqual([response.pixels]);
        expect(same(response.pixels, new BlockPainter().paint(job(7)), 64 * 64 * 4)).toBe(true);
    });

    it("paints into the buffer handed back when it is large enough", () => {
        const recycle = new ArrayBuffer(256 * 256 * 4);
        const { response } = answer(new BlockPainter(), { job: job(8), recycle });
        if ("error" in response) throw new Error(response.error);
        expect(response.pixels).toBe(recycle);
        expect(same(response.pixels, new BlockPainter().paint(job(8)), 64 * 64 * 4)).toBe(true);
    });

    it("an error, and nothing handed over, for a job it cannot paint", () => {
        const broken = { ...job(9), heights: new Float32Array(3) };
        const { response, transfer } = answer(new BlockPainter(), { job: broken });
        expect(response).toEqual({ id: 9, error: expect.any(String) });
        expect(transfer).toEqual([]);
    });
});
