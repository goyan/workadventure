import { describe, expect, it } from "vitest";
import { burnableTreesOf, isTreePrefab } from "../src/Terrain/LandTrees";
import {
    TREE_BURN_SECONDS,
    TREE_EMBERS_PER_ROOM,
    TREE_EMBERS_PER_TREE,
    TreeFire,
    emberReachTiles,
} from "../src/Terrain/TreeFire";
import type { TreeFireStepInput, TreeGround } from "../src/Terrain/TreeFire";
import { TILE_PX } from "../src/types";
import { HURRICANE_RMAX_PX, hurricaneHere } from "../src/Catastrophe/Hurricane";
import type { Hurricane } from "../src/Catastrophe/Hurricane";
import type { WAMFileFormat } from "../src/types";

const STEP = 2;
/** No luck: no ember leaves. */
const calm: TreeFireStepInput = { seconds: STEP, rainMmPerHour: 0, random: () => 1 };

/** A ground the tests set by hand: what burns on it, how dry it is, where nothing grows, what is soaked. */
function ground() {
    const fire = new Map<string, number>();
    const state = {
        dryness: 1,
        barren: new Set<string>(),
        soaked: new Set<string>(),
        lit: [] as { x: number; y: number; radius: number }[],
    };
    const key = (x: number, y: number): string => `${x},${y}`;
    const meadow: TreeGround = {
        fireAt: (x, y) => fire.get(key(x, y)) ?? 0,
        drynessAt: () => state.dryness,
        growsAt: (x, y) => !state.barren.has(key(x, y)),
        soakedAt: (x, y) => state.soaked.has(key(x, y)),
        ignite: (x, y, radius) => {
            state.lit.push({ x, y, radius });
            return 1;
        },
    };
    /** Two tiles in full fire next to a foot: what lights a dry tree in 6 s. */
    const burnAround = (tileX: number, tileY: number, on = true): void => {
        for (const dx of [-1, 1]) {
            if (on) fire.set(key(tileX + dx, tileY), 1);
            else fire.delete(key(tileX + dx, tileY));
        }
    };
    return { meadow, state, burnAround };
}

const tree = (id: string, tileX: number, tileY: number) => ({
    id,
    x: (tileX + 0.5) * TILE_PX,
    y: (tileY + 0.5) * TILE_PX,
});
const run = (fire: TreeFire, seconds: number, input: TreeFireStepInput = calm): void => {
    for (let elapsed = 0; elapsed < seconds; elapsed += STEP) fire.step(input);
};

describe("burnableTreesOf", () => {
    it("reads the trees of the nature catalogue with their id and the foot the server takes for them", () => {
        const entity = (id: string, x: number, y: number, elevation?: number) => ({
            x,
            y,
            prefabRef: { id, collectionName: "Nature" },
            elevation,
        });
        const wam = {
            entities: {
                oak: entity("Nature:tree-oak:Down", 320, 160),
                palm: entity("Nature:nature-3:palm", 640, 320),
                rock: entity("Nature:nature-9:rock", 0, 0),
                chair: entity("basic furniture:chair:Down", 64, 64),
                upstairs: entity("Nature:tree-oak:Down", 96, 96, 64),
            },
        } as unknown as Pick<WAMFileFormat, "entities">;
        expect(burnableTreesOf(wam)).toEqual([
            { id: "oak", x: 320 + TILE_PX, y: 160 + 2 * TILE_PX },
            { id: "palm", x: 640 + TILE_PX, y: 320 + 2 * TILE_PX },
        ]);
        expect(burnableTreesOf(undefined)).toEqual([]);
    });

    it("tells a tree from the other objects of the nature catalogue", () => {
        expect(isTreePrefab("Nature:tree-oak:Down")).toBe(true);
        expect(isTreePrefab("Nature:snow-evergreen-1:Down")).toBe(true);
        expect(isTreePrefab("Nature:nature-6:bare")).toBe(true);
        expect(isTreePrefab("Nature:nature-7:rock")).toBe(false);
        expect(isTreePrefab("basic furniture:chair:Down")).toBe(false);
    });
});

describe("a tree takes fire", () => {
    it("in 6 s from two tiles in full fire at its foot on a dry ground, in 24 s on a green one", () => {
        const dry = ground();
        const fire = new TreeFire([tree("a", 10, 10)], dry.meadow);
        dry.burnAround(10, 10);
        run(fire, 4);
        expect(fire.stateOf("a").fire).toBe(0);
        run(fire, 2);
        expect(fire.stateOf("a").fire).toBeGreaterThan(0);

        const green = ground();
        green.state.dryness = 0;
        const slow = new TreeFire([tree("a", 10, 10)], green.meadow);
        green.burnAround(10, 10);
        run(slow, 22);
        expect(slow.stateOf("a").fire).toBe(0);
        run(slow, 2);
        expect(slow.stateOf("a").fire).toBeGreaterThan(0);
    });

    it("never with its foot under water or sodden, nor where nothing grows (indoors, a paved tile)", () => {
        for (const refusal of ["soaked", "barren"] as const) {
            const { meadow, state, burnAround } = ground();
            state[refusal].add("10,10");
            const fire = new TreeFire([tree("a", 10, 10)], meadow);
            burnAround(10, 10);
            run(fire, 60);
            expect(fire.stateOf("a").fire).toBe(0);
            expect(fire.stateOf("a").damage).toBe(0);
        }
    });

    it("cools down in 20 s once the fire around it is gone", () => {
        const { meadow, burnAround } = ground();
        const fire = new TreeFire([tree("a", 10, 10)], meadow);
        burnAround(10, 10);
        run(fire, 4);
        burnAround(10, 10, false);
        run(fire, 20);
        // Cold again: it needs its full 6 s.
        burnAround(10, 10);
        run(fire, 4);
        expect(fire.stateOf("a").fire).toBe(0);
        run(fire, 2);
        expect(fire.stateOf("a").fire).toBeGreaterThan(0);
    });

    it("at once under the patch of fire of a player, unless its foot is wet", () => {
        const { meadow, state } = ground();
        state.soaked.add("14,10");
        const fire = new TreeFire([tree("a", 10, 10), tree("b", 12, 10), tree("wet", 14, 10)], meadow);
        expect(fire.ignite(10.5 * TILE_PX, 10.5 * TILE_PX, 1 * TILE_PX)).toBe(1);
        expect(fire.stateOf("a").fire).toBeGreaterThan(0);
        expect(fire.stateOf("b").fire).toBe(0);
        expect(fire.ignite(13 * TILE_PX, 10.5 * TILE_PX, 3 * TILE_PX)).toBe(1);
        expect(fire.stateOf("b").fire).toBeGreaterThan(0);
        expect(fire.stateOf("wet").fire).toBe(0);
        expect(fire.burning()).toBe(2);
    });
});

describe("a tree on fire", () => {
    const lit = () => {
        const set = ground();
        const fire = new TreeFire([tree("a", 10, 10)], set.meadow);
        fire.ignite(10.5 * TILE_PX, 10.5 * TILE_PX, TILE_PX);
        return { ...set, fire };
    };

    it("rises to its height in 6 s, burns 90 s, then stands charred", () => {
        const { fire } = lit();
        expect(TREE_BURN_SECONDS).toBe(90);
        run(fire, 6);
        expect(fire.stateOf("a").fire).toBe(1);
        run(fire, 40);
        expect(fire.stateOf("a").damage).toBeGreaterThan(0.45);
        expect(fire.stateOf("a").damage).toBeLessThan(0.6);
        run(fire, 46);
        expect(fire.stateOf("a")).toMatchObject({ fire: 0, damage: 1 });
        expect(fire.burning()).toBe(0);
    });

    it("sets the ground at its foot on fire again while it burns in full", () => {
        const { fire, state } = lit();
        run(fire, 2);
        expect(state.lit).toEqual([]);
        run(fire, 6);
        expect(state.lit.length).toBeGreaterThan(0);
        expect(state.lit[0]).toEqual({ x: 10, y: 10, radius: 1 });
    });

    it("heats the tree downwind of it long before the one upwind", () => {
        const { meadow } = ground();
        const fire = new TreeFire([tree("a", 10, 10), tree("east", 13, 10), tree("west", 7, 10)], meadow);
        fire.ignite(10.5 * TILE_PX, 10.5 * TILE_PX, TILE_PX);
        // A wind from the west at 60 km/h blows east.
        const wind = { ...calm, windFrom: 270, windSpeed: 60 };
        run(fire, 12, wind);
        expect(fire.stateOf("east").fire).toBeGreaterThan(0);
        expect(fire.stateOf("west").fire).toBe(0);
        // Without wind, a neighbour within 4 tiles takes in 10 s of a full fire; further, never.
        const still = new TreeFire([tree("a", 10, 10), tree("near", 14, 10), tree("far", 15, 10)], meadow);
        still.ignite(10.5 * TILE_PX, 10.5 * TILE_PX, TILE_PX);
        run(still, 18);
        expect(still.stateOf("near").fire).toBeGreaterThan(0);
        expect(still.stateOf("far").fire).toBe(0);
    });

    it("goes out under a hard rain or a flood, and keeps what burnt of it", () => {
        const rain = lit();
        run(rain.fire, 20);
        rain.fire.step({ ...calm, rainMmPerHour: 600 });
        const wet = rain.fire.stateOf("a");
        expect(wet.fire).toBe(0);
        expect(wet.damage).toBeGreaterThan(0.1);
        expect(wet.damage).toBeLessThan(0.4);

        const flood = lit();
        run(flood.fire, 20);
        flood.state.soaked.add("10,10");
        flood.fire.step(calm);
        expect(flood.fire.stateOf("a").fire).toBe(0);
        expect(flood.fire.stateOf("a").damage).toBeGreaterThan(0.1);
        // A light rain does not put a tree out.
        const drizzle = lit();
        run(drizzle.fire, 20, { ...calm, rainMmPerHour: 10 });
        expect(drizzle.fire.stateOf("a").fire).toBe(1);
    });
});

describe("embers", () => {
    it("fly further the stronger the wind, 40 tiles at most", () => {
        expect(emberReachTiles(0)).toBe(4);
        expect(emberReachTiles(30)).toBe(13);
        expect(emberReachTiles(80)).toBe(28);
        expect(emberReachTiles(200)).toBe(40);
    });

    it("leave a tree in full fire, land downwind at the next step and set the ground on fire there", () => {
        const { meadow, state } = ground();
        const fire = new TreeFire([tree("a", 10, 10)], meadow);
        fire.ignite(10.5 * TILE_PX, 10.5 * TILE_PX, TILE_PX);
        run(fire, 6);
        state.lit.length = 0;
        // Luck: an ember leaves, as far as it can, straight downwind (a wind from the west blows east).
        const lucky = { ...calm, windFrom: 270, windSpeed: 30, random: () => 0.999999 };
        const none = fire.step(lucky);
        expect(none.embers).toEqual([]);
        const sent = fire.step({ ...lucky, random: sequence([0, 1, 0.5]) });
        expect(sent.embers).toHaveLength(1);
        const [ember] = sent.embers;
        expect(ember.fromX).toBe(10.5 * TILE_PX);
        expect(ember.fromY).toBe(10.5 * TILE_PX);
        expect((ember.toX - ember.fromX) / TILE_PX).toBeCloseTo(13, 5);
        expect(ember.toY).toBeCloseTo(ember.fromY, 5);
        expect(ember.flightSeconds).toBe(2);
        // It lands at the next step: a small patch of fire where it falls.
        state.lit.length = 0;
        fire.step(calm);
        expect(state.lit).toContainEqual({ x: 23, y: 10, radius: 1 });
    });

    it("heats the trees it falls next to", () => {
        const { meadow } = ground();
        const fire = new TreeFire([tree("a", 10, 10), tree("target", 23, 10)], meadow);
        fire.ignite(10.5 * TILE_PX, 10.5 * TILE_PX, TILE_PX);
        run(fire, 6);
        const lucky = { ...calm, windFrom: 270, windSpeed: 30 };
        // Two embers falling at its foot are enough to light it.
        fire.step({ ...lucky, random: sequence([0, 1, 0.5]) });
        fire.step({ ...lucky, random: sequence([0, 1, 0.5]) });
        fire.step(calm);
        expect(fire.stateOf("target").fire).toBeGreaterThan(0);
    });

    it("are 8 at most from a tree, and 40 at most in flight in a room", () => {
        expect(TREE_EMBERS_PER_TREE).toBe(8);
        expect(TREE_EMBERS_PER_ROOM).toBe(40);
        const { meadow } = ground();
        const one = new TreeFire([tree("a", 10, 10)], meadow);
        one.ignite(10.5 * TILE_PX, 10.5 * TILE_PX, TILE_PX);
        run(one, 6);
        let sent = 0;
        for (let step = 0; step < 30; step++) sent += one.step({ ...calm, random: () => 0 }).embers.length;
        expect(sent).toBe(8);

        // Far apart, so they do not heat each other: 60 trees lit together send 40 embers in a step.
        const forest = Array.from({ length: 60 }, (_, index) => tree(`t${index}`, 10 + index * 10, 10));
        const many = new TreeFire(forest, meadow);
        for (const each of forest) many.ignite(each.x, each.y, TILE_PX);
        run(many, 6);
        expect(many.step({ ...calm, random: () => 0 }).embers).toHaveLength(40);
    });

    it("fall close by, any way, when there is no wind", () => {
        const { meadow } = ground();
        const fire = new TreeFire([tree("a", 10, 10)], meadow);
        fire.ignite(10.5 * TILE_PX, 10.5 * TILE_PX, TILE_PX);
        run(fire, 6);
        const [ember] = fire.step({ ...calm, random: sequence([0, 0.5, 0.25]) }).embers;
        const far = Math.hypot(ember.toX - ember.fromX, ember.toY - ember.fromY) / TILE_PX;
        expect(far).toBeGreaterThanOrEqual(2);
        expect(far).toBeLessThanOrEqual(4);
    });
});

describe("a charred tree", () => {
    it("is green again within five minutes of its fire, on a map with the usual meadow", () => {
        const { meadow } = ground();
        const fire = new TreeFire([tree("a", 10, 10)], meadow);
        fire.ignite(10.5 * TILE_PX, 10.5 * TILE_PX, TILE_PX);
        run(fire, 92);
        expect(fire.stateOf("a").damage).toBe(1);
        run(fire, 140);
        expect(fire.stateOf("a").damage).toBe(1);
        run(fire, 166);
        expect(fire.stateOf("a")).toMatchObject({ fire: 0, damage: 0 });
    });

    const charred = () => {
        const set = ground();
        const fire = new TreeFire([tree("a", 10, 10)], set.meadow);
        fire.ignite(10.5 * TILE_PX, 10.5 * TILE_PX, TILE_PX);
        run(fire, 92);
        return { ...set, fire };
    };

    it("stays black half of the five minutes after its fire, then greens back in the other half", () => {
        const { fire } = charred();
        const growing = { ...calm, growSeconds: 600 };
        run(fire, 148, growing);
        expect(fire.stateOf("a").damage).toBe(1);
        run(fire, 77, growing);
        expect(fire.stateOf("a").damage).toBeGreaterThan(0.45);
        expect(fire.stateOf("a").damage).toBeLessThan(0.55);
        run(fire, 77, growing);
        expect(fire.stateOf("a")).toMatchObject({ fire: 0, damage: 0 });
    });

    it("does not take fire again until it is green again", () => {
        const { fire, burnAround } = charred();
        burnAround(10, 10);
        expect(fire.ignite(10.5 * TILE_PX, 10.5 * TILE_PX, TILE_PX)).toBe(0);
        run(fire, 60, { ...calm, growSeconds: 600 });
        expect(fire.stateOf("a").fire).toBe(0);
        run(fire, 260, { ...calm, growSeconds: 600 });
        // Green again within five minutes, the fire still at its foot: it takes.
        expect(fire.stateOf("a").fire).toBeGreaterThan(0);
    });

    it("greens back the faster the less of it burnt", () => {
        const { meadow, state } = ground();
        const fire = new TreeFire([tree("a", 10, 10)], meadow);
        fire.ignite(10.5 * TILE_PX, 10.5 * TILE_PX, TILE_PX);
        run(fire, 46);
        state.soaked.add("10,10");
        fire.step(calm);
        state.soaked.clear();
        const half = fire.stateOf("a").damage;
        expect(half).toBeGreaterThan(0.4);
        expect(half).toBeLessThan(0.6);
        // Black half as long as a tree burnt through, then green in half the time.
        run(fire, 150 + 320, { ...calm, growSeconds: 600 });
        expect(fire.stateOf("a").damage).toBe(0);
    });
});

describe("the fire of a forest", () => {
    it("ends by itself on a map of dry trees: nothing burns for ever", () => {
        const { meadow } = ground();
        const forest = [];
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) forest.push(tree(`${x}:${y}`, 10 + x * 3, 10 + y * 3));
        const fire = new TreeFire(forest, meadow);
        fire.ignite(forest[0].x, forest[0].y, TILE_PX);
        // Embers at every chance, a strong wind: the worst case. Each tree burns, then greens back.
        const burnt = new Set<string>();
        for (let elapsed = 0; elapsed < 600; elapsed += STEP) {
            fire.step({ ...calm, windFrom: 315, windSpeed: 60, random: () => 0 });
            for (const told of fire.damaged()) burnt.add(told.id);
        }
        expect(fire.burning()).toBe(0);
        expect(burnt.size).toBe(64);
    });

    it("costs nothing while nothing burns and no tree is damaged", () => {
        let reads = 0;
        const { meadow } = ground();
        const counting: TreeGround = { ...meadow, fireAt: () => (reads++, 0) };
        const fire = new TreeFire([tree("a", 10, 10)], counting);
        fire.step({ ...calm, groundBurning: false });
        expect(reads).toBe(0);
        fire.step(calm);
        expect(reads).toBeGreaterThan(0);
    });
});

describe("what is told and kept of the trees", () => {
    it("tells the trees whose state changed at a step, and all the damaged ones on demand", () => {
        const { meadow } = ground();
        const fire = new TreeFire([tree("a", 10, 10), tree("b", 30, 30)], meadow);
        expect(fire.step(calm).changed).toEqual([]);
        fire.ignite(10.5 * TILE_PX, 10.5 * TILE_PX, TILE_PX);
        expect(fire.step(calm).changed).toEqual([expect.objectContaining({ id: "a" })]);
        run(fire, 6);
        // At its height, between two degrees of damage: nothing new to say.
        const quiet = fire.step(calm).changed;
        expect(quiet.length).toBeLessThanOrEqual(1);
        expect(fire.damaged().map((each) => each.id)).toEqual(["a"]);
        const told = fire.damaged()[0];
        expect(told.fire).toBe(255);
        expect(told.damage).toBeGreaterThanOrEqual(0);
        expect(told.damage).toBeLessThanOrEqual(16);
    });

    it("keeps the damage and not the fire: a tree that burnt when the server stopped stands charred", () => {
        const { meadow } = ground();
        const fire = new TreeFire([tree("a", 10, 10), tree("b", 30, 30)], meadow);
        fire.ignite(10.5 * TILE_PX, 10.5 * TILE_PX, TILE_PX);
        run(fire, 46);
        const kept = fire.write();
        expect(kept.map((each) => each.id)).toEqual(["a"]);
        const restarted = new TreeFire([tree("a", 10, 10), tree("b", 30, 30)], meadow);
        restarted.read(kept);
        expect(restarted.stateOf("a").fire).toBe(0);
        expect(restarted.stateOf("a").damage).toBeCloseTo(fire.stateOf("a").damage, 5);
        expect(restarted.burning()).toBe(0);
        // A state that names a tree gone from the map, or is not a state at all, is left out.
        restarted.read([
            { id: "gone", damage: 1, wait: 10 },
            { id: "b", damage: Number.NaN, wait: 0 },
        ]);
        expect(restarted.damaged().map((each) => each.id)).toEqual(["a"]);
    });

    it("follows the trees of an edited map: a moved tree keeps its state, a removed one loses it", () => {
        const { meadow } = ground();
        const fire = new TreeFire([tree("a", 10, 10), tree("b", 30, 30)], meadow);
        fire.ignite(10.5 * TILE_PX, 10.5 * TILE_PX, TILE_PX);
        fire.ignite(30.5 * TILE_PX, 30.5 * TILE_PX, TILE_PX);
        run(fire, 10);
        fire.setTrees([tree("a", 50, 50), tree("c", 12, 12)]);
        expect(fire.stateOf("a").fire).toBe(1);
        expect(fire.stateOf("b")).toMatchObject({ fire: 0, damage: 0 });
        expect(fire.stateOf("c")).toMatchObject({ fire: 0, damage: 0 });
        expect(fire.burning()).toBe(1);
    });

    it("puts every tree back green when the meadow of the map is turned off", () => {
        const { meadow } = ground();
        const fire = new TreeFire([tree("a", 10, 10)], meadow);
        fire.ignite(10.5 * TILE_PX, 10.5 * TILE_PX, TILE_PX);
        run(fire, 10);
        const cleared = fire.clear();
        expect(cleared).toEqual([{ id: "a", fire: 0, damage: 0 }]);
        expect(fire.damaged()).toEqual([]);
        expect(fire.burning()).toBe(0);
    });
});

/** A luck that gives these draws in turn, then no luck. */
function sequence(draws: number[]): () => number {
    let next = 0;
    return () => (next < draws.length ? draws[next++] : 1);
}

describe("a tree the wind lays down", () => {
    /** A gust of `gust` km/h from `from` degrees over the whole map. */
    const blowing = (gust: number, from: number, at?: (x: number, y: number) => boolean): TreeFireStepInput => ({
        ...calm,
        windAt: (x, y) => (at && !at(x, y) ? undefined : { gust, from }),
    });
    const two = (): TreeFire => {
        return new TreeFire([tree("west", 2, 5), tree("east", 30, 5)], ground().meadow);
    };

    it("falls after 4 s of gusts of 250 km/h at its place, the way the wind blows, and not under 250", () => {
        const fire = two();
        run(fire, 20, blowing(249, 90));
        expect(fire.stateOf("west").damage).toBe(0);
        run(fire, 2, blowing(250, 90));
        expect(fire.stateOf("west").damage).toBe(0);
        run(fire, 2, blowing(250, 90));
        // From the east: it lies towards the west.
        expect(fire.stateOf("west")).toMatchObject({ damage: 1, fallenFrom: 90 });
        expect(fire.damaged()).toContainEqual({ id: "west", fire: 0, damage: 16, fallen: 91 });
    });

    it("falls only where the wind is that strong: the wind at the tree, not that of the map", () => {
        const fire = two();
        run(
            fire,
            6,
            blowing(300, 0, (x) => x < 10 * TILE_PX),
        );
        expect(fire.stateOf("west")).toMatchObject({ damage: 1, fallenFrom: 0 });
        expect(fire.stateOf("east").damage).toBe(0);
    });

    it("lies as long as a charred tree stays black, then grows back in the same time, as after a fire", () => {
        const fire = two();
        run(fire, 4, blowing(300, 180));
        run(fire, 148);
        expect(fire.stateOf("west").damage).toBe(1);
        run(fire, 4);
        expect(fire.stateOf("west").damage).toBeLessThan(1);
        run(fire, 150);
        expect(fire.stateOf("west")).toMatchObject({ damage: 0, fallenFrom: undefined });
        expect(fire.damaged()).toEqual([]);
    });

    it("does not burn while it lies, and a tree on fire is not laid down", () => {
        const { meadow, burnAround } = ground();
        const fire = new TreeFire([tree("down", 2, 5), tree("burning", 8, 5)], meadow);
        burnAround(8, 5);
        run(fire, 8);
        expect(fire.stateOf("burning").fire).toBeGreaterThan(0);
        run(fire, 4, blowing(300, 270));
        expect(fire.stateOf("down").fallenFrom).toBe(270);
        expect(fire.stateOf("burning").fallenFrom).toBeUndefined();
        burnAround(2, 5);
        run(fire, 20);
        expect(fire.stateOf("down").fire).toBe(0);
    });

    it("is kept across a restart, lying the way it fell", () => {
        const fire = two();
        run(fire, 4, blowing(300, 45));
        const kept = fire.write();
        expect(kept.find((tree) => tree.id === "west")).toMatchObject({ damage: 1, fallenFrom: 45 });
        const restarted = two();
        restarted.read(JSON.parse(JSON.stringify(kept)));
        expect(restarted.stateOf("west")).toMatchObject({ damage: 1, fallenFrom: 45 });
        expect(restarted.damaged()).toContainEqual({ id: "west", fire: 0, damage: 16, fallen: 46 });
    });

    it("costs nothing without a strong wind: no wind at the trees, nothing looked at", () => {
        const fire = two();
        let asked = 0;
        run(fire, 20, {
            ...calm,
            windAt: () => {
                asked++;
                return undefined;
            },
            strongWind: false,
        });
        expect(asked).toBe(0);
    });
});

describe("the trees a hurricane lays down round its eye", () => {
    const EYE = { x: 4000, y: 4000 };
    /** A hurricane whose eye stays put over EYE (from and to the same point), at the middle of its passage. */
    const still = (southern: boolean): Hurricane => ({
        id: 1,
        category: 5,
        durationMs: 600_000,
        heading: 0,
        southern,
        startedAt: 0,
        fromX: EYE.x,
        fromY: EYE.y,
        toX: EYE.x,
        toY: EYE.y,
        anchorX: EYE.x,
        anchorY: EYE.y,
    });
    /** Four trees at the radius of the strongest winds: east, north, west and south of the eye. */
    const around = [
        { id: "east", x: EYE.x + HURRICANE_RMAX_PX, y: EYE.y, out: 90 },
        { id: "north", x: EYE.x, y: EYE.y - HURRICANE_RMAX_PX, out: 0 },
        { id: "west", x: EYE.x - HURRICANE_RMAX_PX, y: EYE.y, out: 270 },
        { id: "south", x: EYE.x, y: EYE.y + HURRICANE_RMAX_PX, out: 180 },
    ];

    for (const southern of [false, true]) {
        it(`lies across the radius, turned the way the storm turns (${southern ? "south" : "north"})`, () => {
            const hurricane = still(southern);
            const fire = new TreeFire(
                around.map(({ id, x, y }) => ({ id, x, y })),
                ground().meadow,
            );
            run(fire, 4, {
                ...calm,
                windAt: (x, y) => {
                    const here = hurricaneHere(hurricane, 300_000, x, y);
                    return here && { gust: here.gust * here.share, from: here.windFrom };
                },
            });
            for (const tree of around) {
                const fallenFrom = fire.stateOf(tree.id).fallenFrom;
                expect(fallenFrom, tree.id).toBeDefined();
                // Where it lies, from the way out from the eye: a quarter turn the way the storm turns (anticlockwise
                // in the north: 270 on the compass, clockwise in the south: 90), within 25 degrees.
                const toward = ((fallenFrom ?? 0) + 180) % 360;
                const across = (toward - tree.out + 360) % 360;
                expect(Math.abs(across - (southern ? 90 : 270)), tree.id).toBeLessThanOrEqual(25);
            }
        });
    }
});
