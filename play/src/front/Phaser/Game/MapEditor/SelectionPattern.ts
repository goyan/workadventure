import type { AreaData, EntityDimensions, WAMEntityData } from "@workadventure/map-editor";
import type { MapPatternItem, MapPatternPayload } from "../../../../common/MapPattern";

interface Bounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** An entity or an area read from the current selection. Only what a pattern keeps: no id, no bounds. */
export type PatternSourceItem =
    | { kind: "entity"; data: WAMEntityData; dimensions: EntityDimensions; collisionGrid?: number[][] }
    | { kind: "area"; data: AreaData };

/** Same shape as the selection items of the editor, so a pasted pattern goes through the usual Paste mode. */
export type PatternPlacedItem =
    | {
          kind: "entity";
          id: string;
          data: WAMEntityData;
          dimensions: EntityDimensions;
          collisionGrid?: number[][];
          bounds: Bounds;
      }
    | { kind: "area"; id: string; data: AreaData; bounds: Bounds };

export interface PatternPlacement {
    items: PatternPlacedItem[];
    bounds: Bounds;
    /** Entities left out because their prefab is not loaded in the map. Areas of old patterns are not counted. */
    ignoredCount: number;
}

function boundsOf(item: PatternSourceItem): Bounds {
    return item.kind === "entity"
        ? { x: item.data.x, y: item.data.y, width: item.dimensions.width, height: item.dimensions.height }
        : { x: item.data.x, y: item.data.y, width: item.data.width, height: item.data.height };
}

function unionOf(boundsList: Bounds[]): Bounds {
    const left = Math.min(...boundsList.map((bounds) => bounds.x));
    const top = Math.min(...boundsList.map((bounds) => bounds.y));
    const right = Math.max(...boundsList.map((bounds) => bounds.x + bounds.width));
    const bottom = Math.max(...boundsList.map((bounds) => bounds.y + bounds.height));
    return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * Converts the selection to a payload v1: no original id, positions relative to the tile corner that contains the
 * top-left of the selection. Pasting moves a pattern by whole tiles, so the offset of that corner inside its tile
 * must survive: thin walls are centered on a grid line, and a pattern anchored on its leftmost wall would otherwise
 * land 6 px away from the grid of its source. Patterns saved before this rule are anchored on the union corner itself.
 * Only entities are stored: areas of the selection are dropped (the schema still reads `area` items of old patterns).
 */
export function selectionToPatternPayload(
    selection: PatternSourceItem[],
    tileDimensions: { width: number; height: number },
): MapPatternPayload {
    const items = selection.filter((item) => item.kind === "entity");
    if (items.length === 0) {
        throw new Error("A pattern needs at least one entity");
    }
    const union = unionOf(items.map(boundsOf));
    const origin = {
        x: Math.floor(union.x / tileDimensions.width) * tileDimensions.width,
        y: Math.floor(union.y / tileDimensions.height) * tileDimensions.height,
    };
    const patternItems: MapPatternItem[] = items.map((item) => ({
        kind: "entity",
        data: { ...structuredClone(item.data), x: item.data.x - origin.x, y: item.data.y - origin.y },
        dimensions: { ...item.dimensions },
        ...(item.collisionGrid ? { collisionGrid: structuredClone(item.collisionGrid) } : {}),
    }));
    return { version: 1, bounds: { width: union.width, height: union.height }, items: patternItems };
}

/**
 * Rebuilds the items of a pattern at the origin (0, 0), ready to be pasted by the usual Paste mode.
 * An entity is kept only when its prefab is loaded in a collection of the map. Areas of patterns stored before areas
 * were dropped are skipped silently: it is a choice, not an error, so they are not counted as ignored.
 */
export function patternPayloadToPlacement(
    payload: MapPatternPayload,
    options: { isPrefabKnown: (collectionName: string, prefabId: string) => boolean },
): PatternPlacement {
    const items: PatternPlacedItem[] = [];
    let ignoredCount = 0;
    for (const item of payload.items) {
        if (item.kind === "entity") {
            if (!options.isPrefabKnown(item.data.prefabRef.collectionName, item.data.prefabRef.id)) {
                ignoredCount += 1;
                continue;
            }
            items.push({
                kind: "entity",
                id: "",
                data: structuredClone(item.data),
                dimensions: { ...item.dimensions },
                collisionGrid: item.collisionGrid ? structuredClone(item.collisionGrid) : undefined,
                bounds: boundsOf(item),
            });
        }
    }
    return {
        items,
        bounds: items.length > 0 ? unionOf(items.map((item) => item.bounds)) : { x: 0, y: 0, width: 0, height: 0 },
        ignoredCount,
    };
}
