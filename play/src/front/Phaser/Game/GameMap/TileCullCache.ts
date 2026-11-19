import type * as Phaser from "phaser";

/** A kept list is read again from the layer at least this often: a tile shown or hidden without going through the layer. */
const KEPT_MS = 500;
/** What changes the tiles of a layer: each bumps the version of its kept list. */
const CHANGING = [
    "putTileAt",
    "putTileAtWorldXY",
    "putTilesAt",
    "removeTileAt",
    "removeTileAtWorldXY",
    "fill",
    "replaceByIndex",
    "swapByIndex",
    "randomize",
    "weightedRandomize",
    "shuffle",
    "copy",
] as const;

type CullCallback = (
    layer: Phaser.Tilemaps.LayerData,
    camera: Phaser.Cameras.Scene2D.Camera,
    outputArray: Phaser.Tilemaps.Tile[],
    renderOrder?: number,
) => Phaser.Tilemaps.Tile[];

/** A classic tilemap layer: Phaser types its culling as a bare function. */
interface CullLayer {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    cullCallback: Function;
}

/**
 * Keeps the tiles a layer draws while neither the tiles nor the part of the map in view change. Phaser walks every
 * cell of the view at every image, empty ones too: on a large map seen from far that is every cell of the map, for a
 * layer that holds a few tiles. The list is read again when a tile is put or removed through the layer, when the
 * view shows other cells, when the drawing order changes, and twice a second in any case.
 */
export function keepCulledTiles(layer: CullLayer, now: () => number = () => performance.now()): void {
    const cull = layer.cullCallback as CullCallback;
    let version = 0;
    const changing = layer as unknown as Record<string, unknown>;
    for (const name of CHANGING) {
        const method = changing[name];
        if (typeof method !== "function") continue;
        changing[name] = function (this: unknown, ...args: unknown[]): unknown {
            version++;
            return (method as (...args: unknown[]) => unknown).apply(this, args);
        };
    }
    let kept: { key: string; version: number; at: number; tiles: Phaser.Tilemaps.Tile[] } | undefined;
    const keeping: CullCallback = (data, camera, outputArray, renderOrder) => {
        const view = camera.worldView;
        const tilemapLayer = data.tilemapLayer;
        const tileWidth = Math.max(1, Math.floor(tilemapLayer.tilemap.tileWidth * tilemapLayer.scaleX));
        const tileHeight = Math.max(1, Math.floor(tilemapLayer.tilemap.tileHeight * tilemapLayer.scaleY));
        // The cells of the layer the view shows, within the layer: the same from far whatever the scroll.
        const left = Math.max(0, Math.floor((view.x - tilemapLayer.x) / tileWidth) - tilemapLayer.cullPaddingX);
        const right = Math.min(
            data.width,
            Math.ceil((view.right - tilemapLayer.x) / tileWidth) + tilemapLayer.cullPaddingX,
        );
        const top = Math.max(0, Math.floor((view.y - tilemapLayer.y) / tileHeight) - tilemapLayer.cullPaddingY);
        const bottom = Math.min(
            data.height,
            Math.ceil((view.bottom - tilemapLayer.y) / tileHeight) + tilemapLayer.cullPaddingY,
        );
        const key = [
            left,
            right,
            top,
            bottom,
            renderOrder ?? 0,
            tilemapLayer.skipCull,
            tilemapLayer.scrollFactorX,
            tilemapLayer.scrollFactorY,
        ].join("|");
        const at = now();
        if (kept && kept.key === key && kept.version === version && at - kept.at < KEPT_MS) return kept.tiles;
        const tiles = [...cull(data, camera, outputArray, renderOrder)];
        kept = { key, version, at, tiles };
        return tiles;
    };
    layer.cullCallback = keeping;
}
