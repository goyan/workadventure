import { describe, expect, it } from "vitest";
import {
    gobeurSheetLayout,
    gobeurWalkFrames,
    sliceGridSheet,
    type RgbaImage,
} from "../../../../../src/front/Phaser/Game/Gobeur/GobeurSheet";

function makeSheet(size: number): RgbaImage {
    const data = new Uint8ClampedArray(size * size * 4);
    const cell = size / 4;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const i = (y * size + x) * 4;
            const light = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0 ? 205 : 235;
            let v = light;
            const dx = (x % cell) - cell / 2;
            const dy = (y % cell) - cell / 2;
            if (dx * dx + dy * dy <= (cell / 3) ** 2) v = 40;
            data[i] = v;
            data[i + 1] = v;
            data[i + 2] = v;
            data[i + 3] = 255;
        }
    }
    return { width: size, height: size, data };
}

describe("gobeurSheetLayout", () => {
    it("detects frames32 sheets", () => {
        expect(gobeurSheetLayout(96, 128)).toEqual({ mode: "frames32", columns: 3 });
        expect(gobeurSheetLayout(128, 128)).toEqual({ mode: "frames32", columns: 4 });
    });
    it("falls back to a 4x4 grid", () => {
        expect(gobeurSheetLayout(1536, 1024)).toEqual({ mode: "grid", columns: 4, cellWidth: 384, cellHeight: 256 });
    });
});

describe("sliceGridSheet", () => {
    it("produces a 128x128 sheet with transparent corners, opaque centre and empty bottom row", () => {
        const out = sliceGridSheet(makeSheet(400));
        expect(out.width).toBe(128);
        expect(out.height).toBe(128);
        const alpha = (x: number, y: number) => out.data[(y * 128 + x) * 4 + 3];
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                expect(alpha(32 * c, 32 * r)).toBe(0);
                expect(alpha(32 * c + 31, 32 * r)).toBe(0);
                expect(alpha(32 * c + 16, 32 * r + 16)).toBe(255);
                let bottomOpaque = 0;
                for (let x = 0; x < 32; x++) if (alpha(32 * c + x, 32 * r + 31) !== 0) bottomOpaque++;
                expect(bottomOpaque).toBe(0);
                let row30 = 0;
                for (let x = 0; x < 32; x++) if (alpha(32 * c + x, 32 * r + 30) !== 0) row30++;
                expect(row30).toBeGreaterThan(0);
            }
        }
    });

    it("yields a fully transparent frame for an empty cell", () => {
        const img = makeSheet(400);
        // Blank the first cell to pure light background.
        for (let y = 0; y < 100; y++)
            for (let x = 0; x < 100; x++) {
                const i = (y * 400 + x) * 4;
                img.data[i] = img.data[i + 1] = img.data[i + 2] = 210;
            }
        const out = sliceGridSheet(img);
        for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) expect(out.data[(y * 128 + x) * 4 + 3]).toBe(0);
    });
});

function blankSheet(): RgbaImage {
    const data = new Uint8ClampedArray(128 * 128 * 4);
    for (let i = 0; i < data.length; i += 4) {
        data[i] = data[i + 1] = data[i + 2] = 230;
        data[i + 3] = 255;
    }
    return { width: 128, height: 128, data };
}

function setPixel(img: RgbaImage, x: number, y: number, v: number): void {
    const i = (y * img.width + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
}

function pixelAt(out: RgbaImage, x: number, y: number): { r: number; a: number } {
    const i = (y * out.width + x) * 4;
    return { r: out.data[i], a: out.data[i + 3] };
}

function countOpaqueWithValue(out: RgbaImage, value: number): number {
    let n = 0;
    for (let y = 0; y < 32; y++)
        for (let x = 0; x < 32; x++) if (pixelAt(out, x, y).r === value && pixelAt(out, x, y).a === 255) n++;
    return n;
}

describe("sliceGridSheet background rule", () => {
    it("keeps light pixels enclosed by a closed outline opaque and clears the outside", () => {
        const img = blankSheet();
        // Dark ring (2 px thick) from (4,4) to (23,23), with a dark pole sticking out on top.
        for (let y = 4; y <= 23; y++)
            for (let x = 4; x <= 23; x++) {
                const onRing = x < 6 || x > 21 || y < 6 || y > 21;
                setPixel(img, x, y, onRing ? 40 : 220);
            }
        for (let y = 0; y <= 3; y++) setPixel(img, 14, y, 40);
        const out = sliceGridSheet(img);
        expect(pixelAt(out, 15, 17)).toEqual({ r: 220, a: 255 });
        expect(pixelAt(out, 4, 2)).toMatchObject({ a: 0 }); // light pixel outside the ring, inside the bbox
        expect(pixelAt(out, 0, 0)).toMatchObject({ a: 0 });
        expect(countOpaqueWithValue(out, 220)).toBeGreaterThan(100);
    });

    it("does not leak through a diagonal-only gap (4-neighbour connectivity)", () => {
        const img = blankSheet();
        const dark = (x: number, y: number): void => setPixel(img, x, y, 40);
        for (let x = 4; x <= 13; x++) dark(x, 4);
        for (let x = 14; x <= 23; x++) dark(x, 5);
        for (let y = 4; y <= 23; y++) dark(4, y);
        for (let y = 5; y <= 23; y++) dark(23, y);
        for (let x = 4; x <= 23; x++) dark(x, 23);
        for (let y = 5; y <= 22; y++) for (let x = 5; x <= 22; x++) if (y >= 6 || x < 14) setPixel(img, x, y, 220);
        const out = sliceGridSheet(img);
        expect(pixelAt(out, 16, 16)).toEqual({ r: 220, a: 255 });
        expect(pixelAt(out, 16, 1)).toMatchObject({ a: 0 }); // source (14,4): outside, diagonal to the interior
        expect(countOpaqueWithValue(out, 220)).toBeGreaterThan(100);
    });

    it("uses one scale for all cells so a small character stays smaller", () => {
        const img = blankSheet();
        for (let y = 2; y < 30; y++) for (let x = 2; x < 30; x++) setPixel(img, x, y, 40); // cell (0,0): 28 px
        for (let y = 10; y < 20; y++) for (let x = 42; x < 52; x++) setPixel(img, x, y, 40); // cell (1,0): 10 px
        const out = sliceGridSheet(img);
        const width = (c: number): number => {
            let min = 32;
            let max = -1;
            for (let y = 0; y < 32; y++)
                for (let x = 0; x < 32; x++)
                    if (pixelAt(out, 32 * c + x, y).a !== 0) {
                        min = Math.min(min, x);
                        max = Math.max(max, x);
                    }
            return max - min + 1;
        };
        expect(width(0)).toBe(30);
        expect(width(1)).toBeGreaterThan(0);
        expect(width(1)).toBeLessThan(15);
    });
});

describe("gobeurWalkFrames", () => {
    it("returns the whole row", () => {
        expect(gobeurWalkFrames("right", 4)).toEqual([8, 9, 10, 11]);
        expect(gobeurWalkFrames("down", 3)).toEqual([0, 1, 2]);
        expect(gobeurWalkFrames("up", 4)).toEqual([12, 13, 14, 15]);
    });
});
