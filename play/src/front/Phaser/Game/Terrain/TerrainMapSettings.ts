import {
    DEFAULT_LIFE_SETTINGS,
    DEFAULT_MAX_DEPTH_TILES,
    DEFAULT_MEADOW_SETTINGS,
    DEFAULT_FLOW_PACE,
    DEFAULT_IMPACT_REACH,
    DEFAULT_WATER_PACE,
    DEFAULT_WATER_SETTINGS,
    DEFAULT_WAVE_SETTINGS,
    waterHasInertia,
} from "@workadventure/map-editor";
import type { LifeSettings, MeadowSettings, PoolStyle, WaveSettings } from "@workadventure/map-editor";
import { gameManager } from "../GameManager";

/** What the map says of its relief and of the pace of its water, with the defaults of a map that says nothing. */
export function readTerrainMapSettings(): {
    maxDepthTiles: number;
    runoff: number;
    evaporation: number;
    speed: number;
    absorption: number;
    current: number;
    maxSurface: number;
    indoorDrain: number;
    inertia: boolean;
    waves: WaveSettings;
    precision: number;
    updates: number;
    flowPace: number;
    impactReach: number;
    life: LifeSettings;
    meadow: MeadowSettings;
    /** The styles of the pools painted on the map (Terrain/Pools.ts). */
    pools: PoolStyle[];
} {
    const wam = gameManager.getCurrentGameScene().getGameMap().getWamFile()?.getWam();
    return {
        maxDepthTiles: wam?.terrain?.maxDepthTiles ?? DEFAULT_MAX_DEPTH_TILES,
        runoff: wam?.settings?.water?.runoff ?? DEFAULT_WATER_SETTINGS.runoff,
        evaporation: wam?.settings?.water?.evaporation ?? DEFAULT_WATER_SETTINGS.evaporation,
        speed: wam?.settings?.water?.speed ?? DEFAULT_WATER_SETTINGS.speed,
        absorption: wam?.settings?.water?.absorption ?? DEFAULT_WATER_SETTINGS.absorption,
        current: wam?.settings?.water?.current ?? DEFAULT_WATER_SETTINGS.current,
        maxSurface: wam?.settings?.water?.maxSurface ?? DEFAULT_WATER_SETTINGS.maxSurface,
        indoorDrain: wam?.settings?.water?.indoorDrain ?? DEFAULT_WATER_SETTINGS.indoorDrain,
        inertia: waterHasInertia(wam?.settings?.water),
        waves: { ...DEFAULT_WAVE_SETTINGS, ...wam?.settings?.water?.waves },
        precision: wam?.settings?.water?.precision ?? DEFAULT_WATER_PACE.precision,
        updates: wam?.settings?.water?.updates ?? DEFAULT_WATER_PACE.updates,
        flowPace: wam?.settings?.water?.flowPace ?? DEFAULT_FLOW_PACE,
        impactReach: wam?.settings?.water?.impactReach ?? DEFAULT_IMPACT_REACH,
        life: { ...DEFAULT_LIFE_SETTINGS, ...wam?.settings?.life },
        meadow: { ...DEFAULT_MEADOW_SETTINGS, ...wam?.settings?.meadow },
        pools: [...(wam?.settings?.pools ?? [])],
    };
}
