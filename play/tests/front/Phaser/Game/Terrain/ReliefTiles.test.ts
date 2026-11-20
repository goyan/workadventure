import { describe, expect, it, vi } from "vitest";
import { cellKey, withHeights } from "@workadventure/map-editor";
import type { TerrainData } from "@workadventure/map-editor";
import { ReliefTiles } from "../../../../../src/front/Phaser/Game/Terrain/ReliefTiles";
import { TerrainWater } from "../../../../../src/front/Phaser/Game/Terrain/TerrainWater";

/** Hollows dug all over a large part of the map: every block of 256 px holds some. */
function dugEverywhere(): TerrainData {
    const changes = new Map<string, number>();
    for (let x = 0; x < 160; x += 4) for (let y = 0; y < 160; y += 4) changes.set(cellKey(x, y), -64);
    return withHeights(undefined, changes);
}

function fixture(terrain: TerrainData = dugEverywhere()) {
    const worldView = { x: 300, y: 300, width: 600, height: 400 };
    const images: { visible: boolean }[] = [];
    /** The last pixels put in each block, by texture key. */
    const painted = new Map<string, Uint8ClampedArray>();
    const image = () => {
        const object = {
            visible: true,
            setOrigin: () => object,
            setDisplaySize: () => object,
            setDepth: () => object,
            setVisible: (visible: boolean) => {
                object.visible = visible;
                return object;
            },
            destroy: vi.fn(),
        };
        images.push(object);
        return object;
    };
    const texture = (key: string) => ({
        key,
        source: [{ scaleMode: 0 }],
        setFilter: vi.fn(),
        refresh: vi.fn(),
        destroy: vi.fn(),
        getContext: () => ({
            createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }),
            putImageData: (pixels: { data: Uint8ClampedArray }) => painted.set(key, pixels.data),
        }),
    });
    const scene = {
        cameras: { main: { worldView } },
        textures: { createCanvas: vi.fn((key: string) => texture(key)) },
        add: { image: vi.fn(() => image()) },
        markDirty: vi.fn(),
    };
    const water = new TerrainWater();
    water.setTerrain(terrain);
    const tiles = new ReliefTiles(scene as never, {
        relief: () => terrain,
        water,
        season: () => undefined,
        snowShown: () => 0,
    });
    /** Updates until every block around the view is drawn. */
    const settle = () => {
        for (let frame = 0; frame < 100; frame++) tiles.update(frame);
    };
    return { tiles, worldView, images, settle, painted };
}

describe("the blocks of the relief seen in 3/4", () => {
    it("draws no block again while the view scrolls or zooms over drawn blocks", () => {
        const { tiles, worldView, settle } = fixture();
        settle();
        const drawn = tiles.redraws();
        worldView.x += 40;
        worldView.y -= 30;
        tiles.update(200);
        worldView.width = 560;
        tiles.update(201);
        expect(tiles.redraws()).toBe(drawn);
    });

    it("draws at most two blocks an image when many come into view at once", () => {
        const { tiles, worldView, settle } = fixture();
        settle();
        // Zoomed far out: many blocks come into view.
        Object.assign(worldView, { x: 0, y: 0, width: 2400, height: 2400 });
        for (let frame = 0; frame < 5; frame++) {
            const before = tiles.redraws();
            tiles.update(300 + frame);
            expect(tiles.redraws() - before).toBeLessThanOrEqual(2);
        }
    });

    it("hides its blocks while the editor is open, and draws them again once it is closed", () => {
        const { tiles, images, settle } = fixture();
        settle();
        tiles.setHidden(true);
        expect(images.every((image) => !image.visible)).toBe(true);
        expect(tiles.isActive()).toBe(false);
        const drawn = tiles.redraws();
        tiles.update(400);
        expect(tiles.redraws()).toBe(drawn);
        tiles.setHidden(false);
        expect(tiles.isActive()).toBe(true);
        tiles.update(401);
        // Nothing kept from before the editor: what was edited in it is drawn again.
        expect(tiles.redraws()).toBeGreaterThan(drawn);
        expect(images.filter((image) => image.visible).length).toBeGreaterThan(0);
    });

    it("finds the ground drawn under a point while it is drawn in 3/4, and the point itself in the editor", () => {
        // Dug 64 px deep from the cell 0 on: drawn 32 px lower.
        const deep = withHeights(
            undefined,
            new Map(
                Array.from({ length: 64 * 64 }, (_, index): [string, number] => [
                    cellKey(index % 64, Math.floor(index / 64)),
                    -64,
                ]),
            ),
        );
        const { tiles } = fixture(deep);
        expect(tiles.groundPointAt({ x: 300, y: 300 + 32 }).y).toBeCloseTo(300, 0);
        tiles.setHidden(true);
        expect(tiles.groundPointAt({ x: 300, y: 332 })).toEqual({ x: 300, y: 332 });
    });

    it("leaves no seam between two blocks dug as deep as a map allows", () => {
        // Dug 256 px deep (8 tiles) all over: drawn 128 px lower, every texel of a block is the floor.
        const deepest = withHeights(
            undefined,
            new Map(
                Array.from({ length: 96 * 96 }, (_, index): [string, number] => [
                    cellKey(index % 96, Math.floor(index / 96)),
                    -256,
                ]),
            ),
        );
        const { settle, painted } = fixture(deepest);
        settle();
        const block = painted.get("relief-block:2,2");
        expect(block).toBeDefined();
        const firstRow = Array.from({ length: 128 }, (_, column) => block?.[column * 4 + 3]);
        expect(firstRow.every((alpha) => alpha === 255)).toBe(true);
    });
});
