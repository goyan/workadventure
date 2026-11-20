import { describe, expect, it } from "vitest";
import { cellKey, withHeights } from "@workadventure/map-editor";
import { ReliefTileSchedule, reliefSignature } from "../../../../../src/front/Phaser/Game/Terrain/ReliefTileSchedule";

const signatures = (keys: string[], value = "a") => new Map(keys.map((key) => [key, value]));

describe("the blocks of the relief to draw", () => {
    it("draws nothing again when the view only scrolls or zooms", () => {
        const schedule = new ReliefTileSchedule();
        const keys = ["0,0", "1,0"];
        expect(schedule.toRedraw(keys, signatures(keys))).toEqual(keys);
        const done = schedule.redraws;
        // Scrolled: another order, a block more out of the budget's reach is not new.
        expect(schedule.toRedraw(["1,0", "0,0"], signatures(keys))).toEqual([]);
        expect(schedule.redraws).toBe(done);
    });

    it("draws again a block whose relief changed in its 8 rows north", () => {
        // The block 0,1 starts at the cell row 16: the cell row 10 is in the 8 rows north of it, and in the block 0,0.
        const before = withHeights(undefined, new Map([[cellKey(3, 2), -32]]));
        const after = withHeights(before, new Map([[cellKey(3, 10), -32]]));
        expect(reliefSignature(after, 0, 1)).not.toBe(reliefSignature(before, 0, 1));
        expect(reliefSignature(after, 0, 0)).not.toBe(reliefSignature(before, 0, 0));
        // A change further north than 8 rows does not touch it.
        const far = withHeights(before, new Map([[cellKey(3, 5), -32]]));
        expect(reliefSignature(far, 0, 1)).toBe(reliefSignature(before, 0, 1));
    });

    it("draws at most two blocks an image, the visible ones first", () => {
        const schedule = new ReliefTileSchedule();
        const visible = Array.from({ length: 10 }, (_, index) => `${index},0`);
        const all = [...visible, "10,0", "11,0"];
        const first = schedule.toRedraw(all, signatures(all), 2, new Set(visible));
        expect(first).toEqual(["0,0", "1,0"]);
        let drawn = first.length;
        while (drawn < 10) {
            const next = schedule.toRedraw(all, signatures(all), 2, new Set(visible));
            expect(next.length).toBeLessThanOrEqual(2);
            for (const key of next) expect(visible).toContain(key);
            drawn += next.length;
        }
        expect(schedule.toRedraw(all, signatures(all), 2, new Set(visible))).toEqual(["10,0", "11,0"]);
    });

    it("lets go of the blocks seen least lately beyond 64", () => {
        const schedule = new ReliefTileSchedule();
        const keys = Array.from({ length: 70 }, (_, index) => `${index},0`);
        for (const key of keys) schedule.toRedraw([key], signatures([key]), 2);
        const dropped = schedule.evict(new Set(["0,0"]), 64);
        expect(dropped).toHaveLength(6);
        expect(dropped).not.toContain("0,0");
        expect(dropped).toContain("1,0");
        expect(dropped).not.toContain("69,0");
    });
});
