import { describe, expect, it } from "vitest";
import { DOLPHIN_SPEED_FACTOR, MAX_ANIMALS, MAX_DOLPHINS, MEALS_FOR_CALF, STARVE_HUNTS } from "../src/Life/Population";
import { isPredator, SPECIES, SPECIES_IDS, SPECIES_WIRE, wireKindOf } from "../src/Life/Species";
import { DOLPHIN_DEPTH_PX, FISH_DEPTH_PX } from "../src/Life/WaterBodies";

describe("the species of the life", () => {
    it("describes the fish and the dolphin as the rules had them", () => {
        expect(SPECIES_IDS.slice(0, 2)).toEqual(["fish", "dolphin"]);
        expect(SPECIES.fish).toMatchObject({
            id: "fish",
            habitat: "water",
            minDepthPx: FISH_DEPTH_PX,
            prey: [],
            speedFactor: 1,
            litter: [2, 4],
            mealsForYoung: 0,
            starveHunts: undefined,
            roomCap: MAX_ANIMALS,
        });
        expect(SPECIES.dolphin).toMatchObject({
            id: "dolphin",
            habitat: "water",
            minDepthPx: DOLPHIN_DEPTH_PX,
            prey: ["fish"],
            speedFactor: DOLPHIN_SPEED_FACTOR,
            litter: [1, 1],
            mealsForYoung: MEALS_FOR_CALF,
            starveHunts: STARVE_HUNTS,
            roomCap: MAX_DOLPHINS,
        });
    });

    it("tells a predator from a prey", () => {
        expect(isPredator(SPECIES.fish)).toBe(false);
        expect(isPredator(SPECIES.dolphin)).toBe(true);
    });

    it("keeps the kinds the browsers already know on the wire", () => {
        expect(SPECIES_WIRE).toMatchObject({ fish: 0, dolphin: 1 });
        expect(wireKindOf("fish", "male")).toBe(0);
        expect(wireKindOf("fish", "female")).toBe(1);
        expect(wireKindOf("dolphin", "male")).toBe(2);
        expect(wireKindOf("dolphin", "female")).toBe(3);
    });
});
