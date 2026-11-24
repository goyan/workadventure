import { PositionMessage_Direction } from "@workadventure/messages";
import type { FishingMessage } from "@workadventure/messages";
import { describe, expect, it } from "vitest";
import { FishingLines } from "../../../../../src/front/Phaser/Game/Fishing/FishingLines";
import {
    decodeRodEquipped,
    FISHING_EVENT,
    fishingDirection,
    formatKilograms,
} from "../../../../../src/front/Phaser/Game/Fishing/FishingProtocol";
import { FishingRod } from "../../../../../src/front/Phaser/Game/Fishing/FishingRod";
import { bobOffset, gaugeFill, lineCurve, rodTip } from "../../../../../src/front/Phaser/Game/Fishing/FishingShapes";

const message = (more: Partial<FishingMessage> = {}): FishingMessage => ({
    lines: [],
    events: [],
    caughtTotal: 0,
    ...more,
});

describe("the fishing rod in the hand", () => {
    it("is held only by a player whose variable says so", () => {
        expect(decodeRodEquipped(true)).toBe(true);
        expect(decodeRodEquipped("true")).toBe(false);
        expect(decodeRodEquipped(undefined)).toBe(false);
    });

    it("casts where the avatar faces", () => {
        expect(fishingDirection(PositionMessage_Direction.UP)).toBe("up");
        expect(fishingDirection(PositionMessage_Direction.RIGHT)).toBe("right");
        expect(fishingDirection(PositionMessage_Direction.DOWN)).toBe("down");
        expect(fishingDirection(PositionMessage_Direction.LEFT)).toBe("left");
    });

    it("casts further the longer the key is held", () => {
        const rod = new FishingRod();
        expect(rod.chargeTiles(0)).toBeUndefined();
        expect(rod.press(0, false)).toBeUndefined();
        expect(rod.chargeTiles(750)).toBe(4.5);
        expect(rod.release(750, { x: 100, y: 100, direction: "right" })).toEqual({ x: 244, y: 100 });
        expect(rod.chargeTiles(800)).toBeUndefined();
    });

    it("casts from the ground under an avatar that stands on a raised floor", () => {
        const rod = new FishingRod();
        rod.press(0, false);
        // Drawn 64 px up the screen, the avatar stands over the ground point (100, 164).
        expect(rod.release(750, { x: 100, y: 100, floorZ: 64, direction: "right" })).toEqual({ x: 244, y: 164 });
        rod.press(1000, false);
        expect(rod.release(1750, { x: 100, y: 100, floorZ: 64, direction: "up" })).toEqual({ x: 100, y: 20 });
    });

    it("does not cast when the key was not pressed for it", () => {
        const rod = new FishingRod();
        expect(rod.release(750, { x: 100, y: 100, direction: "right" })).toBeUndefined();
        rod.press(0, false);
        rod.cancel();
        expect(rod.release(750, { x: 100, y: 100, direction: "right" })).toBeUndefined();
    });

    it("reels at once when a line is in the water, without charging a cast", () => {
        const rod = new FishingRod();
        expect(rod.press(0, true)).toBe("reel");
        expect(rod.chargeTiles(100)).toBeUndefined();
        expect(rod.release(750, { x: 100, y: 100, direction: "right" })).toBeUndefined();
    });

    it("writes a weight in kilograms, in the language of the player", () => {
        expect(formatKilograms(1240, "fr-FR")).toBe("1,24");
        expect(formatKilograms(300, "en-US")).toBe("0.30");
    });
});

describe("the lines the server tells", () => {
    it("keeps the last lines and gives back what just happened", () => {
        const lines = new FishingLines();
        const line = { userId: 4, x: 10, y: 20, state: 0, fishId: 0 };
        const refused = { userId: 5, type: FISHING_EVENT.refused, grams: 0, kind: 0 };
        expect(lines.receive(message({ lines: [line], events: [refused] }), 0)).toEqual([refused]);
        expect(lines.lines).toEqual([line]);
        expect(lines.lineOf(4)).toEqual(line);
        expect(lines.lineOf(5)).toBeUndefined();
        lines.receive(message(), 10);
        expect(lines.lines).toEqual([]);
    });

    it("counts the catches of the room, and those of the last minute it saw", () => {
        const lines = new FishingLines();
        const caught = { userId: 4, type: FISHING_EVENT.caught, grams: 500, kind: 1 };
        lines.receive(message({ caughtTotal: 7 }), 0);
        expect(lines.caughtTotal).toBe(7);
        expect(lines.caughtLastMinute(0)).toBe(0);
        lines.receive(message({ events: [caught], caughtTotal: 8 }), 1000);
        lines.receive(message({ events: [caught], caughtTotal: 9 }), 50_000);
        expect(lines.caughtTotal).toBe(9);
        expect(lines.caughtLastMinute(50_000)).toBe(2);
        expect(lines.caughtLastMinute(61_001)).toBe(1);
        expect(lines.caughtLastMinute(200_000)).toBe(0);
    });
});

describe("what is drawn", () => {
    it("fills the gauge from one tile to eight", () => {
        expect(gaugeFill(1)).toBe(0);
        expect(gaugeFill(4.5)).toBe(0.5);
        expect(gaugeFill(8)).toBe(1);
        expect(gaugeFill(20)).toBe(1);
    });

    it("plunges the float when a fish bites, and keeps it still for who asked for less motion", () => {
        expect(bobOffset(1, 123, false)).toBe(4);
        expect(bobOffset(1, 123, true)).toBe(4);
        expect(bobOffset(0, 123, true)).toBe(0);
        expect(bobOffset(2, 123, true)).toBe(0);
        expect(Math.abs(bobOffset(0, 123, false))).toBeLessThanOrEqual(1);
    });

    it("hangs the line from the tip of the rod to the float", () => {
        const points = lineCurve({ x: 0, y: 0 }, { x: 100, y: 20 }, 10);
        expect(points[0]).toEqual({ x: 0, y: 0 });
        expect(points[points.length - 1]).toEqual({ x: 100, y: 20 });
        // In the middle it hangs under the straight line.
        const middle = points[(points.length - 1) / 2];
        expect(middle.x).toBe(50);
        expect(middle.y).toBeGreaterThan(10);
    });

    it("holds the rod above the avatar, on the side it faces", () => {
        const right = rodTip(100, 100, PositionMessage_Direction.RIGHT, false);
        const left = rodTip(100, 100, PositionMessage_Direction.LEFT, false);
        expect(right.x).toBeGreaterThan(100);
        expect(left.x).toBeLessThan(100);
        expect(right.y).toBeLessThan(100);
        expect(rodTip(100, 100, PositionMessage_Direction.RIGHT, true).y).toBe(right.y - 4);
    });
});
