import { afterEach, describe, expect, it, vi } from "vitest";
import { writable } from "svelte/store";
import { isBrave } from "../../../../../src/front/Phaser/Game/Wander/WanderFear";
import type { Entity } from "../../../../../src/front/Phaser/ECS/Entity";
import type { GameScene } from "../../../../../src/front/Phaser/Game/GameScene";
import { WanderingCharactersManager } from "../../../../../src/front/Phaser/Game/Wander/WanderingCharactersManager";
import type { Point } from "../../../../../src/front/Phaser/Game/Wander/WanderSchedule";
import type * as WanderScheduleModule from "../../../../../src/front/Phaser/Game/Wander/WanderSchedule";
import { JUNGLE_RADIUS_TILES } from "../../../../../src/front/Phaser/Game/Jungle/JunglePlan";
import type { JungleAnimal } from "../../../../../src/front/Phaser/Game/Jungle/JunglePlan";
import { mapEditorModeStore } from "../../../../../src/front/Stores/MapEditorStore";

vi.mock("phaser", () => ({
    Loader: { Events: { FILE_LOAD_ERROR: "loaderror" } },
    Scenes: { Events: { UPDATE: "update" } },
}));

vi.mock("../../../../../src/front/Stores/MapEditorStore", () => ({
    mapEditorModeStore: writable(false),
}));

vi.mock("../../../../../src/front/Utils/PathfindingManager", () => ({
    PathTileType: { Walkable: 0, Collider: 1, Exit: 2, MeetingRoom: 3, PersonalDesk: 4 },
    PathfindingManager: class {
        setCollisionGrid(): void {}
        setBarriers(): void {}
        findPathFromGameCoordinates(): Promise<Point[]> {
            return Promise.resolve([]);
        }
    },
}));

const schedules = vi.hoisted(() => [] as { entityId: string; map: unknown; radiusTiles: number | undefined }[]);
// What the schedules answer instead of standing at the nest, and how many times they were reset.
const walk = vi.hoisted(() => ({ pose: undefined as object | undefined, resets: 0 }));

// A character standing still at its nest: the test is about the visibility, not the walk.
vi.mock("../../../../../src/front/Phaser/Game/Wander/WanderSchedule", async (importOriginal) => ({
    ...(await importOriginal<typeof WanderScheduleModule>()),
    WanderSchedule: class {
        constructor(
            entityId: string,
            private nest: Point,
            map: unknown,
            radiusTiles?: number,
        ) {
            schedules.push({ entityId, map, radiusTiles });
        }
        poseAt() {
            return walk.pose ?? { x: this.nest.x, y: this.nest.y, direction: "down", moving: false, pausedMs: 0 };
        }
        setNest(nest: Point): void {
            this.nest = nest;
        }
        reset(): void {
            walk.resets++;
        }
    },
}));

const SHEET = "duck.png";

const DAY_MS = 24 * 60 * 60 * 1000;

function makeSprite() {
    const sprite = {
        x: 0,
        y: 0,
        depth: 0,
        visible: true,
        angle: 0,
        scaleY: 1,
        frame: { name: 1 },
        anims: { isPlaying: false },
        setOrigin: () => sprite,
        setDepth: (depth: number) => {
            sprite.depth = depth;
            return sprite;
        },
        setVisible: (visible: boolean) => {
            sprite.visible = visible;
            return sprite;
        },
        setPosition: (x: number, y: number) => {
            sprite.x = x;
            sprite.y = y;
            return sprite;
        },
        setAngle: (angle: number) => {
            sprite.angle = angle;
            return sprite;
        },
        setScale: (_x: number, y: number) => {
            sprite.scaleY = y;
            return sprite;
        },
        setFrame: (frame: number) => {
            sprite.frame.name = frame;
            return sprite;
        },
        play: () => sprite,
        stop: () => sprite,
        destroy: () => {},
    };
    return sprite;
}

function makeScene(
    properties: { type: string }[] = [],
    image: { width: number; height: number; frameTotal: number } = { width: 96, height: 128, frameTotal: 13 },
    options: { withDuck?: boolean; sheetLoaded?: boolean; drinkInterval?: number } = {},
) {
    const { withDuck = true, sheetLoaded = true, drinkInterval } = options;
    // The water of the relief: pixels of water by cell of 16 px ("column,row"), and its version.
    const water = { depths: {} as Record<string, number>, version: 0 };
    const entity = {
        entityId: "duck",
        x: 64,
        y: 64,
        displayWidth: 32,
        displayHeight: 32,
        visible: true,
        active: true,
        texture: { key: "duck-entity.png" },
        getPrefab: () => ({ imagePath: "duck-entity.png", tags: [], wander: { sheetPath: SHEET } }),
        getElevation: () => 0,
        getEntityData: () => ({ properties }),
        setVisible: (visible: boolean) => {
            entity.visible = visible;
            return entity;
        },
    };
    const sprite = makeSprite();
    const destroySprite = vi.fn();
    sprite.destroy = destroySprite;
    const addSprite = vi.fn(() => sprite);
    const markDirty = vi.fn();
    // The feet of the avatars on the ground: the wild animals run from them.
    const avatars: { x: number; y: number }[] = [];
    let reconcile: () => void = () => {};
    let update: () => void = () => {};
    let loadError: (file: { key: string }) => void = () => {};
    const scene = {
        getGameMapFrontWrapper: () => ({
            getTileDimensions: () => ({ width: 32, height: 32 }),
            getSharedCollisionGrid: () => Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => 0)),
            getEntitiesManager: () => ({ getEntities: () => new Map(withDuck ? [["duck", entity]] : []) }),
            getWallBarriers: () => ({ equals: () => true, blocksMove: () => false }),
        }),
        avatarFeetOnGround: () => avatars,
        getTerrainWater: () => ({
            version: () => water.version,
            coveredArea: () => ({ x: 0, y: 0, width: 320, height: 320 }),
            settledDepthAt: (x: number, y: number) => water.depths[`${Math.floor(x / 16)},${Math.floor(y / 16)}`] ?? 0,
        }),
        getGameMap: () => ({
            getWamFile: () => ({ getWam: () => ({ settings: drinkInterval ? { life: { drinkInterval } } : {} }) }),
        }),
        time: {
            addEvent: ({ callback }: { callback: () => void }) => {
                reconcile = callback;
                return { remove: () => {} };
            },
        },
        load: {
            on: (_event: string, listener: (file: { key: string }) => void) => {
                loadError = listener;
            },
            off: () => {},
            once: () => {},
            spritesheet: () => {},
            start: () => {},
        },
        events: {
            on: (_event: string, listener: () => void) => {
                update = listener;
            },
            off: () => {},
        },
        textures: {
            exists: () => sheetLoaded,
            get: () => ({
                frameTotal: image.frameTotal,
                getSourceImage: () => ({ width: image.width, height: image.height }),
            }),
        },
        anims: { exists: () => true, create: () => {}, generateFrameNumbers: () => [] },
        add: { sprite: addSprite },
        markDirty,
    } as unknown as GameScene;
    const manager = new WanderingCharactersManager(scene);
    return {
        avatars,
        manager,
        sprite,
        addSprite,
        entity: entity as unknown as Entity & { visible: boolean },
        destroySprite,
        markDirty,
        /** Puts water over cells of the relief, as a new state of the server would. */
        flood: (depths: Record<string, number>) => {
            water.depths = depths;
            water.version++;
        },
        reconcile: () => reconcile(),
        update: () => update(),
        loadError: (key: string) => loadError({ key }),
    };
}

function openers(manager: WanderingCharactersManager): Point[] {
    const positions: Point[] = [];
    manager.forEachDoorOpener((position) => positions.push(position));
    return positions;
}

describe("WanderingCharactersManager", () => {
    let manager: WanderingCharactersManager | undefined;

    afterEach(() => {
        manager?.destroy();
        manager = undefined;
        walk.pose = undefined;
        walk.resets = 0;
    });

    it("makes a visible wandering character that opens doors and hides its entity", () => {
        const scene = makeScene();
        manager = scene.manager;
        scene.reconcile();
        scene.update();
        expect(scene.sprite.visible).toBe(true);
        expect(scene.entity.visible).toBe(false);
        expect(openers(manager)).toHaveLength(1);
    });

    it("leaves a sheet that is not 4 rows of 32 px frames as a still object", () => {
        // A big drawing cut in 32 px frames would be garbage.
        const scene = makeScene([], { width: 1536, height: 1024, frameTotal: 48 * 32 + 1 });
        manager = scene.manager;
        scene.reconcile();
        scene.update();
        expect(scene.addSprite).not.toHaveBeenCalled();
        expect(openers(manager)).toEqual([]);
        expect(scene.entity.visible).toBe(true);
    });

    describe("free characters (no object on the map)", () => {
        const LION: JungleAnimal = { id: "jungle:tree-1", sheetPath: SHEET, nest: { x: 48, y: 48 } };

        afterEach(() => {
            mapEditorModeStore.set(false);
            schedules.length = 0;
        });

        it("the wander map is ready on a map without placed animals", () => {
            const scene = makeScene([], undefined, { withDuck: false });
            manager = scene.manager;
            // The collisions are read before any character exists: the jungle needs them to find its nests.
            expect(manager.getWanderMap().isWalkable({ x: 1, y: 1 })).toBe(true);
            expect(manager.getWanderMap().isWalkable({ x: 20, y: 1 })).toBe(false);
        });

        it("walk on the given map, within the jungle radius", () => {
            const scene = makeScene([], undefined, { withDuck: false });
            manager = scene.manager;
            const map = manager.getWanderMap();
            manager.setFreeCharacters([LION], map);
            expect(schedules).toEqual([{ entityId: LION.id, map, radiusTiles: JUNGLE_RADIUS_TILES }]);
            scene.update();
            expect(scene.sprite.visible).toBe(true);
            expect(manager.freeCharacterPose(LION.id)).toEqual({ x: 48, y: 48, moving: false });
        });

        it("free characters do not open doors", () => {
            const scene = makeScene([], undefined, { withDuck: false });
            manager = scene.manager;
            manager.setFreeCharacters([LION], manager.getWanderMap());
            scene.update();
            expect(scene.sprite.visible).toBe(true);
            expect(openers(manager)).toEqual([]);
        });

        it("reconcile keeps free characters and setFreeCharacters([]) destroys their sprites", () => {
            const scene = makeScene([], undefined, { withDuck: false });
            manager = scene.manager;
            manager.setFreeCharacters([LION], manager.getWanderMap());
            scene.update();
            scene.reconcile();
            scene.update();
            expect(scene.destroySprite).not.toHaveBeenCalled();
            expect(scene.sprite.visible).toBe(true);
            scene.markDirty.mockClear();
            manager.setFreeCharacters([], manager.getWanderMap());
            expect(scene.destroySprite).toHaveBeenCalledOnce();
            expect(scene.markDirty).toHaveBeenCalled();
            expect(manager.freeCharacterPose(LION.id)).toBeUndefined();
        });

        it("placed animals are left alone by setFreeCharacters", () => {
            const scene = makeScene();
            manager = scene.manager;
            scene.reconcile();
            manager.setFreeCharacters([], manager.getWanderMap());
            scene.update();
            expect(scene.destroySprite).not.toHaveBeenCalled();
            expect(scene.sprite.visible).toBe(true);
            expect(openers(manager)).toHaveLength(1);
        });

        it("a new map gives them a new schedule, a moved nest moves them", () => {
            const scene = makeScene([], undefined, { withDuck: false });
            manager = scene.manager;
            const first = manager.getWanderMap();
            manager.setFreeCharacters([LION], first);
            manager.setFreeCharacters([LION], first);
            expect(schedules).toHaveLength(1);
            const second = { ...first };
            manager.setFreeCharacters([LION], second);
            expect(schedules).toHaveLength(2);
            expect(schedules[1].map).toBe(second);
            manager.setFreeCharacters([{ ...LION, nest: { x: 80, y: 48 } }], second);
            expect(schedules).toHaveLength(2);
            scene.update();
            expect(manager.freeCharacterPose(LION.id)).toEqual({ x: 80, y: 48, moving: false });
        });

        it("a shown character whose nest moved runs to its new walk instead of vanishing", () => {
            const clock = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
            const scene = makeScene([], undefined, { withDuck: false });
            manager = scene.manager;
            const map = manager.getWanderMap();
            manager.setFreeCharacters([LION], map);
            scene.update();
            const start = manager.freeCharacterPose(LION.id);
            if (!start) throw new Error("The lion is not shown");
            manager.setFreeCharacters([{ ...LION, nest: { x: start.x + 160, y: start.y } }], map);
            clock.mockReturnValue(1_000_050);
            scene.update();
            expect(scene.sprite.visible).toBe(true);
            expect(manager.freeCharacterPose(LION.id)?.x).toBeCloseTo(start.x + 9.6, 5);
            clock.mockRestore();
        });

        it("a wild animal runs from an avatar that comes close, unless it is brave today", () => {
            // A day on which this lion fears the avatars.
            const day = [0, 1, 2, 3, 4, 5, 6, 7].find((offset) => !isBrave(LION.id, (100 + offset) * DAY_MS));
            if (day === undefined) throw new Error("The lion is brave every day");
            const now = (100 + day) * DAY_MS;
            const clock = vi.spyOn(Date, "now").mockReturnValue(now);
            const scene = makeScene([], undefined, { withDuck: false });
            manager = scene.manager;
            manager.setFreeCharacters([LION], manager.getWanderMap());
            scene.update();
            const start = manager.freeCharacterPose(LION.id);
            if (!start) throw new Error("The lion is not shown");
            scene.avatars.push({ x: start.x - 40, y: start.y });
            clock.mockReturnValue(now + 50);
            scene.update();
            // Away from the avatar, at a run: 192 px/s for 50 ms.
            expect(manager.freeCharacterPose(LION.id)?.x).toBeCloseTo(start.x + 9.6, 5);
            expect(manager.freeCharacterPose(LION.id)?.moving).toBe(true);
            clock.mockRestore();
        });

        it("free characters are hidden in the map editor", () => {
            const scene = makeScene([], undefined, { withDuck: false });
            manager = scene.manager;
            manager.setFreeCharacters([LION], manager.getWanderMap());
            scene.update();
            expect(scene.sprite.visible).toBe(true);
            mapEditorModeStore.set(true);
            scene.update();
            expect(scene.sprite.visible).toBe(false);
            expect(manager.freeCharacterPose(LION.id)).toBeUndefined();
            mapEditorModeStore.set(false);
            scene.update();
            expect(scene.sprite.visible).toBe(true);
        });

        it("a lead moves a free character instead of its schedule, and hides it while it gives no pose", () => {
            const scene = makeScene([], undefined, { withDuck: false });
            manager = scene.manager;
            manager.setFreeCharacters([LION], manager.getWanderMap());
            scene.update();
            let pose: WanderScheduleModule.WanderPose | undefined = {
                x: 100,
                y: 120,
                direction: "right",
                moving: true,
                pausedMs: 0,
            };
            manager.setCharacterLead(LION.id, { poseAt: () => pose });
            scene.update();
            expect(manager.freeCharacterPose(LION.id)).toEqual({ x: 100, y: 120, moving: true });
            expect(scene.sprite.visible).toBe(true);
            pose = undefined;
            scene.update();
            expect(scene.sprite.visible).toBe(false);
            expect(manager.freeCharacterPose(LION.id)).toBeUndefined();
            // Without its lead, it is back to its schedule, around its nest.
            manager.setCharacterLead(LION.id, undefined);
            scene.update();
            expect(manager.freeCharacterPose(LION.id)).toEqual({ x: 48, y: 48, moving: false });
        });

        it("a led character keeps its lead across a new map, and is hidden in the map editor", () => {
            const scene = makeScene([], undefined, { withDuck: false });
            manager = scene.manager;
            const map = manager.getWanderMap();
            manager.setFreeCharacters([LION], map);
            manager.setCharacterLead(LION.id, {
                poseAt: () => ({ x: 100, y: 120, direction: "down", moving: false, pausedMs: 0 }),
            });
            manager.setFreeCharacters([LION], { ...map });
            scene.update();
            expect(manager.freeCharacterPose(LION.id)).toEqual({ x: 100, y: 120, moving: false });
            mapEditorModeStore.set(true);
            scene.update();
            expect(scene.sprite.visible).toBe(false);
        });

        it("lists every tamable character: the free ones and the placed ones (entity:<id>)", () => {
            const scene = makeScene();
            manager = scene.manager;
            scene.reconcile();
            scene.update();
            expect(manager.characterPose("entity:duck")).toEqual({ x: 80, y: 80, moving: false });
            // The entity id alone names no tamable character: the free ones and the placed ones never mix.
            expect(manager.characterPose("duck")).toBeUndefined();
            manager.setFreeCharacters([LION], manager.getWanderMap());
            expect(manager.tameableCharacters()).toEqual([
                { id: "entity:duck", sheetPath: SHEET, nest: { x: 80, y: 80 } },
                LION,
            ]);
        });

        it("a placed animal can be led: its object stays hidden, even while its master is out of view", () => {
            const scene = makeScene();
            manager = scene.manager;
            scene.reconcile();
            scene.update();
            let pose: WanderScheduleModule.WanderPose | undefined = {
                x: 200,
                y: 120,
                direction: "left",
                moving: true,
                pausedMs: 0,
            };
            manager.setCharacterLead("entity:duck", { poseAt: () => pose });
            expect(manager.isLed("entity:duck")).toBe(true);
            scene.update();
            expect(manager.characterPose("entity:duck")).toEqual({ x: 200, y: 120, moving: true });
            expect(scene.entity.visible).toBe(false);
            pose = undefined;
            scene.update();
            expect(scene.sprite.visible).toBe(false);
            expect(scene.entity.visible).toBe(false);
            manager.setCharacterLead("entity:duck", undefined);
            expect(manager.isLed("entity:duck")).toBe(false);
            scene.update();
            expect(manager.characterPose("entity:duck")).toEqual({ x: 80, y: 80, moving: false });
        });

        it("in the map editor, a placed animal someone leads shows its object, to be edited", () => {
            const scene = makeScene();
            manager = scene.manager;
            scene.reconcile();
            scene.update();
            manager.setCharacterLead("entity:duck", { poseAt: () => undefined });
            scene.update();
            expect(scene.entity.visible).toBe(false);
            mapEditorModeStore.set(true);
            scene.update();
            expect(scene.entity.visible).toBe(true);
        });

        it("a placed animal led before its sheet is loaded keeps its object shown", () => {
            const scene = makeScene([], undefined, { sheetLoaded: false });
            manager = scene.manager;
            scene.reconcile();
            manager.setCharacterLead("entity:duck", { poseAt: () => undefined });
            scene.update();
            expect(scene.entity.visible).toBe(true);
        });

        it("a led free character opens the doors on its way, like its master", () => {
            const scene = makeScene([], undefined, { withDuck: false });
            manager = scene.manager;
            manager.setFreeCharacters([LION], manager.getWanderMap());
            scene.update();
            expect(openers(manager)).toEqual([]);
            manager.setCharacterLead(LION.id, {
                poseAt: () => ({ x: 100, y: 120, direction: "down", moving: true, pausedMs: 0 }),
            });
            scene.update();
            expect(openers(manager)).toEqual([{ x: 100, y: 104 }]);
        });

        it("a sheet that fails to load leaves no sprite", () => {
            const scene = makeScene([], undefined, { withDuck: false, sheetLoaded: false });
            manager = scene.manager;
            manager.setFreeCharacters([LION], manager.getWanderMap());
            expect(() => {
                scene.loadError(SHEET);
                scene.update();
                scene.reconcile();
                scene.update();
            }).not.toThrow();
            expect(scene.addSprite).not.toHaveBeenCalled();
            expect(manager.freeCharacterPose(LION.id)).toBeUndefined();
        });
    });

    describe("water of the relief", () => {
        // The duck stands on the tile (2, 2); a pond covers the tile (4, 2) (cells 8..9, 4..5).
        const POND = { "8,4": 8, "9,4": 8, "8,5": 8, "9,5": 8 };

        it("closes the tiles under water, and tells where to drink and how often", () => {
            const scene = makeScene([], undefined, { drinkInterval: 300 });
            manager = scene.manager;
            scene.flood(POND);
            scene.reconcile();
            const map = manager.getWanderMap();
            expect(map.isWalkable({ x: 4, y: 2 })).toBe(false);
            expect(map.isWalkable({ x: 3, y: 2 })).toBe(true);
            expect(map.shores?.()).toContainEqual({ x: 3 * 32 + 16, y: 2 * 32 + 16, toward: "right" });
            expect(map.shores?.()).toHaveLength(4);
            expect(map.drinkIntervalMs?.()).toBe(300_000);
        });

        it("drinks every two minutes on a map that says nothing", () => {
            const scene = makeScene();
            manager = scene.manager;
            scene.reconcile();
            expect(manager.getWanderMap().drinkIntervalMs?.()).toBe(120_000);
        });

        it("a lake at rest leaves the walks alone; water that comes near makes the character walk again", () => {
            const scene = makeScene();
            manager = scene.manager;
            scene.flood(POND);
            scene.reconcile();
            scene.reconcile();
            // The same water, told again by the server.
            scene.flood({ ...POND });
            scene.reconcile();
            expect(walk.resets).toBe(0);
            scene.flood({ ...POND, "6,4": 8 });
            scene.reconcile();
            expect(walk.resets).toBe(1);
        });

        it("runs to where its walk has it now when the water changed that walk, instead of jumping there", () => {
            const clock = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
            const scene = makeScene();
            manager = scene.manager;
            scene.reconcile();
            scene.update();
            const start = { x: scene.sprite.x, y: scene.sprite.y };
            scene.flood(POND);
            scene.reconcile();
            // Its new walk has it far to the west; the next frame comes 50 ms later.
            walk.pose = { x: start.x - 160, y: start.y, direction: "left", moving: true, pausedMs: 0 };
            clock.mockReturnValue(1_000_050);
            scene.update();
            // 192 px a second.
            expect(scene.sprite.x).toBeCloseTo(start.x - 9.6, 5);
            expect(scene.sprite.y).toBe(start.y);
            clock.mockRestore();
        });

        it("draws a drinking character standing, bowed to the water, and straight again afterwards", () => {
            const scene = makeScene([], { width: 160, height: 128, frameTotal: 21 });
            manager = scene.manager;
            scene.reconcile();
            walk.pose = { x: 80, y: 80, direction: "right", moving: false, pausedMs: 500, drinking: true };
            scene.update();
            expect(scene.sprite.angle).toBeGreaterThan(0);
            // The standing frame of the row "right" of a sheet of 5 columns, not a rest pose.
            expect(scene.sprite.frame.name).toBe(2 * 5 + 1);
            walk.pose = { x: 80, y: 80, direction: "right", moving: true, pausedMs: 0 };
            scene.update();
            expect(scene.sprite.angle).toBe(0);
            expect(scene.sprite.scaleY).toBe(1);
        });
    });
});
