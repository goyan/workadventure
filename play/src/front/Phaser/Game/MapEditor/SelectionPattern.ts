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
    /** Items left out: unknown prefab or an area the user cannot edit. */
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

/** Converts the selection to a payload v1: positions relative to the union top-left corner, no original id. */
export function selectionToPatternPayload(items: PatternSourceItem[]): MapPatternPayload {
    if (items.length === 0) {
        throw new Error("A pattern needs at least one item");
    }
    const union = unionOf(items.map(boundsOf));
    const patternItems: MapPatternItem[] = items.map((item) => {
        if (item.kind === "entity") {
            return {
                kind: "entity",
                data: { ...structuredClone(item.data), x: item.data.x - union.x, y: item.data.y - union.y },
                dimensions: { ...item.dimensions },
                ...(item.collisionGrid ? { collisionGrid: structuredClone(item.collisionGrid) } : {}),
            };
        }
        return {
            kind: "area",
            // The schema asks for an id, but a new one is created when the pattern is pasted.
            data: { ...structuredClone(item.data), id: "", x: item.data.x - union.x, y: item.data.y - union.y },
        };
    });
    return { version: 1, bounds: { width: union.width, height: union.height }, items: patternItems };
}

/**
 * Rebuilds the items of a pattern at the origin (0, 0), ready to be pasted by the usual Paste mode.
 * An entity is kept only when its prefab is loaded in a collection of the map; an area only when the user can edit areas.
 */
export function patternPayloadToPlacement(
    payload: MapPatternPayload,
    options: { isPrefabKnown: (collectionName: string, prefabId: string) => boolean; canEditAreas: boolean },
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
        } else {
            if (!options.canEditAreas) {
                ignoredCount += 1;
                continue;
            }
            items.push({ kind: "area", id: "", data: structuredClone(item.data), bounds: boundsOf(item) });
        }
    }
    return {
        items,
        bounds: items.length > 0 ? unionOf(items.map((item) => item.bounds)) : { x: 0, y: 0, width: 0, height: 0 },
        ignoredCount,
    };
}
