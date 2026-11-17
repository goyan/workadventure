import { isAtAreaLevel, type AreaData } from "@workadventure/map-editor";
import type { GameScene } from "../GameScene";
import { lightableAreas } from "../Night/NightLights";
import { toLampZone, type LampZone } from "./LampJam";

/** The areas of the map that can be a room. As for the night lights: an area that covers most of the map is not one. */
export function mapRoomAreas(scene: GameScene): AreaData[] {
    const areas = scene.getGameMap().getWamFile()?.getGameMapAreas()?.getAreas().values() ?? [];
    const map = scene.getGameMapFrontWrapper().getMap();
    const mapWidth = (map.width ?? 0) * (map.tilewidth ?? 32);
    const mapHeight = (map.height ?? 0) * (map.tileheight ?? 32);
    return lightableAreas(areas, mapWidth, mapHeight);
}

/** The raised floor under a point at this altitude, as a zone; undefined on the ground. */
export function raisedFloorZone(
    scene: GameScene,
    elevation: number,
    point: { x: number; y: number },
): LampZone | undefined {
    if (!(elevation > 0)) return undefined;
    const floor = scene.raisedFloorZoneAt(elevation, point.x, point.y);
    return floor
        ? { areaId: `floor:${floor.key}`, x: floor.x, y: floor.y, width: floor.width, height: floor.height }
        : undefined;
}

/**
 * The zones an object at this altitude may be in: the areas of its floor, and on a raised floor the floor itself
 * (upstairs there is in general no area). The smallest that contains the object is its room (see zoneOf): the light
 * of a lamp stays in it, a switch commands the lamps of it.
 */
export function roomZonesAt(
    scene: GameScene,
    areas: readonly AreaData[],
    elevation: number,
    point: { x: number; y: number },
): LampZone[] {
    const zones = areas.filter((area) => isAtAreaLevel(area, elevation)).map(toLampZone);
    const floor = raisedFloorZone(scene, elevation, point);
    return floor ? [...zones, floor] : zones;
}
