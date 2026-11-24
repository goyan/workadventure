import {
    encodeZombieLog,
    encodeZombieTerrain,
    HURRICANE_RMAX_PX,
    TERRAIN_CELL,
    TILE_PX,
    WeatherType,
    zombieDirection,
} from "@workadventure/map-editor";
import type { Hurricane, WAMFileFormat, ZombieHorde } from "@workadventure/map-editor";
import type { SubToPusherRoomMessage, TreeFireMessage } from "@workadventure/messages";
import { describe, expect, it, vi } from "vitest";
import { MeadowManager } from "../src/Model/MeadowManager";
import type { VariablesRepositoryInterface } from "../src/Services/Repository/VariablesRepositoryInterface";

/** A tree whose foot the server takes at the middle of the tile (tileX, tileY). */
const treeAt = (tileX: number, tileY: number) => ({
    x: (tileX - 0.5) * TILE_PX,
    y: (tileY - 1.5) * TILE_PX,
    prefabRef: { id: "Nature:tree-oak:Down", collectionName: "Nature" },
});
const foot = (tileX: number, tileY: number) => ({ x: (tileX + 0.5) * TILE_PX, y: (tileY + 0.5) * TILE_PX });

function createHarness({
    saved = {},
    random = () => 1,
    wind = { windFrom: 0, windSpeed: 0 },
    clock = () => Date.UTC(2026, 6, 14, 10),
    growMinutes,
}: {
    saved?: Record<string, string>;
    random?: () => number;
    wind?: { windFrom: number; windSpeed: number };
    clock?: () => number;
    growMinutes?: number;
} = {}) {
    const told: TreeFireMessage[] = [];
    const store: Record<string, string> = { ...saved };
    const repository = {
        loadVariables: vi.fn((_key: string) => Promise.resolve(store)),
        saveVariable: vi.fn((_key: string, field: string, value: string) => {
            store[field] = value;
            return Promise.resolve(1);
        }),
    } satisfies VariablesRepositoryInterface;
    const wam = {
        version: "2.1.0",
        mapUrl: "map.tmj",
        areas: [],
        entityCollections: [],
        entities: { oak: treeAt(10, 10), far: treeAt(30, 30) },
        // A clear sky: the ground stays dry, a tree can burn.
        settings: { weather: WeatherType.Clear, ...(growMinutes ? { meadow: { growMinutes } } : {}) },
    } as unknown as WAMFileFormat;
    const room = {
        getWam: () => wam,
        sendSubMessageToRoom: (message: SubToPusherRoomMessage): void => {
            if (message.message?.$case === "treeFireMessage") told.push(message.message.treeFireMessage);
        },
    };
    const manager = new MeadowManager(
        room,
        { slotsFor: vi.fn(() => undefined) },
        () => undefined,
        { repository, roomUrl: "room" },
        clock,
        () => ({ width: 80, height: 80 }),
        undefined,
        () => ({ danger: 0, ...wind }),
        random,
    );
    const steps = (count: number): void => {
        for (let step = 0; step < count; step++) manager.step();
    };
    return { manager, told, store, steps, wam };
}

describe("MeadowManager and the trees", () => {
    it("says nothing of the trees while they are all green", () => {
        const { manager, told, steps } = createHarness();
        manager.start();
        steps(5);
        expect(told).toEqual([]);
        expect(manager.treeSnapshot()).toBeUndefined();
    });

    it("lights the trees under the patch of fire of a player and tells the room the ones that changed", () => {
        const { manager, told, steps } = createHarness();
        manager.start();
        const { x, y } = foot(10, 10);
        expect(manager.ignite(x, y, 1)).toBeGreaterThan(0);
        steps(1);
        expect(told).toHaveLength(1);
        expect(told[0].whole).toBe(false);
        expect(told[0].trees.map((tree) => tree.id)).toEqual(["oak"]);
        expect(told[0].trees[0].fire).toBeGreaterThan(0);
        // For who joins the room: every tree that burns or is charred, and they alone.
        const whole = manager.treeSnapshot();
        expect(whole?.whole).toBe(true);
        expect(whole?.trees.map((tree) => tree.id)).toEqual(["oak"]);
        expect(manager.treeFires()).toEqual([expect.objectContaining({ x, y })]);
    });

    it("lights the trees in the crater of a fireball, not those far from it", () => {
        const { manager, told, steps } = createHarness();
        manager.start();
        const { x, y } = foot(10, 10);
        expect(manager.scorch(x, y, 2, 3)).toBeGreaterThan(0);
        steps(1);
        expect(told[0].trees.map((tree) => tree.id)).toEqual(["oak"]);
        expect(told[0].trees[0].fire).toBeGreaterThan(0);
    });

    it("tells the embers that leave, in whole map pixels and milliseconds", () => {
        const { manager, told, steps } = createHarness({ random: () => 0, wind: { windFrom: 270, windSpeed: 30 } });
        manager.start();
        const { x, y } = foot(10, 10);
        manager.ignite(x, y, 1);
        steps(5);
        const embers = told.flatMap((message) => message.embers);
        expect(embers.length).toBeGreaterThan(0);
        const [ember] = embers;
        expect(ember.fromX).toBe(x);
        expect(ember.fromY).toBe(y);
        expect(ember.toX).toBeGreaterThan(x);
        expect(Number.isInteger(ember.toX) && Number.isInteger(ember.toY)).toBe(true);
        expect(ember.flightMs).toBe(2000);
    });

    it("keeps what burnt of the trees across a restart, not their fire", async () => {
        const first = createHarness();
        first.manager.start();
        const { x, y } = foot(10, 10);
        first.manager.ignite(x, y, 1);
        first.steps(10);
        first.manager.stop();
        expect(first.store.trees).toBeDefined();

        const second = createHarness({ saved: first.store });
        await second.manager.restore();
        second.manager.start();
        const whole = second.manager.treeSnapshot();
        expect(whole?.trees.map((tree) => tree.id)).toEqual(["oak"]);
        expect(whole?.trees[0].fire).toBe(0);
        expect(whole?.trees[0].damage).toBeGreaterThan(0);
        expect(second.manager.treeFires()).toEqual([]);
    });

    it("follows the trees of an edited map: a tree removed loses its state", () => {
        const { manager, steps, wam } = createHarness();
        manager.start();
        const { x, y } = foot(10, 10);
        manager.ignite(x, y, 1);
        steps(2);
        delete (wam.entities as Record<string, unknown>).oak;
        manager.mapChanged();
        expect(manager.treeSnapshot()).toBeUndefined();
    });

    it("puts the trees back green and tells the room when the map turns its meadow off", () => {
        const { manager, told, steps, wam } = createHarness();
        manager.start();
        const { x, y } = foot(10, 10);
        manager.ignite(x, y, 1);
        steps(2);
        told.length = 0;
        wam.settings = { ...wam.settings, meadow: { enabled: false } } as WAMFileFormat["settings"];
        steps(1);
        expect(told).toHaveLength(1);
        expect(told[0].trees).toEqual([{ id: "oak", fire: 0, damage: 0, fallen: 0 }]);
        expect(manager.treeSnapshot()).toBeUndefined();
        expect(manager.ignite(x, y, 1)).toBe(0);
    });

    it("shows the animals of the map the fire of the grass and of the trees, and nothing while nothing burns", () => {
        const { manager, steps } = createHarness();
        manager.start();
        steps(1);
        expect(manager.lifeFire()).toBeUndefined();
        const { x, y } = foot(10, 10);
        expect(manager.ignite(x, y, 1)).toBeGreaterThan(0);
        const fire = manager.lifeFire();
        expect(fire).toBeDefined();
        // At the foot of the tree that was lit: the fire is right there (the tree, or the grass around it).
        const near = fire?.near(x, y);
        expect(near).toBeDefined();
        expect(Math.hypot((near?.x ?? 0) - x, (near?.y ?? 0) - y)).toBeLessThan(TILE_PX);
        // Twenty tiles away: nothing to run from.
        expect(fire?.near(x + 20 * TILE_PX, y)).toBeUndefined();
        expect(fire?.burning(x + 20 * TILE_PX, y)).toBe(false);
    });

    it("keeps the trees a hurricane laid down lying until a player stops it, then as long as the map says", () => {
        let now = Date.UTC(2026, 6, 14, 10);
        // A map whose meadow grows in a minute: a tree laid down lies 30 s, then grows back in 30 s.
        const { manager, steps } = createHarness({ clock: () => now, growMinutes: 1 });
        const oak = foot(10, 10);
        // A category 4 whose eye stays put, the oak at the radius of its strongest winds, half way through its
        // passage of ten minutes: it blows there all along.
        let hurricane: Hurricane | undefined = {
            id: 1,
            category: 4,
            durationMs: 600_000,
            heading: 0,
            southern: false,
            startedAt: now - 300_000,
            fromX: oak.x + HURRICANE_RMAX_PX,
            fromY: oak.y,
            toX: oak.x + HURRICANE_RMAX_PX,
            toY: oak.y,
            anchorX: oak.x + HURRICANE_RMAX_PX,
            anchorY: oak.y,
        };
        manager.skyUnder(() => hurricane);
        manager.start();
        const run = (seconds: number): void => {
            for (let step = 0; step < seconds / 2; step++) {
                now += 2000;
                steps(1);
            }
        };
        const oakState = () => manager.treeSnapshot()?.trees.find((tree) => tree.id === "oak");
        run(6);
        expect(oakState()).toMatchObject({ fire: 0, damage: 16 });
        // Four minutes of hurricane: still lying.
        run(240);
        expect(oakState()).toMatchObject({ fire: 0, damage: 16 });
        // A player stops it: 30 s lying from now, then 30 s growing back.
        hurricane = undefined;
        run(28);
        expect(oakState()).toMatchObject({ fire: 0, damage: 16 });
        run(4);
        expect(oakState()?.damage).toBeLessThan(16);
        run(30);
        expect(oakState()).toBeUndefined();
    });

    it("lays down the trees a horde of zombies walks over, away from it, and keeps them down while it goes on", () => {
        let now = Date.UTC(2026, 6, 14, 10);
        const { manager, steps } = createHarness({ clock: () => now, growMinutes: 1 });
        // Eastwards across the map of 80 x 80 cells, 600 zombies on a front as wide as the map, coming in for two minutes
        // (the first 40 % of five).
        let horde: ZombieHorde | undefined = {
            id: 7,
            seed: 99,
            count: 600,
            durationMs: 300_000,
            heading: 90,
            startedAt: now,
            anchorStep: 0,
            anchorAt: now,
            msPerStep: 100,
            avatars: "",
            safeStep: 1_000_000,
            ...zombieDirection(90),
            anchorX: 40 * TERRAIN_CELL,
            anchorY: 40 * TERRAIN_CELL,
            widthCells: 80,
            heightCells: 80,
            terrain: encodeZombieTerrain(new Uint8Array(80 * 80)),
        };
        manager.zombiesUnder(() => horde);
        manager.start();
        const run = (seconds: number): void => {
            for (let step = 0; step < seconds / 2; step++) {
                now += 2000;
                steps(1);
            }
        };
        const tree = (id: string) => manager.treeSnapshot()?.trees.find((told) => told.id === id);
        run(60);
        // Down, lying east: the horde came from the west (270°, told plus one).
        expect(tree("oak")).toMatchObject({ fire: 0, damage: 16, fallen: 271 });
        // Still down while the horde goes on, past the time a tree lies on this map (30 s).
        run(50);
        expect(tree("oak")).toMatchObject({ damage: 16 });
        // Over: it lies 30 s more, then grows back in 30 s.
        horde = undefined;
        run(64);
        expect(tree("oak")).toBeUndefined();
    });

    it("sets fire to the meadow and the trees where a grenade shot into a horde goes off", () => {
        let now = Date.UTC(2026, 6, 14, 10);
        const { manager, steps } = createHarness({ clock: () => now });
        const { x, y } = foot(10, 10);
        // Lobbed from 2 m west of the oak, it goes off at step 60 (6 s).
        const horde: ZombieHorde = {
            id: 8,
            seed: 5,
            count: 100,
            durationMs: 300_000,
            heading: 90,
            startedAt: now,
            anchorStep: 0,
            anchorAt: now,
            msPerStep: 100,
            avatars: encodeZombieLog([
                { applyStep: 60, changes: [], grenades: [{ fromX: x - 58, fromY: y, toX: x, toY: y }] },
            ]),
            safeStep: 1_000_000,
            ...zombieDirection(90),
            anchorX: 40 * TERRAIN_CELL,
            anchorY: 40 * TERRAIN_CELL,
            widthCells: 80,
            heightCells: 80,
            terrain: encodeZombieTerrain(new Uint8Array(80 * 80)),
        };
        manager.zombiesUnder(() => horde);
        manager.start();
        const run = (seconds: number): void => {
            for (let step = 0; step < seconds / 2; step++) {
                now += 2000;
                steps(1);
            }
        };
        run(4);
        expect(manager.lifeFire()).toBeUndefined();
        run(4);
        expect(manager.lifeFire()).toBeDefined();
        run(10);
        expect(manager.treeSnapshot()?.trees.find((told) => told.id === "oak")?.fire).toBeGreaterThan(0);
    });
});
