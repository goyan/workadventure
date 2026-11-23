import {
    cellKey,
    DEFAULT_POOL_STYLE,
    poolBasins,
    poolSoilCode,
    WaterGrid,
    WaterSnapshot,
    WaterSnapshotView,
    withHeights,
    withSoils,
} from "@workadventure/map-editor";
import type {
    Places,
    WAMFileFormat,
    WaterBodies,
    WaterCrossings,
    WaterStepInput,
    WaterView,
} from "@workadventure/map-editor";
import type { SubToPusherRoomMessage } from "@workadventure/messages";
import { describe, expect, it } from "vitest";
import { AquaticLifeManager } from "../src/Model/AquaticLifeManager";
import { plain } from "./helpers/GroundScenario";

// A map of 70 × 48 cells: a lake, a pond joined to it by a channel, a pool, and flat ground a flood covers.
const MAP = { width: 70, height: 48 };
const heights = new Map<string, number>();
for (let y = 8; y < 34; y++) for (let x = 2; x < 34; x++) heights.set(cellKey(x, y), -30);
for (let y = 14; y < 30; y++) for (let x = 42; x < 60; x++) heights.set(cellKey(x, y), -22);
for (let x = 34; x < 42; x++) for (let y = 20; y < 23; y++) heights.set(cellKey(x, y), -12);
const soils = new Map<string, number>();
for (let y = 38; y < 44; y++) for (let x = 10; x < 20; x++) soils.set(cellKey(x, y), poolSoilCode(0));
const terrain = withSoils(withHeights(undefined, heights), soils);
const wam: WAMFileFormat = {
    version: "2.1.0",
    mapUrl: "map.tmj",
    areas: [],
    entityCollections: [],
    entities: {},
    terrain,
    settings: {
        pools: [DEFAULT_POOL_STYLE],
        life: {
            enabled: true,
            reproductionDelay: 5,
            maxLifespan: 240,
            maxSpeed: 1.5,
            huntInterval: 5,
            dolphinReproductionDelay: 10,
            dolphinMaxLifespan: 3600,
            drinkInterval: 20,
            landEnabled: true,
            antelopeReproductionDelay: 10,
            antelopeMaxLifespan: 900,
            landHuntInterval: 10,
            landPredatorReproductionDelay: 30,
            landPredatorMaxLifespan: 3600,
            gullsEnabled: true,
            gullHuntInterval: 10,
            gullReproductionDelay: 30,
            gullMaxLifespan: 5700,
        },
    },
};
/** A door in the channel between the lake and the pond. */
const door = { east: new Set([cellKey(37, 20), cellKey(37, 21), cellKey(37, 22)]), south: new Set<string>() };
const still: WaterStepInput = { rainPx: 0, evaporationPx: 0, absorptionPx: 0, flows: [], inertia: true, seconds: 0.1 };
const rising: WaterStepInput = {
    ...still,
    rainPx: 0.6,
    flows: [
        { cellX: 8, cellY: 12, px: 900, radius: 3 },
        { cellX: 50, cellY: 20, px: 500, radius: 3 },
    ],
};
const falling: WaterStepInput = {
    ...still,
    evaporationPx: 0.15,
    absorptionPx: 0.4,
    flows: [
        { cellX: 26, cellY: 28, px: -1500, radius: 4 },
        { cellX: 52, cellY: 24, px: -900, radius: 4 },
    ],
};

/** The same water, whose crossings always say that something changed: the life reads it again as it always did. */
function alwaysCrossed(grid: WaterView, counts: { cells: number }): WaterView {
    let asked = 0;
    return {
        bounds: grid.bounds,
        depthAt: (cellX, cellY) => grid.depthAt(cellX, cellY),
        canCross: (cellX, cellY, side) => grid.canCross(cellX, cellY, side),
        restLevelAt: (cellX, cellY, reach) => grid.restLevelAt(cellX, cellY, reach),
        cells: () => {
            counts.cells++;
            return grid.cells();
        },
        crossings: (): WaterCrossings => ({ swim: ++asked, land: asked }),
    };
}

/** The same water, counting how many times its cells are read whole (once for each reading of its bodies). */
function counted(grid: WaterView, counts: { cells: number }): WaterView {
    return {
        bounds: grid.bounds,
        depthAt: (cellX, cellY) => grid.depthAt(cellX, cellY),
        canCross: (cellX, cellY, side) => grid.canCross(cellX, cellY, side),
        restLevelAt: (cellX, cellY, reach) => grid.restLevelAt(cellX, cellY, reach),
        cells: () => {
            counts.cells++;
            return grid.cells();
        },
        crossings: () => grid.crossings(),
    };
}

/** Lays `px` more of water on a patch of flat ground, far from the lake. */
function sheet(grid: WaterGrid, px: number): void {
    for (let y = 36; y < 46; y++) for (let x = 44; x < 62; x++) grid.rainOn(x, y, 0, px);
}

/** The places a life holds now: the body of water and of land of each cell, and the cells beside water. */
function placesOf(manager: AquaticLifeManager): number[] {
    const held = manager as unknown as { bodies?: WaterBodies; land?: Places };
    const all: number[] = [held.bodies?.sizes.length ?? -1, held.land?.sizes.length ?? -1];
    // How large each body of water is, and how much of it is deep enough for a dolphin.
    for (const size of held.bodies?.sizes ?? []) all.push(size.cells, size.deep);
    for (let y = 0; y < MAP.height; y++) {
        for (let x = 0; x < MAP.width; x++) {
            all.push(
                held.bodies?.bodyAt(x, y) ?? -1,
                held.land?.bodyAt(x, y) ?? -1,
                held.land?.atShore?.(x, y) ? 1 : 0,
            );
        }
    }
    // The nearest shore from a few cells: read from the shores the land keeps once they were asked for.
    for (const [x, y] of [
        [40, 40],
        [60, 44],
        [5, 5],
        [36, 10],
    ]) {
        const shore = held.land?.shoreNear?.(-1, x, y, 16);
        all.push(shore?.cellX ?? -1, shore?.cellY ?? -1);
    }
    return all;
}

/** A life over a water, with its own luck and its own clock: what it told the room, and what it saved. */
function lifeOver(water: () => WaterView, version: () => number) {
    const told: string[] = [];
    const saved: string[] = [];
    const clock = { now: 1_000_000 };
    let seed = 7;
    const random = (): number => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x80000000;
    };
    const manager = new AquaticLifeManager(
        {
            getWam: () => wam,
            sendSubMessageToRoom: (message: SubToPusherRoomMessage): void => {
                told.push(plain(message));
            },
        },
        { getGrid: water, waterVersion: version },
        {
            roomUrl: "room",
            repository: {
                loadVariables: () => Promise.resolve({}),
                saveVariable: (_key: string, field: string, value: string) => {
                    saved.push(`${field}|${value}`);
                    return Promise.resolve(1);
                },
            },
        },
        () => clock.now,
        random,
        () => [{ x: 300, y: 300 }],
        () => MAP,
    );
    return {
        manager,
        told,
        saved,
        step: (): void => {
            manager.step();
            clock.now += 500;
        },
    };
}

describe("AquaticLifeManager, reading its places again only when the water crossed a depth they are read by", () => {
    it("lives the same life as when it read them again at each change of the water, and reads far less", () => {
        const grid = new WaterGrid(poolBasins(terrain, wam.settings?.pools), { x: 0, y: 0, ...MAP });
        let version = 0;
        const snapshot = WaterSnapshot.allocate(grid.bounds);
        const view = new WaterSnapshotView(snapshot);
        const reads = { before: { cells: 0 }, now: { cells: 0 }, copy: { cells: 0 } };
        const asBefore = alwaysCrossed(grid, reads.before);
        const asNow = counted(grid, reads.now);
        const onCopy = counted(view, reads.copy);
        const lives = {
            before: lifeOver(
                () => asBefore,
                () => version,
            ),
            now: lifeOver(
                () => asNow,
                () => version,
            ),
            // As a room reads the water computed on another thread: a copy, refreshed when it is asked for.
            copy: lifeOver(
                () => {
                    view.refresh();
                    return onCopy;
                },
                () => {
                    view.refresh();
                    return view.version();
                },
            ),
        };
        const readsAt: Record<string, number>[] = [];
        for (let step = 0; step < 900; step++) {
            // A flood that rises (the door closing on the way), goes down, then a water that settled.
            if (step === 60) grid.setClosedDoors(door);
            if (step === 180) grid.setClosedDoors(undefined);
            if (step < 420) grid.step(step < 220 ? rising : falling);
            // Then a water that changes at each step without any cell crossing a depth the life reads its places
            // by: a drop of rain in the middle of the lake.
            else grid.rainOn(12, 16, 0, 0.0001);
            // And a sheet of water on flat ground that crosses one depth at a time: the film one drinks at, then
            // the depth a fish needs, then the depth a dolphin needs.
            if (step === 520) sheet(grid, 3);
            if (step === 620) sheet(grid, 6);
            if (step === 720) sheet(grid, 8);

            version++;
            grid.publish(snapshot, version);
            if (step % 5 === 0) {
                for (const life of Object.values(lives)) life.step();
                // The places each life holds are those the life of before holds: body by body, shore by shore.
                const places = placesOf(lives.before.manager);
                expect(placesOf(lives.now.manager), `places at step ${step}`).toEqual(places);
                expect(placesOf(lives.copy.manager), `places of the copy at step ${step}`).toEqual(places);
            }
            if (step === 419 || step === 899) {
                readsAt.push({ before: reads.before.cells, now: reads.now.cells, copy: reads.copy.cells });
            }
        }
        // The life happened: animals were told, and saved.
        expect(lives.before.told.length).toBeGreaterThan(20);
        expect(lives.before.told.join("").length).toBeGreaterThan(5000);
        // The same life, message for message and save for save, on the water and on its copy.
        expect(lives.now.told).toEqual(lives.before.told);
        expect(lives.now.saved).toEqual(lives.before.saved);
        expect(lives.copy.told).toEqual(lives.before.told);
        expect(lives.copy.saved).toEqual(lives.before.saved);
        // While the flood moved, the bodies were read again about as often; once the water settled, no more.
        const [flood, end] = readsAt;
        expect(flood.before).toBeGreaterThan(30);
        expect(end.before - flood.before).toBeGreaterThan(40);
        // (But for what the last steps of the flood crossed, and the two times the sheet crossed a depth one swims
        // at: not when it crossed the film, which the land alone is read by.)
        expect(end.now - flood.now).toBeLessThanOrEqual(3);
        expect(end.copy - flood.copy).toBeLessThanOrEqual(3);
        expect(flood.now).toBeLessThanOrEqual(flood.before);
    }, 120_000);

    it("reads the bodies of water again when a door closes or opens, though no depth is crossed", () => {
        // Still water in the lake, the pond and the channel between them; dry land around.
        const grid = new WaterGrid(poolBasins(terrain, wam.settings?.pools), { x: 0, y: 0, ...MAP });
        for (const key of heights.keys()) {
            const [x, y] = key.split(",").map(Number);
            grid.rainOn(x, y, 0, 20);
        }
        let version = 0;
        const reads = { before: { cells: 0 }, now: { cells: 0 } };
        const asBefore = alwaysCrossed(grid, reads.before);
        const asNow = counted(grid, reads.now);
        const lives = {
            before: lifeOver(
                () => asBefore,
                () => version,
            ),
            now: lifeOver(
                () => asNow,
                () => version,
            ),
        };
        const bodies: number[] = [];
        for (let step = 0; step < 60; step++) {
            // The door of the channel closes, then opens: the lake and the pond are two bodies, then one again.
            if (step === 20) grid.setClosedDoors(door);
            if (step === 40) grid.setClosedDoors(undefined);
            // The water changes at each step, without crossing any depth.
            grid.rainOn(12, 16, 0, 0.0001);
            version++;
            for (const life of Object.values(lives)) life.step();
            expect(placesOf(lives.now.manager), `places at step ${step}`).toEqual(placesOf(lives.before.manager));
            bodies.push(placesOf(lives.now.manager)[0] - 1);
        }
        expect(bodies[10]).toBe(1);
        expect(bodies[30]).toBe(2);
        expect(bodies[55]).toBe(1);
        expect(lives.now.told).toEqual(lives.before.told);
        // Read at the start, when the door closed and when it opened; the life of before read them thirty times.
        expect(reads.now.cells).toBe(3);
        expect(reads.before.cells).toBeGreaterThan(25);
    });
});
