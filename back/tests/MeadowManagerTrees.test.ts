import { TILE_PX, WeatherType } from "@workadventure/map-editor";
import type { WAMFileFormat } from "@workadventure/map-editor";
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
}: { saved?: Record<string, string>; random?: () => number; wind?: { windFrom: number; windSpeed: number } } = {}) {
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
        settings: { weather: WeatherType.Clear },
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
        () => Date.UTC(2026, 6, 14, 10),
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
});
