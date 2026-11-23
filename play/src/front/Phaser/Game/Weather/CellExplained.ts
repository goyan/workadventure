import { ICE_CURRENT_OPEN_MS, ICE_CURRENT_SHEET_MS, PX_PER_MM, snowCoverOf } from "@workadventure/map-editor";
import type { SnowWeather } from "@workadventure/map-editor";
import type { PointerGround } from "../Floors/AvatarAltitude";
import type { IceState } from "../Ice/IceHold";
import { explainKeptIce, explainKeptSnow } from "./KeptCover";
import type { KeptIce, KeptSnow } from "./KeptCover";
import type { AirOwner, Audience } from "./WeatherExplained";

/**
 * What goes on in one cell of the ground, the one under the pointer of the weather pipette: its relief and its soil,
 * its water and how it runs, its ice and its snow with where they are going, its frost, its grass. Pure: everything
 * is given as the game itself reads it (CellProbeNow), and where the ice and the snow are going is what the rules of
 * the server give (KeptCover). One cell only: nothing of the map is gone through.
 */

/** Not told by the server; still; running, slow enough for a sheet of ice; too fast for a sheet (slush); open water. */
export type WaterRun = "unknown" | "still" | "runs" | "slush" | "open";

/** A water slower than this (m/s) is told as still. */
export const STILL_WATER_MS = 0.05;

export interface CellInput {
    /** The city this player follows; undefined while they follow the server. */
    city: string | undefined;
    /**
     * Whose ground the cell is read on: the server's, the same for who follows it ("map"), or this player's own
     * ("own": they follow a city).
     */
    ground: AirOwner;
    /** Outdoors: indoors (closed by walls) nothing falls, nothing freezes. */
    outdoor: boolean;
    /** The relief, the soil and the water of the cell (groundReadingAt). */
    reading: PointerGround;
    /** The water lying on the cell, in pixels of altitude (TerrainWater.settledDepthAt). */
    depthPx: number;
    /** Whether one swims there (SWIM_DEPTH_PX): only there does a thin ice give way. */
    deep: boolean;
    /** How fast the water runs (m/s) and where to (degrees from the north, clockwise); undefined when not told. */
    current: { speed: number; heading: number } | undefined;
    /** The ice as this player stands on it (iceUnderfoot). */
    hold: IceState;
    /** What the ground holds tile by tile (the meadow shown); undefined when it holds none for this player. */
    kept:
        | { iceMm: number; snowMm: number; grass: number; moisture: number; dryness: number; fire: number; ash: number }
        | undefined;
    /** The even snow (mm of water) and the frost (0 to 1) of this player's own cycle (waterCycleNow). */
    own: { snowMm: number; frost: number };
    /** The air the ice and the snow of that ground go by, with its wind; undefined while not known. */
    weather: SnowWeather | undefined;
    /** Whether a snow falls on that ground now. */
    snowing: boolean;
    /** How many times faster than reality that ground goes (waterTimesOf). */
    times: number;
    /** How frozen the soil of the map is, 0 to 1 (soilFrostOf the air of the room). */
    soilFrost: number;
    /** The height of the sun over the horizon, in degrees; undefined when not known. */
    sunElevation: number | undefined;
    /** The pool painted under the cell, and whether its water is heated; undefined out of any pool. */
    pool?: { hot: boolean };
    /** The altitudes (pixels) of the raised floors drawn over the cell, the highest first. */
    floorsOver?: readonly number[];
    /** Whether a shadow of the sky is drawn over the cell for this player; undefined while none is drawn. */
    shaded?: boolean;
}

export type CellIceWhy =
    /** Indoors the water never freezes. */
    | "indoor"
    /** No water lies there: no ice. */
    | "noWater"
    /** The heated water of a pool never freezes. */
    | "hotPool"
    /** The air is at zero or over and no ice is left. */
    | "warm"
    /** It freezes, but the water runs too fast for a sheet of ice. */
    | "current"
    /** It freezes and the ice is taking. */
    | "taking"
    /** There is ice: see `kept` for where it goes. */
    | "ice"
    /** The air is not known. */
    | "unknown";

export interface CellExplained {
    city: string | undefined;
    ground: AirOwner;
    /** Who sees that ground as this player does. */
    audience: Audience;
    outdoor: boolean;
    reading: PointerGround;
    water: { run: WaterRun; speed?: number; heading?: number; deep: boolean } | undefined;
    ice: { hold: IceState; why: CellIceWhy; kept: KeptIce | undefined };
    snow: { cover: number; kept: KeptSnow };
    /** The frost drawn for this player, 0 to 1: always their own. */
    frost: number;
    /** How frozen the soil of the map is, 0 to 1: the server's, for everyone. */
    soilFrost: number;
    meadow: { grass: number; moisture: number; dryness: number; fire: number; ash: number } | undefined;
    sunElevation: number | undefined;
    /** The water of the cell is that of a heated pool: it takes no ice and melts the snow. */
    hotPool: boolean;
    /** The altitudes (pixels) of the raised floors drawn over the cell, the highest first: the cell is read under them. */
    floorsOver: readonly number[];
    /** Whether a shadow of the sky is drawn over the cell for this player; undefined while none is drawn. */
    shaded: boolean | undefined;
    /** The air that ground goes by. */
    temperature: number | undefined;
    times: number;
}

function runOf(current: CellInput["current"]): WaterRun {
    if (!current || !Number.isFinite(current.speed)) return "unknown";
    if (current.speed < STILL_WATER_MS) return "still";
    if (current.speed >= ICE_CURRENT_OPEN_MS) return "open";
    return current.speed > ICE_CURRENT_SHEET_MS ? "slush" : "runs";
}

/** What goes on in a cell: see the head of this file. */
export function explainCell(input: CellInput): CellExplained {
    const wet = input.reading.depth !== undefined;
    const hotPool = wet && input.pool?.hot === true;
    const iceMm = hotPool ? 0 : (input.kept?.iceMm ?? 0);
    // The ice is never thicker than the water under it (Meadow.stepIce).
    const keptIce =
        wet && input.outdoor && input.kept && !hotPool
            ? explainKeptIce({
                  mm: iceMm,
                  weather: input.weather,
                  snowMm: input.kept.snowMm,
                  currentMs: input.current?.speed,
                  times: input.times,
                  capMm: input.depthPx / PX_PER_MM,
              })
            : undefined;
    const why: CellIceWhy = !wet
        ? "noWater"
        : !input.outdoor
          ? "indoor"
          : hotPool
            ? "hotPool"
            : input.hold !== "none" || iceMm > 0
              ? "ice"
              : !input.weather
                ? "unknown"
                : keptIce?.trend === "growing"
                  ? "taking"
                  : input.weather.temperature < 0 && keptIce?.currentShare === 0
                    ? "current"
                    : input.weather.temperature < 0
                      ? "taking"
                      : "warm";
    // The snow of the tile where the ground holds it; else the even snow of this player's own city, outdoors.
    const snowMm = input.kept ? input.kept.snowMm : input.outdoor ? input.own.snowMm : 0;
    return {
        city: input.city,
        ground: input.ground,
        audience: input.ground === "map" ? "serverFollowers" : "you",
        outdoor: input.outdoor,
        reading: input.reading,
        water: wet
            ? {
                  run: runOf(input.current),
                  speed: input.current?.speed,
                  heading: input.current?.heading,
                  deep: input.deep,
              }
            : undefined,
        ice: { hold: wet && input.outdoor ? input.hold : "none", why, kept: keptIce },
        snow: {
            cover: snowCoverOf(snowMm),
            kept: explainKeptSnow({
                mm: snowMm,
                weather: input.weather,
                times: input.times,
                building: input.snowing && input.outdoor,
            }),
        },
        frost: input.outdoor ? input.own.frost : 0,
        soilFrost: input.soilFrost,
        // Under water there is no grass to tell.
        meadow:
            input.kept && !wet
                ? {
                      grass: input.kept.grass,
                      moisture: input.kept.moisture,
                      dryness: input.kept.dryness,
                      fire: input.kept.fire,
                      ash: input.kept.ash,
                  }
                : undefined,
        sunElevation: input.sunElevation,
        hotPool,
        floorsOver: input.floorsOver ?? [],
        shaded: input.outdoor ? input.shaded : undefined,
        temperature: input.weather?.temperature,
        times: input.times,
    };
}
