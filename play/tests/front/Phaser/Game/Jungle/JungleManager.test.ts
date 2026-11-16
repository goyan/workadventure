import { afterEach, describe, expect, it, vi } from "vitest";
import { JungleManager } from "../../../../../src/front/Phaser/Game/Jungle/JungleManager";
import type { JungleHearing, JungleSource } from "../../../../../src/front/Phaser/Game/Jungle/JungleManager";
import {
    JUNGLE_MAX_VOLUME,
    jungleCryLeg,
    jungleSoundKey,
} from "../../../../../src/front/Phaser/Game/Jungle/JungleCries";
import { LEG_MS, wanderLegOffset } from "../../../../../src/front/Phaser/Game/Wander/WanderSchedule";
import { jungleTreePicked, parisDay } from "../../../../../src/front/Phaser/Game/Jungle/JunglePlan";
import type { JungleAnimal, JunglePrefab } from "../../../../../src/front/Phaser/Game/Jungle/JunglePlan";
import type { WanderMap } from "../../../../../src/front/Phaser/Game/Wander/WanderSchedule";
import { jungleEnabledStore } from "../../../../../src/front/Stores/JungleStore";

const NOW = new Date("2026-11-14T12:00:00Z");
const LION: JunglePrefab = { id: "lion", tags: ["Animaux", "Jungle"], wander: { sheetPath: "lion-sheet.png" } };
const TIGRE: JunglePrefab = { id: "tigre", tags: ["Animaux", "Jungle"], wander: { sheetPath: "tigre-sheet.png" } };
const MARKER: JunglePrefab = { id: "panneau-jungle", tags: ["Animaux", "Jungle"] };
const TREE: JunglePrefab = { id: "Nature:tree-1-2:Default:Down", tags: [] };

type Placed = ReturnType<JungleSource["placedEntities"]> extends Iterable<infer T> ? T : never;

/** Ids of trees that have an animal today. */
const pickedTrees = Array.from({ length: 60 }, (_, i) => `tree-${i}`)
    .filter((id) => jungleTreePicked(id, parisDay(NOW)))
    .slice(0, 3);

function tree(id: string, index: number): Placed {
    return { id, prefab: TREE, x: index * 160, y: 0, width: 32, height: 64 };
}

function makeSource(options: { marker?: boolean; species?: JunglePrefab[]; outdoor?: boolean } = {}) {
    const { marker = true, species = [LION, TIGRE], outdoor = true } = options;
    const wanderMap: WanderMap = { isWalkable: () => true, findPath: () => Promise.resolve([]) };
    const state = {
        placed: [
            ...pickedTrees.map(tree),
            ...(marker ? [{ id: "marker", prefab: MARKER, x: 0, y: 300, width: 32, height: 32 }] : []),
        ] as Placed[],
        species,
        outdoor,
        outdoorVersion: 1,
    };
    const source: JungleSource = {
        placedEntities: () => state.placed,
        loadedPrefabs: () => state.species,
        outdoor: () => (state.outdoor ? { isOutdoorAt: () => true } : undefined),
        outdoorVersion: () => state.outdoorVersion,
        wanderMap: () => wanderMap,
        tileSize: () => 32,
        now: () => NOW,
    };
    const apply = vi.fn<(animals: JungleAnimal[], map: WanderMap) => void>();
    return { source, state, apply };
}

describe("JungleManager", () => {
    let manager: JungleManager | undefined;

    afterEach(() => {
        manager?.destroy();
        manager = undefined;
        jungleEnabledStore.set(true);
    });

    it("no marker, no jungle", () => {
        const { source, apply } = makeSource({ marker: false });
        manager = new JungleManager(source, apply);
        manager.refresh();
        expect(apply).not.toHaveBeenCalled();
        expect(manager.animals).toEqual([]);
    });

    it("marker + species + outdoor trees: animals applied once", () => {
        const { source, apply } = makeSource();
        manager = new JungleManager(source, apply);
        manager.refresh();
        manager.refresh();
        expect(apply).toHaveBeenCalledOnce();
        const [animals, map] = apply.mock.calls[0];
        expect(animals.map((animal) => animal.id).sort()).toEqual(pickedTrees.map((id) => `jungle:${id}`).sort());
        expect(manager.animals).toEqual(animals);
        // The animals walk outdoors only, and never sit.
        expect(map).not.toBe(source.wanderMap());
        expect("seats" in map).toBe(false);
    });

    it("removing the marker applies an empty list", () => {
        const { source, state, apply } = makeSource();
        manager = new JungleManager(source, apply);
        manager.refresh();
        state.placed = state.placed.filter((entity) => entity.id !== "marker");
        manager.refresh();
        expect(apply).toHaveBeenCalledTimes(2);
        expect(apply.mock.calls[1][0]).toEqual([]);
    });

    it("no species, no jungle", () => {
        const { source, apply } = makeSource({ species: [MARKER] });
        manager = new JungleManager(source, apply);
        manager.refresh();
        expect(apply).not.toHaveBeenCalled();
    });

    it("switching the personal setting off applies an empty list, on brings the same animals back", () => {
        const { source, apply } = makeSource();
        manager = new JungleManager(source, apply);
        manager.refresh();
        const animals = apply.mock.calls[0][0];
        jungleEnabledStore.set(false);
        manager.refresh();
        expect(apply.mock.calls[1][0]).toEqual([]);
        jungleEnabledStore.set(true);
        manager.refresh();
        expect(apply.mock.calls[2][0]).toEqual(animals);
    });

    it("no outdoor grid yet: nothing, then animals once it exists", () => {
        const { source, state, apply } = makeSource({ outdoor: false });
        manager = new JungleManager(source, apply);
        manager.refresh();
        expect(apply).not.toHaveBeenCalled();
        state.outdoor = true;
        manager.refresh();
        expect(apply).toHaveBeenCalledOnce();
        expect(apply.mock.calls[0][0]).toHaveLength(pickedTrees.length);
    });

    it("a moved tree changes the plan", () => {
        const { source, state, apply } = makeSource();
        manager = new JungleManager(source, apply);
        manager.refresh();
        const moved = state.placed[0];
        state.placed = [{ ...moved, x: moved.x + 64 }, ...state.placed.slice(1)];
        manager.refresh();
        expect(apply).toHaveBeenCalledTimes(2);
        const before = apply.mock.calls[0][0].find((animal) => animal.id === `jungle:${moved.id}`);
        const after = apply.mock.calls[1][0].find((animal) => animal.id === `jungle:${moved.id}`);
        expect(after?.nest.x).toBe((before?.nest.x ?? 0) + 64);
    });

    it("a new outdoor grid gives the animals a new map", () => {
        const { source, state, apply } = makeSource();
        manager = new JungleManager(source, apply);
        manager.refresh();
        state.outdoorVersion = 2;
        manager.refresh();
        expect(apply).toHaveBeenCalledTimes(2);
        expect(apply.mock.calls[1][0]).toEqual(apply.mock.calls[0][0]);
        expect(apply.mock.calls[1][1]).not.toBe(apply.mock.calls[0][1]);
    });

    it("destroy applies an empty list", () => {
        const { source, apply } = makeSource();
        manager = new JungleManager(source, apply);
        manager.refresh();
        manager.destroy();
        manager = undefined;
        expect(apply).toHaveBeenLastCalledWith([], expect.anything());
    });

    describe("calls", () => {
        /** A moment when this animal has a call: in the middle of one of its legs that has one. */
        function cryMoment(animalId: string): number {
            for (let leg = 1000; leg < 3000; leg++) {
                const now = leg * LEG_MS - wanderLegOffset(animalId) + 10_000;
                if (jungleCryLeg(animalId, now) !== undefined) return now;
            }
            throw new Error("no call found");
        }

        function setUp(options: { moving?: boolean; distance?: number; hidden?: boolean; led?: boolean } = {}) {
            const { moving = false, distance = 0, hidden = false, led = false } = options;
            const { source, apply } = makeSource();
            const play = vi.fn<JungleHearing["play"]>();
            // Filled once the plan is applied: the first animal of the plan.
            const shown: { caller?: JungleAnimal } = {};
            const hearing: JungleHearing = {
                listener: () =>
                    shown.caller ? { x: shown.caller.nest.x + distance, y: shown.caller.nest.y } : undefined,
                // Only the first animal is shown: the others are still loading.
                pose: (id) =>
                    shown.caller && id === shown.caller.id
                        ? { x: shown.caller.nest.x, y: shown.caller.nest.y, moving }
                        : undefined,
                hidden: () => hidden,
                led: () => led,
                volume: () => 0.5,
                play,
            };
            manager = new JungleManager(source, apply, hearing);
            manager.refresh();
            const caller = manager.animals[0];
            shown.caller = caller;
            return { play, caller, now: cryMoment(caller.id) };
        }

        it("a stopped animal near the player calls once in a leg that has a call", () => {
            const { play, caller, now } = setUp();
            manager?.update(now);
            manager?.update(now + 1_000);
            expect(play).toHaveBeenCalledOnce();
            expect(play).toHaveBeenCalledWith(jungleSoundKey(caller.sheetPath), JUNGLE_MAX_VOLUME * 0.5);
        });

        it("quieter with the distance, silent from 12 tiles on", () => {
            const half = setUp({ distance: 6 * 32 });
            manager?.update(half.now);
            expect(half.play.mock.calls[0][1]).toBeCloseTo(JUNGLE_MAX_VOLUME * 0.5 * 0.5);
            manager?.destroy();
            const far = setUp({ distance: 12 * 32 });
            manager?.update(far.now);
            expect(far.play).not.toHaveBeenCalled();
        });

        it("no call while walking, in a hidden tab, or once the jungle is off", () => {
            const walking = setUp({ moving: true });
            manager?.update(walking.now);
            expect(walking.play).not.toHaveBeenCalled();
            manager?.destroy();
            const hidden = setUp({ hidden: true });
            manager?.update(hidden.now);
            expect(hidden.play).not.toHaveBeenCalled();
            manager?.destroy();
            const off = setUp();
            jungleEnabledStore.set(false);
            manager?.refresh();
            manager?.update(off.now);
            expect(off.play).not.toHaveBeenCalled();
        });

        it("a tamed animal following its master does not call, indoors or out", () => {
            const { play, now } = setUp({ led: true });
            manager?.update(now);
            expect(play).not.toHaveBeenCalled();
        });

        it("no call in a leg without one", () => {
            const { play, caller, now } = setUp();
            let quiet = now;
            while (jungleCryLeg(caller.id, quiet) !== undefined) quiet += LEG_MS;
            manager?.update(quiet);
            expect(play).not.toHaveBeenCalled();
        });
    });
});
