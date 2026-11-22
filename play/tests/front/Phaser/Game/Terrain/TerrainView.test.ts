import { cellKey, Season, withHeights } from "@workadventure/map-editor";
import type { TerrainData } from "@workadventure/map-editor";
import { describe, expect, it, vi } from "vitest";
import type { GameScene } from "../../../../../src/front/Phaser/Game/GameScene";
import { TerrainView } from "../../../../../src/front/Phaser/Game/Terrain/TerrainView";
import {
    ASH_COLOR,
    FIRE_GLOW_COLOR,
    GRASS_COLOR,
    MeadowState,
    mottledCover,
    STRAW_COLOR,
    strawLevel,
} from "../../../../../src/front/Phaser/Game/Terrain/MeadowState";
import { SNOW_COLOR } from "../../../../../src/front/Phaser/Game/Terrain/TerrainShading";
import { TerrainWater } from "../../../../../src/front/Phaser/Game/Terrain/TerrainWater";
import type { WaterState } from "../../../../../src/front/Phaser/Game/Terrain/TerrainWater";

const pit = withHeights(
    undefined,
    new Map([
        [cellKey(2, 2), -32],
        [cellKey(3, 2), -32],
    ]),
);
/** A whole state of the server: `depth` pixels of water over the two cells of the pit, on a grid around it. */
function stateOf(seq: number, depth: number): WaterState {
    const grid = { x: 0, y: 0, width: 8, height: 8 };
    const depths = new Uint8Array(grid.width * grid.height * 2);
    for (const column of [2, 3]) {
        const index = 2 * grid.width + column;
        depths[index * 2] = (depth * 8) & 255;
        depths[index * 2 + 1] = (depth * 8) >> 8;
    }
    return { ...grid, seq, full: true, depths };
}

function fixture(terrain: TerrainData | undefined = pit, flat = false) {
    const worldView = { x: 0, y: 0, width: 640, height: 480 };
    const scene = { cameras: { main: { worldView } }, markDirty: vi.fn() };
    const surface = {
        begin: vi.fn((_view: unknown, _resolution: number) => ({ x: -160, y: -128, columns: 62, rows: 47 })),
        paintField: vi.fn(),
        end: vi.fn(),
        hide: vi.fn(),
        destroy: vi.fn(),
    };
    const water = new TerrainWater();
    water.setTerrain(flat ? undefined : terrain);
    const view = new TerrainView(scene as unknown as GameScene, water, surface);
    return { view, water, scene, surface, worldView };
}

describe("TerrainView", () => {
    // A map without relief must cost nothing at every image.
    it("draws nothing and asks no redraw on a map without relief", () => {
        const { view, surface, scene } = fixture(undefined, true);
        view.update(0);
        view.update(16);
        view.update(32);
        expect(surface.begin).not.toHaveBeenCalled();
        expect(scene.markDirty).not.toHaveBeenCalled();
    });

    it("draws the relief once, then again only when the water or the relief changed", () => {
        const { view, water, surface, scene } = fixture();
        view.update(0);
        view.update(16);
        expect(surface.begin).toHaveBeenCalledTimes(1);
        expect(surface.begin.mock.calls[0][1]).toBe(16);
        expect(scene.markDirty).toHaveBeenCalledTimes(1);
        water.receive(stateOf(1, 4), 32);
        view.update(32);
        expect(surface.begin).toHaveBeenCalledTimes(2);
        water.setTerrain(withHeights(pit, new Map([[cellKey(4, 2), -16]])));
        view.update(48);
        expect(surface.begin).toHaveBeenCalledTimes(3);
        view.update(64);
        expect(surface.begin).toHaveBeenCalledTimes(3);
    });

    it("paints water only once there is some, and more faintly while the relief is edited", () => {
        const dry = fixture();
        dry.view.update(0);
        const layersDry = dry.surface.paintField.mock.calls.length;
        const wet = fixture();
        wet.water.receive(stateOf(1, 32), 0);
        wet.view.update(0);
        expect(wet.surface.paintField.mock.calls.length).toBeGreaterThan(layersDry);
        const alphaOf = (calls: unknown[][]): number => {
            const water = calls.find(([, , , , color]) => color === 0x7fb6d9);
            return (water?.[5] as (level: number) => number)(40);
        };
        const full = alphaOf(wet.surface.paintField.mock.calls);
        wet.view.setSeeThrough(true);
        wet.view.update(16);
        const layers = wet.surface.paintField.mock.calls.length / 2;
        expect(alphaOf(wet.surface.paintField.mock.calls.slice(-layers))).toBeLessThan(full);
    });

    // Reading the relief is the costly part of a drawing: a water that glides must not pay for it ten times a second.
    it("reads the relief once for a view, not again each time the water moves", () => {
        let reads = 0;
        const counted: TerrainData = {
            ...pit,
            get chunks() {
                reads++;
                return pit.chunks;
            },
        };
        const { view, water, surface } = fixture(counted);
        view.update(0);
        const afterFirst = reads;
        expect(afterFirst).toBeGreaterThan(0);
        water.receive(stateOf(1, 4), 16);
        view.update(16);
        water.receive(stateOf(2, 8), 1016);
        view.update(1500);
        expect(surface.begin).toHaveBeenCalledTimes(3);
        expect(reads).toBe(afterFirst);
    });

    it("draws again when the camera leaves what was drawn, not for a small scroll", () => {
        const { view, surface, worldView } = fixture();
        view.update(0);
        worldView.x += 20;
        view.update(16);
        expect(surface.begin).toHaveBeenCalledTimes(1);
        worldView.x += 2000;
        view.update(32);
        expect(surface.begin).toHaveBeenCalledTimes(2);
    });

    it("hides itself while the other engine of the ground draws (the relief in 3/4), and draws again after", () => {
        const { water, surface, scene } = fixture();
        const hidden = { value: false };
        const view = new TerrainView(
            scene as unknown as GameScene,
            water,
            surface,
            undefined,
            undefined,
            undefined,
            () => hidden.value,
        );
        view.update(0);
        expect(surface.begin).toHaveBeenCalledTimes(1);
        hidden.value = true;
        view.update(16);
        view.update(32);
        expect(surface.hide).toHaveBeenCalledTimes(1);
        expect(surface.begin).toHaveBeenCalledTimes(1);
        // The water moved meanwhile: still nothing drawn.
        water.receive(stateOf(1, 4), 40);
        view.update(48);
        expect(surface.begin).toHaveBeenCalledTimes(1);
        hidden.value = false;
        view.update(64);
        expect(surface.begin).toHaveBeenCalledTimes(2);
    });

    it("hides itself when the relief is filled in, and frees its surface when destroyed", () => {
        const { view, water, surface, scene } = fixture();
        view.update(0);
        water.setTerrain(undefined);
        view.update(16);
        expect(surface.hide).toHaveBeenCalledTimes(1);
        expect(scene.markDirty).toHaveBeenCalledTimes(2);
        view.update(32);
        expect(surface.hide).toHaveBeenCalledTimes(1);
        view.destroy();
        expect(surface.destroy).toHaveBeenCalledOnce();
    });

    it("draws the snow of the heights in the season of the map, and again when the season turns", () => {
        const top = withHeights(undefined, new Map([[cellKey(2, 2), 200]]));
        const worldView = { x: 0, y: 0, width: 640, height: 480 };
        const scene = { cameras: { main: { worldView } }, markDirty: vi.fn() };
        const surface = {
            begin: vi.fn((_view: unknown, _resolution: number) => ({ x: -160, y: -128, columns: 62, rows: 47 })),
            paintField: vi.fn(),
            end: vi.fn(),
            hide: vi.fn(),
            destroy: vi.fn(),
        };
        const water = new TerrainWater();
        water.setTerrain(top);
        let season = Season.Summer;
        const view = new TerrainView(scene as unknown as GameScene, water, surface, undefined, () => season);
        const snowFields = (): Uint8Array[] =>
            surface.paintField.mock.calls.filter((call) => call[4] === 0xf3f7ff).map((call) => call[1] as Uint8Array);
        view.update(0);
        // 200 px is under the snow line of the summer.
        expect(snowFields()).toHaveLength(0);
        season = Season.Winter;
        view.update(16);
        expect(surface.begin).toHaveBeenCalledTimes(2);
        const fields = snowFields();
        expect(fields).toHaveLength(1);
        // The cell (2, 2) on a canvas that starts at the cell (-10, -8), 62 columns wide: a full cover.
        expect(fields[0][(2 + 8) * 62 + (2 + 10)]).toBe(255);
        expect(fields[0].reduce((sum, level) => sum + level, 0)).toBe(255);
    });

    // An avatar that walks moves the camera at every image: the relief was read again at each drawing of the water.
    it("keeps the relief read while a scroll stays inside what was drawn", () => {
        let reads = 0;
        const counted: TerrainData = {
            ...pit,
            get chunks() {
                reads++;
                return pit.chunks;
            },
        };
        const { view, water, surface, worldView } = fixture(counted);
        view.update(0);
        const afterFirst = reads;
        // The camera follows the avatar a few pixels while more water comes.
        worldView.x = 12;
        worldView.y = 7;
        water.receive(stateOf(1, 4), 16);
        view.update(16);
        worldView.x = 30;
        water.receive(stateOf(2, 8), 1016);
        view.update(1500);
        expect(surface.begin).toHaveBeenCalledTimes(3);
        expect(reads).toBe(afterFirst);
        // The same part of the map each time: the canvas does not follow the camera inside its margin.
        const views = surface.begin.mock.calls.map((call) => call[0]);
        expect(views[1]).toEqual(views[0]);
        expect(views[2]).toEqual(views[0]);
        // Out of what was drawn: drawn again around the camera.
        worldView.x = 2000;
        view.update(1600);
        expect(surface.begin.mock.calls.at(-1)?.[0]).not.toEqual(views[0]);
    });

    // While the water moves the ground does not change: it is painted once, then laid back under the water.
    it("paints the ground once and lays it back while the water alone moves", () => {
        const { view, water, surface } = fixture();
        const kept = { pixels: new Uint8ClampedArray(4), painted: true };
        const keeping = Object.assign(surface, {
            snapshot: vi.fn(() => kept),
            restore: vi.fn(() => true),
        });
        water.receive(stateOf(1, 32), 0);
        view.update(0);
        const first = surface.paintField.mock.calls.length;
        expect(keeping.snapshot).toHaveBeenCalledTimes(1);
        expect(keeping.restore).not.toHaveBeenCalled();
        // More water comes: drawn again, the ground laid back, only the water painted.
        water.receive(stateOf(2, 40), 1000);
        view.update(1016);
        expect(surface.begin).toHaveBeenCalledTimes(2);
        expect(keeping.restore).toHaveBeenCalledWith(kept);
        expect(keeping.snapshot).toHaveBeenCalledTimes(1);
        const second = surface.paintField.mock.calls.length - first;
        expect(second).toBeGreaterThan(0);
        expect(second).toBeLessThan(first);
        // A canvas of another size cannot take it back: everything is painted again.
        keeping.restore.mockReturnValue(false);
        water.receive(stateOf(3, 48), 2000);
        view.update(2016);
        expect(surface.paintField.mock.calls.length - first - second).toBe(first);
    });

    describe("with a meadow", () => {
        const CANVAS = { x: -160, y: -128, columns: 62, rows: 47 };
        const WIDTH = 12;
        const HEIGHT = 10;

        /** A meadow of 12 × 10 tiles: grass on a diagonal, one tile dry, one burnt, one on fire, `extra` more grass. */
        function meadowState(extra = 0) {
            const tiles = WIDTH * HEIGHT;
            const grass = new Uint8Array(tiles);
            const dryness = new Uint8Array(tiles);
            const fire = new Uint8Array(tiles);
            const ash = new Uint8Array(tiles);
            for (let tile = 0; tile < HEIGHT; tile++) grass[tile * WIDTH + tile] = 40 + tile * 20 + extra;
            dryness[3 * WIDTH + 3] = 200;
            dryness[1 * WIDTH + 6] = 120;
            ash[4 * WIDTH + 7] = 180;
            fire[5 * WIDTH + 8] = 255;
            return { width: WIDTH, height: HEIGHT, grass, moisture: new Uint8Array(tiles), dryness, fire, ash };
        }

        /** Outdoors everywhere but a strip of the map: no grass is drawn under its roof. */
        const outdoors = { isOutdoorAt: (x: number, _y: number): boolean => !(x >= 96 && x < 128) };

        function meadowFixture(terrain: TerrainData = pit) {
            const worldView = { x: 0, y: 0, width: 640, height: 480 };
            const scene = {
                cameras: { main: { worldView } },
                markDirty: vi.fn(),
                getOutdoorGrid: () => outdoors,
            };
            const surface = {
                begin: vi.fn((_view: unknown, _resolution: number) => CANVAS),
                paintField: vi.fn(),
                end: vi.fn(),
                hide: vi.fn(),
                destroy: vi.fn(),
            };
            const water = new TerrainWater();
            water.setTerrain(terrain);
            const meadow = new MeadowState();
            meadow.receive(meadowState());
            const view = new TerrainView(scene as unknown as GameScene, water, surface, meadow);
            return { view, water, surface, meadow };
        }

        it("whitens all the ground outdoors for who chose the winter theme, not under a roof, and no more once it is left", () => {
            const worldView = { x: 0, y: 0, width: 640, height: 480 };
            const scene = { cameras: { main: { worldView } }, markDirty: vi.fn(), getOutdoorGrid: () => outdoors };
            const surface = {
                begin: vi.fn((_view: unknown, _resolution: number) => CANVAS),
                paintField: vi.fn(),
                end: vi.fn(),
                hide: vi.fn(),
                destroy: vi.fn(),
            };
            const water = new TerrainWater();
            // A map without relief: the snow that fell is painted by this view itself.
            water.setTerrain(undefined);
            const meadow = new MeadowState();
            meadow.receive(meadowState());
            const winter = { value: false };
            const view = new TerrainView(
                scene as unknown as GameScene,
                water,
                surface,
                meadow,
                undefined,
                undefined,
                undefined,
                undefined,
                () => winter.value,
            );
            view.update(0);
            expect(fieldOf(surface, SNOW_COLOR)).toBeUndefined();
            winter.value = true;
            view.update(16);
            const snow = fieldOf(surface, SNOW_COLOR);
            if (!snow) throw new Error("no snow painted");
            const cell = (x: number, y: number) => snow[((y - CANVAS.y) / 16) * CANVAS.columns + (x - CANVAS.x) / 16];
            // Outdoors, grass or not: all white. Under the roof (x from 96 to 128): none.
            expect(cell(0, 0)).toBe(255);
            expect(cell(160, 64)).toBe(255);
            expect(cell(96, 32)).toBe(0);
            expect(cell(112, 160)).toBe(0);
            winter.value = false;
            const painted = surface.paintField.mock.calls.length;
            view.update(32);
            expect(surface.paintField.mock.calls.slice(painted).some((args) => args[4] === SNOW_COLOR)).toBe(false);
        });

        /** The last field painted in a colour, copied (the view may reuse its arrays). */
        function fieldOf(surface: { paintField: { mock: { calls: unknown[][] } } }, color: number) {
            const call = [...surface.paintField.mock.calls].reverse().find((args) => args[4] === color);
            return call ? Array.from(call[1] as Uint8Array) : undefined;
        }

        /** The layers of the meadow over the canvas, cell by cell, as the rule tells them. */
        function expectedLayers(state: ReturnType<typeof meadowState>) {
            const size = CANVAS.columns * CANVAS.rows;
            const layers = {
                grass: new Array<number>(size).fill(0),
                straw: new Array<number>(size).fill(0),
                ash: new Array<number>(size).fill(0),
                fire: new Array<number>(size).fill(0),
            };
            for (let row = 0; row < CANVAS.rows; row++) {
                for (let column = 0; column < CANVAS.columns; column++) {
                    const cellX = CANVAS.x / 16 + column;
                    const cellY = CANVAS.y / 16 + row;
                    const tileX = Math.floor(cellX / 2);
                    const tileY = Math.floor(cellY / 2);
                    if (tileX < 0 || tileY < 0 || tileX >= WIDTH || tileY >= HEIGHT) continue;
                    if (!outdoors.isOutdoorAt((cellX + 0.5) * 16, (cellY + 0.5) * 16)) continue;
                    const tile = tileY * WIDTH + tileX;
                    const index = row * CANVAS.columns + column;
                    const drawn = state.grass[tile] === 0 ? 0 : mottledCover(state.grass[tile], cellX, cellY);
                    layers.grass[index] = drawn;
                    layers.ash[index] = state.ash[tile];
                    layers.fire[index] = state.fire[tile];
                    if (state.dryness[tile] > 0) layers.straw[index] = strawLevel(drawn, state.dryness[tile]);
                }
            }
            return layers;
        }

        it("paints the grass, the straw, the ash and the fire of each tile on its outdoor cells", () => {
            const { view, surface } = meadowFixture();
            view.update(0);
            const expected = expectedLayers(meadowState());
            expect(fieldOf(surface, GRASS_COLOR)).toEqual(expected.grass);
            expect(fieldOf(surface, STRAW_COLOR)).toEqual(expected.straw);
            expect(fieldOf(surface, ASH_COLOR)).toEqual(expected.ash);
            expect(fieldOf(surface, FIRE_GLOW_COLOR)).toEqual(expected.fire);
            // The roof of the strip keeps the grass off: the tile (3, 3) lies under it.
            expect(expected.grass.some((level) => level > 0)).toBe(true);
            expect(expected.grass[(8 + 6) * CANVAS.columns + 10 + 6]).toBe(0);
        });

        // The meadow is told again every ten seconds: the relief, long to read on a wide view, is not read for it.
        it("reads the meadow again when it changes, not the relief", () => {
            let reads = 0;
            const counted: TerrainData = {
                ...pit,
                get chunks() {
                    reads++;
                    return pit.chunks;
                },
            };
            const { view, surface, meadow } = meadowFixture(counted);
            view.update(0);
            const afterFirst = reads;
            expect(afterFirst).toBeGreaterThan(0);
            meadow.receive(meadowState(15));
            view.update(16);
            expect(surface.begin).toHaveBeenCalledTimes(2);
            expect(reads).toBe(afterFirst);
            expect(fieldOf(surface, GRASS_COLOR)).toEqual(expectedLayers(meadowState(15)).grass);
        });

        it("paints the ground again when the meadow changed, and lays it back when it did not", () => {
            const { view, water, surface, meadow } = meadowFixture();
            const keeping = Object.assign(surface, {
                snapshot: vi.fn(() => ({ pixels: new Uint8ClampedArray(4) })),
                restore: vi.fn(() => true),
            });
            view.update(0);
            expect(keeping.snapshot).toHaveBeenCalledTimes(1);
            water.receive(stateOf(1, 32), 1000);
            view.update(1016);
            expect(keeping.restore).toHaveBeenCalledTimes(1);
            expect(keeping.snapshot).toHaveBeenCalledTimes(1);
            meadow.receive(meadowState(15));
            view.update(2000);
            // The ground kept shows the old grass: painted anew, and kept again.
            expect(keeping.restore).toHaveBeenCalledTimes(1);
            expect(keeping.snapshot).toHaveBeenCalledTimes(2);
        });
    });
});
