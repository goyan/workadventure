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
        settings: { weather, water: { runoff: 10, evaporation: 0, speed: 1, absorption: 0, current: 1 } },
        terrain,
    };
}

function createHarness({
    wam = wamWith(lake),
    saved = {},
    failingStore = false,
}: { wam?: WAMFileFormat; saved?: Record<string, string>; failingStore?: boolean } = {}) {
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
    const manager = new TerrainWaterManager(room, rain, { repository, roomUrl: "room" }, () =>
        Date.UTC(2026, 6, 14, 12),
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
            water: { runoff: 0, evaporation: 0, speed: 60, absorption: 0, current: 1 },
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
