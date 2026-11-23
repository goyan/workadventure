import type { RealWeatherSlot, WAMFileFormat, WeatherLocation } from "@workadventure/map-editor";
import { CatastropheKind } from "@workadventure/messages";
import { describe, expect, it, vi } from "vitest";
import { LocalTerrainController } from "@wa/front/Phaser/Game/Terrain/LocalTerrainController";
import type { LocalTerrainPort, LocalTerrainScene } from "@wa/front/Phaser/Game/Terrain/LocalTerrainController";
import type { LocalTerrainCommand, LocalTerrainTold } from "@wa/front/Phaser/Game/Terrain/LocalTerrainSimulation";
import { TerrainWater } from "@wa/front/Phaser/Game/Terrain/TerrainWater";
import type { WaterState } from "@wa/front/Phaser/Game/Terrain/TerrainWater";

const RIO: WeatherLocation = { name: "Rio", latitude: -22.9, longitude: -43.2, timezone: "America/Sao_Paulo" };
const SLOTS: RealWeatherSlot[] = [{ at: 0, weather: null, temperature: 25 }];
const WAM = { version: "2.1.0", mapUrl: "map.tmj", areas: [], entityCollections: [], entities: {} } as WAMFileFormat;

/** A whole state of a water of 2 cells, `px` pixels deep in each. */
const stateOf = (px: number, seq: number): WaterState => ({
    x: 0,
    y: 0,
    width: 2,
    height: 1,
    seq,
    full: true,
    depths: Uint8Array.from([px * 8, 0, px * 8, 0]),
});
const meadowOf = (grass: number) => ({
    width: 1,
    height: 1,
    grass: Uint8Array.from([grass]),
    moisture: Uint8Array.from([0]),
});

function harness(open?: () => Promise<LocalTerrainPort>) {
    const posted: LocalTerrainCommand[] = [];
    const terminate = vi.fn();
    const showMeadow = vi.fn();
    const port: LocalTerrainPort = {
        postMessage: (command) => posted.push(command),
        terminate,
        onmessage: null,
    };
    let chosen: ReturnType<LocalTerrainScene["chosenPlace"]>;
    let fast: ReturnType<LocalTerrainScene["fastWater"]>;
    const water = new TerrainWater();
    const backToShared = vi.fn();
    const scene: LocalTerrainScene = {
        chosenPlace: () => chosen,
        fastWater: () => fast,
        backToSharedWater: backToShared,
        map: () => ({ wam: WAM, key: "1", mapCells: { width: 2, height: 1 } }),
        walkers: () => [{ x: 8, y: 8 }],
        water,
        showWaterStats: vi.fn(),
        showMeadow,
    };
    const opened = vi.fn(open ?? (() => Promise.resolve(port)));
    const controller = new LocalTerrainController(scene, opened, () => 0);
    return {
        controller,
        water,
        terminate,
        showMeadow,
        posted,
        opened,
        backToShared,
        choose: (place: ReturnType<LocalTerrainScene["chosenPlace"]>) => {
            chosen = place;
        },
        fastWater: (on: ReturnType<LocalTerrainScene["fastWater"]>) => {
            fast = on;
        },
        tell: (told: LocalTerrainTold) => port.onmessage?.({ data: told } as MessageEvent<LocalTerrainTold>),
    };
}

/** Lets the worker of a start open. */
const opened = (): Promise<void> =>
    new Promise((resolve) => {
        setTimeout(resolve, 0);
    });

describe("LocalTerrainController", () => {
    it("shows the ground of the server while no place is chosen", () => {
        const { controller, opened: open } = harness();
        controller.update();

        expect(controller.fromServerWater(stateOf(4, 1))).toBe(false);
        expect(controller.fromServerMeadow(meadowOf(3))).toBe(false);
        expect(open).not.toHaveBeenCalled();
    });

    it("waits for the weather of the chosen place before its ground lives", () => {
        const { controller, choose, opened: open } = harness();
        choose({ place: RIO, slots: undefined });
        controller.update();

        expect(open).not.toHaveBeenCalled();
        expect(controller.isLocal()).toBe(false);
    });

    it("starts without the snow and the ice of the server: the place chosen lays its own", async () => {
        const { controller, water, posted, choose } = harness();
        water.receive(stateOf(4, 1), 0);
        controller.fromServerMeadow({ ...meadowOf(3), snow: Uint8Array.from([200]), ice: Uint8Array.from([90]) });
        choose({ place: RIO, slots: SLOTS });
        controller.update();
        await opened();

        const start = posted.find((command) => command.kind === "start");
        const meadow = start?.kind === "start" ? start.start.meadow : undefined;
        expect(meadow?.grass).toEqual(Uint8Array.from([3]));
        expect(meadow?.snow).toBeUndefined();
        expect(meadow?.ice).toBeUndefined();
    });

    it("starts from the ground of the server, shows its own, and keeps the server's aside meanwhile", async () => {
        const { controller, water, posted, choose, tell, showMeadow } = harness();
        water.receive(stateOf(4, 1), 0);
        controller.fromServerMeadow(meadowOf(3));
        choose({ place: RIO, slots: SLOTS });
        controller.update();
        await opened();

        const start = posted.find((command) => command.kind === "start");
        expect(start?.kind === "start" && start.start.water?.depths).toEqual(Uint8Array.from([32, 0, 32, 0]));
        expect(start?.kind === "start" && start.start.meadow?.grass).toEqual(Uint8Array.from([3]));
        // The server goes on: kept aside, not shown.
        expect(controller.fromServerWater(stateOf(9, 2))).toBe(true);
        expect(water.settledDepthAt(0, 0)).toBe(4);
        // The local ground tells its own water: shown.
        tell({ kind: "water", message: { ...stateOf(1, 1), stats: undefined } });
        expect(water.settledDepthAt(0, 0)).toBe(1);
        tell({ kind: "meadow", message: { ...meadowOf(7), dryness: new Uint8Array(0) } as never });
        expect(showMeadow).toHaveBeenLastCalledWith(expect.objectContaining({ grass: Uint8Array.from([7]) }));
    });

    it("goes back to the last state of the server at once when the place is let go", async () => {
        const { controller, water, terminate, choose, showMeadow } = harness();
        water.receive(stateOf(4, 1), 0);
        choose({ place: RIO, slots: SLOTS });
        controller.update();
        await opened();
        controller.fromServerWater(stateOf(9, 2));
        controller.fromServerMeadow(meadowOf(5));

        choose(undefined);
        controller.update();

        expect(terminate).toHaveBeenCalled();
        expect(controller.isLocal()).toBe(false);
        expect(water.settledDepthAt(0, 0)).toBe(9);
        expect(showMeadow).toHaveBeenLastCalledWith(meadowOf(5));
        // The server is shown again as it comes.
        expect(controller.fromServerWater(stateOf(2, 3))).toBe(false);
    });

    it("tells the local ground another place, an edit of the map, and where the avatar stands", async () => {
        const { controller, posted, choose } = harness();
        choose({ place: RIO, slots: SLOTS });
        controller.update();
        await opened();
        const paris = { ...RIO, name: "Paris", latitude: 48.9, longitude: 2.3 };
        choose({ place: paris, slots: SLOTS });
        controller.update();

        expect(posted).toContainEqual({ kind: "place", place: paris, slots: SLOTS });
        expect(posted).toContainEqual({ kind: "walkers", walkers: [{ x: 8, y: 8 }] });
    });

    it("runs fast water alone under the weather of the map, from the water of the server", async () => {
        const { controller, water, posted, fastWater } = harness();
        water.receive(stateOf(4, 1), 0);
        fastWater({ slots: undefined });
        controller.update();
        // The weather of the map is not known yet: nothing starts.
        expect(controller.isLocal()).toBe(false);

        fastWater({ slots: SLOTS });
        controller.update();
        await opened();

        const start = posted.find((command) => command.kind === "start");
        expect(start?.kind === "start" && start.start.place).toBeUndefined();
        expect(start?.kind === "start" && start.start.fast).toBe(true);
        expect(start?.kind === "start" && start.start.slots).toBe(SLOTS);
        expect(start?.kind === "start" && start.start.water?.depths).toEqual(stateOf(4, 1).depths);
    });

    it("tells the ground of a city followed that fast water stops, and keeps it", async () => {
        const { controller, posted, choose, fastWater, terminate } = harness();
        choose({ place: RIO, slots: SLOTS });
        fastWater({ slots: SLOTS });
        controller.update();
        await opened();
        expect(posted.find((command) => command.kind === "start")).toMatchObject({ start: { place: RIO, fast: true } });

        fastWater(undefined);
        controller.update();

        expect(posted).toContainEqual({ kind: "fast", fast: false });
        expect(terminate).not.toHaveBeenCalled();
        expect(controller.isLocal()).toBe(true);
    });

    it("glides back to the water of the server when fast water stops, and says so", async () => {
        const { controller, water, fastWater, backToShared, terminate } = harness();
        water.receive(stateOf(4, 1), 0);
        fastWater({ slots: SLOTS });
        controller.update();
        await opened();
        controller.fromServerWater(stateOf(9, 2));

        fastWater(undefined);
        controller.update();

        expect(terminate).toHaveBeenCalled();
        expect(water.settledDepthAt(0, 0)).toBe(9);
        expect(backToShared).toHaveBeenCalledTimes(1);
    });

    it("stops its worker while the tab is hidden, and starts again from the water of the server", async () => {
        const { controller, water, posted, fastWater, terminate, tell } = harness();
        water.receive(stateOf(4, 1), 0);
        fastWater({ slots: SLOTS });
        controller.update();
        await opened();
        tell({ kind: "water", message: { ...stateOf(1, 7), stats: undefined } });
        controller.fromServerWater(stateOf(6, 2));

        controller.hidden(true);
        expect(terminate).toHaveBeenCalledTimes(1);
        controller.update();
        expect(controller.isLocal()).toBe(false);

        controller.hidden(false);
        controller.update();
        await opened();
        const starts = posted.filter((command) => command.kind === "start");
        expect(starts).toHaveLength(2);
        const last = starts.at(-1);
        expect(last?.kind === "start" && last.start.water?.depths).toEqual(stateOf(6, 2).depths);
    });

    it("starts again from the water of the server on « Resynchroniser »", async () => {
        const { controller, water, posted, fastWater, tell } = harness();
        water.receive(stateOf(4, 1), 0);
        fastWater({ slots: SLOTS });
        controller.update();
        await opened();
        tell({ kind: "water", message: { ...stateOf(1, 7), stats: undefined } });
        controller.fromServerWater(stateOf(5, 2));

        controller.resynchronize();
        controller.update();
        await opened();

        const last = posted.filter((command) => command.kind === "start").at(-1);
        expect(last?.kind === "start" && last.start.water?.depths).toEqual(stateOf(5, 2).depths);
    });

    it("hands the catastrophes of the room to the local ground, as the server tells them", async () => {
        const { controller, posted, fastWater } = harness();
        // A drain already going on when the local ground starts: it is told at the start.
        controller.fromCatastrophe({
            id: 4,
            kind: CatastropheKind.CATASTROPHE_DRAIN,
            x: 64,
            y: 32,
            impactInMs: 5000,
            radiusTiles: 2,
            wholeMap: false,
        });
        fastWater({ slots: SLOTS });
        controller.update();
        await opened();
        expect(posted).toContainEqual({
            kind: "catastrophes",
            downpours: [],
            drains: [{ id: 4, x: 64, y: 32, radiusTiles: 2 }],
            balls: [],
        });
        // A meteor: it strikes the local water when it lands.
        controller.fromCatastrophe({
            id: 5,
            kind: CatastropheKind.CATASTROPHE_METEOR,
            x: 10,
            y: 20,
            impactInMs: 0,
            radiusTiles: 3,
            wholeMap: false,
        });
        controller.update();
        expect(posted).toContainEqual({ kind: "strike", x: 10, y: 20, radiusTiles: 3 });
    });

    it("keeps the ground of the server when the local one cannot start", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const { controller, choose, opened: open } = harness(() => Promise.reject(new Error("no worker")));
        choose({ place: RIO, slots: SLOTS });
        controller.update();
        await opened();

        expect(controller.isLocal()).toBe(false);
        expect(controller.fromServerWater(stateOf(4, 1))).toBe(false);
        // Not tried again at each image for the same place (the whole ground would be drawn again each time)...
        controller.update();
        controller.update();
        await opened();
        expect(open).toHaveBeenCalledTimes(1);
        // ...but again for another place.
        choose({ place: { ...RIO, latitude: 10 }, slots: SLOTS });
        controller.update();
        expect(open).toHaveBeenCalledTimes(2);
        warn.mockRestore();
    });
});
