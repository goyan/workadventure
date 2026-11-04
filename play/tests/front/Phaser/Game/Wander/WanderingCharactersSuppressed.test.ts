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

function makeScene(properties: { type: string }[] = []) {
    const entity = {
        entityId: "duck",
        x: 64,
        y: 64,
        displayWidth: 32,
        displayHeight: 32,
        visible: true,
        active: true,
        texture: { key: "duck-entity.png" },
        getPrefab: () => ({ imagePath: "duck-entity.png", wander: { sheetPath: SHEET } }),
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
            get: () => ({ frameTotal: 13, getSourceImage: () => ({ width: 96 }) }),
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

describe("WanderingCharactersManager.setSuppressed", () => {
    let manager: WanderingCharactersManager | undefined;

    afterEach(() => {
        manager?.destroy();
        manager = undefined;
    });

    it("hides a suppressed character, stops it opening doors, and shows it again once restored", () => {
        const scene = makeScene();
        manager = scene.manager;
        scene.reconcile();
        scene.update();
        expect(scene.sprite.visible).toBe(true);
        expect(scene.entity.visible).toBe(false);
        expect(openers(manager)).toHaveLength(1);

        manager.setSuppressed("duck", true);
        scene.update();
        expect(scene.sprite.visible).toBe(false);
        expect(openers(manager)).toEqual([]);
        // Whoever suppressed the character owns the entity meanwhile: it is not shown again.
        expect(scene.entity.visible).toBe(false);

        manager.setSuppressed("duck", false);
        scene.update();
        expect(scene.sprite.visible).toBe(true);
        expect(openers(manager)).toHaveLength(1);
    });

    it("keeps a character suppressed before it is created hidden", () => {
        const scene = makeScene();
        manager = scene.manager;
        manager.setSuppressed("duck", true);
        scene.reconcile();
        scene.update();
        expect(scene.sprite.visible).toBe(false);
        expect(openers(manager)).toEqual([]);
    });

    it("never makes a wandering character of a Gobeur, even with a wander sheet", () => {
        const scene = makeScene([{ type: "gobeurPropertyData" }]);
        manager = scene.manager;
        scene.reconcile();
        scene.update();
        expect(scene.addSprite).not.toHaveBeenCalled();
        expect(openers(manager)).toEqual([]);
        // Idle, the Gobeur is the object as placed.
        expect(scene.entity.visible).toBe(true);
    });
});
