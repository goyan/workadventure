import type { MeadowState } from "@wa/front/Phaser/Game/Terrain/MeadowState";
import { chosenWeatherNow } from "./ChosenPlaceWeather";

/**
 * Where the snow this player sees on the ground comes from. A player who follows the weather of the server sees the
 * ground of the server: the snow that fell there, the same for everyone. A player who follows a place of their own
 * (ChosenPlaceWeather) has a world of their own: nothing of the snow of the server is shown to them, they have the
 * snow of their own city instead (Frost.ts, ownSnowAfter), the same over the whole outdoors of the map, and nothing
 * of theirs is sent.
 */

/** Whether this player follows the weather of the server, hence its ground: not a place of their own. */
export function followsServerGround(): boolean {
    return chosenWeatherNow().place === undefined;
}

let localGroundShown: () => boolean = () => false;

/** The scene tells whether the own ground of this player (LocalTerrainController) is shown in place of the server's. */
export function setLocalGroundShown(shown: () => boolean): void {
    localGroundShown = shown;
}

/**
 * Whether the meadow shown holds the snow and the ice of this player, tile by tile: the server's, or their own local
 * ground's (it computes them under the weather of their place). Else only the even snow of their city is theirs.
 */
export function meadowHoldsSnow(): boolean {
    return followsServerGround() || localGroundShown();
}

/**
 * How much the snow whitens the ground at a point of the map (map pixels) for this player, 0 to 1: the snow of the
 * server there, or for a player who follows their own weather the snow of their city (`own`), outdoors only.
 */
export function snowCoverHere(
    meadow: MeadowState | undefined,
    x: number,
    y: number,
    own?: { cover: number; outdoors: boolean },
): number {
    if (meadowHoldsSnow()) return meadow?.snowCoverAt(x, y) ?? 0;
    return own?.outdoors ? own.cover : 0;
}

/**
 * How much snow lies on the map as a whole for this player, 0 to 1: its trees whiten with it. The snow of the server,
 * or for a player who follows their own weather the snow of their city (`ownCover`).
 */
export function snowCoverOfMap(meadow: MeadowState | undefined, ownCover = 0): number {
    if (meadowHoldsSnow()) return meadow?.meanSnowCover() ?? 0;
    return ownCover;
}

/**
 * The deepest snow cover of the map for this player, 0 to 1: the snow of the heights alone lets the footprints be
 * laid there, where the mean over the whole map would round to nothing.
 */
export function snowPeakOfMap(meadow: MeadowState | undefined, ownCover = 0): number {
    if (meadowHoldsSnow()) return meadow?.peakSnowCover() ?? 0;
    return ownCover;
}
