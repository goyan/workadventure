import { describe, expect, it } from "vitest";
import { Season } from "@workadventure/map-editor";
import {
    BlockPainter,
    COVER_INDEX,
    DENSE_COLUMNS,
    DENSE_ROWS,
} from "../../../../../../src/front/Phaser/Game/Terrain/Pixel/BlockPainter";
import type { BlockJob } from "../../../../../../src/front/Phaser/Game/Terrain/Pixel/BlockPainter";
import { blockCellWindow } from "../../../../../../src/front/Phaser/Game/Terrain/Pixel/BlockWindow";
import type { Cover } from "../../../../../../src/front/Phaser/Game/Terrain/Pixel/MaterialBorder";

let nextId = 1;

/** A job for the block 1,1 (cells 16 to 31), from what each cell of its window holds. */
function job(
    cells: {
        height?: (x: number, y: number) => number;
        water?: (x: number, y: number) => number;
        cover?: (x: number, y: number) => Cover;
    },
    options: Partial<Pick<BlockJob, "texel" | "season" | "projected" | "seeThrough" | "withLayout" | "dense">> = {},
): BlockJob {
    const window = blockCellWindow(1, 1);
    const heights = new Float32Array(window.width * window.height);
    const waters = new Uint8Array(window.width * window.height);
    const covers = new Uint8Array(window.width * window.height);
    let wet = false;
    for (let row = 0; row < window.height; row++) {
        for (let column = 0; column < window.width; column++) {
            const x = window.x + column;
            const y = window.y + row;
            const index = row * window.width + column;
            heights[index] = cells.height?.(x, y) ?? 0;
            waters[index] = cells.water?.(x, y) ?? 0;
            if (waters[index] > 0) wet = true;
            covers[index] = COVER_INDEX[cells.cover?.(x, y) ?? "grass"];
        }
    }
    return {
        id: nextId++,
        blockX: 1,
        blockY: 1,
        texel: options.texel ?? 1,
        projected: options.projected ?? true,
        seeThrough: options.seeThrough ?? false,
        withLayout: options.withLayout ?? true,
        season: options.season,
        heights,
        waters: wet ? waters : undefined,
        covers,
        dense: options.dense,
    };
}

const inSquare = (x: number, y: number) => x >= 20 && x <= 27 && y >= 20 && y <= 27;
const flat = () => job({});
const hollowWithLake = (texel: 1 | 4 = 1) =>
    job({ height: (x, y) => (inSquare(x, y) ? -128 : 0), water: (x, y) => (inSquare(x, y) ? 20 : 0) }, { texel });
const mount = (texel: 1 | 4 = 1) =>
    job(
        { height: (x, y) => (inSquare(x, y) ? 128 : 0), cover: (x, y) => (inSquare(x, y) ? "rock" : "sand") },
        { texel },
    );

/** The block painted pass by pass, a slice of 16 rows (or columns) at a time, as the game does it over several images. */
function bySlices(painter: BlockPainter, painted: BlockJob): Uint8ClampedArray {
    const shape = painter.begin(painted);
    for (let row = shape.firstRow; row < shape.endRow; row += 16)
        painter.groundRows(row, Math.min(row + 16, shape.endRow));
    if (shape.shaded) {
        for (let row = shape.firstRow; row < shape.endRow; row += 16) {
            painter.horizonRows(row, Math.min(row + 16, shape.endRow));
        }
    }
    for (let row = shape.colorsFirst; row < shape.colorsEnd; row += 16) {
        painter.colorRows(row, Math.min(row + 16, shape.colorsEnd));
    }
    for (let column = 0; column < shape.size; column += 16) {
        painter.projectColumns(column, Math.min(column + 16, shape.size));
    }
    return painter.pixels().slice();
}

describe("a block of the terrain painted from plain data", () => {
    it("gives the same pixels at once as slice by slice, sharp and coarse", () => {
        for (const make of [
            () => flat(),
            () => hollowWithLake(1),
            () => hollowWithLake(4),
            () => mount(1),
            () => mount(4),
        ]) {
            const whole = new BlockPainter().paint(make());
            const sliced = bySlices(new BlockPainter(), make());
            expect(whole.length).toBe(sliced.length);
            expect(Buffer.from(whole.buffer, whole.byteOffset, whole.length).equals(Buffer.from(sliced))).toBe(true);
        }
        expect(new BlockPainter().paint(mount(1)).length).toBe(256 * 256 * 4);
        expect(new BlockPainter().paint(mount(4)).length).toBe(64 * 64 * 4);
    });

    it("keeps nothing from a block to the next: the same job, the same pixels, whatever was painted before", () => {
        const painter = new BlockPainter();
        const alone = new BlockPainter().paint(mount()).slice();
        painter.paint(hollowWithLake(4));
        painter.paint(hollowWithLake(1));
        const after = painter.paint(mount());
        expect(Buffer.from(after.buffer, after.byteOffset, after.length).equals(Buffer.from(alone))).toBe(true);
    });

    it("paints into the buffer it is given when it is large enough, into a new one else", () => {
        const painter = new BlockPainter();
        const expected = new BlockPainter().paint(mount(4)).slice();
        const large = new ArrayBuffer(256 * 256 * 4);
        new Uint8Array(large).fill(7);
        const into = painter.paint(mount(4), large);
        expect(into.buffer).toBe(large);
        expect(into.length).toBe(64 * 64 * 4);
        expect(Buffer.from(into.buffer, 0, into.length).equals(Buffer.from(expected))).toBe(true);
        const small = new ArrayBuffer(16);
        const fresh = painter.paint(mount(4), small);
        expect(fresh.buffer).not.toBe(small);
        expect(Buffer.from(fresh.buffer, fresh.byteOffset, fresh.length).equals(Buffer.from(expected))).toBe(true);
    });

    it("leaves a flat block that nothing covers to the map: transparent", () => {
        const pixels = new BlockPainter().paint(job({ cover: () => "none" }));
        for (let at = 3; at < pixels.length; at += 4) expect(pixels[at]).toBe(0);
    });

    it("sows flowers where the grass is dense, in spring; none where it is not told dense", () => {
        const flowers = (pixels: Uint8ClampedArray) => {
            let found = 0;
            for (let at = 0; at < pixels.length; at += 4) {
                const pink = pixels[at] === 0xf1 && pixels[at + 1] === 0x9a && pixels[at + 2] === 0xc0;
                const yellow = pixels[at] === 0xf6 && pixels[at + 1] === 0xd8 && pixels[at + 2] === 0x4a;
                if (pink || yellow) found++;
            }
            return found;
        };
        const dense = new Uint8Array(DENSE_COLUMNS * DENSE_ROWS).fill(1);
        expect(flowers(new BlockPainter().paint(job({}, { season: Season.Spring, dense })))).toBeGreaterThan(50);
        expect(flowers(new BlockPainter().paint(job({}, { season: Season.Spring })))).toBe(0);
    });
});
