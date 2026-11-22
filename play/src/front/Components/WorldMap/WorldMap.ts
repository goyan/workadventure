import type { WorldPoint } from "../../Phaser/Game/Night/WorldDaylight";

/** The map of the world (Natural Earth, public domain): equirectangular, a point is read straight from it. */
export const WORLD_MAP = "/resources/terrain/world-map.png";
export const WORLD_MAP_WIDTH = 240;
export const WORLD_MAP_HEIGHT = 120;

/**
 * The point of the world under a click on the map drawn in `box`: its longitude from the left edge, its latitude from
 * the top, kept off the poles (a sun there has no day nor night of a familiar length).
 */
export function pointOnWorldMap(
    box: { left: number; top: number; width: number; height: number },
    clientX: number,
    clientY: number,
): WorldPoint {
    const longitude = ((clientX - box.left) / box.width) * 360 - 180;
    const latitude = 90 - ((clientY - box.top) / box.height) * 180;
    return {
        latitude: Math.max(-89, Math.min(89, latitude)),
        longitude: Math.max(-180, Math.min(180, longitude)),
    };
}

/** Loads the map of the world ahead, so that a menu opened later draws it at once from the cache. */
export function preloadWorldMap(): void {
    new Image().src = WORLD_MAP;
}
