import { afterEach, describe, expect, it, vi } from "vitest";
import { writable } from "svelte/store";
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
            return { x: this.nest.x, y: this.nest.y, direction: "down", moving: false, pausedMs: 0 };
        }
        setNest(nest: Point): void {
            this.nest = nest;
        }
        reset(): void {}
    },
}));

const SHEET = "duck.png";

function makeSprite() {
    const sprite = {
        x: 0,
        y: 0,
        depth: 0,
        visible: true,
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
    options: { withDuck?: boolean; sheetLoaded?: boolean } = {},
) {
    const { withDuck = true, sheetLoaded = true } = options;
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
    let reconcile: () => void = () => {};
    let update: () => void = () => {};
    let loadError: (file: { key: string }) => void = () => {};
    const scene = {
        getGameMapFrontWrapper: () => ({
            getTileDimensions: () => ({ width: 32, height: 32 }),
            getSharedCollisionGrid: () => Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => 0)),
            getEntitiesManager: () => ({ getEntities: () => new Map(withDuck ? [["duck", entity]] : []) }),
            getWallBarriers: () => ({ equals: () => true }),
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
        manager,
        sprite,
        addSprite,
        entity: entity as unknown as Entity & { visible: boolean },
        destroySprite,
        markDirty,
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
            manager.setFreeCharacterLead(LION.id, { poseAt: () => pose });
            scene.update();
            expect(manager.freeCharacterPose(LION.id)).toEqual({ x: 100, y: 120, moving: true });
            expect(scene.sprite.visible).toBe(true);
            pose = undefined;
            scene.update();
            expect(scene.sprite.visible).toBe(false);
            expect(manager.freeCharacterPose(LION.id)).toBeUndefined();
            // Without its lead, it is back to its schedule, around its nest.
            manager.setFreeCharacterLead(LION.id, undefined);
            scene.update();
            expect(manager.freeCharacterPose(LION.id)).toEqual({ x: 48, y: 48, moving: false });
        });

        it("a led character keeps its lead across a new map, and is hidden in the map editor", () => {
            const scene = makeScene([], undefined, { withDuck: false });
            manager = scene.manager;
            const map = manager.getWanderMap();
            manager.setFreeCharacters([LION], map);
            manager.setFreeCharacterLead(LION.id, {
                poseAt: () => ({ x: 100, y: 120, direction: "down", moving: false, pausedMs: 0 }),
            });
            manager.setFreeCharacters([LION], { ...map });
            scene.update();
            expect(manager.freeCharacterPose(LION.id)).toEqual({ x: 100, y: 120, moving: false });
            mapEditorModeStore.set(true);
            scene.update();
            expect(scene.sprite.visible).toBe(false);
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
});
