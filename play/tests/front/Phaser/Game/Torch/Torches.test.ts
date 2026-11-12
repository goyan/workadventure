import { PositionMessage_Direction } from "@workadventure/messages";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import { get } from "svelte/store";
import type { EntityPrefab } from "@workadventure/map-editor";
import type { Entity } from "../../../../../src/front/Phaser/ECS/Entity";
import type { GameScene } from "../../../../../src/front/Phaser/Game/GameScene";
import type { LightCone, Point } from "../../../../../src/front/Phaser/Game/Lamps/RgbLampGeometry";
import type { TorchBearer } from "../../../../../src/front/Phaser/Game/Torch/Torches";
import { isLit } from "../Lamps/LightTestUtils";

interface FakeVisual {
    id: string;
    draws: { light: LightCone; polygon: Point[]; colour: number }[];
    intensities: number[];
    visible: boolean;
    destroyed: boolean;
}
const visuals: FakeVisual[] = [];

// The visual needs Phaser and a canvas: only what is asked of it is looked at here.
vi.mock("../../../../../src/front/Phaser/Game/Lamps/RgbLampVisual", () => ({
    RgbLampVisual: class {
        private readonly fake: FakeVisual;
        public textureKey = "";
        constructor(_scene: unknown, id: string) {
            // Like the real one, the image is hidden until it is shown.
            this.fake = { id, draws: [], intensities: [], visible: false, destroyed: false };
            this.textureKey = `rgb-lamp:${id}`;
            visuals.push(this.fake);
        }
        draw(light: LightCone, polygon: Point[], colour: number): void {
            this.fake.draws.push({ light, polygon, colour });
        }
        setIntensity(intensity: number): void {
            this.fake.intensities.push(intensity);
        }
        setVisible(visible: boolean): void {
            this.fake.visible = visible;
        }
        destroy(): void {
            this.fake.destroyed = true;
        }
    },
}));

const { Torches } = await import("../../../../../src/front/Phaser/Game/Torch/Torches");
const { torchLightsStore } = await import("../../../../../src/front/Stores/TorchStore");
const { TORCH_COLOUR } = await import("../../../../../src/front/Phaser/Game/Torch/TorchProtocol");

/** A map of 40 by 40 free tiles. */
const freeGrid = (): number[][] => Array.from({ length: 40 }, () => Array.from({ length: 40 }, () => 0));

const prefab = (overrides: Partial<EntityPrefab>): EntityPrefab => ({
    id: "prefab",
    name: "prefab",
    tags: [],
    imagePath: "p.png",
    direction: "Down",
    color: "",
    collectionName: "Meubles",
    type: "Default",
    ...overrides,
});

function entity(id: string, x: number, y: number, model: EntityPrefab): Entity {
    return Object.assign(
        { entityId: id, x, y },
        { getPrefab: () => model, getProperties: () => [] },
    ) as unknown as Entity;
}

function setup() {
    const scene = mockDeep<GameScene>();
    const wrapper = mockDeep<ReturnType<GameScene["getGameMapFrontWrapper"]>>();
    const state = { grid: freeGrid(), entities: new Map<string, Entity>() };
    wrapper.getMapCollisionGrid.mockImplementation(() => state.grid);
    wrapper.getMap.mockReturnValue({ tilewidth: 32, tileheight: 32 } as ReturnType<typeof wrapper.getMap>);
    const entitiesManager = mockDeep<ReturnType<typeof wrapper.getEntitiesManager>>();
    entitiesManager.getEntities.mockImplementation(() => state.entities);
    wrapper.getEntitiesManager.mockReturnValue(entitiesManager);
    scene.getGameMapFrontWrapper.mockReturnValue(wrapper);
    scene.isDoorOpen.mockReturnValue(false);
    Object.defineProperty(scene, "cameras", {
        value: { main: { worldView: { x: 0, y: 0, width: 1280, height: 1280 } } },
    });
    const torches = new Torches(scene, 5);
    current = torches;
    return { scene, state, torches };
}

const bearer = (id: string, x: number, y: number, overrides: Partial<TorchBearer> = {}): TorchBearer => ({
    id,
    x,
    y,
    direction: PositionMessage_Direction.DOWN,
    seated: false,
    intensity: 1,
    local: false,
    ...overrides,
});

let current: InstanceType<typeof Torches> | undefined;
afterEach(() => {
    current?.destroy();
    current = undefined;
    visuals.length = 0;
});

describe("Torches", () => {
    it("lights orange around the flame of each bearer, and tells the night veil", () => {
        const { torches } = setup();
        torches.update(0, [bearer("7", 640, 640)], false);
        expect(visuals).toHaveLength(1);
        expect(visuals[0].id).toBe("torch:7");
        expect(visuals[0].visible).toBe(true);
        expect(visuals[0].draws).toHaveLength(1);
        const { light, colour, polygon } = visuals[0].draws[0];
        expect(colour).toBe(TORCH_COLOUR);
        expect(light).toEqual({ x: 645, y: 638, radius: 176, direction: 90, angle: 360 });
        expect(isLit(polygon, { x: 645, y: 760 })).toBe(true);
        expect(get(torchLightsStore)).toEqual([
            { id: "torch:7", x: 469, y: 462, size: 352, textureKey: "rgb-lamp:torch:7", revision: 1 },
        ]);
    });

    it("costs nothing for a bearer standing still", () => {
        const { torches } = setup();
        torches.update(0, [bearer("7", 640, 640)], false);
        torches.update(16, [bearer("7", 640, 640)], false);
        torches.update(400, [bearer("7", 640, 640)], false);
        expect(visuals[0].draws).toHaveLength(1);
    });

    it("follows a bearer that moves by a pixel, and its direction", () => {
        const { torches } = setup();
        torches.update(0, [bearer("7", 640, 640)], false);
        torches.update(16, [bearer("7", 640.3, 640)], false);
        expect(visuals[0].draws).toHaveLength(1);
        torches.update(32, [bearer("7", 641, 640)], false);
        expect(visuals[0].draws).toHaveLength(2);
        torches.update(48, [bearer("7", 641, 640, { direction: PositionMessage_Direction.LEFT })], false);
        expect(visuals[0].draws).toHaveLength(3);
        expect(visuals[0].draws[2].light.x).toBe(636);
    });

    it("is drawn again when an obstacle changes within its reach, not out of it", () => {
        const { state, torches } = setup();
        torches.update(0, [bearer("7", 640, 640)], false);
        const far = freeGrid();
        far[0][0] = 1;
        state.grid = far;
        torches.update(300, [bearer("7", 640, 640)], false);
        expect(visuals[0].draws).toHaveLength(1);
        const near = freeGrid();
        for (let x = 0; x < 40; x++) near[22][x] = 1;
        state.grid = near;
        torches.update(600, [bearer("7", 640, 640)], false);
        expect(visuals[0].draws).toHaveLength(2);
        expect(isLit(visuals[0].draws[1].polygon, { x: 645, y: 760 })).toBe(false);
    });

    it("casts the shadow of a tall object of the map, and of a closed door of the map layer", () => {
        const { state, torches } = setup();
        state.entities.set(
            "cupboard",
            entity(
                "cupboard",
                608,
                704,
                prefab({ castsShadow: true, collisionRectangles: [{ x: 0, y: 0, width: 64, height: 32 }] }),
            ),
        );
        torches.update(0, [bearer("7", 640, 640)], false);
        expect(isLit(visuals[0].draws[0].polygon, { x: 645, y: 690 })).toBe(true);
        expect(isLit(visuals[0].draws[0].polygon, { x: 645, y: 780 })).toBe(false);
    });

    it("keeps each bearer's light on its own side of a wall of the map layer", () => {
        const { state, torches } = setup();
        for (let column = 10; column < 30; column++) {
            state.entities.set(
                `wall-${column}`,
                entity(
                    `wall-${column}`,
                    column * 32,
                    22 * 32,
                    prefab({ collectionName: "Carte Murs", id: "Carte Murs:facade-blanc-mid:Default:Down" }),
                ),
            );
        }
        // As close to the wall as the body allows, north (sprite centre at 714) and south (at 736) of it.
        torches.update(
            0,
            [bearer("north", 640, 714), bearer("south", 800, 736, { direction: PositionMessage_Direction.UP })],
            false,
        );
        const north = visuals.find(({ id }) => id === "torch:north")?.draws[0].polygon ?? [];
        const south = visuals.find(({ id }) => id === "torch:south")?.draws[0].polygon ?? [];
        expect(isLit(north, { x: 645, y: 650 })).toBe(true);
        expect(isLit(north, { x: 645, y: 780 })).toBe(false);
        expect(isLit(south, { x: 805, y: 780 })).toBe(true);
        expect(isLit(south, { x: 805, y: 650 })).toBe(false);
    });

    it("draws at most four lights per image, the local player's first, and catches up on the next images", () => {
        const { torches } = setup();
        const others = Array.from({ length: 6 }, (_, index) => bearer(String(index), 100 + index * 100, 300));
        const local = bearer("me", 640, 900, { local: true });
        torches.update(0, [...others, local], false);
        const drawn = (): number => visuals.reduce((count, visual) => count + visual.draws.length, 0);
        expect(drawn()).toBe(4);
        expect(visuals.find(({ id }) => id === "torch:me")?.draws).toHaveLength(1);
        torches.update(16, [...others, local], false);
        expect(drawn()).toBe(7);
        expect(visuals.every(({ draws }) => draws.length === 1)).toBe(true);
    });

    it("puts the light out of a bearer that left or put the torch away", () => {
        const { torches } = setup();
        torches.update(0, [bearer("7", 640, 640)], false);
        torches.update(16, [], false);
        expect(visuals[0].destroyed).toBe(true);
        expect(get(torchLightsStore)).toEqual([]);
    });

    it("lights nothing while the map editor is open, and lights again when it closes", () => {
        const { torches } = setup();
        torches.update(0, [bearer("7", 640, 640)], false);
        torches.update(16, [bearer("7", 640, 640)], true);
        expect(visuals[0].visible).toBe(false);
        expect(get(torchLightsStore)).toEqual([]);
        torches.update(32, [bearer("7", 640, 640)], false);
        expect(visuals[0].visible).toBe(true);
        expect(get(torchLightsStore)).toHaveLength(1);
    });

    it("flickers by its intensity only, and asks for a render only when a torch on the screen changed", () => {
        const { scene, torches } = setup();
        torches.update(0, [bearer("7", 640, 640, { intensity: 0.9 })], false);
        expect(visuals[0].intensities).toEqual([0.9]);
        scene.markDirty.mockClear();
        torches.update(16, [bearer("7", 640, 640, { intensity: 0.9 })], false);
        expect(scene.markDirty.mock.calls).toEqual([]);
        torches.update(32, [bearer("7", 640, 640, { intensity: 0.95 })], false);
        expect(visuals[0].intensities).toEqual([0.9, 0.95]);
        expect(visuals[0].draws).toHaveLength(1);
        expect(scene.markDirty.mock.calls.length).toBeGreaterThan(0);

        // Far out of the screen: the light changes, nothing is rendered for it.
        torches.update(48, [bearer("7", 5000, 5000, { intensity: 0.95 })], false);
        scene.markDirty.mockClear();
        torches.update(64, [bearer("7", 5000, 5000, { intensity: 0.85 })], false);
        expect(scene.markDirty.mock.calls).toEqual([]);
    });
});
