import { afterEach, describe, expect, it, vi } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import { get } from "svelte/store";
import type { EntityDataProperties, EntityPrefab } from "@workadventure/map-editor";
import type { Entity } from "../../../../../src/front/Phaser/ECS/Entity";
import type { GameScene } from "../../../../../src/front/Phaser/Game/GameScene";
import type { LightCone, Point } from "../../../../../src/front/Phaser/Game/Lamps/RgbLampGeometry";

interface FakeVisual {
    id: string;
    draws: { light: LightCone; polygon: Point[]; colour: number }[];
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
            this.fake = { id, draws: [], visible: true, destroyed: false };
            this.textureKey = `rgb-lamp:${id}`;
            visuals.push(this.fake);
        }
        draw(light: LightCone, polygon: Point[], colour: number): void {
            this.fake.draws.push({ light, polygon, colour });
        }
        setVisible(visible: boolean): void {
            this.fake.visible = visible;
        }
        destroy(): void {
            this.fake.destroyed = true;
        }
    },
}));

const { RgbLamps } = await import("../../../../../src/front/Phaser/Game/Lamps/RgbLamps");
const { rgbLampLightsStore, rgbLampPreviewStore } = await import("../../../../../src/front/Stores/RgbLampStore");

function isLit(polygon: readonly Point[], point: Point): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[i];
        const b = polygon[j];
        if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
            inside = !inside;
        }
    }
    return inside;
}

const prefab = (overrides: Partial<EntityPrefab>): EntityPrefab => ({
    id: "prefab",
    name: "prefab",
    tags: [],
    imagePath: "p.png",
    direction: "Down",
    color: "",
    collectionName: "Lampes",
    type: "Default",
    ...overrides,
});

interface FakeEntity {
    entityId: string;
    x: number;
    y: number;
    width: number;
    height: number;
    displayWidth: number;
    displayHeight: number;
    visible: boolean;
    properties: EntityDataProperties;
}

function entity(id: string, x: number, y: number, model: EntityPrefab): { fake: FakeEntity; entity: Entity } {
    const fake: FakeEntity = {
        entityId: id,
        x,
        y,
        width: 32,
        height: 32,
        displayWidth: 32,
        displayHeight: 32,
        visible: true,
        properties: [],
    };
    const object = Object.assign(fake, {
        getPrefab: () => model,
        getProperties: () => fake.properties,
    });
    return { fake, entity: object as unknown as Entity };
}

/** An RGB lamp whose light comes from the middle of its 32 px image. */
const lamp = (id: string, x: number, y: number) => entity(id, x, y, prefab({ lamp: { kind: "rgb" } }));

/** A map of 40 by 40 free tiles. */
const freeGrid = (): number[][] => Array.from({ length: 40 }, () => Array.from({ length: 40 }, () => 0));

function setup(grid = freeGrid()) {
    const scene = mockDeep<GameScene>();
    const wrapper = mockDeep<ReturnType<GameScene["getGameMapFrontWrapper"]>>();
    const state = { grid, openDoors: new Set<string>() };
    wrapper.getMapCollisionGrid.mockImplementation(() => state.grid);
    wrapper.getMap.mockReturnValue({ tilewidth: 32, tileheight: 32 } as ReturnType<typeof wrapper.getMap>);
    scene.getGameMapFrontWrapper.mockReturnValue(wrapper);
    scene.isDoorOpen.mockImplementation((id: string) => state.openDoors.has(id));
    const lamps = new RgbLamps(scene, 5);
    return { scene, state, lamps };
}

let current: InstanceType<typeof RgbLamps> | undefined;
afterEach(() => {
    current?.destroy();
    current = undefined;
    visuals.length = 0;
    rgbLampPreviewStore.set(undefined);
});

function start(entities: Entity[], grid?: number[][]) {
    const context = setup(grid);
    current = context.lamps;
    const map = new Map(entities.map((object) => [object.entityId, object]));
    const tick = (): void => {
        context.lamps.reconcile(map);
        context.lamps.update();
    };
    tick();
    return { ...context, map, tick };
}

describe("RgbLamps", () => {
    it("lights an RGB lamp nothing was set on with the defaults: warm white, 6 tiles, all around", () => {
        start([lamp("a", 624, 624).entity]);
        expect(visuals).toHaveLength(1);
        expect(visuals[0].draws).toHaveLength(1);
        const { light, colour, polygon } = visuals[0].draws[0];
        expect(light).toEqual({ x: 640, y: 640, radius: 192, direction: 90, angle: 360 });
        expect(colour).toBe(0xffd9a0);
        expect(isLit(polygon, { x: 640, y: 800 })).toBe(true);
    });

    it("leaves the other objects alone, lamps that follow the music included", () => {
        start([
            entity("spot", 0, 0, prefab({ lamp: { kind: "spot" } })).entity,
            entity("floor", 0, 0, prefab({ lamp: { kind: "dancefloor" } })).entity,
            entity("chair", 0, 0, prefab({})).entity,
        ]);
        expect(visuals).toHaveLength(0);
    });

    it("costs nothing while nothing changes: the light is computed and drawn once", () => {
        const { tick, lamps, scene } = start([lamp("a", 624, 624).entity]);
        scene.markDirty.mockClear();
        for (let i = 0; i < 10; i++) {
            tick();
            lamps.update();
        }
        expect(visuals[0].draws).toHaveLength(1);
        expect(scene.markDirty.mock.calls).toHaveLength(0);
    });

    it("follows the lamp at every image while it is dragged, without waiting for the next look at the map", () => {
        const { fake, entity: object } = lamp("a", 624, 624);
        const { lamps } = start([object]);
        fake.x = 656;
        lamps.update();
        expect(visuals[0].draws).toHaveLength(2);
        expect(visuals[0].draws[1].light.x).toBe(672);
    });

    it("reads the settings of the object again when they change", () => {
        const { fake, entity: object } = lamp("a", 624, 624);
        const { lamps } = start([object]);
        fake.properties = [
            { id: "p", type: "rgbLampPropertyData", color: "#00ff00", radius: 2, direction: 0, angle: 90 },
        ];
        lamps.update();
        const last = visuals[0].draws[1];
        expect(last.colour).toBe(0x00ff00);
        expect(last.light).toEqual({ x: 640, y: 640, radius: 64, direction: 0, angle: 90 });
    });

    it("shows the settings being dragged in the editor before they are saved", () => {
        const { lamps } = start([lamp("a", 624, 624).entity]);
        rgbLampPreviewStore.set({
            entityId: "a",
            settings: { color: "#ff0000", radius: 3, direction: 180, angle: 45 },
        });
        lamps.update();
        expect(visuals[0].draws[1].colour).toBe(0xff0000);
        expect(visuals[0].draws[1].light.radius).toBe(96);
        rgbLampPreviewStore.set(undefined);
        lamps.update();
        expect(visuals[0].draws[2].colour).toBe(0xffd9a0);
    });

    it("is stopped by a wall of the map, and lights again when the wall goes (a door of the map opens)", () => {
        const grid = freeGrid();
        // A wall two tiles south of the lamp, five tiles wide.
        for (let x = 18; x <= 22; x++) grid[22][x] = 1;
        const { state, tick } = start([lamp("a", 624, 624).entity], grid);
        expect(isLit(visuals[0].draws[0].polygon, { x: 640, y: 780 })).toBe(false);
        expect(isLit(visuals[0].draws[0].polygon, { x: 640, y: 690 })).toBe(true);
        state.grid = freeGrid();
        tick();
        expect(visuals[0].draws).toHaveLength(2);
        expect(isLit(visuals[0].draws[1].polygon, { x: 640, y: 780 })).toBe(true);
    });

    it("is not drawn again when the map changes out of its reach", () => {
        const { state, tick } = start([lamp("a", 624, 624).entity]);
        const changed = freeGrid();
        changed[0][0] = 1;
        state.grid = changed;
        tick();
        expect(visuals[0].draws).toHaveLength(1);
    });

    it("is stopped by a tall object, not by a low one, and follows the tall object when it is moved", () => {
        const rectangles = [{ x: 0, y: 0, width: 32, height: 32 }];
        const cupboard = entity("cupboard", 624, 688, prefab({ castsShadow: true, collisionRectangles: rectangles }));
        const table = entity("table", 688, 624, prefab({ collisionRectangles: rectangles }));
        const { tick } = start([lamp("a", 624, 624).entity, cupboard.entity, table.entity]);
        const first = visuals[0].draws[0].polygon;
        // Behind the cupboard, south of the lamp: dark. Behind the table, east of it: lit.
        expect(isLit(first, { x: 640, y: 780 })).toBe(false);
        expect(isLit(first, { x: 780, y: 640 })).toBe(true);
        cupboard.fake.x = 0;
        cupboard.fake.y = 0;
        tick();
        expect(isLit(visuals[0].draws[1].polygon, { x: 640, y: 780 })).toBe(true);
    });

    it("is stopped by a wall of the map layer and its closed doors, and passes through an open door", () => {
        const wall = (id: string, column: number) =>
            entity(
                id,
                column * 32,
                22 * 32,
                prefab({ collectionName: "Carte Murs", id: "Carte Murs:facade-blanc-mid:Default:Down" }),
            ).entity;
        const door = entity(
            "door",
            19 * 32,
            22 * 32,
            prefab({ collectionName: "Carte Portes", id: "Carte Portes:porte-h-blanc-g:Default:Down" }),
        ).entity;
        // A wall along the line 22 from the column 15 to 25, with a door on the columns 19 and 20: under the lamp.
        const walls = [15, 16, 17, 18, 21, 22, 23, 24].map((column) => wall(`wall-${column}`, column));
        const { state, tick } = start([lamp("a", 624, 624).entity, door, ...walls]);
        expect(isLit(visuals[0].draws[0].polygon, { x: 640, y: 780 })).toBe(false);
        expect(isLit(visuals[0].draws[0].polygon, { x: 560, y: 780 })).toBe(false);
        state.openDoors.add("door");
        tick();
        const open = visuals[0].draws[1].polygon;
        expect(isLit(open, { x: 640, y: 780 })).toBe(true);
        expect(isLit(open, { x: 560, y: 780 })).toBe(false);
    });

    it("goes out with its object, and with an object that is no longer a lamp", () => {
        const { map, tick } = start([lamp("a", 624, 624).entity]);
        map.delete("a");
        tick();
        expect(visuals[0].destroyed).toBe(true);
        expect(get(rgbLampLightsStore)).toEqual([]);
    });

    it("is hidden with its object", () => {
        const { fake, entity: object } = lamp("a", 624, 624);
        const { lamps } = start([object]);
        fake.visible = false;
        lamps.update();
        expect(visuals[0].visible).toBe(false);
        expect(get(rgbLampLightsStore)).toEqual([]);
    });

    it("tells the night veil where each light is, and when its shape changed", () => {
        const { fake, entity: object } = lamp("a", 624, 624);
        const { lamps, scene } = start([object]);
        const [first] = get(rgbLampLightsStore);
        expect(first).toMatchObject({ id: "a", x: 448, y: 448, size: 384, textureKey: "rgb-lamp:a" });
        scene.markDirty.mockClear();
        fake.x = 656;
        lamps.update();
        const [second] = get(rgbLampLightsStore);
        expect(second.x).toBe(480);
        expect(second.revision).not.toBe(first.revision);
        expect(scene.markDirty.mock.calls.length).toBeGreaterThan(0);
    });

    it("puts everything out when the scene ends", () => {
        const { lamps } = start([lamp("a", 624, 624).entity]);
        lamps.destroy();
        expect(visuals[0].destroyed).toBe(true);
        expect(get(rgbLampLightsStore)).toEqual([]);
    });
});
