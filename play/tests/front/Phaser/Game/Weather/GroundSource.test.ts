import { snowByte } from "@workadventure/map-editor";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MeadowState } from "@wa/front/Phaser/Game/Terrain/MeadowState";
import {
    followsServerGround,
    meadowHoldsSnow,
    setLocalGroundShown,
    snowCoverHere,
    snowCoverOfMap,
    snowPeakOfMap,
} from "@wa/front/Phaser/Game/Weather/GroundSource";

const chosen = vi.hoisted(() => ({ place: undefined as { latitude: number; longitude: number } | undefined }));
vi.mock("@wa/front/Phaser/Game/Weather/ChosenPlaceWeather", () => ({
    chosenWeatherNow: () => ({ place: chosen.place, state: { status: "pending" } }),
}));

/** A map of 2 × 1 tiles: 15 mm of snow (a full cover) on the first, none on the second. */
const snowy = (): MeadowState => {
    const meadow = new MeadowState();
    meadow.receive({
        width: 2,
        height: 1,
        grass: new Uint8Array(2),
        moisture: new Uint8Array(2),
        snow: Uint8Array.from([snowByte(15), 0]),
    });
    return meadow;
};

describe("GroundSource", () => {
    beforeEach(() => {
        chosen.place = undefined;
        setLocalGroundShown(() => false);
    });

    it("follows the ground of the server unless the player follows a place of their own", () => {
        expect(followsServerGround()).toBe(true);
        chosen.place = { latitude: 69, longitude: 18 };
        expect(followsServerGround()).toBe(false);
    });

    it("reads the snow of the server where the player stands, and over the whole map", () => {
        const meadow = snowy();
        expect(snowCoverHere(meadow, 10, 10)).toBeCloseTo(1, 1);
        expect(snowCoverHere(meadow, 40, 10)).toBe(0);
        expect(snowCoverOfMap(meadow)).toBeCloseTo(0.5, 1);
        expect(snowCoverHere(undefined, 10, 10)).toBe(0);
        expect(snowCoverOfMap(undefined)).toBe(0);
    });

    it("gives a player who follows their own weather the snow of their own city, outdoors only", () => {
        chosen.place = { latitude: 69, longitude: 18 };
        const meadow = snowy();
        expect(snowCoverHere(meadow, 40, 10, { cover: 0.6, outdoors: true })).toBe(0.6);
        expect(snowCoverHere(meadow, 10, 10, { cover: 0.6, outdoors: false })).toBe(0);
        expect(snowCoverOfMap(meadow, 0.6)).toBe(0.6);
        // A player who follows the server is shown nothing of it.
        chosen.place = undefined;
        expect(snowCoverHere(meadow, 40, 10, { cover: 0.6, outdoors: true })).toBe(0);
        expect(snowCoverOfMap(meadow, 0.6)).toBeCloseTo(0.5, 1);
    });

    it("shows none of the snow of the server to a player who follows their own weather", () => {
        chosen.place = { latitude: 69, longitude: 18 };
        const meadow = snowy();
        expect(snowCoverHere(meadow, 10, 10)).toBe(0);
        expect(snowCoverOfMap(meadow)).toBe(0);
    });

    it("reads the snow of their own local ground tile by tile, once it is shown", () => {
        chosen.place = { latitude: 69, longitude: 18 };
        setLocalGroundShown(() => true);
        const meadow = snowy();
        expect(meadowHoldsSnow()).toBe(true);
        // The even snow of their city gives way to the snow their ground computed.
        expect(snowCoverHere(meadow, 10, 10, { cover: 0.2, outdoors: true })).toBeCloseTo(1, 1);
        expect(snowCoverHere(meadow, 40, 10, { cover: 0.2, outdoors: true })).toBe(0);
        expect(snowCoverOfMap(meadow, 0.2)).toBeCloseTo(0.5, 1);
    });

    it("gives the snowiest tile of the map, not its mean: the snow of the heights alone gets its footprints", () => {
        const heights = new MeadowState();
        const snow = new Uint8Array(100);
        snow[0] = snowByte(15);
        heights.receive({ width: 100, height: 1, grass: new Uint8Array(100), moisture: new Uint8Array(100), snow });
        expect(snowCoverOfMap(heights)).toBeLessThan(0.05);
        expect(snowPeakOfMap(heights)).toBeCloseTo(1, 1);
        expect(snowPeakOfMap(undefined)).toBe(0);
        // Their own city's even snow for who follows a place without a ground of their own.
        chosen.place = { latitude: 69, longitude: 18 };
        expect(snowPeakOfMap(heights, 0.4)).toBe(0.4);
    });
});
