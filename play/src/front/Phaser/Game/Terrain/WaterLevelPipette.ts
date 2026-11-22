import { MAX_WATER_LEVEL, metresOf, MIN_WATER_LEVEL } from "@workadventure/map-editor";
import type { TerrainData } from "@workadventure/map-editor";
import { groundReadingAt } from "../Floors/AvatarAltitude";
import type { PointerGround, PointerWater } from "../Floors/AvatarAltitude";
import { gameManager } from "../GameManager";

/**
 * The levels a source or a sink may hold, in metres to the decimetre, rounded inwards: a level taken at the bounds is
 * saved as it is shown (-8.76 m would be shown -8.8 and saved -8.76).
 */
const LOWEST = Math.ceil(metresOf(MIN_WATER_LEVEL) * 10) / 10;
const HIGHEST = Math.floor(metresOf(MAX_WATER_LEVEL) * 10) / 10;

/**
 * The level the pipette takes from what it reads (in metres, as the floors badge tells them): the surface of the
 * water where there is water, to hold a lake at its level; the ground where it is dry, or when asked (`ground`), to
 * fill a hollow up to that rim. Within the levels a source may hold.
 */
export function pipetteLevelMetres(reading: PointerGround, ground: boolean): number {
    const level = ground || reading.surface === undefined ? reading.ground : reading.surface;
    return Math.min(HIGHEST, Math.max(LOWEST, level));
}

/**
 * The ground and the water at a point of the map, read as under the pointer (groundReadingAt): the floor of a pool,
 * the last state of the water the server sent; on a map without relief too. The ice does not change the level.
 */
export function levelReadingAt(
    terrain: TerrainData | undefined,
    point: { x: number; y: number },
    water: PointerWater,
): PointerGround {
    return groundReadingAt(terrain, point, water, () => false);
}

/** The level the pipette takes at a point of the map of the game now, in metres. */
export function readWaterLevelAt(point: { x: number; y: number }, ground: boolean): number {
    const scene = gameManager.getCurrentGameScene();
    const terrain = scene.getGameMap().getWamFile()?.getWam().terrain;
    return pipetteLevelMetres(levelReadingAt(terrain, point, scene.getTerrainWater()), ground);
}
