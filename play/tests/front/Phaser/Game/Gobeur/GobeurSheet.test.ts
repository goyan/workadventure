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

    it("keeps light pixels enclosed by the outline and yields transparent frames for empty cells", () => {
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

describe("gobeurWalkFrames", () => {
    it("returns the whole row", () => {
        expect(gobeurWalkFrames("right", 4)).toEqual([8, 9, 10, 11]);
        expect(gobeurWalkFrames("down", 3)).toEqual([0, 1, 2]);
        expect(gobeurWalkFrames("up", 4)).toEqual([12, 13, 14, 15]);
    });
});
