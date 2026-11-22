import { ICE_SHACK_MM, ICE_SLIPS_MM, iceByte, iceMmOfByte, TERRAIN_CELL } from "@workadventure/map-editor";
import type { IceShackGround } from "@workadventure/map-editor";
import type { GameScene } from "../GameScene";
import { isPoolAt } from "../Water/WaterZones";

/**
 * The ice reaches this browser in a byte a tile (iceByte): a thickness read back from its byte may fall a little
 * short of the thickness the server keeps. A byte that tells at least the byte of a threshold is read as that
 * threshold at least, so that the wheel never greys a shack the server would put up.
 */
export function iceOfByte(byte: number): number {
    const mm = iceMmOfByte(byte);
    if (byte >= iceByte(ICE_SHACK_MM)) return Math.max(mm, ICE_SHACK_MM);
    if (byte >= iceByte(ICE_SLIPS_MM)) return Math.max(mm, ICE_SLIPS_MM);
    return mm;
}

/**
 * The ground a shack goes up on as this browser knows it from the server: the ice it keeps (MeadowState), the water
 * of the relief, its pools. Only to tell why the server would refuse: the server decides on its own ground.
 */
export function clientShackGround(
    scene: Pick<GameScene, "getMeadow" | "getTerrainWater" | "getGameMap">,
): IceShackGround {
    const meadow = scene.getMeadow();
    const water = scene.getTerrainWater();
    const terrain = scene.getGameMap()?.getWamFile()?.getWam().terrain;
    const centre = (cell: number): number => cell * TERRAIN_CELL + TERRAIN_CELL / 2;
    return {
        iceMmAt: (tileX, tileY) => iceOfByte(meadow?.iceByteAt(tileX, tileY) ?? 0),
        // The server reads the water it keeps, without the glide between two of its states.
        depthPxAt: (cellX, cellY) => water?.settledDepthAt(centre(cellX), centre(cellY)) ?? 0,
        inPool: (cellX, cellY) => isPoolAt(terrain, { x: centre(cellX), y: centre(cellY) }),
    };
}
