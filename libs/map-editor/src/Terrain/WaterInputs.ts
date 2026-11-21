import {
    DEFAULT_SINK_RADIUS_TILES,
    DEFAULT_FLOW_PACE,
    DEFAULT_WATER_PACE,
    DEFAULT_WATER_SETTINGS,
    DEFAULT_WAVE_SETTINGS,
    TERRAIN_CELL,
    TILE_PX,
    WaterSinkPropertyData,
    WaterSourcePropertyData,
} from "../types";
import type { WAMFileFormat, WaterSettings } from "../types";
import { LITRES_PER_M3, metresOf } from "./Scale";
import { CELL_LITRES_PER_PX, MAX_FLOW_STEPS } from "./WaterGrid";
import type { WaterStepInput, WaterTally } from "./WaterGrid";

/** The water of a map is stepped this often: ten times a second, so that it is seen running. */
export const WATER_STEP_MS = 100;

/** The room is told the water this often (what changed only): the browsers glide from one state to the next. */
export const WATER_MESSAGE_MS = 1000;

/**
 * How many steps of the water there are between two tellings of the room, on a map that asks for `updates` a
 * second (once a second when it says nothing, never more often than every step).
 */
export function stepsBetweenUpdates(updates: number | undefined): number {
    const asked =
        updates !== undefined && Number.isFinite(updates) && updates >= 1 ? updates : DEFAULT_WATER_PACE.updates;
    return Math.max(1, Math.round(1000 / WATER_STEP_MS / asked));
}

/** A source (positive flow) or a sink (negative) of the map, at the cell where its water comes out. */
export interface WaterObject {
    cellX: number;
    cellY: number;
    litresPerMinute: number;
    /** The radius of the disc a source pours over or a sink takes from, in cells of the relief (0: its cell only). */
    radiusCells: number;
    /**
     * The level it holds, in pixels of altitude: a source pours only under it, a sink takes only over it. Absent:
     * it always runs.
     */
    levelPx?: number;
}

/**
 * The sources and the sinks of a map: the objects with a water property, each at the foot of its object (the
 * position of the object plus the anchor the editor wrote in the property; the server knows nothing of the size of
 * the objects). A broken property is left out.
 */
export function waterObjectsOf(wam: Pick<WAMFileFormat, "entities"> | undefined): WaterObject[] {
    const objects: WaterObject[] = [];
    for (const entity of Object.values(wam?.entities ?? {})) {
        for (const property of entity.properties ?? []) {
            const source = WaterSourcePropertyData.safeParse(property);
            const sink = source.success ? undefined : WaterSinkPropertyData.safeParse(property);
            const found = source.success ? source.data : sink?.success ? sink.data : undefined;
            if (!found || found.flow === 0) continue;
            objects.push({
                cellX: Math.floor((entity.x + (found.anchorX ?? 0)) / TERRAIN_CELL),
                cellY: Math.floor((entity.y + (found.anchorY ?? 0)) / TERRAIN_CELL),
                litresPerMinute: source.success ? found.flow : -found.flow,
                radiusCells: Math.round(
                    ((found.radius ?? (source.success ? 0 : DEFAULT_SINK_RADIUS_TILES)) * TILE_PX) / TERRAIN_CELL,
                ),
                ...(found.level === undefined ? {} : { levelPx: found.level }),
            });
        }
    }
    return objects;
}

/** The water moves once more a step for each of these many times the map goes faster than reality. */
const SPEED_PER_FLOW_STEP = 4;

/** Pixels of water a millimetre of water makes. */
export const PX_PER_MM = 1 / (-metresOf(-1) * 1000);

/**
 * What one step of `seconds` does to the water of a map, from its settings, how hard it rains (mm an hour) and its
 * sources and sinks: the rain on the hollows (with the runoff of the ground around), the evaporation in dry weather
 * only, what the flat ground drinks, the flows. All of it goes `speed` times faster than in reality.
 */
export function stepInputOf(
    water: WaterSettings | undefined,
    rainMmPerHour: number,
    objects: readonly WaterObject[],
    seconds: number,
): WaterStepInput {
    const settings: WaterSettings = water ?? DEFAULT_WATER_SETTINGS;
    const figure = (value: number, fallback = 0): number => (Number.isFinite(value) && value > 0 ? value : fallback);
    const hours = (figure(seconds) * figure(settings.speed, 1)) / 3600;
    const rain = figure(rainMmPerHour);
    return {
        rainPx: rain * hours * PX_PER_MM * (1 + figure(settings.runoff)),
        evaporationPx: rain > 0 ? 0 : figure(settings.evaporation) * hours * PX_PER_MM,
        absorptionPx: figure(settings.absorption) * hours * PX_PER_MM,
        // A map saved before the drains of the rooms has none in its settings: the usual ones. 0 drains nothing.
        indoorDrainPx: figure(settings.indoorDrain ?? DEFAULT_WATER_SETTINGS.indoorDrain) * hours * PX_PER_MM,
        // A map that goes faster than reality gives its water more moves a step towards its sinks: a quarter of
        // its speed.
        flowSteps: Math.max(1, Math.min(MAX_FLOW_STEPS, Math.round(figure(settings.speed, 1) / SPEED_PER_FLOW_STEP))),
        // The water with inertia, on a map that chose it: it needs the real time of the step, whatever the speed.
        ...(settings.inertia
            ? {
                  inertia: true,
                  seconds: figure(seconds),
                  waves: { ...DEFAULT_WAVE_SETTINGS, ...settings.waves },
                  moves: settings.precision ?? DEFAULT_WATER_PACE.precision,
                  pace: settings.flowPace ?? DEFAULT_FLOW_PACE,
              }
            : {}),
        flows: objects
            .filter((object) => Number.isFinite(object.litresPerMinute) && hours > 0)
            .map((object) => ({
                cellX: object.cellX,
                cellY: object.cellY,
                px: (object.litresPerMinute * 60 * hours) / CELL_LITRES_PER_PX,
                radius: object.radiusCells,
                ...(object.levelPx === undefined ? {} : { level: object.levelPx }),
            })),
    };
}

/** What came into and went out of the water of a map, in cubic metres an hour of the time of the map. */
export interface WaterRates {
    rain: number;
    sources: number;
    sinks: number;
    evaporation: number;
    absorption: number;
    lost: number;
}

/**
 * The rates of a tally summed over `seconds` of real time on a map whose water goes `speed` times faster: cubic
 * metres an hour of the time of the map, so they compare with its settings whatever its speed.
 */
export function ratesOf(tally: Omit<WaterTally, "moved">, seconds: number, speed: number): WaterRates {
    const hours = (seconds * (Number.isFinite(speed) && speed >= 1 ? speed : 1)) / 3600;
    const rate = (px: number): number => (hours > 0 ? (px * CELL_LITRES_PER_PX) / LITRES_PER_M3 / hours : 0);
    return {
        rain: rate(tally.rainPx),
        sources: rate(tally.sourcesPx),
        sinks: rate(tally.sinksPx),
        evaporation: rate(tally.evaporationPx),
        absorption: rate(tally.absorptionPx),
        lost: rate(tally.lostPx),
    };
}
