import { gunzipSync } from "node:zlib";
import {
    cellKey,
    CELL_LITRES_PER_PX,
    DEFAULT_POOL_STYLE,
    DEFAULT_WATER_SETTINGS,
    POOL_FREEBOARD_PX,
    poolSoilCode,
    PX_PER_MM,
    WeatherType,
    withHeights,
    withSoils,
} from "@workadventure/map-editor";
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
/** Fills the wide hollow alone with 8 px of water: none on the ground around, so none runs off the map. */
const fillWideLake = (manager: TerrainWaterManager): void => {
    const grid = manager.getGrid();
    if (!grid) throw new Error("no grid");
    const bytes = new Uint8Array(grid.writeDepths().length);
    for (let y = 0; y < 30; y++) {
        for (let x = 0; x < 30; x++) bytes[((y - grid.bounds.y) * grid.bounds.width + (x - grid.bounds.x)) * 2] = 64;
    }
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
            // The blast of an impact has its own tests: here a meteor moves the water of its crater alone.
            water: {
                runoff: 10,
                evaporation: 0,
                speed: 1,
                absorption: 0,
                current: 1,
                maxSurface: 18,
                indoorDrain: 0,
                impactReach: 1,
            },
        },
        terrain,
    };
}

function createHarness({
    wam = wamWith(lake),
    saved = {},
    failingStore = false,
    mapSize = () => undefined,
    clock,
}: {
    /** A clock in ms to time the steps with; the real one when none is given. */
    clock?: () => number;
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
        clock,
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

    it("a strike on a water with inertia throws a rim around its crater, and the room sees the real wave five times a second", () => {
        const wam = wamWith(wideLake);
        if (wam.settings?.water) wam.settings.water.inertia = true;
        const { manager, sent, steps } = createHarness({ wam });
        manager.mapChanged();
        fillWithWater(manager);
        manager.strike(240, 240, 4);
        // The crater (8 cells around the cell 15, 15) is empty, the rim next to it stands over the water around.
        expect(manager.getGrid()?.depthAt(15, 15)).toBe(0);
        expect(manager.getGrid()?.depthAt(15 + 10, 15)).toBeGreaterThan(8);
        expect(sent[0].stats?.sources).toBeGreaterThan(0);
        const afterImpact = sent.length;
        steps(4);
        expect(sent.length - afterImpact).toBe(2);
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

    it("a drain empties the disc under it step after step, faster in its middle, counted with the sinks", () => {
        const { manager, sent, steps } = createHarness({ wam: wamWith(wideLake) });
        manager.mapChanged();
        fillWithWater(manager);
        // The point is the cell (15, 15); a radius of 3 tiles is 6 cells.
        manager.setDrains(() => [{ id: 1, x: 240, y: 240, radiusTiles: 3 }]);
        sent.length = 0;
        steps(1);
        // A step of a tenth of a second: 25.6 px gone in the middle, 12.8 at the rim, more than the 8 px there are.
        expect(manager.getGrid()?.depthAt(15, 15)).toBeLessThan(2);
        expect(manager.getGrid()?.depthAt(28, 28)).toBeGreaterThan(7.5);
        // The corner of the square around the disc is not in it.
        expect(manager.getGrid()?.depthAt(21, 21)).toBeGreaterThan(7.5);
        steps(9);
        expect(manager.getGrid()?.depthAt(15, 15)).toBeLessThan(1);
        expect(sent.length).toBeGreaterThanOrEqual(5);
        expect(sent.at(-1)?.stats?.sinks).toBeGreaterThan(0);
    });

    it("a ball takes the place of the water under it, and the map keeps all its water", () => {
        const { manager, sent, steps, repository } = createHarness({ wam: wamWith(wideLake) });
        manager.mapChanged();
        fillWideLake(manager);
        const grid = manager.getGrid();
        const before = grid?.totalPx() ?? 0;
        // The point is the cell (15, 15); a radius of 64 px is 4 cells. The lake is 32 px deep.
        manager.setBalls(() => [{ id: 1, x: 240, y: 240, radiusPx: 64 }]);
        sent.length = 0;
        steps(10);
        expect(grid?.ballAt(15, 15)).toBe(true);
        expect(grid?.depthAt(15, 15)).toBeLessThan(1);
        expect(grid?.totalPx()).toBeCloseTo(before, 1);
        // The room sees the water move as often as under a wave, and is told a stock that did not change.
        expect(sent.length).toBeGreaterThanOrEqual(5);
        const stock = sent.at(-1)?.stats?.stock ?? 0;
        expect(stock).toBeCloseTo((before * CELL_LITRES_PER_PX) / 1000, 1);
        expect(sent.every((message) => (message.stats?.lost ?? 0) === 0)).toBe(true);
        // The ball goes: the water comes back where it stood.
        manager.setBalls(() => []);
        steps(300);
        expect(grid?.ballAt(15, 15)).toBe(false);
        expect(grid?.depthAt(15, 15)).toBeGreaterThan(7);
        expect(grid?.totalPx()).toBeCloseTo(before, 1);
        expect(repository.saveVariable).toHaveBeenCalled();
    });

    it("takes a ball that moved since the last step along its way: it pushed the water of the whole way", () => {
        const { manager, steps } = createHarness({ wam: wamWith(wideLake) });
        manager.mapChanged();
        fillWideLake(manager);
        const grid = manager.getGrid();
        if (!grid) throw new Error("no grid");
        const before = grid.totalPx();
        let ball = { id: 1, x: 100, y: 240, radiusPx: 32 };
        manager.setBalls(() => [ball]);
        steps(1);
        const placed = vi.spyOn(grid, "setBalls");
        // Under the pointer at once: 200 px further at the next step.
        ball = { ...ball, x: 300 };
        steps(1);
        // 200 px: thirteen strides of a cell at most, the last one where the ball is.
        expect(placed).toHaveBeenCalledTimes(13);
        expect(placed.mock.calls.at(-1)?.[0]).toEqual([ball]);
        const first = placed.mock.calls[0][0][0];
        expect(first.x).toBeGreaterThan(100);
        expect(first.x).toBeLessThanOrEqual(116);
        expect(grid.totalPx()).toBeCloseTo(before, 1);
        // Gone at once: one go, no way to sweep.
        placed.mockClear();
        manager.setBalls(() => []);
        steps(1);
        expect(placed).toHaveBeenCalledTimes(1);
        expect(grid.ballAt(18, 15)).toBe(false);
    });

    it("saves the water a ball holds under itself", () => {
        // A hollow 96 px deep: a ball of 32 px of radius leaves 64 px of room under its middle.
        const deep: [number, number, number][] = [];
        for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) deep.push([x, y, -96]);
        const { manager, repository } = createHarness({ wam: wamWith(terrainOf(deep)) });
        manager.mapChanged();
        const grid = manager.getGrid();
        if (!grid) throw new Error("no grid");
        const bytes = new Uint8Array(grid.writeDepths().length);
        // 96 px of water in each cell: 768 eighths.
        for (let index = 0; index < bytes.length; index += 2) bytes[index + 1] = 3;
        grid.readDepths(bytes);
        manager.setBalls(() => [{ id: 1, x: 240, y: 240, radiusPx: 32 }]);
        manager.step();
        expect(grid.ballAt(15, 15)).toBe(true);
        manager.stop();
        const saved = repository.saveVariable.mock.calls.find(([, key]) => key === "grid")?.[2];
        if (!saved) throw new Error("nothing saved");
        const depths = new Uint8Array(gunzipSync(Buffer.from(saved, "base64")));
        const at = ((15 - grid.bounds.y) * grid.bounds.width + (15 - grid.bounds.x)) * 2;
        expect((depths[at] | (depths[at + 1] << 8)) / 8).toBeGreaterThan(60);
    });

    it("a ball on a map without water does nothing, and one that is no number neither", () => {
        const dry = createHarness({ wam: wamWith(undefined) });
        dry.manager.mapChanged();
        dry.manager.setBalls(() => [{ id: 1, x: 240, y: 240, radiusPx: 64 }]);
        expect(() => dry.steps(3)).not.toThrow();
        const { manager, steps } = createHarness({ wam: wamWith(wideLake) });
        manager.mapChanged();
        fillWideLake(manager);
        const before = manager.getGrid()?.totalPx();
        manager.setBalls(() => [{ id: 1, x: Number.NaN, y: 240, radiusPx: 64 }]);
        steps(3);
        expect(manager.getGrid()?.totalPx()).toBe(before);
        expect(manager.getGrid()?.ballAt(15, 15)).toBe(false);
    });

    it("a drain on a map without water does nothing", () => {
        const { manager, steps } = createHarness({ wam: wamWith(undefined) });
        manager.mapChanged();
        manager.setDrains(() => [{ id: 1, x: 240, y: 240, radiusTiles: 3 }]);
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

    it("a fireball blows the water around its crater outwards, as far as the map says", () => {
        const depthAfter = (impactReach: number | undefined): number | undefined => {
            const wam = wamWith(wideLake);
            wam.settings = {
                ...wam.settings,
                water: { ...DEFAULT_WATER_SETTINGS, ...wam.settings?.water, impactReach },
            };
            const { manager } = createHarness({ wam });
            manager.mapChanged();
            fillWithWater(manager);
            manager.vaporise(240, 240, 4);
            // Ten cells from the middle of a crater of eight.
            return manager.getGrid()?.depthAt(25, 15);
        };
        expect(depthAfter(1)).toBe(8);
        // The usual blast reaches 2.5 times the crater: five sixths of the water there are gone.
        expect(depthAfter(undefined)).toBeCloseTo(8 / 6, 1);
        // A blast that reaches four times the crater is stronger there: eleven twelfths are gone.
        expect(depthAfter(4)).toBeCloseTo(8 / 12, 1);
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

    it("tells the room how fast the water runs on a map whose water has inertia, and nothing of it otherwise", () => {
        const told = (inertia: boolean): TerrainWaterMessage => {
            const wam = wamWith(wideLake);
            if (wam.settings?.water) wam.settings.water.inertia = inertia;
            wam.entities.spring = sourceAt(15, 15, 600000);
            const { manager, sent, steps } = createHarness({ wam });
            manager.mapChanged();
            steps(20);
            return sent[sent.length - 1];
        };
        expect(told(false).speeds).toBeUndefined();
        const message = told(true);
        const speeds = new Uint8Array(gunzipSync(message.speeds ?? new Uint8Array()));
        // Two bytes a block of 4 cells a side over the whole grid, some of them moving.
        expect(speeds).toHaveLength(Math.ceil(message.width / 4) * Math.ceil(message.height / 4) * 2);
        expect(speeds.some((byte) => byte !== 0)).toBe(true);
    });

    it("tells the room as often as the map asks while the water moves", () => {
        const count = (updates?: number): number => {
            const wam = wamWith(wideLake);
            if (wam.settings?.water && updates !== undefined) wam.settings.water.updates = updates;
            wam.entities.spring = sourceAt(15, 15, 600000);
            const { manager, sent, steps } = createHarness({ wam });
            manager.mapChanged();
            steps(20);
            return sent.length;
        };
        // Two seconds: once a second for a map that says nothing, five and ten times for those that ask.
        expect(count()).toBe(2);
        expect(count(5)).toBe(10);
        expect(count(10)).toBe(20);
    });

    it("does not tell again a cell whose water barely changed, and puts it right at the next whole state", () => {
        const { manager, sent, steps } = createHarness({ wam: wamWith(wideLake) });
        manager.mapChanged();
        fillWithWater(manager);
        steps(10);
        const grid = manager.getGrid();
        if (!grid) throw new Error("no grid");
        // An eighth of a pixel more over one cell: under what is worth telling.
        const nudge = (eighths: number): void => {
            const bytes = grid.writeDepths();
            const index = (20 * grid.bounds.width + 20) * 2;
            bytes[index] += eighths;
            grid.readDepths(bytes);
        };
        // The room is first told what moved, then that nothing comes in or goes out any more.
        manager["tell"](grid);
        manager["tell"](grid);
        const before = depthsAfter(sent).at(grid.bounds.x + 20, grid.bounds.y + 20);
        nudge(1);
        const told = sent.length;
        manager["tell"](grid);
        expect(sent).toHaveLength(told);
        // Half a pixel more: told.
        nudge(4);
        manager["tell"](grid);
        expect(sent).toHaveLength(told + 1);
        expect(depthsAfter(sent).at(grid.bounds.x + 20, grid.bounds.y + 20)).toBeCloseTo(before + 5 / 8, 5);
    });

    it("holds the water at a closed door, opens it for an avatar in its passage, and closes it a second after", () => {
        const wam = wamWith(wideLake);
        // A vertical door on the wall line of the tile column 10, its leaves on the tile rows 6 and 7.
        for (const [id, name, y] of [
            ["top", "porte-v-gris-haut", 5 * 32 + 12],
            ["bottom", "porte-v-gris-bas", 6 * 32 + 12],
        ] as const) {
            wam.entities[id] = {
                x: 10 * 32 - 32,
                y,
                prefabRef: { collectionName: "Carte Portes", id: `Carte Portes:${name}:Default:Down` },
            } as (typeof wam.entities)[string];
        }
        const { manager, steps } = createHarness({ wam });
        let walkers: { x: number; y: number }[] = [];
        manager.setWalkers(() => walkers);
        manager.mapChanged();
        const crosses = (): boolean => manager.getGrid()?.canCross(19, 13, "east") ?? false;
        steps(1);
        expect(crosses()).toBe(false);
        // Someone stands in the doorway: the water goes through.
        walkers = [{ x: 10 * 32, y: 7 * 32 }];
        steps(1);
        expect(crosses()).toBe(true);
        // They walk away: the door stays open a second, then holds the water again.
        walkers = [{ x: 30 * 32, y: 7 * 32 }];
        steps(9);
        expect(crosses()).toBe(true);
        steps(2);
        expect(crosses()).toBe(false);
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

    it("lives again the time the room missed: the rain of the past fills its hollows, its dry days lower them", () => {
        const { manager, wam } = createHarness();
        manager.mapChanged();
        const grid = manager.getGrid();
        if (!grid) throw new Error("no grid");
        // Less than ten minutes missed waits for what comes after it, unless the meadow caught up.
        manager.liveAgain(120, 2, false);
        expect(grid.totalPx()).toBe(0);
        for (let slice = 0; slice < 30; slice++) manager.liveAgain(120, 2, slice === 29);
        const rained = grid.totalPx();
        expect(rained).toBeGreaterThan(0);
        if (wam.settings?.water) wam.settings.water.evaporation = 1;
        for (let slice = 0; slice < 30; slice++) manager.liveAgain(120, 0, slice === 29);
        expect(grid.totalPx()).toBeLessThan(rained);
    });

    it("fills nothing with a rain that falls as snow in the cold of the room, and half as much with a mix", () => {
        const rainOf = (air: { temperature: number; humidity: number } | undefined): number => {
            const { manager, sent, steps } = createHarness({ wam: wamWith(lake, WeatherType.Rain) });
            manager.fallThrough(() => air);
            manager.mapChanged();
            steps(10);
            manager.stop();
            return sent[0]?.stats?.rainRate ?? 0;
        };
        expect(rainOf(undefined)).toBe(2);
        expect(rainOf({ temperature: 20, humidity: 60 })).toBe(2);
        expect(rainOf({ temperature: -2, humidity: 80 })).toBe(0);
        // 1.2 °C in saturated air: a wet bulb of about 1 °C, half rain, half snow.
        const mixed = rainOf({ temperature: 1.2, humidity: 99 });
        expect(mixed).toBeGreaterThan(0.8);
        expect(mixed).toBeLessThan(1.2);
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

describe("the snow and the water of the relief", () => {
    it("a downpour that falls as snow in the cold of the room brings no water", () => {
        const { manager, steps } = createHarness({ wam: wamWith(wideLake) });
        manager.fallThrough(() => ({ temperature: -5, humidity: 50 }));
        manager.mapChanged();
        manager.setDownpours(() => [{ id: 1, x: 240, y: 240, radiusTiles: 2, wholeMap: false }]);
        steps(10);
        expect(manager.getGrid()?.depthAt(15, 15)).toBe(0);
        manager.stop();
    });

    it("pours the water of a melted snow on the four cells of its tile, counted with the rain", () => {
        const { manager, sent, steps } = createHarness({ wam: wamWith(wideLake) });
        manager.mapChanged();
        // The snow that makes a pixel of water.
        const mm = 1 / PX_PER_MM;
        expect(manager.pour(7, 7, mm)).toBeCloseTo(mm);
        const grid = manager.getGrid();
        for (const [x, y] of [
            [14, 14],
            [15, 14],
            [14, 15],
            [15, 15],
        ]) {
            expect(grid?.depthAt(x, y)).toBeCloseTo(1);
        }
        expect(manager.pour(5000, 5000, mm)).toBe(0);
        expect(manager.pour(7, 7, Number.NaN)).toBe(0);
        steps(10);
        expect(sent.at(-1)?.stats?.rain).toBeGreaterThan(0);
        manager.stop();
    });
});

describe("the pools of the map in the water of the relief", () => {
    /** A flat map with a pool of 6 × 4 cells at (20, 20), 48 px deep. */
    const poolCells: [string, number][] = [];
    for (let y = 20; y < 24; y++) for (let x = 20; x < 26; x++) poolCells.push([cellKey(x, y), poolSoilCode(0)]);
    const pooled = (): WAMFileFormat => {
        const wam = wamWith(withSoils(undefined, new Map(poolCells)));
        wam.settings = { ...wam.settings, pools: [DEFAULT_POOL_STYLE] };
        return wam;
    };
    const full = DEFAULT_POOL_STYLE.depthPx - POOL_FREEBOARD_PX;

    it("fills a pool by itself up to its rim in a few seconds, and nothing around it", () => {
        const { manager, sent, steps } = createHarness({ wam: pooled(), mapSize: () => ({ width: 60, height: 60 }) });
        manager.mapChanged();
        const grid = manager.getGrid();
        expect(grid).toBeDefined();
        expect(grid?.depthAt(22, 22)).toBe(0);
        // Half of the eight seconds: about half full.
        steps(40);
        expect(grid?.depthAt(22, 22)).toBeGreaterThan(full * 0.35);
        expect(grid?.depthAt(22, 22)).toBeLessThan(full * 0.65);
        steps(60);
        expect(grid?.depthAt(22, 22)).toBeCloseTo(full, 0);
        expect(grid?.depthAt(20, 20)).toBeCloseTo(full, 0);
        expect(grid?.depthAt(19, 22)).toBe(0);
        expect(grid?.depthAt(26, 22)).toBe(0);
        // Full, the pump stops: the water stays at its level.
        steps(50);
        expect(grid?.depthAt(22, 22)).toBeCloseTo(full, 0);
        // What the pump brought is counted with the sources.
        expect(sent.some((message) => (message.stats?.sources ?? 0) > 0)).toBe(true);
        manager.stop();
    });

    it("stops the pump of a pool where a ball stands: the ball is in the place of the water", () => {
        const { manager, sent, steps } = createHarness({ wam: pooled(), mapSize: () => ({ width: 60, height: 60 }) });
        manager.mapChanged();
        steps(120);
        const grid = manager.getGrid();
        const before = grid?.totalPx() ?? 0;
        // A ball as wide as the pool is long, in its middle: the cell (23, 22).
        manager.setBalls(() => [{ id: 1, x: 23 * 16, y: 22 * 16, radiusPx: 64 }]);
        sent.length = 0;
        steps(200);
        expect(grid?.ballAt(22, 22)).toBe(true);
        // The pump brought nothing more: the water the ball pushed out of the pool went over its rim instead.
        expect(sent.every((message) => (message.stats?.sources ?? 0) === 0)).toBe(true);
        expect(grid?.totalPx() ?? 0).toBeLessThanOrEqual(before + 0.01);
        manager.stop();
    });

    it("has a meteor that falls in a wide pool throw far more water out than its crater holds", () => {
        // A pool of 40 × 30 cells, a crater of 4 tiles (8 cells) in its middle.
        const wide: [string, number][] = [];
        for (let y = 10; y < 40; y++) for (let x = 10; x < 50; x++) wide.push([cellKey(x, y), poolSoilCode(0)]);
        const water = (reach: number | undefined): number => {
            const wam = wamWith(withSoils(undefined, new Map(wide)));
            wam.settings = {
                ...wam.settings,
                pools: [DEFAULT_POOL_STYLE],
                water: { ...DEFAULT_WATER_SETTINGS, ...wam.settings?.water, impactReach: reach },
            };
            const { manager } = createHarness({ wam, mapSize: () => ({ width: 80, height: 60 }) });
            manager.mapChanged();
            for (let step = 0; step < 120; step++) manager.step();
            manager.vaporise(30 * 16, 25 * 16, 4);
            const grid = manager.getGrid();
            let held = 0;
            for (const [key] of wide) {
                const [x, y] = key.split(",").map(Number);
                held += grid?.depthAt(x, y) ?? 0;
            }
            manager.stop();
            return held / (wide.length * full);
        };
        // The crater alone: a sixth of the water of the pool. The usual blast takes far more of it, a wider one more.
        const craterOnly = water(1);
        const usual = water(undefined);
        expect(craterOnly).toBeGreaterThan(0.75);
        expect(usual).toBeLessThan(craterOnly - 0.2);
        expect(usual).toBeLessThan(0.6);
        expect(water(4)).toBeLessThan(usual);
    });

    it("leaves a pool a meteor emptied empty for a moment: its pump takes three seconds to start again", () => {
        const { manager, steps } = createHarness({ wam: pooled(), mapSize: () => ({ width: 60, height: 60 }) });
        manager.mapChanged();
        steps(120);
        const grid = manager.getGrid();
        manager.vaporise(23 * 16, 22 * 16, 4);
        // Two seconds later it is still empty; then it fills as fast as before.
        steps(20);
        expect(grid?.depthAt(22, 22)).toBeLessThan(1);
        steps(10 + 40);
        expect(grid?.depthAt(22, 22)).toBeGreaterThan(full * 0.35);
        expect(grid?.depthAt(22, 22)).toBeLessThan(full * 0.65);
        manager.stop();
    });

    it("fills a pool again after it was emptied", () => {
        const { manager, steps } = createHarness({ wam: pooled(), mapSize: () => ({ width: 60, height: 60 }) });
        manager.mapChanged();
        steps(120);
        const grid = manager.getGrid();
        // A fireball boils its water away.
        manager.vaporise(23 * 16, 22 * 16, 4);
        expect(grid?.depthAt(22, 22)).toBeLessThan(1);
        steps(120);
        expect(grid?.depthAt(22, 22)).toBeCloseTo(full, 0);
        manager.stop();
    });

    it("lets the overflow of a pool take what comes over its level, counted with the sinks", () => {
        const { manager, sent, steps } = createHarness({ wam: pooled(), mapSize: () => ({ width: 60, height: 60 }) });
        manager.mapChanged();
        steps(120);
        const grid = manager.getGrid();
        // A snow melts in the pool: one more pixel of water on the two tiles of its west end.
        for (const tileY of [10, 11]) manager.pour(10, tileY, 1 / PX_PER_MM);
        expect(grid?.depthAt(20, 20)).toBeGreaterThan(full + 0.5);
        steps(60);
        expect(grid?.depthAt(20, 20)).toBeLessThan(full + 0.5);
        expect(grid?.depthAt(19, 20)).toBe(0);
        expect(sent.some((message) => (message.stats?.sinks ?? 0) > 0)).toBe(true);
        manager.stop();
    });

    it("keeps a map without relief nor pool without any water to step", () => {
        const { manager } = createHarness({ wam: wamWith(undefined), mapSize: () => ({ width: 60, height: 60 }) });
        manager.mapChanged();
        expect(manager.getGrid()).toBeUndefined();
        manager.stop();
    });

    it("lowers the fineness and says so while its steps take too long, and gives it back level by level once they are quick", () => {
        const wam = wamWith(wideLake);
        if (wam.settings?.water) Object.assign(wam.settings.water, { inertia: true, precision: 8, updates: 10 });
        // Each step reads the clock twice: `cost` ms go by between the two.
        let cost = 80;
        let time = 0;
        let reads = 0;
        const clock = (): number => {
            if (reads++ % 2 === 1) time += cost;
            return time;
        };
        const { manager, sent, steps } = createHarness({ wam, clock });
        manager.mapChanged();
        fillWithWater(manager);
        // A strike stirs the water: the room is told while it moves.
        manager.strike(240, 240, 4);
        steps(100);
        const slow = sent.at(-1)?.stats;
        expect(slow?.easedPrecision).toBeDefined();
        expect(slow?.easedPrecision).toBeLessThan(8);
        cost = 2;
        steps(600);
        manager.strike(240, 240, 4);
        steps(20);
        const quick = sent.at(-1)?.stats;
        // Given back a level every ten seconds: higher than it was, and the room told as often as the map asks.
        expect(quick?.easedPrecision ?? 8).toBeGreaterThan(slow?.easedPrecision ?? 8);
        expect(quick?.easedUpdates).toBeUndefined();
        // Seven hundred steps of a wide lake stirred at the finest: longer than the usual time of a test.
    }, 30_000);
});
