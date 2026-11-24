import { describe, expect, it } from "vitest";
import { ICE_SLIPS_MM } from "@workadventure/map-editor";
import {
    CRACK_MS,
    HOLE_CONFIRM_MS,
    HOLE_OPEN_MS,
    HOLE_RADIUS_PX,
    IceBreaks,
} from "../../../../../src/front/Phaser/Game/Ice/IceBreaks";

describe("IceBreaks", () => {
    it("cracks under an avatar on thin ice, then breaks a hole where they stand", () => {
        const breaks = new IceBreaks();
        expect(breaks.step(0, { x: 100, y: 100 }, true)).toBeUndefined();
        expect(breaks.shown(CRACK_MS / 2)[0].phase).toBeCloseTo(0.5);
        expect(breaks.step(CRACK_MS / 2, { x: 104, y: 100 }, true)).toBeUndefined();
        expect(breaks.step(CRACK_MS, { x: 104, y: 100 }, true)).toEqual({ x: 100, y: 100 });
        expect(breaks.holeAt(100, 100, CRACK_MS + 1)).toBe(true);
        expect(breaks.shown(CRACK_MS + 1)[0].phase).toBeGreaterThanOrEqual(1);
    });

    it("never breaks ice that bears the avatar, and starts again when they walk on", () => {
        const breaks = new IceBreaks();
        breaks.step(0, { x: 100, y: 100 }, false);
        expect(breaks.step(CRACK_MS * 2, { x: 100, y: 100 }, false)).toBeUndefined();
        breaks.step(0, { x: 100, y: 100 }, true);
        expect(breaks.step(CRACK_MS, { x: 100 + HOLE_RADIUS_PX * 2, y: 100 }, true)).toBeUndefined();
        expect(breaks.holeAt(100, 100, CRACK_MS)).toBe(false);
    });

    it("lets a hole freeze over, and keeps one hole where the room tells one already open", () => {
        const breaks = new IceBreaks();
        breaks.addHole(200, 200, 0);
        breaks.addHole(205, 200, 10);
        expect(breaks.shown(10)).toHaveLength(1);
        expect(breaks.holeIn({ x: 180, y: 190, width: 10, height: 10 }, 10)).toBe(true);
        expect(breaks.holeAt(200, 200, HOLE_OPEN_MS)).toBe(false);
        breaks.step(HOLE_OPEN_MS, undefined, false);
        expect(breaks.active()).toBe(false);
    });
});

describe("a hole in the ice of the server", () => {
    /** The ice the server keeps at the hole (mm), as the room was last told it. */
    function onServerIce(): { mm: number; breaks: IceBreaks } {
        const ice: { mm: number; breaks: IceBreaks } = { mm: 0, breaks: new IceBreaks() };
        ice.breaks = new IceBreaks(() => () => ice.mm);
        return ice;
    }

    it("stays open water as long as the server keeps no ice there, whatever the time", () => {
        const ice = onServerIce();
        ice.breaks.addHole(200, 200, 0);
        // Hours later, still no ice: the hole has not closed on a clock of its own.
        const hours = 3 * 3600 * 1000;
        expect(ice.breaks.holeAt(200, 200, hours)).toBe(true);
        expect(ice.breaks.shown(hours)[0].phase).toBe(1);
    });

    it("closes as the ice of the server takes it again, and is gone once it is ice one slips on", () => {
        const ice = onServerIce();
        ice.breaks.addHole(200, 200, 0);
        ice.mm = ICE_SLIPS_MM / 2;
        const later = HOLE_CONFIRM_MS + 1;
        expect(ice.breaks.shown(later)[0].phase).toBeCloseTo(1.5);
        ice.mm = ICE_SLIPS_MM;
        expect(ice.breaks.holeAt(200, 200, later)).toBe(false);
        ice.breaks.step(later, undefined, false);
        expect(ice.breaks.active()).toBe(false);
    });

    it("stays open until the room is told the ice it broke: the ice before the break is not looked at", () => {
        const ice = onServerIce();
        ice.mm = 30;
        ice.breaks.addHole(200, 200, 0);
        expect(ice.breaks.holeAt(200, 200, HOLE_CONFIRM_MS - 1)).toBe(true);
        expect(ice.breaks.holeAt(200, 200, HOLE_CONFIRM_MS)).toBe(false);
    });

    it("keeps the clock of its own for a player who follows a weather of their own", () => {
        const breaks = new IceBreaks(() => undefined);
        breaks.addHole(200, 200, 0);
        expect(breaks.holeAt(200, 200, HOLE_OPEN_MS)).toBe(false);
    });
});
