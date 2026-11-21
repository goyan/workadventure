import { snowByte } from "@workadventure/map-editor";
import { describe, expect, it } from "vitest";
import { grassAlpha, MeadowState, mottledCover } from "../../../../../src/front/Phaser/Game/Terrain/MeadowState";

describe("MeadowState", () => {
    it("holds nothing until told, then the grass and the moisture of each tile", () => {
        const meadow = new MeadowState();
        expect(meadow.hasGrass()).toBe(false);
        expect(meadow.grassAt(1, 0)).toBe(0);
        meadow.receive({
            width: 3,
            height: 2,
            grass: Uint8Array.from([0, 255, 0, 0, 0, 128]),
            moisture: Uint8Array.from([0, 51, 0, 0, 0, 255]),
        });
        expect(meadow.hasGrass()).toBe(true);
        expect(meadow.grassAt(1, 0)).toBe(255);
        expect(meadow.grassAt(2, 1)).toBe(128);
        // Read at a point of the map: the tile (1, 0) covers the pixels 32 to 63 by 0 to 31.
        expect(meadow.coverAt(40, 10)).toBe(1);
        expect(meadow.moistureAt(40, 10)).toBeCloseTo(0.2);
        expect(meadow.moistureAt(70, 40)).toBe(1);
        // Off the map: bare and dry.
        expect(meadow.grassAt(3, 0)).toBe(0);
        expect(meadow.moistureAt(-5, 10)).toBe(0);
    });

    it("leaves out a state that does not fit its size, and counts the others", () => {
        const meadow = new MeadowState();
        meadow.receive({ width: 3, height: 2, grass: new Uint8Array(5), moisture: new Uint8Array(6) });
        expect(meadow.version()).toBe(0);
        meadow.receive({ width: 3, height: 2, grass: new Uint8Array(6), moisture: new Uint8Array(6) });
        expect(meadow.version()).toBe(1);
        expect(meadow.hasGrass()).toBe(false);
    });

    it("draws a meadow thicker here and thinner there, the same for a cell every time", () => {
        expect(mottledCover(0, 3, 4)).toBe(0);
        const levels = new Set<number>();
        for (let cell = 0; cell < 40; cell++) {
            const level = mottledCover(200, cell, 7);
            expect(level).toBe(mottledCover(200, cell, 7));
            expect(level).toBeGreaterThanOrEqual(140);
            expect(level).toBeLessThanOrEqual(200);
            levels.add(level);
        }
        expect(levels.size).toBeGreaterThan(5);
        expect(grassAlpha(0)).toBe(0);
        expect(grassAlpha(255)).toBeCloseTo(0.75);
        expect(grassAlpha(128)).toBeLessThan(grassAlpha(255));
    });

    it("holds the snow lying on each tile, none from a server that tells none", () => {
        const meadow = new MeadowState();
        const state = { width: 2, height: 1, grass: new Uint8Array(2), moisture: new Uint8Array(2) };
        meadow.receive({ ...state, snow: Uint8Array.from([snowByte(15), 0]) });
        expect(meadow.hasSnow()).toBe(true);
        expect(meadow.snowAt(0, 0)).toBeGreaterThan(14);
        expect(meadow.snowAt(0, 0)).toBeLessThan(16);
        expect(meadow.snowAt(1, 0)).toBe(0);
        expect(meadow.snowAt(5, 5)).toBe(0);
        expect(meadow.snowCoverAt(10, 10)).toBeCloseTo(1, 1);
        expect(meadow.meanSnowCover()).toBeCloseTo(0.5, 1);
        // An empty field, or one of another size: no snow.
        for (const snow of [undefined, new Uint8Array(0), new Uint8Array(5)]) {
            meadow.receive({ ...state, snow });
            expect(meadow.hasSnow()).toBe(false);
            expect(meadow.snowAt(0, 0)).toBe(0);
            expect(meadow.meanSnowCover()).toBe(0);
        }
    });
});
