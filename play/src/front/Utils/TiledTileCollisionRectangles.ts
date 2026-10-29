import { ITiledMapObjectLayer } from "@workadventure/tiled-map-type-guard";

const tileCollisionGroupSchema = ITiledMapObjectLayer.pick({ objects: true, offsetx: true, offsety: true });

/**
 * Undefined means that Arcade must keep the existing full-tile collision.
 * Restrict shapes to rectangles inside the tile so the 32px navigation grid remains conservative.
 */
export function getTiledTileCollisionRectangles(
    tile: Pick<
        Phaser.Tilemaps.Tile,
        "getCollisionGroup" | "width" | "height" | "flipX" | "flipY" | "rotation" | "getLeft" | "getTop"
    >,
): Phaser.Types.Math.RectangleLike[] | undefined {
    const group = tileCollisionGroupSchema.safeParse(tile.getCollisionGroup());
    if (!group.success || group.data.objects.length === 0 || tile.width !== tile.height) {
        return undefined;
    }
    const quarterTurns = tile.rotation / (Math.PI / 2);
    if (!Number.isInteger(quarterTurns)) {
        return undefined;
    }

    const rectangles: Phaser.Types.Math.RectangleLike[] = [];
    const cosine = Math.round(Math.cos(tile.rotation));
    const sine = Math.round(Math.sin(tile.rotation));
    for (const object of group.data.objects) {
        const width = object.width;
        const height = object.height;
        const x = object.x + (group.data.offsetx ?? 0);
        const y = object.y + (group.data.offsety ?? 0);
        if (
            object.ellipse ||
            object.point ||
            object.polygon ||
            object.polyline ||
            object.gid !== undefined ||
            object.text ||
            (object.rotation ?? 0) !== 0 ||
            width === undefined ||
            height === undefined ||
            ![x, y, width, height].every(Number.isFinite) ||
            width <= 0 ||
            height <= 0 ||
            x < 0 ||
            y < 0 ||
            x + width > tile.width ||
            y + height > tile.height
        ) {
            return undefined;
        }
        const corners = [
            { x, y },
            { x: x + width, y },
            { x, y: y + height },
            { x: x + width, y: y + height },
        ].map((corner) => {
            const flippedX = (tile.flipX ? tile.width - corner.x : corner.x) - tile.width / 2;
            const flippedY = (tile.flipY ? tile.height - corner.y : corner.y) - tile.height / 2;
            return {
                x: flippedX * cosine - flippedY * sine + tile.width / 2,
                y: flippedX * sine + flippedY * cosine + tile.height / 2,
            };
        });
        const left = Math.min(...corners.map((corner) => corner.x));
        const top = Math.min(...corners.map((corner) => corner.y));
        rectangles.push({
            x: tile.getLeft() + left,
            y: tile.getTop() + top,
            width: Math.max(...corners.map((corner) => corner.x)) - left,
            height: Math.max(...corners.map((corner) => corner.y)) - top,
        });
    }
    return rectangles;
}
