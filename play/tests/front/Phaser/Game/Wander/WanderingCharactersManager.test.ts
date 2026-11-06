import { afterEach, describe, expect, it, vi } from "vitest";
import { writable } from "svelte/store";
import type { Entity } from "../../../../../src/front/Phaser/ECS/Entity";
import type { GameScene } from "../../../../../src/front/Phaser/Game/GameScene";
import { WanderingCharactersManager } from "../../../../../src/front/Phaser/Game/Wander/WanderingCharactersManager";
import type { Point } from "../../../../../src/front/Phaser/Game/Wander/WanderSchedule";

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

// A character standing still at its nest: the test is about the visibility, not the walk.
vi.mock("../../../../../src/front/Phaser/Game/Wander/WanderSchedule", () => ({
    WanderSchedule: class {
        constructor(
            _entityId: string,
            private readonly nest: Point,
        ) {}
        poseAt() {
            return { x: this.nest.x, y: this.nest.y, direction: "down", moving: false, pausedMs: 0 };
        }
        setNest(): void {}
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
) {
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
    const addSprite = vi.fn(() => sprite);
    let reconcile: () => void = () => {};
    let update: () => void = () => {};
    const scene = {
        getGameMapFrontWrapper: () => ({
            getTileDimensions: () => ({ width: 32, height: 32 }),
            getSharedCollisionGrid: () => Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => 0)),
            getEntitiesManager: () => ({ getEntities: () => new Map([["duck", entity]]) }),
            getWallBarriers: () => ({ equals: () => true }),
        }),
        time: {
            addEvent: ({ callback }: { callback: () => void }) => {
                reconcile = callback;
                return { remove: () => {} };
            },
        },
        load: { on: () => {}, off: () => {}, once: () => {}, spritesheet: () => {}, start: () => {} },
        events: {
            on: (_event: string, listener: () => void) => {
                update = listener;
            },
            off: () => {},
        },
        textures: {
            exists: () => true,
            get: () => ({
                frameTotal: image.frameTotal,
                getSourceImage: () => ({ width: image.width, height: image.height }),
            }),
        },
        anims: { exists: () => true, create: () => {}, generateFrameNumbers: () => [] },
        add: { sprite: addSprite },
        markDirty: () => {},
    } as unknown as GameScene;
    const manager = new WanderingCharactersManager(scene);
    return {
        manager,
        sprite,
        addSprite,
        entity: entity as unknown as Entity & { visible: boolean },
        reconcile: () => reconcile(),
        update: () => update(),
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
});
