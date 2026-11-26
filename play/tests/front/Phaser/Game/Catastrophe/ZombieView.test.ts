import {
    RAISED_FLOOR_COLLECTION,
    TERRAIN_CELL,
    TILE_PX,
    ZOMBIE_DART_FALL_STEPS,
    ZOMBIE_DART_FIGURES,
    ZOMBIE_DART_TICKS,
    ZOMBIE_SHOT,
    ZOMBIE_WALKING,
    ZombieCrowd,
    bridgeTilesOf,
    bridgesOf,
    dryOnBridges,
    encodeZombieLog,
    encodeZombieTerrain,
    zombieDirection,
    zombieTerrainOf,
} from "@workadventure/map-editor";
import type { WAMFileFormat, ZombieHorde } from "@workadventure/map-editor";
import { describe, expect, it, vi } from "vitest";
import { ZombieView } from "../../../../../src/front/Phaser/Game/Catastrophe/ZombieView";
import {
    ZOMBIE_DEAD,
    ZOMBIE_HURT,
    ZOMBIE_SHEET_COLUMNS,
    ZOMBIE_SHEETS,
    ZOMBIE_WALK,
} from "../../../../../src/front/Phaser/Game/Catastrophe/ZombieSheets";
import { FLOOR_LEVEL_DEPTH, floorDepth } from "../../../../../src/front/Phaser/Game/MapEditor/MapLayer/FloorDepth";

vi.mock("phaser", () => ({ Textures: { FilterMode: { LINEAR: 1 } } }));

const START = 1_800_000_000_000;
const WIDTH_CELLS = 120;
const HEIGHT_CELLS = 80;

interface FakeBob {
    frame: number;
    x: number;
    y: number;
    visible: boolean;
    flipX: boolean;
    tint: number;
    setFrame(frame: number): FakeBob;
    setAlpha(alpha: number): FakeBob;
    setVisible(visible: boolean): FakeBob;
}

interface FakeBlitter {
    depth: number;
    bobs: FakeBob[];
}

/** A scene whose atlas of the horde is laid already, that keeps the batches of images it is asked for. */
function createScene() {
    const blitters: FakeBlitter[] = [];
    const scene = {
        markDirty: vi.fn(),
        time: { now: 0 },
        cameras: { main: { worldView: { x: 0, y: 0, right: WIDTH_CELLS * 16, bottom: HEIGHT_CELLS * 16 } } },
        textures: { exists: () => true },
        add: {
            blitter: () => {
                const made: FakeBlitter = { depth: 0, bobs: [] };
                blitters.push(made);
                const blitter = {
                    setDepth: (depth: number) => {
                        made.depth = depth;
                        return blitter;
                    },
                    create: () => {
                        const bob: FakeBob = {
                            frame: -1,
                            x: 0,
                            y: 0,
                            visible: true,
                            flipX: false,
                            tint: 0,
                            setFrame: (frame: number) => {
                                bob.frame = frame;
                                return bob;
                            },
                            setAlpha: () => bob,
                            setVisible: (visible: boolean) => {
                                bob.visible = visible;
                                return bob;
                            },
                        };
                        made.bobs.push(bob);
                        return bob;
                    },
                    destroy: vi.fn(),
                };
                return blitter;
            },
        },
    };
    return { scene: scene as unknown as ConstructorParameters<typeof ZombieView>[0], blitters };
}

/**
 * A river of deep water across the map, north to south (tiles 28 to 31), and a bridge of the map over it: a deck of
 * wooden slabs 20 px up on the tiles 28 to 31 of the rows 20 and 21, a ramp 2 tiles wide up to it on each bank (tiles
 * 27 and 32). Its ground as the server freezes it for a horde (GameRoom.zombieTerrain).
 */
function riverWithBridge() {
    const piece = (name: string, tileX: number, groundTileY: number, elevation = 0) => ({
        x: tileX * TILE_PX,
        // Placed where its image is drawn: its altitude further north than the ground it covers.
        y: groundTileY * TILE_PX - 20,
        elevation,
        prefabRef: { collectionName: RAISED_FLOOR_COLLECTION, id: `${RAISED_FLOOR_COLLECTION}:${name}:Default:Down` },
    });
    const pieces = [piece("rampe-e-l2-h1", 27, 20), piece("rampe-o-l2-h1", 32, 20)];
    for (let tileX = 28; tileX < 32; tileX++) {
        for (const tileY of [20, 21]) pieces.push(piece("dalle-bois", tileX, tileY, 20));
    }
    const wam: Pick<WAMFileFormat, "entities"> = {
        entities: Object.fromEntries(pieces.map((entity, index) => [`piece${index}`, entity])),
    };
    const river = (x: number): boolean => x >= 28 * TILE_PX && x < 32 * TILE_PX;
    const depthAt = dryOnBridges((cellX) => (river(cellX * TERRAIN_CELL) ? 60 : 0), bridgeTilesOf(wam));
    return { river, bridges: bridgesOf(wam), terrain: zombieTerrainOf(WIDTH_CELLS, HEIGHT_CELLS, depthAt) };
}

/** A horde of a single zombie going east over that ground. */
function hordeOver(terrain: Uint8Array): ZombieHorde {
    return {
        id: 1,
        seed: 12345,
        count: 1,
        durationMs: 2 * 60_000,
        heading: 90,
        ...zombieDirection(90),
        startedAt: START,
        anchorStep: 0,
        anchorAt: START,
        msPerStep: 100,
        anchorX: (WIDTH_CELLS * TERRAIN_CELL) / 2,
        anchorY: (HEIGHT_CELLS * TERRAIN_CELL) / 2,
        widthCells: WIDTH_CELLS,
        heightCells: HEIGHT_CELLS,
        terrain: encodeZombieTerrain(terrain),
        avatars: "",
        safeStep: 1_000_000,
    };
}

describe("ZombieView", () => {
    it("draws as many sheets as the darts of the Nerf know figures of: they meet the zombies as they are drawn", () => {
        expect(ZOMBIE_DART_FIGURES).toHaveLength(ZOMBIE_SHEETS.length);
        // The sheets the figures were measured on, in that order.
        expect(ZOMBIE_SHEETS.map((sheet) => sheet.key)).toEqual([
            "zombie-homme-veste",
            "zombie-femme-torse",
            "zombie-femme-jupe",
        ]);
    });

    it("draws a zombie crossing a bridge all the way over it: on its deck, as high as the deck, over its slabs", () => {
        const { river, bridges, terrain } = riverWithBridge();
        const told = hordeOver(terrain);
        const { scene, blitters } = createScene();
        // The bed of the river is a hollow of the relief, drawn 12 px lower.
        const view = new ZombieView(
            scene,
            (x) => (river(x) ? 12 : 0),
            (x, y) => bridges.elevationAt(x, y),
        );
        view.setHorde(told, START);
        // The same crowd, stepped alongside: where the zombie is.
        const twin = new ZombieCrowd(told);
        let groundOffset: number | undefined;
        let onDeck = 0;
        let crossed = false;
        for (let image = 1; image < twin.lastStep - 2 && !crossed; image++) {
            // Half way between two steps.
            const epoch = START + image * 100 + 50;
            view.update(epoch, epoch, true, false);
            const target = twin.stepFor(epoch);
            while (twin.steps < target) twin.step();
            if (twin.state[0] !== ZOMBIE_WALKING) continue;
            const between = twin.between(epoch);
            const x = twin.lastX[0] + (twin.x[0] - twin.lastX[0]) * between;
            const y = twin.lastY[0] + (twin.y[0] - twin.lastY[0]) * between;
            // Counted and seen at every image of its way.
            expect(view.walking()).toBe(1);
            const shown = blitters.flatMap((blitter) =>
                blitter.bobs.filter((bob) => bob.visible).map((bob) => ({ bob, depth: blitter.depth })),
            );
            expect(shown).toHaveLength(1);
            const { bob, depth } = shown[0];
            const lift = bridges.elevationAt(x, y);
            if (lift === 0 && !river(x)) {
                // On the ground: drawn at its feet, sorted by them as an avatar is.
                groundOffset ??= bob.y - Math.round(y);
                expect(bob.y - Math.round(y)).toBe(groundOffset);
                expect(depth).toBeLessThan(floorDepth(1, 0));
            }
            if (lift === 20) {
                onDeck++;
                // The slabs of a deck 20 px up are drawn just under floorDepth(20, 0) (floorPieceDepth).
                expect(depth).toBeGreaterThan(floorDepth(20, 0));
                // As high as the deck, not as low as the bed of the river under it.
                expect(groundOffset).toBeDefined();
                expect(Math.abs(bob.y - Math.round(y) - ((groundOffset ?? 0) - 20))).toBeLessThanOrEqual(1);
            }
            // Up a ramp too: over everything on the ground, the ramp included (sorted by its foot).
            if (lift > 0) expect(depth).toBeGreaterThan(FLOOR_LEVEL_DEPTH);
            crossed = x > 34 * TILE_PX;
        }
        // Four tiles of deck at a run: some eight images.
        expect(onDeck).toBeGreaterThanOrEqual(5);
        expect(crossed).toBe(true);
        expect(view.walking()).toBe(1);
    });

    it("draws a zombie the water caught after the horde began (a flood) half under it, never hidden, and out of it", () => {
        // Its ground was dry when it began; the water rose afterwards over the tiles 28 to 31, 30 px deep (one swims
        // in it), in a hollow of the relief drawn 12 px lower.
        const flooded = (x: number): boolean => x >= 28 * TILE_PX && x < 32 * TILE_PX;
        // The images cut at the water line follow all the others (two scales of every sheet).
        const wadingFrames = 2 * ZOMBIE_SHEETS.length * 5 * ZOMBIE_SHEET_COLUMNS;
        const told = hordeOver(new Uint8Array(WIDTH_CELLS * HEIGHT_CELLS));
        const { scene, blitters } = createScene();
        const view = new ZombieView(
            scene,
            (x) => (flooded(x) ? 12 : 0),
            () => 0,
            (x) => (flooded(x) ? 30 : 0),
        );
        view.setHorde(told, START);
        const twin = new ZombieCrowd(told);
        let inWater = 0;
        let crossed = false;
        let dryOffset: number | undefined;
        for (let image = 1; image < twin.lastStep - 2 && !crossed; image++) {
            const epoch = START + image * 100 + 50;
            view.update(epoch, epoch, true, false);
            const target = twin.stepFor(epoch);
            while (twin.steps < target) twin.step();
            if (twin.state[0] !== ZOMBIE_WALKING) continue;
            const between = twin.between(epoch);
            const x = twin.lastX[0] + (twin.x[0] - twin.lastX[0]) * between;
            const y = twin.lastY[0] + (twin.y[0] - twin.lastY[0]) * between;
            expect(view.walking()).toBe(1);
            const shown = blitters.flatMap((blitter) =>
                blitter.bobs.filter((bob) => bob.visible).map((bob) => ({ bob, depth: blitter.depth })),
            );
            expect(shown).toHaveLength(1);
            const { bob, depth } = shown[0];
            if (flooded(x)) {
                inWater++;
                // The water and what is drawn on it (TerrainView, WaterFlowView, WaterGlints) are under the depth 1.
                expect(depth).toBeGreaterThan(1);
                // Half under: its image cut at the water line, drawn lower (the hollow, and sunk a little).
                expect(bob.frame).toBeGreaterThanOrEqual(wadingFrames);
                expect(bob.y - Math.round(y)).toBeGreaterThan((dryOffset ?? 0) + 12);
            } else {
                expect(bob.frame).toBeLessThan(wadingFrames);
                if (x < 28 * TILE_PX) dryOffset ??= bob.y - Math.round(y);
            }
            crossed = x > 34 * TILE_PX;
        }
        expect(inWater).toBeGreaterThanOrEqual(5);
        expect(crossed).toBe(true);
        expect(view.walking()).toBe(1);
    });
    it("draws a zombie a dart went through hurt, then falling dead where it was met, recoiling along it, then gone", () => {
        const dry = new Uint8Array(WIDTH_CELLS * HEIGHT_CELLS);
        const shotStep = 20;
        // Where the zombie runs at the step the dart is shot at: the dart comes from 12 px east of it, westwards.
        const twin = new ZombieCrowd(hordeOver(dry));
        while (twin.steps < shotStep) twin.step();
        const fromX = Math.round(twin.x[0] + 12);
        const fromY = Math.round(twin.y[0] - 10);
        // Applied by the log well after its flight, as on a map sped up: the zombie is drawn falling before.
        const applyStep = shotStep + ZOMBIE_DART_TICKS + 20;
        const told = {
            ...hordeOver(dry),
            avatars: encodeZombieLog([
                {
                    applyStep,
                    changes: [],
                    darts: [{ fromX, fromY, toX: fromX - 384, toY: fromY, shotStep, stride: 1 }],
                },
            ]),
        };
        const { scene, blitters } = createScene();
        const view = new ZombieView(scene);
        view.setHorde(told, START);
        const shown = () => blitters.flatMap((blitter) => blitter.bobs.filter((bob) => bob.visible));
        // Zombie 0: the first sheet, the first scale, its rows of eight images.
        const rowOf = (frame: number) => Math.floor(frame / ZOMBIE_SHEET_COLUMNS);
        const rows: number[] = [];
        let fallenAt: number | undefined;
        let walkedAt: number | undefined;
        for (let image = 1; image <= shotStep + ZOMBIE_DART_FALL_STEPS + 5; image++) {
            const epoch = START + image * 100 - 1;
            view.update(epoch, epoch, true, false);
            const bobs = shown();
            if (image <= shotStep) {
                // It runs up to the step it is met at.
                expect(bobs).toHaveLength(1);
                expect(rowOf(bobs[0].frame)).toBe(ZOMBIE_WALK);
                walkedAt = bobs[0].x;
                continue;
            }
            if (image >= shotStep + ZOMBIE_DART_FALL_STEPS + 1) {
                expect(bobs).toHaveLength(0);
                continue;
            }
            expect(bobs).toHaveLength(1);
            rows.push(rowOf(bobs[0].frame));
            // Where it was met, a few pixels further west (the dart flies west), and no further: it does not run on.
            fallenAt ??= bobs[0].x;
            expect(bobs[0].x).toBeLessThanOrEqual(fallenAt);
            expect(bobs[0].x).toBeGreaterThanOrEqual(fallenAt - 10);
            // It faces where the dart came from.
            expect(bobs[0].flipX).toBe(false);
        }
        expect(Math.abs((fallenAt ?? 0) - (walkedAt ?? 0))).toBeLessThan(16);
        expect(rows.slice(0, 3)).toEqual([ZOMBIE_HURT, ZOMBIE_HURT, ZOMBIE_HURT]);
        expect(rows.at(-1)).toBe(ZOMBIE_DEAD);
        expect(new Set(rows)).toEqual(new Set([ZOMBIE_HURT, ZOMBIE_DEAD]));
        // The crowd killed it once the log applied the dart: met at the step it was shot at, it lay its 3 s already.
        const crowd = new ZombieCrowd(told);
        while (crowd.steps < applyStep) crowd.step();
        expect(crowd.state[0]).toBe(ZOMBIE_WALKING);
        crowd.step();
        expect(crowd.hitStep[0]).toBe(shotStep);
        expect(crowd.state[0]).not.toBe(ZOMBIE_WALKING);
        expect(crowd.state[0]).not.toBe(ZOMBIE_SHOT);
    });

    it("never steps past the step its log is complete to: it waits there, still drawn, then goes on", () => {
        const dry = new Uint8Array(WIDTH_CELLS * HEIGHT_CELLS);
        const visible = (blitters: { bobs: { visible: boolean; x: number; y: number }[] }[]) =>
            blitters.flatMap((blitter) => blitter.bobs.filter((bob) => bob.visible).map(({ x, y }) => ({ x, y })));
        // Its log complete to the step 30 only (a message lost), the time of the server at the step 100.
        const waiting = createScene();
        const stalled = new ZombieView(waiting.scene);
        stalled.setHorde({ ...hordeOver(dry), safeStep: 30 }, START);
        for (let image = 1; image <= 100; image++)
            stalled.update(START + image * 100, START + image * 100, true, false);
        // The same horde stepped to the step 31 and drawn there, as it waits.
        const reference = createScene();
        const stepped = new ZombieView(reference.scene);
        stepped.setHorde(hordeOver(dry), START);
        for (let image = 1; image <= 30; image++) stepped.update(START + image * 100, START + image * 100, true, false);
        // At the end of the step 31, where the waiting one is drawn.
        stepped.update(START + 3100 - 0.001, START + 3100, true, false);
        expect(visible(waiting.blitters)).toHaveLength(1);
        expect(visible(waiting.blitters)).toEqual(visible(reference.blitters));
        // The log comes: it catches up.
        stalled.setHorde({ ...hordeOver(dry), safeStep: 1_000_000 }, START);
        for (let image = 101; image <= 110; image++) {
            stalled.update(START + image * 100, START + image * 100, true, false);
        }
        expect(visible(waiting.blitters)).toHaveLength(1);
        expect(visible(waiting.blitters)).not.toEqual(visible(reference.blitters));
    });

    it("tells the doors the zombies about to go through them, as drawn, and none while they are not drawn", () => {
        const dry = new Uint8Array(WIDTH_CELLS * HEIGHT_CELLS);
        const { scene } = createScene();
        const view = new ZombieView(scene);
        expect(view.doorOpenersIn({ left: 0, top: 0, right: 10_000, bottom: 10_000 })).toEqual([]);
        view.setHorde(hordeOver(dry), START);
        for (let image = 1; image <= 40; image++) view.update(START + image * 100, START + image * 100, true, false);
        // The single zombie, running east: told where it will be in a quarter of a second, facing sideways.
        const [zombie] = view.doorOpenersIn({ left: 0, top: 0, right: 10_000, bottom: 10_000 });
        expect(zombie.facingSideways).toBe(true);
        expect(zombie.silent).toBeUndefined();
        expect(zombie.uuid).toBeUndefined();
        // A rectangle just ahead of it: it is in it; one just behind it: it is not.
        expect(
            view.doorOpenersIn({ left: zombie.x - 2, top: zombie.y - 2, right: zombie.x + 2, bottom: zombie.y + 2 }),
        ).toHaveLength(1);
        expect(
            view.doorOpenersIn({ left: zombie.x - 60, top: zombie.y - 2, right: zombie.x - 40, bottom: zombie.y + 2 }),
        ).toHaveLength(0);
        // In Basique (not drawn), it opens nothing.
        view.update(START + 4100, START + 4100, false, false);
        expect(view.doorOpenersIn({ left: 0, top: 0, right: 10_000, bottom: 10_000 })).toEqual([]);
    });

    it("tells no door a zombie runs into but keeps out of (a desk's, a locked area's): it stops before it", () => {
        const dry = new Uint8Array(WIDTH_CELLS * HEIGHT_CELLS);
        const tilesWide = (WIDTH_CELLS * TERRAIN_CELL) / TILE_PX;
        // Where the single zombie runs (east, along its row) at 4 s, without a desk.
        const { scene: freeScene } = createScene();
        const free = new ZombieView(freeScene);
        free.setHorde(hordeOver(dry), START);
        for (let image = 1; image <= 40; image++) free.update(START + image * 100, START + image * 100, true, false);
        const [ahead] = free.doorOpenersIn({ left: 0, top: 0, right: 10_000, bottom: 10_000 });
        const tileX = Math.floor(ahead.x / TILE_PX) + 1;
        const tileY = Math.floor(ahead.y / TILE_PX);
        // The same horde, a column of door tiles kept out of across its way, one tile further than it is at 4 s.
        const door = Array.from({ length: HEIGHT_CELLS / 2 }, (_, row) => row * tilesWide + tileX);
        const { scene } = createScene();
        const view = new ZombieView(scene);
        view.setHorde(
            { ...hordeOver(dry), avatars: encodeZombieLog([{ applyStep: 0, changes: [], forbidOn: door }]) },
            START,
        );
        const rect = {
            left: tileX * TILE_PX,
            top: tileY * TILE_PX,
            right: (tileX + 1) * TILE_PX,
            bottom: (tileY + 1) * TILE_PX,
        };
        let told = 0;
        for (let image = 1; image <= 80; image++) {
            view.update(START + image * 100, START + image * 100, true, false);
            told += view.doorOpenersIn(rect).length;
        }
        expect(told).toBe(0);
        // Without the tiles kept out of, it is told there as it comes.
        let toldFree = 0;
        for (let image = 41; image <= 80; image++) {
            free.update(START + image * 100, START + image * 100, true, false);
            toldFree += free.doorOpenersIn(rect).length;
        }
        expect(toldFree).toBeGreaterThan(0);
    });
});
