import { cellKey, withHeights } from "@workadventure/map-editor";
import { describe, expect, it } from "vitest";
import {
    altitudeLabel,
    avatarAltitude,
    pointerAltitude,
} from "../../../../../src/front/Phaser/Game/Floors/AvatarAltitude";

const relief = withHeights(
    undefined,
    new Map([
        [cellKey(10, 5), 48],
        [cellKey(20, 5), -24],
    ]),
);

describe("avatarAltitude", () => {
    it("is not told on a map without relief", () => {
        expect(avatarAltitude(undefined, 100, 100, 0)).toBeUndefined();
        expect(avatarAltitude({ chunks: {} }, 100, 100, 52)).toBeUndefined();
    });

    it("is the height of the relief under the feet of an avatar on the ground", () => {
        // The cell (10, 5) covers the pixels 160 to 175 by 80 to 95.
        expect(avatarAltitude(relief, 168, 88, 0)).toBe(48);
        expect(avatarAltitude(relief, 328, 88, 0)).toBe(-24);
        expect(avatarAltitude(relief, 600, 600, 0)).toBe(0);
    });

    it("is the altitude of the floor the avatar stands on, whatever the relief under it", () => {
        expect(avatarAltitude(relief, 168, 88, 52)).toBe(52);
    });
});

describe("altitudeLabel", () => {
    it("tells the altitude in metres, a tile of altitude being about 1.10 m", () => {
        expect(altitudeLabel(0, "en-US")).toBe("0 m");
        expect(altitudeLabel(32, "en-US")).toBe("+1.1 m");
        expect(altitudeLabel(-64, "en-US")).toBe("-2.2 m");
        expect(altitudeLabel(48, "fr-FR")).toBe("+1,6 m");
    });
});

describe("pointerAltitude", () => {
    it("is the height of the relief under the pointer", () => {
        expect(pointerAltitude(relief, { x: 168, y: 88 })).toBe(48);
        expect(pointerAltitude(relief, { x: 328, y: 88 })).toBe(-24);
        expect(pointerAltitude(relief, { x: 600, y: 600 })).toBe(0);
    });

    it("is not told on a map without relief, nor while the pointer is off the game", () => {
        expect(pointerAltitude(undefined, { x: 168, y: 88 })).toBeUndefined();
        expect(pointerAltitude({ chunks: {} }, { x: 168, y: 88 })).toBeUndefined();
        expect(pointerAltitude(relief, undefined)).toBeUndefined();
    });
});
