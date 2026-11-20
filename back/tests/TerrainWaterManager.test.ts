import { gunzipSync } from "node:zlib";
import { cellKey, CELL_LITRES_PER_PX, WeatherType, withHeights } from "@workadventure/map-editor";
import type { TerrainData, WAMFileFormat } from "@workadventure/map-editor";
import type { SubToPusherRoomMessage, TerrainWaterMessage } from "@workadventure/messages";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TerrainWaterManager } from "../src/Model/TerrainWaterManager";
import type { VariablesRepositoryInterface } from "../src/Services/Repository/VariablesRepositoryInterface";

const terrainOf = (cells: [number, number, number][]): TerrainData =>
    withHeights(undefined, new Map(cells.map(([x, y, height]) => [cellKey(x, y), height])));
// A hollow of 3 × 3 cells, one tile deep.
const hollow: [number, number, number][] = [];
for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) hollow.push([x, y, -32]);
const lake = terrainOf(hollow);
// A hollow of 30 × 30 cells, wide enough for the crater and the ring of a meteor.
const widePool: [number, number, number][] = [];
for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) widePool.push([x, y, -32]);
const wideLake = terrainOf(widePool);
/** Fills every cell of the grid with 8 px of water. */
const fillWithWater = (manager: TerrainWaterManager): void => {
    const grid = manager.getGrid();
    if (!grid) throw new Error("no grid");
    const bytes = new Uint8Array(grid.writeDepths().length);
    for (let index = 0; index < bytes.length; index += 2) bytes[index] = 64;
    grid.readDepths(bytes);
};
const prefabRef = { collectionName: "eau", id: "x" };
const sourceAt = (x: number, y: number, flow: number) => ({
    x: x * 16 + 8,
    y: y * 16 + 8,
    prefabRef,
    properties: [{ id: "s", type: "waterSourcePropertyData" as const, flow }],
});

function wamWith(terrain: TerrainData | undefined, weather: WeatherType = WeatherType.Clear): WAMFileFormat {
    return {
        version: "2.1.0",
        mapUrl: "map.tmj",
        areas: [],
        entityCollections: [],
        entities: {},
        settings: {
            weather,
            water: { runoff: 10, evaporation: 0, speed: 1, absorption: 0, current: 1, maxSurface: 18, indoorDrain: 0 },
        },
        terrain,
    };
}

function createHarness({
    wam = wamWith(lake),
    saved = {},
    failingStore = false,
    mapSize = () => undefined,
}: {
    wam?: WAMFileFormat;
    saved?: Record<string, string>;
    failingStore?: boolean;
    mapSize?: () => { width: number; height: number } | undefined;
} = {}) {
    const sent: TerrainWaterMessage[] = [];
    const repository = {
        loadVariables: vi.fn((_roomUrl: string) =>
            failingStore ? Promise.reject(new Error("down")) : Promise.resolve(saved),
        ),
        saveVariable: vi.fn((_roomUrl: string, _key: string, _value: string) =>
            failingStore ? Promise.reject(new Error("down")) : Promise.resolve(1),
        ),
    } satisfies VariablesRepositoryInterface;
    const rain = { slotsFor: vi.fn(() => undefined) };
    const room = {
        getWam: () => wam,
        sendSubMessageToRoom: (message: SubToPusherRoomMessage): void => {
            if (message.message?.$case === "terrainWaterMessage") sent.push(message.message.terrainWaterMessage);
        },
    };
    const manager = new TerrainWaterManager(
        room,
        rain,
        { repository, roomUrl: "room" },
        () => Date.UTC(2026, 6, 14, 12),
        mapSize,
    );
    const steps = (count: number): void => {
        for (let step = 0; step < count; step++) manager.step();
    };
    return { manager, wam, sent, repository, rain, steps };
}

/** The depths (pixels of water, cell by cell) a browser has after these messages, applied in order. */
function depthsAfter(messages: readonly TerrainWaterMessage[]): {
    bytes: Uint8Array;
    at(x: number, y: number): number;
} {
    let bytes = new Uint8Array(0);
    let last: TerrainWaterMessage | undefined;
    for (const message of messages) {
        const data = new Uint8Array(gunzipSync(message.depths));
        if (message.full) bytes = data;
        else bytes = bytes.map((byte, index) => byte ^ data[index]);
        last = message;
    }
    return {
        bytes,
        at: (x: number, y: number): number => {
            if (!last) return 0;
            const index = (y - last.y) * last.width + (x - last.x);
            return (bytes[index * 2] | (bytes[index * 2 + 1] << 8)) / 8;
        },
    };
}

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe("TerrainWaterManager", () => {
    // A map without relief nor water object must cost nothing.
    it("arms no timer and reads nothing on a map without relief", () => {
        vi.useFakeTimers();
        const { manager, rain, repository, sent, wam } = createHarness({ wam: wamWith(undefined, WeatherType.Real) });
        manager.start();
        expect(vi.getTimerCount()).toBe(0);
        manager.step();
        expect(rain.slotsFor).not.toHaveBeenCalled();
        expect(repository.saveVariable).not.toHaveBeenCalled();
        expect(sent).toHaveLength(0);
        expect(manager.snapshot()).toBeUndefined();
        // Dug later: the timer starts; filled in again: it stops.
        wam.terrain = lake;
        manager.mapChanged();
        expect(vi.getTimerCount()).toBe(1);
        wam.terrain = undefined;
        manager.mapChanged();
        expect(vi.getTimerCount()).toBe(0);
        wam.terrain = lake;
        manager.mapChanged();
        manager.stop();
        expect(vi.getTimerCount()).toBe(0);
    });

    it("a strike moves the water, counts what it brings and tells the room at once", () => {
        const { manager, sent } = createHarness({ wam: wamWith(wideLake) });
        manager.mapChanged();
        fillWithWater(manager);
        manager.strike(240, 240, 4);
        expect(manager.getGrid()?.depthAt(15, 15)).toBe(0);
        expect(sent).toHaveLength(1);
        expect(sent[0].stats?.sources).toBeGreaterThan(0);
    });

    it("the wave of a strike goes on step after step, and the room sees it five times a second", () => {
        const { manager, sent, steps } = createHarness({ wam: wamWith(wideLake) });
        manager.mapChanged();
        fillWithWater(manager);
        manager.strike(240, 240, 4);
        const afterImpact = sent.length;
        steps(4);
        expect(sent.length - afterImpact).toBe(2);
        // Long after the wave ended, the room is told once a second again.
        steps(60);
        const settled = sent.length;
        steps(10);
        expect(sent.length - settled).toBeLessThanOrEqual(1);
    });

    it("a wave whose map loses its water ends without a word", () => {
        const { manager, wam, sent, steps } = createHarness({ wam: wamWith(wideLake) });
        manager.mapChanged();
        fillWithWater(manager);
        manager.strike(240, 240, 4);
        const afterImpact = sent.length;
        wam.terrain = undefined;
        manager.mapChanged();
        expect(() => steps(20)).not.toThrow();
        expect(sent.length).toBe(afterImpact);
    });

    it("lets the water stand as high as the map says", () => {
        const { manager, wam, steps } = createHarness({ wam: wamWith(wideLake) });
        manager.mapChanged();
        expect(manager.getGrid()?.maxSurface()).toBe(18);
        if (!wam.settings?.water) throw new Error("no water settings");
        wam.settings.water.maxSurface = 120;
        steps(1);
        expect(manager.getGrid()?.maxSurface()).toBe(120);
    });

    it("a drain empties the square under it step after step, counted with the sinks, and the room sees it often", () => {
        const { manager, sent, steps } = createHarness({ wam: wamWith(wideLake) });
        manager.mapChanged();
        fillWithWater(manager);
        // The tile of the point is (7, 7): the square is the tiles 5 to 9, the cells 10 to 19.
        manager.setDrains(() => [{ id: 1, x: 240, y: 240 }]);
        sent.length = 0;
        steps(1);
        // A step of a tenth of a second at 256 px a second: up to 25.6 px gone from each cell of the square.
        expect(manager.getGrid()?.depthAt(15, 15)).toBeLessThan(2);
        expect(manager.getGrid()?.depthAt(28, 28)).toBeGreaterThan(7.5);
        steps(9);
        expect(manager.getGrid()?.depthAt(15, 15)).toBeLessThan(1);
        expect(sent.length).toBeGreaterThanOrEqual(5);
        expect(sent.at(-1)?.stats?.sinks).toBeGreaterThan(0);
    });

    it("a drain on a map without water does nothing", () => {
        const { manager, steps } = createHarness({ wam: wamWith(undefined) });
        manager.mapChanged();
        manager.setDrains(() => [{ id: 1, x: 240, y: 240 }]);
        expect(() => steps(3)).not.toThrow();
    });

    it("a downpour fills the cells under it step after step, counted with the rain, and the room sees it often", () => {
        const { manager, sent, steps } = createHarness({ wam: wamWith(wideLake) });
        manager.mapChanged();
        manager.setDownpours(() => [{ id: 1, x: 240, y: 240, radiusTiles: 2, wholeMap: false }]);
        steps(10);
        const grid = manager.getGrid();
        // Ten steps of a tenth of a second at 4 px a second, less what ran to the dry cells around.
        expect(grid?.depthAt(15, 15)).toBeGreaterThan(1);
        expect(grid?.depthAt(15, 15)).toBeLessThanOrEqual(4);
        expect(grid?.depthAt(29, 29)).toBeLessThan(0.5);
        expect(sent.length).toBeGreaterThanOrEqual(5);
        expect(sent.at(-1)?.stats?.rain).toBeGreaterThan(0);
    });

    it("a downpour goes on raining while the wave of a meteor runs", () => {
        const { manager, sent, steps } = createHarness({ wam: wamWith(wideLake) });
        manager.mapChanged();
        fillWithWater(manager);
        manager.strike(240, 240, 4);
        manager.setDownpours(() => [{ id: 1, x: 40, y: 40, radiusTiles: 1, wholeMap: false }]);
        sent.length = 0;
        steps(4);
        expect(sent.some((message) => (message.stats?.rain ?? 0) > 0)).toBe(true);
    });

    it("a downpour on the whole map rains on every cell, and nothing falls once it ended", () => {
        const { manager, steps } = createHarness({ wam: wamWith(wideLake) });
        manager.mapChanged();
        let falling = true;
        manager.setDownpours(() => (falling ? [{ id: 1, x: 0, y: 0, radiusTiles: 1, wholeMap: true }] : []));
        steps(10);
        const after = manager.getGrid()?.totalPx() ?? 0;
        expect(manager.getGrid()?.depthAt(29, 29)).toBeGreaterThan(1);
        falling = false;
        steps(10);
        expect(manager.getGrid()?.totalPx() ?? 0).toBeLessThanOrEqual(after);
    });

    it("a fireball boils away the water of its crater, counted as lost, without a wave, and tells the room", () => {
        const { manager, sent, steps } = createHarness({ wam: wamWith(wideLake) });
        manager.mapChanged();
        fillWithWater(manager);
        sent.length = 0;
        manager.vaporise(240, 240, 4);
        expect(manager.getGrid()?.depthAt(15, 15)).toBe(0);
        // Nothing is thrown out: the water around the crater is what it was.
        expect(manager.getGrid()?.depthAt(28, 28)).toBe(8);
        expect(sent).toHaveLength(1);
        expect(sent[0].stats?.lost).toBeGreaterThan(0);
        expect(sent[0].stats?.sources).toBe(0);
        // No wave runs after it: the room is not told five times a second.
        sent.length = 0;
        steps(5);
        expect(sent.length).toBeLessThan(5);
    });

    it("a fireball on a map without water does nothing", () => {
        const { manager, sent } = createHarness({ wam: wamWith(undefined) });
        manager.mapChanged();
        expect(() => manager.vaporise(240, 240, 4)).not.toThrow();
        expect(sent).toEqual([]);
    });

    it("a strike on a map without water does nothing", () => {
        const { manager, sent } = createHarness({ wam: wamWith(undefined) });
        manager.mapChanged();
        manager.strike(24, 24, 4);
        expect(sent).toHaveLength(0);
    });

    it("a strike reads the grid of the moment", () => {
        const { manager, wam, sent } = createHarness({ wam: wamWith(wideLake) });
        manager.mapChanged();
        fillWithWater(manager);
        wam.terrain = undefined;
        manager.mapChanged();
        manager.strike(240, 240, 4);
        expect(sent).toHaveLength(0);
    });

    it("pours a source at its foot and tells the room once a second, the whole state first", () => {
        const { manager, wam, sent, steps } = createHarness();
        // 600 litres a minute: 36 m³ an hour.
        wam.entities.spring = sourceAt(1, 1, 600);
        manager.mapChanged();
        steps(9);
        expect(sent).toHaveLength(0);
        steps(1);
        expect(sent).toHaveLength(1);
        expect(sent[0].full).toBe(true);
        expect(sent[0].stats?.sources).toBeCloseTo(36, 3);
        expect(sent[0].stats?.rain).toBe(0);
        // One second of it: 10 litres on the map.
        expect(sent[0].stats?.stock).toBeCloseTo(0.01, 4);
        expect(sent[0].stats?.wetArea).toBeGreaterThan(0);
        expect(depthsAfter(sent).at(1, 1)).toBeGreaterThan(0);
        expect(depthsAfter(sent).at(40, 40)).toBe(0);
    });

    it("then sends only what changed, in order, and a browser that applies it has the water of the server", () => {
        const { manager, wam, sent, steps } = createHarness();
        wam.entities.spring = sourceAt(1, 1, 6000);
        manager.mapChanged();
        steps(50);
        expect(sent).toHaveLength(5);
        expect(sent.slice(1).every((message) => !message.full)).toBe(true);
        expect(sent.map((message) => message.seq)).toEqual([1, 2, 3, 4, 5]);
        const seen = depthsAfter(sent);
        // 5 seconds at 100 litres a second: 500 litres, within the rounding of the bytes.
        let litres = 0;
        for (let index = 0; index < seen.bytes.length; index += 2) {
            litres += ((seen.bytes[index] | (seen.bytes[index + 1] << 8)) / 8) * CELL_LITRES_PER_PX;
        }
        expect(litres).toBeGreaterThan(480);
        expect(litres).toBeLessThan(520);
        expect(sent[4].stats?.stock).toBeCloseTo(0.5, 2);
    });

    it("gives a player who joins the state the room was last told", () => {
        const { manager, wam, sent, steps } = createHarness();
        wam.entities.spring = sourceAt(1, 1, 6000);
        manager.mapChanged();
        steps(37);
        const snapshot = manager.snapshot();
        expect(snapshot?.full).toBe(true);
        expect(snapshot?.seq).toBe(3);
        expect(depthsAfter(snapshot ? [snapshot] : []).bytes).toEqual(depthsAfter(sent).bytes);
        // The next change applies on top of it.
        steps(3);
        expect(depthsAfter(snapshot ? [snapshot, sent[3]] : []).bytes).toEqual(depthsAfter(sent).bytes);
    });

    it("says nothing once the water is at rest and nothing comes in", () => {
        const { manager, wam, sent, steps } = createHarness();
        wam.entities.spring = sourceAt(1, 1, 6000);
        manager.mapChanged();
        steps(20);
        delete wam.entities.spring;
        manager.mapChanged();
        steps(600);
        const told = sent.length;
        // The last message tells the rates are back to nothing.
        expect(sent[told - 1].stats?.sources).toBe(0);
        steps(300);
        expect(sent).toHaveLength(told);
    });

    it("fills the hollows with the rain of the map, and counts it", () => {
        const { manager, sent, steps } = createHarness({ wam: wamWith(lake, WeatherType.Rain) });
        manager.mapChanged();
        steps(10);
        // A fixed rain is 2 mm an hour: on 9 cells of 0.3 m², times 11 with the runoff: 59.4 litres an hour.
        expect(sent[0].stats?.rainRate).toBe(2);
        expect(sent[0].stats?.rain).toBeCloseTo(0.0594, 4);
        expect(depthsAfter(sent).at(1, 1)).toBeGreaterThanOrEqual(0);
        expect(sent[0].stats?.stock).toBeGreaterThan(0);
    });

    // A relief edited under the water keeps it where it was.
    it("keeps the water where it was when the relief changes, and tells the room the whole state again", () => {
        const { manager, wam, sent, steps } = createHarness();
        wam.entities.spring = sourceAt(1, 1, 6000);
        manager.mapChanged();
        steps(30);
        delete wam.entities.spring;
        const before = depthsAfter(sent).at(1, 1);
        expect(before).toBeGreaterThan(0);
        // Dug further away: the grid grows.
        wam.terrain = terrainOf([...hollow, [30, 1, -8]]);
        manager.mapChanged();
        steps(10);
        const last = sent[sent.length - 1];
        expect(last.full).toBe(true);
        expect(depthsAfter([last]).at(1, 1)).toBeGreaterThan(before / 2);
        // Three seconds at 100 litres a second: 0.3 m³, all of it still there.
        expect(last.stats?.stock).toBeCloseTo(0.3, 2);
    });

    it("keeps its water inside the map: nothing is simulated past its edges, nor for a relief dug outside", () => {
        const map: { size?: { width: number; height: number } } = {};
        const wam = wamWith(terrainOf([...hollow, [500, 2, -32]]));
        wam.entities.spring = sourceAt(1, 1, 6000);
        const { manager, sent, steps } = createHarness({ wam, mapSize: () => map.size });
        const told = (): TerrainWaterMessage | undefined => {
            manager.mapChanged();
            steps(10);
            return sent.at(-1);
        };
        manager.start();
        // The size of the map is not read yet: the grid covers all the relief.
        const before = told();
        expect((before?.x ?? 0) + (before?.width ?? 0)).toBeGreaterThan(500);

        map.size = { width: 60, height: 40 };
        const inside = told();
        expect(inside?.full).toBe(true);
        expect(inside?.x).toBe(0);
        expect(inside?.y).toBe(0);
        expect((inside?.x ?? 0) + (inside?.width ?? 0)).toBeLessThanOrEqual(60);
        expect((inside?.y ?? 0) + (inside?.height ?? 0)).toBeLessThanOrEqual(40);
        // The water poured before the size was read is still in its hollow.
        expect(depthsAfter(sent).at(1, 1)).toBeGreaterThan(0);

        // A size that could not be read (empty) dries nothing: the grid is the one of a map of unknown size.
        map.size = { width: 0, height: 0 };
        expect(told()?.width).toBe(before?.width);
    });

    it("saves the water and brings it back after a restart", async () => {
        const first = createHarness();
        first.wam.entities.spring = sourceAt(1, 1, 6000);
        first.manager.mapChanged();
        first.steps(320);
        const fields = Object.fromEntries(
            first.repository.saveVariable.mock.calls.map(([, field, value]): [string, string] => [field, value]),
        );
        expect(first.repository.saveVariable.mock.calls[0][0]).toBe("terrain-water:room");
        expect(Object.keys(fields).sort()).toEqual(["bounds", "grid"]);

        const second = createHarness({ saved: fields });
        await second.manager.restore();
        second.manager.mapChanged();
        second.steps(10);
        // What was saved at the 300th step (30 seconds at 100 litres a second: 3 m³) is there again; the first map
        // went on two seconds more.
        expect(second.sent[0].stats?.stock).toBeCloseTo(3, 1);
        expect(second.sent[0].stats?.stock).toBeLessThan(first.sent[first.sent.length - 1].stats?.stock ?? 0);
    });

    it("ignores broken saved water and a store that does not answer", async () => {
        const broken = createHarness({ saved: { grid: "not a grid", bounds: "{" } });
        await broken.manager.restore();
        broken.manager.mapChanged();
        broken.steps(10);
        expect(broken.sent).toHaveLength(0);
        const flowing = wamWith(lake);
        flowing.entities.spring = sourceAt(1, 1, 6000);
        const down = createHarness({ wam: flowing, failingStore: true });
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        await expect(down.manager.restore()).resolves.toBeUndefined();
        down.manager.mapChanged();
        expect(() => down.steps(320)).not.toThrow();
        expect(down.sent.length).toBeGreaterThan(0);
    });

    it("holds the water behind a wall of the map tool, and follows a wall built later, keeping the water", () => {
        // A source on flat ground at the cell (4, 4); a wall along the foot of the tile row 3 (cells 6 and 7).
        const wam = wamWith(undefined);
        wam.settings = {
            weather: WeatherType.Clear,
            water: { runoff: 0, evaporation: 0, speed: 60, absorption: 0, current: 1, maxSurface: 18, indoorDrain: 0 },
        };
        wam.entities = { spring: sourceAt(4, 4, 600) };
        const wallPiece = (column: number) => ({
            x: column * 32,
            y: 96,
            prefabRef: { collectionName: "Carte Murs", id: "Carte Murs:facade-blanc-mid:Default:Down" },
        });
        const { manager, sent, steps } = createHarness({ wam });
        manager.start();
        steps(100);
        const before = depthsAfter(sent);
        // No wall yet: the water went south of the row 7.
        expect(before.at(4, 9)).toBeGreaterThan(0);
        // A long wall under the source, built while the water is there.
        for (let column = -30; column < 30; column++) wam.entities[`wall${column}`] = wallPiece(column);
        manager.mapChanged();
        steps(10);
        const after = depthsAfter(sent);
        // The water is still there, and the room was told the whole state again.
        expect(after.at(4, 4)).toBeGreaterThan(0);
        expect(sent[sent.length - 1].full).toBe(true);
        manager.stop();
        // From a dry map with the wall, nothing ever reaches the other side.
        const walled = createHarness({ wam: { ...wam } });
        walled.manager.start();
        walled.steps(200);
        const held = depthsAfter(walled.sent);
        expect(held.at(4, 7)).toBeGreaterThan(0);
        expect(held.at(4, 8)).toBe(0);
        expect(held.at(4, 12)).toBe(0);
        walled.manager.stop();
    });

    it("drains the floor of a room closed by walls, at the pace the map sets", () => {
        // A room of the map tool over the tiles 2 to 5 (cells 4 to 11), a source in its middle.
        const facade = (column: number, row: number) => ({
            x: column * 32,
            y: row * 32,
            prefabRef: { collectionName: "Carte Murs", id: "Carte Murs:facade-blanc-mid:Default:Down" },
        });
        const vertical = (line: number, row: number) => ({
            x: line * 32 - 6,
            y: (row - 1) * 32 + 12,
            prefabRef: { collectionName: "Carte Murs", id: "Carte Murs:mur-vertical-blanc:Default:Down" },
        });
        const roomWith = (indoorDrain: number): WAMFileFormat => {
            const wam = wamWith(undefined);
            wam.settings = {
                weather: WeatherType.Clear,
                water: { runoff: 0, evaporation: 0, speed: 60, absorption: 0, current: 1, maxSurface: 18, indoorDrain },
            };
            wam.entities = { spring: sourceAt(7, 7, 60) };
            for (let tile = 2; tile <= 5; tile++) {
                wam.entities[`top${tile}`] = facade(tile, 1);
                wam.entities[`bottom${tile}`] = facade(tile, 5);
                wam.entities[`left${tile}`] = vertical(2, tile);
                wam.entities[`right${tile}`] = vertical(6, tile);
            }
            return wam;
        };
        const waterInRoom = (indoorDrain: number): number => {
            const { manager, sent, steps } = createHarness({ wam: roomWith(indoorDrain) });
            manager.start();
            steps(300);
            manager.stop();
            const depths = depthsAfter(sent);
            let total = 0;
            for (let y = 4; y <= 11; y++) for (let x = 4; x <= 11; x++) total += depths.at(x, y);
            // The walls hold it: nothing outside.
            expect(depths.at(2, 7) + depths.at(13, 7) + depths.at(7, 2) + depths.at(7, 13)).toBe(0);
            return total;
        };
        const kept = waterInRoom(0);
        expect(kept).toBeGreaterThan(50);
        expect(waterInRoom(3000)).toBeLessThan(kept / 20);
    });

    // A step runs in a timer: an error there would otherwise take the whole server down, with every room.
    it("stops the water of the room, without throwing, when a step fails", () => {
        vi.useFakeTimers();
        const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
        try {
            const { manager, rain } = createHarness({ wam: wamWith(lake, WeatherType.Real) });
            manager.start();
            rain.slotsFor.mockImplementation(() => {
                throw new Error("broken");
            });
            expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
            expect(error).toHaveBeenCalledTimes(1);
            expect(vi.getTimerCount()).toBe(0);
            manager.stop();
        } finally {
            error.mockRestore();
            vi.useRealTimers();
        }
    });

    it("asks the real rain of the place of a map in real weather", () => {
        const wam = wamWith(lake, WeatherType.Real);
        const place = { name: "Jakarta", latitude: -6.2, longitude: 106.85 };
        wam.settings = { ...wam.settings, weatherLocation: place };
        const { manager, rain, steps } = createHarness({ wam });
        manager.mapChanged();
        steps(10);
        expect(rain.slotsFor).toHaveBeenCalledWith(place);
    });
});
