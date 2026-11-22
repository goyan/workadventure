import { cellKey, heightOfMetres, withHeights } from "@workadventure/map-editor";
import type { TerrainData } from "@workadventure/map-editor";
import { describe, expect, it } from "vitest";
import {
    altitudeLabel,
    avatarAltitude,
    metresLabel,
    pointerGround,
    pointerGroundAt,
    samePointerGround,
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

/** The water as the browser knows it: the relief its pools dug, and pixels of water over some points. */
function waterOf(basin: TerrainData | undefined, depths: Record<string, number> = {}) {
    return {
        basin: () => basin,
        settledDepthAt: (x: number, y: number) => depths[`${Math.floor(x / 16)},${Math.floor(y / 16)}`] ?? 0,
    };
}
const dry = () => false;

describe("pointerGround", () => {
    it("tells the ground alone where there is no water", () => {
        expect(pointerGround(heightOfMetres(-3.6), 0)).toEqual({ ground: -3.6 });
        // A film thinner than what the map draws is no water either.
        expect(pointerGround(heightOfMetres(-3.6), 0.25)).toEqual({ ground: -3.6 });
    });

    it("tells the surface of the water over the ground, and its depth", () => {
        expect(pointerGround(heightOfMetres(-3.6), heightOfMetres(2.4))).toEqual({
            ground: -3.6,
            surface: -1.2,
            depth: 2.4,
        });
        // Over a mountain: the surface is over the ground of the map.
        expect(pointerGround(heightOfMetres(1.5), heightOfMetres(0.8))).toEqual({
            ground: 1.5,
            surface: 2.3,
            depth: 0.8,
        });
    });

    it("rounds to the decimetre, the depth being what the two figures shown tell", () => {
        // -3.64 and +2.46: the surface -1.18 shows -1.2, the ground -3.6, so the depth shows 2.4, not 2.5.
        expect(pointerGround(heightOfMetres(-3.64), heightOfMetres(2.46))).toEqual({
            ground: -3.6,
            surface: -1.2,
            depth: 2.4,
        });
        // Never a "-0" next to the level of the map.
        expect(pointerGround(heightOfMetres(-0.02), 0)).toEqual({ ground: 0 });
        expect(Object.is(pointerGround(heightOfMetres(-0.02), 0).ground, -0)).toBe(false);
    });

    it("tells a frozen surface as ice, at the level of its water", () => {
        expect(pointerGround(heightOfMetres(-3.6), heightOfMetres(2.4), true)).toEqual({
            ground: -3.6,
            surface: -1.2,
            depth: 2.4,
            ice: true,
        });
        // No water, no ice.
        expect(pointerGround(heightOfMetres(-3.6), 0, true)).toEqual({ ground: -3.6 });
    });
});

describe("pointerGroundAt", () => {
    it("reads the ground of the relief under the pointer, and the water over it", () => {
        const water = waterOf(relief, { "20,5": heightOfMetres(2.4) });
        expect(pointerGroundAt(relief, { x: 168, y: 88 }, water, dry)).toEqual({ ground: 1.6 });
        expect(pointerGroundAt(relief, { x: 328, y: 88 }, water, dry)).toEqual({
            ground: -0.8,
            surface: 1.6,
            depth: 2.4,
        });
        expect(pointerGroundAt(relief, { x: 600, y: 600 }, water, dry)).toEqual({ ground: 0 });
    });

    it("reads the floor of a pool where its basin is dug, as the server pours the water over it", () => {
        const basin = withHeights(relief, new Map([[cellKey(30, 5), heightOfMetres(-1.5)]]));
        const water = waterOf(basin, { "30,5": heightOfMetres(1.2) });
        expect(pointerGroundAt(relief, { x: 488, y: 88 }, water, dry)).toEqual({
            ground: -1.5,
            surface: -0.3,
            depth: 1.2,
        });
    });

    it("reads the ground and the water under a bridge or a raised floor, not its deck", () => {
        // The water reads its last state over the cell, whatever is built over it (a bridge reads none for walkers).
        const water = { ...waterOf(relief, { "20,5": heightOfMetres(2.4) }), walkerSettledDepthAt: () => 0 };
        expect(pointerGroundAt(relief, { x: 328, y: 88 }, water, dry)).toEqual({
            ground: -0.8,
            surface: 1.6,
            depth: 2.4,
        });
    });

    it("tells the ice where the water is frozen", () => {
        const water = waterOf(relief, { "20,5": heightOfMetres(2.4) });
        expect(pointerGroundAt(relief, { x: 328, y: 88 }, water, () => true)).toMatchObject({ ice: true });
    });

    it("is not told on a map without relief, nor while the pointer is off the game", () => {
        const water = waterOf(relief);
        expect(pointerGroundAt(undefined, { x: 168, y: 88 }, water, dry)).toBeUndefined();
        expect(pointerGroundAt({ chunks: {} }, { x: 168, y: 88 }, water, dry)).toBeUndefined();
        expect(pointerGroundAt(relief, undefined, water, dry)).toBeUndefined();
    });
});

describe("samePointerGround", () => {
    it("is true when nothing shown changes", () => {
        expect(samePointerGround(undefined, undefined)).toBe(true);
        expect(samePointerGround({ ground: -3.6 }, { ground: -3.6 })).toBe(true);
        expect(
            samePointerGround({ ground: -3.6, surface: -1.2, depth: 2.4 }, { ground: -3.6, surface: -1.2, depth: 2.4 }),
        ).toBe(true);
        expect(samePointerGround({ ground: -3.6 }, undefined)).toBe(false);
        expect(samePointerGround({ ground: -3.6 }, { ground: -3.6, surface: -1.2, depth: 2.4 })).toBe(false);
        expect(
            samePointerGround(
                { ground: -3.6, surface: -1.2, depth: 2.4 },
                { ground: -3.6, surface: -1.2, depth: 2.4, ice: true },
            ),
        ).toBe(false);
    });
});

describe("metresLabel", () => {
    it("tells metres to the decimetre, signed or not", () => {
        expect(metresLabel(-3.6, "fr-FR")).toBe("-3,6 m");
        expect(metresLabel(2.4, "fr-FR")).toBe("+2,4 m");
        expect(metresLabel(2.4, "fr-FR", false)).toBe("2,4 m");
        expect(metresLabel(-1.2, "en-US")).toBe("-1.2 m");
        expect(metresLabel(0, "fr-FR")).toBe("0 m");
    });
});
