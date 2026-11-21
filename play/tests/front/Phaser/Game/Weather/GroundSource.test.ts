import { snowByte } from "@workadventure/map-editor";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MeadowState } from "@wa/front/Phaser/Game/Terrain/MeadowState";
import { followsServerGround, snowCoverHere, snowCoverOfMap } from "@wa/front/Phaser/Game/Weather/GroundSource";

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

    it("shows none of the snow of the server to a player who follows their own weather", () => {
        chosen.place = { latitude: 69, longitude: 18 };
        const meadow = snowy();
        expect(snowCoverHere(meadow, 10, 10)).toBe(0);
        expect(snowCoverOfMap(meadow)).toBe(0);
    });
});
