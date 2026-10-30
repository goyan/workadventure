import { describe, expect, it } from "vitest";
import { isPlacementFree, shouldSnapToGrid } from "../../../../src/front/Phaser/Game/MapEditor/EntityPlacementSnapping";

describe("EntityPlacementSnapping", () => {
    it.each([
        { snapEnabled: true, shiftDown: false, snaps: true },
        { snapEnabled: true, shiftDown: true, snaps: false },
        { snapEnabled: false, shiftDown: false, snaps: false },
        { snapEnabled: false, shiftDown: true, snaps: true },
    ])("snapEnabled=$snapEnabled shiftDown=$shiftDown -> snaps=$snaps", ({ snapEnabled, shiftDown, snaps }) => {
        expect(shouldSnapToGrid(snapEnabled, shiftDown)).toBe(snaps);
        expect(isPlacementFree(snapEnabled, shiftDown)).toBe(!snaps);
    });
});
