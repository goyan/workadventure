import { MAP_LAYER_TILE_SIZE } from "../MapEditor/MapLayer/MapLayerCatalog";
import { doorHeight, type MapLayerModel } from "../MapEditor/MapLayer/MapLayerModel";
import { SHADOW_MAX_LENGTH, shadowDirection, shadowOffset } from "./SkyShadowGeometry";
import type { Point, ShadowLight } from "./SkyShadowGeometry";

/** The glass of a window starts this high above the floor and stops this far under the top of its opening (px). */
const WINDOW_SILL = 8;
const GLASS_TOP_MARGIN = 6;
/** A light that runs almost along the wall (less than this share of its way across it) does not come in. */
const GRAZING = 0.05;
/** Probes, in map pixels, just past each side of the row a wall is drawn on. */
const PROBE = 4;

/** A pane between the outdoors and a room: on the foot line of its wall, from `x` over `width` (map pixels). */
export interface WindowOpening {
    x: number;
    width: number;
    footY: number;
    /** Bottom and top of the glass above the floor, in map pixels. */
    sill: number;
    top: number;
    /** The room the light comes into (OutdoorGrid.roomAt), and on which side of the wall it lies. */
    room: number;
    inside: "north" | "south";
}

/**
 * The windows and the glazed doors of the map layer between the outdoors and a room: the sun or the moon comes in
 * through them. A horizontal wall of the line y is drawn on the row y, its foot on the bottom of that row: its north
 * side is looked at just above the row, its south side just under it.
 */
export function windowOpenings(
    model: MapLayerModel,
    roomAt: (x: number, y: number) => number | undefined,
    isOutdoorAt: (x: number, y: number) => boolean,
): WindowOpening[] {
    const size = MAP_LAYER_TILE_SIZE;
    const panes: { x: number; y: number; width: number; sill: number; height: number }[] = [];
    for (const window of model.getWindows()) {
        const height = model.getWindowHeight(window.x, window.y) ?? 1;
        panes.push({ x: window.x * size, y: window.y, width: size, sill: WINDOW_SILL, height });
    }
    for (const door of model.getDoors()) {
        // A horizontal door stands on the segments x - 1 and x (doorEdges): two tiles wide, its glass to the floor.
        if (door.orientation !== "h" || door.glazed !== true) continue;
        panes.push({ x: (door.x - 1) * size, y: door.y, width: 2 * size, sill: 0, height: doorHeight(door) });
    }
    const openings: WindowOpening[] = [];
    for (const pane of panes) {
        const centre = pane.x + pane.width / 2;
        const north = pane.y * size - PROBE;
        const south = (pane.y + 1) * size + PROBE;
        const northRoom = roomAt(centre, north);
        const southRoom = roomAt(centre, south);
        let room: number | undefined;
        let inside: "north" | "south" | undefined;
        if (northRoom !== undefined && southRoom === undefined && isOutdoorAt(centre, south)) {
            room = northRoom;
            inside = "north";
        } else if (southRoom !== undefined && northRoom === undefined && isOutdoorAt(centre, north)) {
            room = southRoom;
            inside = "south";
        }
        if (room === undefined || inside === undefined) continue;
        openings.push({
            x: pane.x,
            width: pane.width,
            footY: (pane.y + 1) * size,
            sill: pane.sill,
            top: pane.height * size - GLASS_TOP_MARGIN,
            room,
            inside,
        });
    }
    return openings;
}

/**
 * Where the light of the sky that comes in through a window lies on the floor of the room: between where the rays
 * through the bottom and through the top of the glass meet the floor, slanted with the light, as far as the longest
 * shadow of the light. Undefined when the window does not face the light, or the light is under the horizon.
 */
export function windowLightPatch(opening: WindowOpening, light: ShadowLight): Point[] | undefined {
    const direction = shadowDirection(light.azimuth);
    const comesIn = opening.inside === "north" ? direction.y < -GRAZING : direction.y > GRAZING;
    if (!comesIn) return undefined;
    // The longest shadow set for the light bounds the patch; its shortest shadow does not move the pane.
    const reach = { ...light, shadowLength: { min: 0, max: light.shadowLength?.max ?? SHADOW_MAX_LENGTH } };
    const near = shadowOffset(opening.sill, reach);
    const far = shadowOffset(opening.top, reach);
    if (!near || !far) return undefined;
    const left = opening.x;
    const right = opening.x + opening.width;
    const foot = opening.footY;
    return [
        { x: left + near.x, y: foot + near.y },
        { x: right + near.x, y: foot + near.y },
        { x: right + far.x, y: foot + far.y },
        { x: left + far.x, y: foot + far.y },
    ];
}
