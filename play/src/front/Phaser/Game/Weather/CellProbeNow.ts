import { CELL_METRES, snowShareOf, soilFrostOf, TILE_PX, waterTimesOf } from "@workadventure/map-editor";
import type { SnowWeather, TerrainData } from "@workadventure/map-editor";
import { get } from "svelte/store";
import { fireConditionsStore } from "@wa/front/Stores/FireConditionsStore";
import { groundReadingAt } from "../Floors/AvatarAltitude";
import type { IceState } from "../Ice/IceHold";
import { SWIM_DEPTH_PX } from "../Terrain/Pixel/TerrainUnits";
import type { WorldPlace } from "../Night/WorldDaylight";
import type { MeadowState } from "../Terrain/MeadowState";
import type { TerrainWater } from "../Terrain/TerrainWater";
import { explainCell } from "./CellExplained";
import type { CellExplained } from "./CellExplained";
import { chosenWeatherNow } from "./ChosenPlaceWeather";
import { frostAirNow, waterCycleNow } from "./Frost";
import { followsServerGround, meadowHoldsSnow } from "./GroundSource";
import { roomPrecipitationAir } from "./PrecipitationAir";
import { mapWeatherSettings, shownWeatherSettings } from "./RealWeatherClient";
import type { MapSnowSettings } from "./SnowCover";
import { fallsUnder } from "./WeatherBoardNow";

/** What the pipette reads of the scene: the readers the game itself draws and walks by. */
export interface ProbedScene {
    terrain: TerrainData | undefined;
    settings: (MapSnowSettings & { water?: { speed?: number } }) | undefined;
    water: TerrainWater;
    meadow: MeadowState;
    /** Outdoors at a point of the map (OutdoorGrid); true where the map has no walls to tell. */
    outdoorAt(x: number, y: number): boolean;
    /** The ice under a point as this player stands on it (iceUnderfoot). */
    iceUnderfoot(point: { x: number; y: number }): IceState;
    /** The height of the sun over the horizon, in degrees. */
    sunElevation: number | undefined;
}

/** A place without its region and country. */
function townOf(name: string | undefined): string | undefined {
    return name?.split(",")[0]?.trim() || name;
}

/**
 * What goes on in the cell at `point` (map pixels) now, each thing read by the reader the game draws from: asked a
 * few times a second while the pipette is on, for that one cell, never otherwise.
 */
export function cellProbeNow(scene: ProbedScene, point: { x: number; y: number }, date: Date): CellExplained {
    const { settings, water, meadow } = scene;
    const server = followsServerGround();
    // The place followed: a point far from any city says its long name (as the weather board).
    const place: WorldPlace | undefined = chosenWeatherNow().place;
    const cycle = waterCycleNow(settings);
    const tileX = Math.floor(point.x / TILE_PX);
    const tileY = Math.floor(point.y / TILE_PX);
    const hold = scene.iceUnderfoot(point);
    const depthPx = water.settledDepthAt(point.x, point.y);
    const speed = water.speedAt(point.x, point.y);
    // The air the ground goes by: the server's goes by the air of the room and the wind of its conditions (GameRoom,
    // snowUnder); a player's own by the air of the city they follow.
    const roomAir = roomPrecipitationAir(settings, date);
    const roomWind = get(fireConditionsStore)?.windSpeed;
    const ownAir = frostAirNow(settings, date);
    const weather: SnowWeather | undefined = server
        ? roomAir && roomWind !== undefined
            ? { ...roomAir, windSpeed: roomWind }
            : undefined
        : ownAir?.humidity !== undefined
          ? { temperature: ownAir.temperature, humidity: ownAir.humidity, windSpeed: ownAir.windSpeed ?? 0 }
          : undefined;
    const shown = server ? mapWeatherSettings(settings, date) : shownWeatherSettings(settings, date);
    return explainCell({
        city: server ? undefined : (place?.longName ?? townOf(place?.name)),
        ground: server ? "map" : "own",
        outdoor: scene.outdoorAt(point.x, point.y),
        reading: groundReadingAt(scene.terrain, point, water, (at) => scene.iceUnderfoot(at) !== "none"),
        depthPx,
        deep: depthPx >= SWIM_DEPTH_PX,
        current: speed
            ? {
                  speed: Math.hypot(speed.x, speed.y) * CELL_METRES,
                  // From the north, clockwise: the screen has its y downwards.
                  heading: ((Math.atan2(speed.x, -speed.y) * 180) / Math.PI + 360) % 360,
              }
            : undefined,
        hold,
        kept:
            meadowHoldsSnow() && meadow.version() > 0
                ? {
                      iceMm: meadow.iceAt(tileX, tileY),
                      snowMm: meadow.snowAt(tileX, tileY),
                      grass: meadow.grassAt(tileX, tileY) / 255,
                      moisture: meadow.moistureAt(point.x, point.y),
                      dryness: meadow.drynessAt(tileX, tileY) / 255,
                      fire: meadow.fireAt(tileX, tileY) / 255,
                      ash: meadow.ashAt(tileX, tileY) / 255,
                  }
                : undefined,
        own: { snowMm: cycle.snowMm, frost: cycle.frost },
        weather,
        snowing: fallsUnder(shown, date) && snowShareOf(weather) > 0,
        times: waterTimesOf(settings?.water),
        soilFrost: soilFrostOf(roomAir),
        sunElevation: scene.sunElevation,
    });
}
