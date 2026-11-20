import { WaterGrid } from "@workadventure/map-editor";
import type { LifeSettings, WAMFileFormat } from "@workadventure/map-editor";
import type { AquaticLifeMessage, SubToPusherRoomMessage } from "@workadventure/messages";
import { describe, expect, it, vi } from "vitest";
import { AquaticLifeManager } from "../src/Model/AquaticLifeManager";
import type { VariablesRepositoryInterface } from "../src/Services/Repository/VariablesRepositoryInterface";

const ANTELOPE = 2;

function harness({
    life = {},
    withWater = false,
    withRiver = false,
    sizeKnown = true,
    saved = {},
}: {
    life?: Partial<LifeSettings>;
    withWater?: boolean;
    withRiver?: boolean;
    sizeKnown?: boolean;
    saved?: Record<string, string>;
} = {}) {
    let grid: WaterGrid | undefined;
    if (withRiver) {
        // A deep river two tiles wide from the top of the map to its bottom, four tiles from its west edge.
        grid = new WaterGrid(undefined, { x: 8, y: 0, width: 4, height: 40 });
        const bytes = new Uint8Array(320);
        for (let index = 0; index < 160; index++) bytes[index * 2] = 160;
        grid.readDepths(bytes);
    }
    if (withWater) {
        // A pond of 10 × 10 cells of deep water in the corner of the map.
        grid = new WaterGrid(undefined, { x: 0, y: 0, width: 10, height: 10 });
        const bytes = new Uint8Array(200);
        for (let index = 0; index < 100; index++) bytes[index * 2] = 160;
        grid.readDepths(bytes);
    }
    const settings: Partial<LifeSettings> = {
        enabled: withWater,
        reproductionDelay: 60,
        maxLifespan: 600,
        maxSpeed: 1.5,
        huntInterval: 30,
        dolphinReproductionDelay: 120,
        dolphinMaxLifespan: 3600,
        drinkInterval: 120,
        landEnabled: true,
        ...life,
    };
    const wam: WAMFileFormat = {
        version: "2.1.0",
        mapUrl: "map.tmj",
        areas: [],
        entityCollections: [],
        entities: {},
        settings: { life: settings as LifeSettings },
    };
    const sent: AquaticLifeMessage[] = [];
    const repository = {
        loadVariables: vi.fn((_roomUrl: string) => Promise.resolve(saved)),
        saveVariable: vi.fn((_roomUrl: string, key: string, value: string) => {
            saved[key] = value;
            return Promise.resolve(1);
        }),
    } satisfies VariablesRepositoryInterface;
    const room = {
        getWam: () => wam,
        sendSubMessageToRoom: (message: SubToPusherRoomMessage): void => {
            if (message.message?.$case === "aquaticLifeMessage") sent.push(message.message.aquaticLifeMessage);
        },
    };
    const clock = { now: 1_000_000 };
    let seed = 7;
    const random = (): number => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x80000000;
    };
    const land: { size: { width: number; height: number } | undefined } = {
        size: sizeKnown ? { width: 60, height: 40 } : undefined,
    };
    const manager = new AquaticLifeManager(
        room,
        { getGrid: () => grid, waterVersion: () => 1 },
        { repository, roomUrl: "room" },
        () => clock.now,
        random,
        () => [],
        () => land.size,
    );
    const steps = (count: number): void => {
        for (let step = 0; step < count; step++) {
            manager.step();
            clock.now += 500;
        }
    };
    return { manager, sent, steps, wam, land, saved };
}
const kinds = (message: AquaticLifeMessage | undefined): number[] => (message?.animals ?? []).map((one) => one.kind);
const onLand = (message: AquaticLifeMessage | undefined): number[] => kinds(message).filter((kind) => kind >= 4);

describe("AquaticLifeManager, the life of the land", () => {
    it("makes antelopes live on a map without water, and tells the room", () => {
        const { manager, sent, steps } = harness();
        steps(2);
        expect(onLand(manager.snapshot()).sort()).toEqual([4, 5]);
        expect(sent).toHaveLength(1);
        expect(sent[0].species.find((entry) => entry.species === ANTELOPE)).toMatchObject({
            males: 1,
            females: 1,
            arrivals: 2,
            cap: 15,
        });
    });

    it("arms its timer for the land alone, and none when both are off", () => {
        vi.useFakeTimers();
        const land = harness();
        land.manager.start();
        expect(vi.getTimerCount()).toBe(1);
        land.manager.stop();
        const off = harness({ life: { landEnabled: false } });
        off.manager.start();
        expect(vi.getTimerCount()).toBe(0);
        vi.useRealTimers();
    });

    it("keeps the animals of the land out of the water, and the fish in it", () => {
        const { manager, steps } = harness({ withWater: true });
        steps(2);
        const message = manager.snapshot();
        expect(kinds(message).filter((kind) => kind < 2)).toHaveLength(2);
        for (const animal of message?.animals ?? []) {
            const inPond = animal.x < 160 && animal.y < 160;
            expect(inPond).toBe(animal.kind < 4);
        }
    });

    it("takes the animals of the land away when the land is turned off, and keeps the fish", () => {
        const { manager, steps, wam, sent } = harness({ withWater: true });
        steps(2);
        expect(onLand(manager.snapshot())).toHaveLength(2);
        if (wam.settings?.life) wam.settings.life.landEnabled = false;
        manager.mapChanged();
        expect(onLand(manager.snapshot())).toEqual([]);
        expect(kinds(manager.snapshot()).filter((kind) => kind < 2)).toHaveLength(2);
        expect(onLand(sent[sent.length - 1])).toEqual([]);
        manager.stop();
    });

    it("waits for the size of the map: no land, and no failure, until it is known", () => {
        const { manager, steps, land } = harness({ sizeKnown: false });
        steps(4);
        expect(manager.snapshot()).toBeUndefined();
        land.size = { width: 60, height: 40 };
        manager.mapChanged();
        steps(2);
        expect(onLand(manager.snapshot())).toHaveLength(2);
        manager.stop();
    });

    it("reads the land again when a wall is built", () => {
        const { manager, steps, wam } = harness();
        steps(2);
        const capOf = (): number | undefined =>
            manager.snapshot()?.species.find((entry) => entry.species === ANTELOPE)?.cap;
        expect(capOf()).toBe(15);
        // A wall across the whole map, two tiles under its top: the land above it is too small for antelopes.
        for (let x = 0; x < 30; x++) {
            wam.entities[`wall${x}`] = {
                x: x * 32,
                y: 64,
                prefabRef: { collectionName: "Carte Murs", id: "Carte Murs:facade-blanc-mid:Default:Down" },
                properties: [],
            };
        }
        manager.mapChanged();
        steps(2);
        expect(capOf()).toBeLessThan(15);
        manager.stop();
    });

    it("a bridge over a river makes one land of its two banks, until it is taken away", () => {
        const { manager, steps, wam } = harness({ withRiver: true });
        steps(2);
        const capOf = (): number | undefined =>
            manager.snapshot()?.species.find((entry) => entry.species === ANTELOPE)?.cap;
        // The west bank (80 tiles) is too small for antelopes: only the east one (480 tiles) counts.
        expect(capOf()).toBe(12);
        // A deck 20 px over the river (tiles 4 and 5), a ramp on each bank.
        const pieces = { 3: "rampe-e-l1-h1", 4: "dalle-bois", 5: "dalle-bois", 6: "rampe-o-l1-h1" };
        for (const [x, name] of Object.entries(pieces)) {
            wam.entities[`bridge${x}`] = {
                x: Number(x) * 32,
                y: 300,
                prefabRef: { collectionName: "Carte Paliers", id: `Carte Paliers:${name}:Default:Down` },
                properties: [],
                ...(name === "dalle-bois" ? { elevation: 20 } : {}),
            };
        }
        manager.mapChanged();
        steps(2);
        // Both banks and the deck: 562 tiles of one land.
        expect(capOf()).toBe(14);
        delete wam.entities.bridge4;
        delete wam.entities.bridge5;
        manager.mapChanged();
        steps(2);
        expect(capOf()).toBe(12);
        manager.stop();
    });

    it("brings the animals of the land back after a restart", async () => {
        const first = harness();
        first.steps(2);
        first.manager.stop();
        const second = harness({ saved: first.saved });
        await second.manager.restore();
        expect(onLand(second.manager.snapshot()).sort()).toEqual([4, 5]);
    });

    it("gives the fire of the map to the life: no antelope comes to a land that burns everywhere", () => {
        const { manager, sent, steps } = harness();
        manager.followFire(() => ({ near: () => undefined, burning: () => true }));
        manager.start();
        steps(4);
        expect(onLand(sent[sent.length - 1])).toEqual([]);
        // The fire out, they come as on any map.
        manager.followFire(() => undefined);
        steps(4);
        expect(onLand(sent[sent.length - 1]).length).toBeGreaterThan(0);
    });
});
