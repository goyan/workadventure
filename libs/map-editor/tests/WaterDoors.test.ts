import { describe, expect, it } from "vitest";
import { cellKey } from "../src/Terrain/TerrainGrid";
import { closedDoorSides, holdsOpen, waterDoorsOf } from "../src/Terrain/WaterDoors";
import { WaterGrid } from "../src/Terrain/WaterGrid";
import type { WaterStepInput } from "../src/Terrain/WaterGrid";
import { DEFAULT_WAVE_SETTINGS } from "../src/types";
import type { WAMFileFormat } from "../src/types";

const piece = (collectionName: string, name: string, x: number, y: number) => ({
    x,
    y,
    prefabRef: { collectionName, id: `${collectionName}:${name}:Default:Down` },
});
const wamOf = (entities: Record<string, ReturnType<typeof piece>>): Pick<WAMFileFormat, "entities"> => ({ entities });

/** A horizontal door on the wall line of the tile row 9, its leaves on the tiles 5 and 6. */
const horizontal = {
    left: piece("Carte Portes", "porte-h-blanc-g", 5 * 32, 9 * 32),
    right: piece("Carte Portes", "porte-h-blanc-d", 6 * 32, 9 * 32),
};
/** A vertical door on the wall line of the tile column 10, its leaves on the tile rows 6 and 7. */
const vertical = {
    top: piece("Carte Portes", "porte-v-gris-haut", 10 * 32 - 32, 5 * 32 + 12),
    bottom: piece("Carte Portes", "porte-v-gris-bas", 10 * 32 - 32, 6 * 32 + 12),
};

describe("waterDoorsOf", () => {
    it("makes one door of the two leaves of a door, with the sides it closes and its passage", () => {
        const doors = waterDoorsOf(wamOf({ ...horizontal, ...vertical }));
        expect(doors).toHaveLength(2);
        const [across, upright] = doors;
        // The horizontal door: the south side of the tiles 5 and 6 of the row 9, two cells a tile.
        expect(across.south.sort()).toEqual(
            [cellKey(10, 19), cellKey(11, 19), cellKey(12, 19), cellKey(13, 19)].sort(),
        );
        expect(across.east).toEqual([]);
        expect(across).toMatchObject({ left: 160, right: 224, top: 9 * 32 - 16, bottom: 10 * 32 + 16 });
        // The vertical door: the east side of the column of cells before its line, on the rows of its two tiles.
        expect(upright.east.sort()).toEqual(
            [cellKey(19, 12), cellKey(19, 13), cellKey(19, 14), cellKey(19, 15)].sort(),
        );
        expect(upright).toMatchObject({ left: 288, right: 352, top: 192, bottom: 256 });
    });

    it("keeps two doors apart on the same wall, and reads nothing of a door of a raised floor", () => {
        const far = piece("Carte Portes", "porte-h-blanc-g", 12 * 32, 9 * 32);
        expect(waterDoorsOf(wamOf({ ...horizontal, far }))).toHaveLength(2);
        const upstairs = { ...piece("Carte Portes", "porte-h-blanc-g", 5 * 32, 9 * 32), elevation: 64 };
        expect(waterDoorsOf(wamOf({ upstairs }))).toHaveLength(0);
        expect(waterDoorsOf(undefined)).toEqual([]);
    });

    it("is held open by who stands in its passage, and closes its sides otherwise", () => {
        const [door] = waterDoorsOf(wamOf(horizontal));
        expect(holdsOpen(door, { x: 190, y: 300 })).toBe(true);
        expect(holdsOpen(door, { x: 190, y: 400 })).toBe(false);
        expect(holdsOpen(door, { x: 100, y: 300 })).toBe(false);
        expect(closedDoorSides([door], () => false).south.size).toBe(4);
        expect(closedDoorSides([door], () => true).south.size).toBe(0);
    });
});

describe("a door and the water", () => {
    const still: WaterStepInput = { rainPx: 0, evaporationPx: 0, absorptionPx: 0, flows: [] };
    const inertia: WaterStepInput = { ...still, inertia: true, seconds: 0.1, waves: { ...DEFAULT_WAVE_SETTINGS } };
    // A wall all along the east side of the column of cells 19, but for the rows 12 to 15: the doorway.
    const wall = (): { east: Set<string>; south: Set<string> } => {
        const east = new Set<string>();
        for (let y = 0; y < 30; y++) if (y < 12 || y > 15) east.add(cellKey(19, y));
        return { east, south: new Set() };
    };
    const [door] = waterDoorsOf(wamOf(vertical));
    const flooded = (): WaterGrid => {
        const grid = new WaterGrid(undefined, { x: 0, y: 0, width: 40, height: 30 }, undefined, wall());
        // Water west of the wall, held in by the edges being far: laid cell by cell.
        const bytes = new Uint8Array(40 * 30 * 2);
        for (let y = 4; y < 26; y++) for (let x = 4; x < 20; x++) bytes[(y * 40 + x) * 2] = 10 * 8;
        grid.readDepths(bytes);
        return grid;
    };
    const beyond = (grid: WaterGrid): number => {
        let water = 0;
        for (let y = 0; y < 30; y++) for (let x = 20; x < 40; x++) water += grid.depthAt(x, y);
        return water;
    };

    for (const [name, input] of [
        ["that creeps", still],
        ["with inertia", inertia],
    ] as const) {
        it(`holds the water ${name} while it is closed, and lets it through once open`, () => {
            const closed = flooded();
            closed.setClosedDoors(closedDoorSides([door], () => false));
            expect(closed.canCross(19, 13, "east")).toBe(false);
            for (let step = 0; step < 60; step++) closed.step(input);
            expect(beyond(closed)).toBe(0);
            // The door opens: the water it held goes through.
            closed.setClosedDoors(closedDoorSides([door], () => true));
            expect(closed.canCross(19, 13, "east")).toBe(true);
            // Twelve seconds: a thin sheet on level ground is slow, the ground holds it back.
            for (let step = 0; step < 120; step++) closed.step(input);
            expect(beyond(closed)).toBeGreaterThan(0.1);
            // The wall on each side of it holds the water all the while.
            expect(closed.canCross(19, 5, "east")).toBe(false);
        });
    }

    it("closes again, and never closes more than the doors it is told", () => {
        const grid = flooded();
        grid.setClosedDoors(closedDoorSides([door], () => false));
        grid.setClosedDoors(undefined);
        expect(grid.canCross(19, 13, "east")).toBe(true);
        expect(grid.canCross(20, 13, "west")).toBe(true);
        grid.setClosedDoors(closedDoorSides([door], () => false));
        expect(grid.canCross(20, 13, "west")).toBe(false);
        // A door outside the grid is nothing to it.
        expect(() => grid.setClosedDoors({ east: new Set([cellKey(999, 999)]), south: new Set() })).not.toThrow();
    });
});
