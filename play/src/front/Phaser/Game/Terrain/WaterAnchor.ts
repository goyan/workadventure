import { MAX_WATER_FLOW, MAX_WATER_RADIUS_TILES } from "@workadventure/map-editor";
import type { EntityDataProperties, EntityPrefab } from "@workadventure/map-editor";

/** A flow is stored in litres a minute, and given in cubic metres an hour in a catalogue and in the editor. */
export const LITRES_A_MINUTE_PER_M3_AN_HOUR = 1000 / 60;

/**
 * Where the water of a source or a sink comes out of an object, from the corner of its image, in pixels: the point
 * its catalogue entry gives (the basin of a fountain, the middle of a chasm), else the middle of its foot (a tree
 * pours at its trunk, not at the top left of its leaves). Written in the property by the editor: the server reads it,
 * knowing nothing of the size of the objects.
 */
export function waterAnchorOf(entity: {
    displayWidth: number;
    displayHeight: number;
    getPrefab?: () => Pick<EntityPrefab, "waterFlow">;
}): {
    anchorX: number;
    anchorY: number;
} {
    const given = entity.getPrefab?.().waterFlow?.anchor;
    if (given) return { anchorX: Math.round(given.x), anchorY: Math.round(given.y) };
    return {
        anchorX: Math.round(entity.displayWidth / 2),
        // Half a tile up from the bottom edge: the ground the object stands on.
        anchorY: Math.round(Math.max(0, entity.displayHeight - 16)),
    };
}

/**
 * The water property an object placed from the catalog starts with: one whose catalog entry says `waterFlow` (a
 * fountain, a chasm) pours or takes water at once, without anything to set.
 */
export function newWaterProperties(prefab: Pick<EntityPrefab, "waterFlow">, newId: () => string): EntityDataProperties {
    const water = prefab.waterFlow;
    if (!water) return [];
    return [
        {
            id: newId(),
            type: water.kind === "source" ? "waterSourcePropertyData" : "waterSinkPropertyData",
            flow: Math.min(MAX_WATER_FLOW, Math.round(water.flow * LITRES_A_MINUTE_PER_M3_AN_HOUR)),
            ...(water.radius === undefined ? {} : { radius: Math.min(MAX_WATER_RADIUS_TILES, water.radius) }),
            ...(water.anchor ? { anchorX: Math.round(water.anchor.x), anchorY: Math.round(water.anchor.y) } : {}),
        },
    ];
}

/**
 * The properties of an object turned to another direction of its catalog entry (the rotation of the editor): its
 * water comes out or goes where the new image says (a channel lying across turned upright), its flow, radius, level
 * and the rest kept. A catalog entry that gives no point leaves them as they are.
 */
export function rotatedWaterProperties(
    properties: EntityDataProperties | undefined,
    prefab: Pick<EntityPrefab, "waterFlow">,
): EntityDataProperties | undefined {
    const anchor = prefab.waterFlow?.anchor;
    if (!properties || !anchor) return properties;
    return properties.map((property) =>
        property.type === "waterSourcePropertyData" || property.type === "waterSinkPropertyData"
            ? { ...property, anchorX: Math.round(anchor.x), anchorY: Math.round(anchor.y) }
            : property,
    );
}
