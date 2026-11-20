import { describe, expect, it, vi } from "vitest";

const { keepCulledTiles } = await import("../../../../../src/front/Phaser/Game/GameMap/TileCullCache");
const { placeAtDepth } = await import("../../../../../src/front/Phaser/Game/DepthSort");

function fixture() {
    const tiles = [{ index: 3 }, { index: 7 }];
    const cull = vi.fn((...args: unknown[]): unknown[] => {
        const output = args[2] as unknown[];
        output.length = 0;
        output.push(...tiles);
        return output;
    });
    const layer: {
        cullCallback: (...args: unknown[]) => unknown[];
        putTileAt: () => string;
        removeTileAt: () => void;
    } = { cullCallback: cull, putTileAt: vi.fn(() => "put"), removeTileAt: vi.fn() };
    const tilemapLayer = {
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        cullPaddingX: 1,
        cullPaddingY: 1,
        skipCull: false,
        scrollFactorX: 1,
        scrollFactorY: 1,
        tilemap: { tileWidth: 32, tileHeight: 32 },
    };
    const data = { width: 100, height: 80, tilemapLayer };
    const camera = { worldView: { x: 0, y: 0, right: 640, bottom: 480 } };
    let time = 0;
    keepCulledTiles(layer, () => time);
    // The culling keepCulledTiles put on the layer, called as Phaser calls it.
    const draw = (order = 0): unknown[] => layer.cullCallback(data, camera, [], order);
    return { layer, cull, tiles, camera, draw, pass: (ms: number) => (time += ms) };
}

describe("keepCulledTiles", () => {
    it("reads the tiles of the view once while nothing changes", () => {
        const { cull, draw, tiles } = fixture();
        expect(draw()).toEqual(tiles);
        expect(draw()).toEqual(tiles);
        expect(draw()).toEqual(tiles);
        expect(cull).toHaveBeenCalledTimes(1);
    });

    it("reads them again when the view shows other cells, not for a scroll inside the same cells", () => {
        const { cull, draw, camera } = fixture();
        draw();
        camera.worldView.x = 5;
        camera.worldView.right = 635;
        draw();
        expect(cull).toHaveBeenCalledTimes(1);
        camera.worldView.x = 64;
        camera.worldView.right = 704;
        draw();
        expect(cull).toHaveBeenCalledTimes(2);
    });

    it("stays the same from far, where the view holds the whole layer whatever the scroll", () => {
        const { cull, draw, camera } = fixture();
        Object.assign(camera.worldView, { x: -500, y: -500, right: 9000, bottom: 9000 });
        draw();
        Object.assign(camera.worldView, { x: -800, y: -300, right: 8700, bottom: 9200 });
        draw();
        expect(cull).toHaveBeenCalledTimes(1);
    });

    it("reads them again when a tile is put or removed through the layer, which still does its work", () => {
        const { layer, cull, draw } = fixture();
        draw();
        expect(layer.putTileAt()).toBe("put");
        draw();
        expect(cull).toHaveBeenCalledTimes(2);
        layer.removeTileAt();
        draw();
        expect(cull).toHaveBeenCalledTimes(3);
    });

    it("reads them again for another drawing order, and twice a second in any case", () => {
        const { cull, draw, pass } = fixture();
        draw(0);
        draw(1);
        expect(cull).toHaveBeenCalledTimes(2);
        pass(499);
        draw(1);
        expect(cull).toHaveBeenCalledTimes(2);
        pass(2);
        draw(1);
        expect(cull).toHaveBeenCalledTimes(3);
    });

    it("keeps its own list: the array Phaser reuses for the next reading does not change it", () => {
        const { draw, tiles } = fixture();
        const first = draw();
        tiles.push({ index: 9 });
        expect(first).toHaveLength(2);
    });
});

describe("placeAtDepth", () => {
    it("sets a depth only when it changes: Phaser sorts the whole scene at each set", () => {
        const object = { depth: 4, setDepth: vi.fn((depth: number) => (object.depth = depth)) };
        placeAtDepth(object, 4);
        expect(object.setDepth).not.toHaveBeenCalled();
        placeAtDepth(object, 5);
        expect(object.setDepth).toHaveBeenCalledWith(5);
        expect(object.depth).toBe(5);
    });
});
