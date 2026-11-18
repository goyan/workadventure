import { describe, expect, it } from "vitest";
import type { Animal } from "../src/Life/Animal";
import { DRY_DEATH_MS, minDepthOf, swim } from "../src/Life/Swim";
import { DOLPHIN_DEPTH_PX, FISH_DEPTH_PX, waterBodiesOf } from "../src/Life/WaterBodies";
import type { WaterGrid } from "../src/Terrain/WaterGrid";
import { gridOf, scripted } from "./lifeHelpers";

const fishAt = (cellX: number, cellY: number): Animal => ({
    id: 1,
    kind: "fish",
    sex: "male",
    x: cellX * 16 + 8,
    y: cellY * 16 + 8,
    bornAt: 0,
    lifespanMs: 1e9,
    readyAt: 0,
});
const dolphinAt = (cellX: number, cellY: number): Animal => ({
    ...fishAt(cellX, cellY),
    kind: "dolphin",
    sex: undefined,
});
const cellOf = (animal: Animal): [number, number] => [Math.floor(animal.x / 16), Math.floor(animal.y / 16)];

/** Swims for that many steps of half a second; returns the cells visited, or undefined if the animal died. */
function swimFor(animal: Animal, grid: WaterGrid, steps: number, speed = 48): Set<string> | undefined {
    const bodies = waterBodiesOf(grid);
    const random = scripted();
    const visited = new Set<string>();
    for (let step = 0; step < steps; step++) {
        if (!swim(animal, bodies, grid, speed, 500, step * 500, random)) return undefined;
        visited.add(cellOf(animal).join(","));
    }
    return visited;
}

describe("swim", () => {
    it("wanders through its pond and never leaves the water", () => {
        const grid = gridOf(["ssss..", "ssss..", "ss....", "ss....", "......"]);
        const fish = fishAt(0, 0);
        const visited = swimFor(fish, grid, 2000);
        expect(visited).toBeDefined();
        for (const key of visited ?? []) {
            const [x, y] = key.split(",").map(Number);
            expect(grid.depthAt(x, y)).toBeGreaterThanOrEqual(FISH_DEPTH_PX);
        }
        // It does move about: most of the twelve cells are seen.
        expect(visited?.size).toBeGreaterThanOrEqual(8);
    });

    it("never crosses a wall in the middle of a pool", () => {
        const grid = gridOf(
            ["ssssss", "ssssss"],
            [
                [2, 0],
                [2, 1],
            ],
        );
        const visited = swimFor(fishAt(0, 0), grid, 2000);
        for (const key of visited ?? []) expect(Number(key.split(",")[0])).toBeLessThanOrEqual(2);
    });

    it("crosses neither a wall nor dry ground at its fastest, six tiles a second", () => {
        const grid = gridOf(
            ["sss.ssssss", "sss.ssssss"],
            [
                [6, 0],
                [6, 1],
            ],
        );
        const visited = swimFor(fishAt(5, 0), grid, 2000, 6 * 32);
        expect(visited).toBeDefined();
        for (const key of visited ?? []) {
            const x = Number(key.split(",")[0]);
            expect(x).toBeGreaterThanOrEqual(4);
            expect(x).toBeLessThanOrEqual(6);
        }
    });

    it("flees to the deepest wet cell next to it when its own dries up", () => {
        const grid = gridOf([".sd"]);
        const fish = fishAt(1, 0);
        const dried = gridOf(["..d"]);
        const bodies = waterBodiesOf(dried);
        expect(swim(fish, bodies, dried, 48, 500, 1000, scripted())).toBe(true);
        expect(fish.dryAt).toBe(1000);
        expect(swim(fish, bodies, dried, 48, 500, 1500, scripted())).toBe(true);
        expect(cellOf(fish)).toEqual([2, 0]);
        expect(swim(fish, bodies, dried, 48, 500, 2000, scripted())).toBe(true);
        expect(fish.dryAt).toBeUndefined();
        expect(grid.depthAt(1, 0)).toBe(8);
    });

    it("dies after five seconds without water, not before", () => {
        const dry = gridOf(["...", "...", "..."]);
        const bodies = waterBodiesOf(dry);
        const fish = fishAt(1, 1);
        expect(swim(fish, bodies, dry, 48, 500, 0, scripted())).toBe(true);
        expect(swim(fish, bodies, dry, 48, 500, DRY_DEATH_MS - 1, scripted())).toBe(true);
        expect(cellOf(fish)).toEqual([1, 1]);
        expect(swim(fish, bodies, dry, 48, 500, DRY_DEATH_MS, scripted())).toBe(false);
    });

    it("keeps a dolphin in deep water", () => {
        expect(minDepthOf(dolphinAt(0, 0))).toBe(DOLPHIN_DEPTH_PX);
        expect(minDepthOf(fishAt(0, 0))).toBe(FISH_DEPTH_PX);
        const grid = gridOf(["sddds", "sddds", "sssss"]);
        const visited = swimFor(dolphinAt(2, 0), grid, 1000);
        expect(visited).toBeDefined();
        for (const key of visited ?? []) {
            const [x, y] = key.split(",").map(Number);
            expect(grid.depthAt(x, y)).toBeGreaterThanOrEqual(DOLPHIN_DEPTH_PX);
        }
        expect(visited?.size).toBeGreaterThanOrEqual(4);
    });

    it("swims towards a target it was given, at the speed it was given", () => {
        const grid = gridOf(["ssssssssss"]);
        const fish = { ...fishAt(0, 0), targetX: 9 * 16 + 8, targetY: 8, speed: 32 };
        swim(fish, waterBodiesOf(grid), grid, 48, 500, 0, scripted());
        expect(fish.x).toBeCloseTo(8 + 16);
        expect(fish.y).toBeCloseTo(8);
    });
});
