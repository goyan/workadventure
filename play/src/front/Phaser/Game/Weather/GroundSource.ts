import type { MeadowState } from "@wa/front/Phaser/Game/Terrain/MeadowState";
import { chosenWeatherNow } from "./ChosenPlaceWeather";

/**
 * Where the snow this player sees on the ground comes from. A player who follows the weather of the server sees the
 * ground of the server: the snow that fell there, the same for everyone. A player who follows a place of their own
 * (ChosenPlaceWeather) has a world of their own: nothing of the snow of the server is shown to them, and nothing of
 * theirs is sent.
 */

/** Whether this player follows the weather of the server, hence its ground: not a place of their own. */
export function followsServerGround(): boolean {
    return chosenWeatherNow().place === undefined;
}

/** How much the snow whitens the ground at a point of the map (map pixels) for this player, 0 to 1. */
export function snowCoverHere(meadow: MeadowState | undefined, x: number, y: number): number {
    if (!meadow || !followsServerGround()) return 0;
    return meadow.snowCoverAt(x, y);
}

/** How much snow lies on the map as a whole for this player, 0 to 1: its trees whiten with it. */
export function snowCoverOfMap(meadow: MeadowState | undefined): number {
    if (!meadow || !followsServerGround()) return 0;
    return meadow.meanSnowCover();
}
