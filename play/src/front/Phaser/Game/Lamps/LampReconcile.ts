import { LAMP_LIGHT_MAX_TILES, LAMP_LIGHT_MIN_TILES, type EntityDataProperties } from "@workadventure/map-editor";
import { DANCE_FLOOR_TILE_PX } from "./DanceFloorPatterns";
import type { LampKind } from "./LampVisuals";

/** What the objects of the map say about lamps: their id, and the kind of lamp their catalog entry asks for (if any). */
export interface LampObject {
    id: string;
    kind: LampKind | undefined;
}

export interface LampPlan {
    /** Lamps to light: new objects, and objects whose kind changed. */
    create: { id: string; kind: LampKind }[];
    /** Ids whose lamp goes out: deleted objects, objects that are not lamps any more, kinds that changed. */
    remove: string[];
}

/**
 * Compares the lamps that are lit (by object id) with the objects of the map. An object moves without changing: its
 * lamp follows it, nothing is replaced.
 */
export function planLamps(lit: ReadonlyMap<string, LampKind>, objects: readonly LampObject[]): LampPlan {
    const create: { id: string; kind: LampKind }[] = [];
    const remove: string[] = [];
    const present = new Set<string>();
    for (const object of objects) {
        present.add(object.id);
        const current = lit.get(object.id);
        if (object.kind === undefined) {
            if (current !== undefined) {
                remove.push(object.id);
            }
        } else if (current !== object.kind) {
            if (current !== undefined) {
                remove.push(object.id);
            }
            create.push({ id: object.id, kind: object.kind });
        }
    }
    for (const id of lit.keys()) {
        if (!present.has(id)) {
            remove.push(id);
        }
    }
    return { create, remove };
}

/** The part of an object that tells where it is on the screen and how it is drawn. */
export interface LampBounds {
    x: number;
    y: number;
    displayWidth: number;
    displayHeight: number;
    /** Size of the image itself, before any resizing. */
    width: number;
    height: number;
}

/**
 * Where the light of a lamp object comes from, on the map: the point of the image the catalog names (scaled with the
 * object if it was resized), or the centre of the object.
 */
export function lampSource(object: LampBounds, anchor: { x: number; y: number } | undefined): { x: number; y: number } {
    if (!anchor) {
        return { x: object.x + object.displayWidth / 2, y: object.y + object.displayHeight / 2 };
    }
    const scaleX = object.width > 0 ? object.displayWidth / object.width : 1;
    const scaleY = object.height > 0 ? object.displayHeight / object.height : 1;
    return { x: object.x + anchor.x * scaleX, y: object.y + anchor.y * scaleY };
}

/** The size of the light set for a lamp in the editor, in tiles, if one was. */
export function lampSizeOf(properties: EntityDataProperties): { width: number; height: number } | undefined {
    for (const property of properties) {
        if (property.type === "lampPropertyData") {
            return { width: property.width, height: property.height };
        }
    }
    return undefined;
}

/**
 * What a dance floor covers on the map: the size set for it in the editor, in tiles, from the top-left corner of its
 * object; without one, the image of the object as it is. It follows the object when it is moved.
 */
export function danceFloorBounds(
    object: LampBounds,
    sizeInTiles: { width: number; height: number } | undefined,
): { x: number; y: number; width: number; height: number } {
    return {
        x: object.x,
        y: object.y,
        width: sizeInTiles ? sizeInTiles.width * DANCE_FLOOR_TILE_PX : object.width,
        height: sizeInTiles ? sizeInTiles.height * DANCE_FLOOR_TILE_PX : object.height,
    };
}

/** A size in pixels as the size of a dance floor, in whole tiles, within what the size of a lamp can be. */
export function danceFloorTiles(size: { width: number; height: number }): { width: number; height: number } {
    const tiles = (pixels: number): number =>
        Math.min(LAMP_LIGHT_MAX_TILES, Math.max(LAMP_LIGHT_MIN_TILES, Math.round(pixels / DANCE_FLOOR_TILE_PX)));
    return { width: tiles(size.width), height: tiles(size.height) };
}
