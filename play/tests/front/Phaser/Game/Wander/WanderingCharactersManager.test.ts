import { lifeFireOf } from "@workadventure/map-editor";
import { afterEach, describe, expect, it, vi } from "vitest";
import { writable } from "svelte/store";
import { isBrave } from "../../../../../src/front/Phaser/Game/Wander/WanderFear";
import type { Entity } from "../../../../../src/front/Phaser/ECS/Entity";
import type { GameScene } from "../../../../../src/front/Phaser/Game/GameScene";
import { WanderingCharactersManager } from "../../../../../src/front/Phaser/Game/Wander/WanderingCharactersManager";
import type { Point, WanderPose } from "../../../../../src/front/Phaser/Game/Wander/WanderSchedule";
import type * as WanderScheduleModule from "../../../../../src/front/Phaser/Game/Wander/WanderSchedule";
import { JUNGLE_RADIUS_TILES } from "../../../../../src/front/Phaser/Game/Jungle/JunglePlan";
import type { JungleAnimal } from "../../../../../src/front/Phaser/Game/Jungle/JunglePlan";
import { mapEditorModeStore } from "../../../../../src/front/Stores/MapEditorStore";
import { floorDepth } from "../../../../../src/front/Phaser/Game/MapEditor/MapLayer/FloorDepth";
import { FloorModel } from "../../../../../src/front/Phaser/Game/MapEditor/MapLayer/FloorModel";

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
            return (
                walk.pose ?? {
                    x: this.nest.x,
                    y: this.nest.y,
                    direction: "down",
                    moving: false,
                    pausedMs: 0,
                    ...(this.nest.z ? { z: this.nest.z } : {}),
                }
            );
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
    options: {
        withDuck?: boolean;
        sheetLoaded?: boolean;
        drinkInterval?: number;
        /** The raised floors of the map, as the floors of the avatars read them. */
        floors?: { model: FloorModel };
        /** The altitude the duck was put at. */
        duckElevation?: number;
    } = {},
) {
    const { withDuck = true, sheetLoaded = true, drinkInterval, floors, duckElevation = 0 } = options;
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
        getPrefab: () => ({
            collectionName: "Animaux",
            id: "Animaux:duck:Default:Down",
            imagePath: "duck-entity.png",
            tags: [],
            wander: { sheetPath: SHEET },
        }),
        getElevation: () => duckElevation,
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
    // The tiles of the map on fire ("x,y"): every walking animal runs from them.
    const burning = new Set<string>();
    const fire = lifeFireOf({ fireAt: (x, y) => (burning.has(`${x},${y}`) ? 1 : 0) });
    let reconcile: () => void = () => {};
    let update: () => void = () => {};
    let loadError: (file: { key: string }) => void = () => {};
    const scene = {
        floorSpike: { walkContext: () => (floors ? { model: floors.model, state: { elevation: 0 } } : undefined) },
        getGameMapFrontWrapper: () => ({
            getTileDimensions: () => ({ width: 32, height: 32 }),
            getSharedCollisionGrid: () => Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => 0)),
            getEntitiesManager: () => ({ getEntities: () => new Map(withDuck ? [["duck", entity]] : []) }),
            getWallBarriers: () => ({ equals: () => true, blocksMove: () => false }),
        }),
        avatarFeetOnGround: () => avatars,
        getLifeFire: () => (burning.size > 0 ? fire : undefined),
        getTerrainWater: () => ({
            version: () => water.version,
            relief: () => undefined,
            coveredArea: () => ({ x: 0, y: 0, width: 320, height: 320 }),
            walkerSettledDepthAt: (x: number, y: number) =>
                water.depths[`${Math.floor(x / 16)},${Math.floor(y / 16)}`] ?? 0,
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
        burning,
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

        it("a wild animal runs from a fire five tiles away or less, even a brave one", () => {
            // A day on which this lion does not fear the avatars.
            const day = Array.from({ length: 60 }, (_, offset) => offset).find((offset) =>
                isBrave(LION.id, (100 + offset) * DAY_MS),
            );
            if (day === undefined) throw new Error("The lion is never brave");
            const now = (100 + day) * DAY_MS;
            const clock = vi.spyOn(Date, "now").mockReturnValue(now);
            const scene = makeScene([], undefined, { withDuck: false });
            manager = scene.manager;
            manager.setFreeCharacters([LION], manager.getWanderMap());
            scene.update();
            const start = manager.freeCharacterPose(LION.id);
            if (!start) throw new Error("The lion is not shown");
            // The tile on its west burns.
            const tileX = Math.floor(start.x / 32) - 1;
            const tileY = Math.floor(start.y / 32);
            scene.burning.add(`${tileX},${tileY}`);
            clock.mockReturnValue(now + 50);
            scene.update();
            const after = manager.freeCharacterPose(LION.id);
            if (!after) throw new Error("The lion is not shown");
            // Away from the middle of the burning tile, at a run: 192 px/s for 50 ms.
            const from = { x: (tileX + 0.5) * 32, y: (tileY + 0.5) * 32 };
            const away =
                Math.hypot(after.x - from.x, after.y - from.y) - Math.hypot(start.x - from.x, start.y - from.y);
            expect(away).toBeCloseTo(9.6, 5);
            expect(after.moving).toBe(true);
            clock.mockRestore();
        });

        it("never runs onto a ground that burns", () => {
            const now = 100 * DAY_MS;
            const clock = vi.spyOn(Date, "now").mockReturnValue(now);
            const scene = makeScene([], undefined, { withDuck: false });
            manager = scene.manager;
            manager.setFreeCharacters([LION], manager.getWanderMap());
            scene.update();
            const start = manager.freeCharacterPose(LION.id);
            if (!start) throw new Error("The lion is not shown");
            const tileX = Math.floor(start.x / 32);
            const tileY = Math.floor(start.y / 32);
            // A fire on its west, and a wall of fire two tiles on its east, where the straight way out leads.
            scene.burning.add(`${tileX - 1},${tileY}`);
            for (let row = tileY - 1; row <= tileY + 1; row++) scene.burning.add(`${tileX + 2},${row}`);
            for (let frame = 1; frame <= 20; frame++) {
                clock.mockReturnValue(now + frame * 50);
                scene.update();
                const pose = manager.freeCharacterPose(LION.id);
                if (!pose) throw new Error("The lion is not shown");
                expect(scene.burning.has(`${Math.floor(pose.x / 32)},${Math.floor(pose.y / 32)}`)).toBe(false);
            }
            clock.mockRestore();
        });

        it("an animal put on the map runs from a fire too", () => {
            const clock = vi.spyOn(Date, "now").mockReturnValue(100 * DAY_MS);
            const scene = makeScene();
            manager = scene.manager;
            scene.reconcile();
            scene.update();
            const start = { x: scene.sprite.x, y: scene.sprite.y };
            const tileX = Math.floor(start.x / 32) - 1;
            const tileY = Math.floor(start.y / 32);
            scene.burning.add(`${tileX},${tileY}`);
            clock.mockReturnValue(100 * DAY_MS + 50);
            scene.update();
            const from = { x: (tileX + 0.5) * 32, y: (tileY + 0.5) * 32 };
            const away =
                Math.hypot(scene.sprite.x - from.x, scene.sprite.y - from.y) -
                Math.hypot(start.x - from.x, start.y - from.y);
            expect(away).toBeCloseTo(9.6, 5);
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

    describe("raised floors", () => {
        const LION: JungleAnimal = { id: "jungle:tree-1", sheetPath: SHEET, nest: { x: 48, y: 48 } };
        const centre = (x: number, y: number): Point => ({ x: x * 32 + 16, y: y * 32 + 16 });
        const standing = (x: number, y: number, z: number): WanderPose => ({
            x,
            y,
            z,
            direction: "down",
            moving: false,
            pausedMs: 0,
        });

        /** A bridge: a ramp going east on the tile (3, 5), a deck at 20 px over (4..6, 5), a ramp going west on (7, 5). */
        function bridge(): FloorModel {
            const model = new FloorModel();
            for (let x = 4; x <= 6; x++) model.setSlab(20, x, 5, "bois");
            model.addStair({ direction: "e", width: 1, rise: 20, open: true, ramp: true }, { x: 3, y: 5 }, 0);
            model.addStair({ direction: "o", width: 1, rise: 20, open: true, ramp: true }, { x: 7, y: 5 }, 0);
            return model;
        }

        function raisedOpeners(target: WanderingCharactersManager): (Point & { elevation: number })[] {
            const positions: (Point & { elevation: number })[] = [];
            target.forEachRaisedDoorOpener((position, elevation) => positions.push({ ...position, elevation }));
            return positions;
        }

        afterEach(() => {
            schedules.length = 0;
        });

        it("draws a character on a raised floor its altitude further north, among what stands on that floor", () => {
            const scene = makeScene();
            manager = scene.manager;
            // Its feet are over the point (100, 200) of the ground, 52 px up.
            walk.pose = standing(100, 200, 52);
            scene.reconcile();
            scene.update();
            expect(scene.sprite.visible).toBe(true);
            expect({ x: scene.sprite.x, y: scene.sprite.y }).toEqual({ x: 100, y: 148 });
            expect(scene.sprite.depth).toBe(floorDepth(52, 148));
            // Back on the ground: sorted by its feet, as ever.
            walk.pose = standing(100, 200, 0);
            scene.update();
            expect({ x: scene.sprite.x, y: scene.sprite.y }).toEqual({ x: 100, y: 200 });
            expect(scene.sprite.depth).toBe(200);
        });

        it("opens the doors of its own floor, and is not sensed on the ground", () => {
            const scene = makeScene();
            manager = scene.manager;
            walk.pose = standing(100, 200, 52);
            scene.reconcile();
            scene.update();
            expect(openers(manager)).toEqual([]);
            expect(raisedOpeners(manager)).toEqual([{ x: 100, y: 132, elevation: 52 }]);
            const sensed: Point[] = [];
            manager.forEachWalker((position) => sensed.push(position));
            expect(sensed).toEqual([]);
        });

        it("tells the floors where it stands, to show and fade with its floor like a player", () => {
            const scene = makeScene();
            manager = scene.manager;
            walk.pose = standing(100, 200, 52);
            scene.reconcile();
            scene.update();
            const occupants = [...manager.floorOccupants()];
            expect(occupants).toHaveLength(1);
            expect(occupants[0].isOnFloor(52)).toBe(true);
            expect(occupants[0].isOnFloor(0)).toBe(false);
            expect(occupants[0].isOnFloor(84)).toBe(false);
            // As for a player: its middle, its feet 12 px lower.
            expect({ x: occupants[0].x, y: occupants[0].y }).toEqual({ x: 100, y: 136 });
            // The same one at each call: the floors remember whom they faded.
            expect([...manager.floorOccupants()][0]).toBe(occupants[0]);
        });

        it("on the ground it is drawn where the ground is on a relief seen in 3/4, and not on a raised floor", () => {
            const scene = makeScene();
            manager = scene.manager;
            walk.pose = standing(100, 200, 0);
            scene.reconcile();
            scene.update();
            // A hollow drawn 40 px lower from the row 150 on.
            const dropAt = (_x: number, y: number): number => (y >= 150 ? 40 : 0);
            const lower = [...manager.drawnLower(dropAt)];
            expect(lower).toHaveLength(1);
            expect(lower[0].getGroundDrop()).toBe(40);
            // Its place itself never moves: only the image, while it is drawn (CharacterDrops).
            expect(scene.sprite.y).toBe(200);
            lower[0].y += 40;
            expect(scene.sprite.y).toBe(240);
            lower[0].y -= 40;
            // The same one at each call.
            expect([...manager.drawnLower(dropAt)][0]).toBe(lower[0]);
            // Its shadow lies under it: told on the ground, for it to follow the relief too.
            const told: boolean[] = [];
            manager.forEachShownCharacter((_id, _sprite, raised) => told.push(raised));
            expect(told).toEqual([false]);
            // On a raised floor it passes over the relief.
            walk.pose = standing(100, 200, 52);
            scene.update();
            expect([...manager.drawnLower(dropAt)][0].getGroundDrop()).toBe(0);
            // And its shadow with it.
            told.length = 0;
            manager.forEachShownCharacter((_id, _sprite, raised) => told.push(raised));
            expect(told).toEqual([true]);
        });

        it("the nest of an animal put on a raised floor is on that floor, under its image", () => {
            const scene = makeScene([], undefined, { duckElevation: 52 });
            manager = scene.manager;
            scene.reconcile();
            scene.update();
            // Its image is at (64, 64) on the screen: its middle over the point (80, 132) of the ground, 52 px up.
            expect({ x: scene.sprite.x, y: scene.sprite.y }).toEqual({ x: 80, y: 80 });
            expect(scene.sprite.depth).toBe(floorDepth(52, 80));
        });

        it("a wild animal on a raised floor does not run from the avatars of the ground", () => {
            const scene = makeScene([], undefined, { withDuck: false });
            manager = scene.manager;
            const brave = Array.from({ length: 400 }, (_, i) => i * DAY_MS).find((now) => !isBrave(LION.id, now)) ?? 0;
            vi.spyOn(Date, "now").mockReturnValue(brave);
            walk.pose = standing(100, 200, 52);
            manager.setFreeCharacters([LION], manager.getWanderMap());
            scene.update();
            scene.avatars.push({ x: 104, y: 150 });
            scene.update();
            scene.update();
            expect({ x: scene.sprite.x, y: scene.sprite.y }).toEqual({ x: 100, y: 148 });
            vi.restoreAllMocks();
        });

        it("a led character is drawn at the altitude its lead tells", () => {
            const scene = makeScene([], undefined, { withDuck: false });
            manager = scene.manager;
            manager.setFreeCharacters([LION], manager.getWanderMap());
            manager.setCharacterLead(LION.id, { poseAt: () => standing(300, 400, 84) });
            scene.update();
            expect({ x: scene.sprite.x, y: scene.sprite.y }).toEqual({ x: 300, y: 316 });
            expect(scene.sprite.depth).toBe(floorDepth(84, 316));
            expect(manager.characterPose(LION.id)).toEqual({ x: 300, y: 316, moving: false, z: 84 });
            expect(raisedOpeners(manager)).toEqual([{ x: 300, y: 300, elevation: 84 }]);
        });

        it("tells the map the raised floors, and closes the ground under the stairs", () => {
            const scene = makeScene([], undefined, { withDuck: false, floors: { model: bridge() } });
            manager = scene.manager;
            const map = manager.getWanderMap();
            expect(map.levelsAt?.({ x: 5, y: 5 })).toEqual([20]);
            expect(map.levelsAt?.({ x: 5, y: 6 })).toEqual([]);
            expect(map.isWalkable({ x: 3, y: 5 })).toBe(false);
            expect(map.isWalkable({ x: 7, y: 5 })).toBe(false);
            expect(map.isWalkable({ x: 2, y: 5 })).toBe(true);
            // Under the deck, the ground is still the ground.
            expect(map.isWalkable({ x: 5, y: 5 })).toBe(true);
        });

        it("finds a way over a bridge when the ground gives none, and to a raised floor", async () => {
            const scene = makeScene([], undefined, { withDuck: false, floors: { model: bridge() } });
            manager = scene.manager;
            const map = manager.getWanderMap();
            // The pathfinding of the ground finds nothing here (see the mock).
            const over = await map.findPath(centre(1, 5), centre(9, 5));
            expect(over[0]).toEqual(centre(1, 5));
            expect(over.at(-1)).toEqual(centre(9, 5));
            expect(over.filter((point) => point.z === 20).length).toBeGreaterThanOrEqual(4);
            const up = await map.findPath(centre(1, 5), { ...centre(5, 5), z: 20 });
            expect(up.at(-1)).toEqual({ ...centre(5, 5), z: 20 });
        });

        it("a map without raised floors tells none, and finds no way but the one of the ground", async () => {
            const scene = makeScene([], undefined, { withDuck: false });
            manager = scene.manager;
            const map = manager.getWanderMap();
            expect(map.levelsAt?.({ x: 5, y: 5 })).toEqual([]);
            expect(await map.findPath(centre(1, 5), centre(9, 5))).toEqual([]);
        });

        it("floors that change make every character walk again", () => {
            const floors = { model: bridge() };
            const scene = makeScene([], undefined, { floors });
            manager = scene.manager;
            scene.reconcile();
            scene.reconcile();
            const before = walk.resets;
            scene.reconcile();
            expect(walk.resets).toBe(before);
            // The map editor laid a slab: the floors of the avatars read a new model.
            floors.model = bridge();
            scene.reconcile();
            expect(walk.resets).toBe(before + 1);
        });
    });
});
