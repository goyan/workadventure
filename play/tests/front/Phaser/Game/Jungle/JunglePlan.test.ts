import { describe, expect, it } from "vitest";
import {
    JUNGLE_MAX_ANIMALS,
    isJungleMarker,
    isJungleTree,
    jungleSpecies,
    jungleTreePicked,
    parisDay,
    planJungle,
} from "../../../../../src/front/Phaser/Game/Jungle/JunglePlan";
import type { JungleTree } from "../../../../../src/front/Phaser/Game/Jungle/JunglePlan";
import type { Point } from "../../../../../src/front/Phaser/Game/Wander/WanderSchedule";

const DAY = "2026-11-14";
const SPECIES = ["lion-sheet.png", "tigre-sheet.png"];

/** Trees in a row, one every 4 tiles, the foot in the middle of the bottom of a 32 x 64 image. */
function treesInARow(count: number, prefix = "tree"): JungleTree[] {
    return Array.from({ length: count }, (_, i) => ({ id: `${prefix}-${i}`, foot: { x: i * 128 + 16, y: 95 } }));
}

const everywhere = {
    isOutdoor: () => true,
    isWalkable: () => true,
};

/** Ids of trees that have an animal on DAY. */
function pickedIds(count: number): string[] {
    return Array.from({ length: count }, (_, i) => `picked-${i}`).filter((id) => jungleTreePicked(id, DAY));
}

describe("JunglePlan", () => {
    it("recognises trees, the marker and the species", () => {
        expect(isJungleTree("Nature:tree-1-2:Default:Down")).toBe(true);
        expect(isJungleTree("Nature:bush-1:Default:Down")).toBe(false);
        expect(isJungleMarker({ id: "panneau", tags: ["Animaux", "Jungle"] })).toBe(true);
        expect(
            isJungleMarker({ id: "lion", tags: ["Animaux", "Jungle"], wander: { sheetPath: "lion-sheet.png" } }),
        ).toBe(false);
        expect(isJungleMarker({ id: "panneau", tags: ["Animaux"] })).toBe(false);
        expect(
            jungleSpecies([
                { id: "tigre", tags: ["Animaux", "Jungle"], wander: { sheetPath: "tigre-sheet.png" } },
                { id: "lion", tags: ["Animaux", "Jungle"], wander: { sheetPath: "lion-sheet.png" } },
                { id: "canard", tags: ["Animaux"], wander: { sheetPath: "canard-sheet.png" } },
                { id: "lion-2", tags: ["Jungle"], wander: { sheetPath: "lion-sheet.png" } },
                { id: "panneau", tags: ["Animaux", "Jungle"] },
            ]),
        ).toEqual(["lion-sheet.png", "tigre-sheet.png"]);
    });

    it("gives the Paris day", () => {
        expect(parisDay(new Date("2026-11-14T23:30:00Z"))).toBe("2026-11-15");
        expect(parisDay(new Date("2026-11-14T22:30:00Z"))).toBe("2026-11-14");
        expect(parisDay(new Date("2026-07-01T21:59:00Z"))).toBe("2026-07-01");
        expect(parisDay(new Date("2026-07-01T22:00:00Z"))).toBe("2026-07-02");
    });

    it("picks about one tree in three", () => {
        const picked = Array.from({ length: 300 }, (_, i) => `tree-${i}`).filter((id) => jungleTreePicked(id, DAY));
        expect(picked.length).toBeGreaterThanOrEqual(70);
        expect(picked.length).toBeLessThanOrEqual(130);
    });

    it("never more than fifty, whatever the order of the trees", () => {
        const trees = treesInARow(300);
        const forward = planJungle({ trees, species: SPECIES, day: DAY, ...everywhere });
        const backward = planJungle({ trees: [...trees].reverse(), species: SPECIES, day: DAY, ...everywhere });
        expect(JUNGLE_MAX_ANIMALS).toBe(50);
        expect(forward).toHaveLength(JUNGLE_MAX_ANIMALS);
        expect(backward.map((animal) => animal.id)).toEqual(forward.map((animal) => animal.id));
        expect(backward).toEqual(forward);
        for (const animal of forward) {
            expect(animal.id).toMatch(/^jungle:tree-\d+$/);
            expect(SPECIES).toContain(animal.sheetPath);
        }
        // Both species show up among fifty animals.
        expect(new Set(forward.map((animal) => animal.sheetPath)).size).toBe(2);
    });

    it("changes with the day and not with the client", () => {
        const trees = treesInARow(300);
        const today = planJungle({ trees, species: SPECIES, day: DAY, ...everywhere });
        expect(planJungle({ trees, species: SPECIES, day: DAY, ...everywhere })).toEqual(today);
        const tomorrow = planJungle({ trees, species: SPECIES, day: "2026-11-15", ...everywhere });
        expect(tomorrow.map((animal) => animal.id)).not.toEqual(today.map((animal) => animal.id));
    });

    it("skips indoor trees and trees without a free outdoor tile nearby", () => {
        const [indoor, walled, blockedFoot] = pickedIds(40);
        const trees: JungleTree[] = [
            // Foot at tile (2, 2), inside a building.
            { id: indoor, foot: { x: 2 * 32 + 16, y: 2 * 32 + 31 } },
            // Foot at tile (20, 20): nothing free within 3 tiles.
            { id: walled, foot: { x: 20 * 32 + 16, y: 20 * 32 + 31 } },
            // Foot at tile (40, 40): its tile is taken (the trunk), the one on its right is free.
            { id: blockedFoot, foot: { x: 40 * 32 + 16, y: 40 * 32 + 31 } },
        ];
        const plan = planJungle({
            trees,
            species: SPECIES,
            day: DAY,
            isOutdoor: (x, y) => !(x < 5 * 32 && y < 5 * 32),
            isWalkable: (tile: Point) => (tile.x < 5 && tile.y < 5) || (tile.x === 41 && tile.y === 40),
        });
        expect(plan.map((animal) => animal.id)).toEqual([`jungle:${blockedFoot}`]);
        expect(plan[0].nest).toEqual({ x: 41 * 32 + 16, y: 40 * 32 + 16 });
    });

    it("takes the nearest free outdoor tile, a free tile indoors does not count", () => {
        const [id] = pickedIds(20);
        // Foot at tile (10, 10). Free: (10, 8) indoors, (12, 10) outdoors, both 2 tiles away; (10, 8) comes first in
        // the search order (dy, then dx), so only being indoors rules it out.
        const plan = planJungle({
            trees: [{ id, foot: { x: 10 * 32 + 16, y: 10 * 32 + 31 } }],
            species: SPECIES,
            day: DAY,
            isOutdoor: (x, y) => !(Math.floor(x / 32) === 10 && Math.floor(y / 32) === 8),
            isWalkable: (tile: Point) => (tile.x === 10 && tile.y === 8) || (tile.x === 12 && tile.y === 10),
        });
        expect(plan).toEqual([
            { id: `jungle:${id}`, sheetPath: expect.any(String), nest: { x: 12 * 32 + 16, y: 10 * 32 + 16 } },
        ]);
    });

    it("no species, no animal", () => {
        expect(planJungle({ trees: treesInARow(30), species: [], day: DAY, ...everywhere })).toEqual([]);
    });
});
