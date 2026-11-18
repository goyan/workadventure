import { WeatherType } from "@workadventure/map-editor";
import type { AutoWeatherSettings } from "@workadventure/map-editor";
import { hash01 } from "../Autumn/LeafPalette";
import type { MapSnowSettings } from "./SnowCover";
import type { WeatherView } from "./WeatherFrame";
import { autoWeatherAt, slotStart } from "./WeatherSchedule";

/** Puddles fill over the first ten minutes of a rain and dry over the twenty after it. */
export const PUDDLE_FILL_MS = 10 * 60 * 1000;
export const PUDDLE_DRY_MS = 20 * 60 * 1000;

function rains(weather: WeatherType): boolean {
    return weather === WeatherType.Rain || weather === WeatherType.Storm;
}

/**
 * How wet the ground is, 0 to 1, from server dates only: the same puddles for everyone, also after a reload. A fixed
 * rain without a start date has always been falling; an automatic one follows its schedule; a real one that stopped
 * (`dryFrom`) dries from then.
 */
export function groundWetness(
    configured: WeatherType,
    epoch: number,
    startedAt?: number,
    auto?: AutoWeatherSettings,
    dryFrom?: number,
): number {
    if (!Number.isFinite(epoch)) return 0;
    const clamp = (value: number): number => Math.max(0, Math.min(1, value));
    if (configured === WeatherType.Automatic) {
        const date = new Date(epoch);
        const start = slotStart(date).getTime();
        const elapsed = epoch - start;
        const wasRaining = rains(autoWeatherAt(new Date(start - 1), auto));
        if (rains(autoWeatherAt(date, auto))) return wasRaining ? 1 : clamp(elapsed / PUDDLE_FILL_MS);
        return wasRaining ? clamp(1 - elapsed / PUDDLE_DRY_MS) : 0;
    }
    if (!rains(configured)) return dryFrom === undefined ? 0 : clamp(1 - (epoch - dryFrom) / PUDDLE_DRY_MS);
    return startedAt === undefined ? 1 : clamp((epoch - startedAt) / PUDDLE_FILL_MS);
}

/** The wetness of the ground of a map as shown to this person (shownWeatherSettings), 0 without a date. */
export function mapGroundWetness(settings: MapSnowSettings | undefined, serverDate: Date | undefined): number {
    if (!serverDate) return 0;
    return groundWetness(
        settings?.weather ?? WeatherType.Clear,
        serverDate.getTime(),
        // A real rain turning into a storm is one wet episode: the puddles do not start again.
        settings?.rainSince ?? settings?.weatherStartedAt,
        settings?.weatherAuto,
        settings?.rainDryFrom,
    );
}

export interface Puddle {
    /** Centre and half sizes, map pixels. */
    x: number;
    y: number;
    radiusX: number;
    radiusY: number;
    seed: number;
}

/** One puddle at most in each square of this side, fixed to the map. */
const PUDDLE_CELL = 96;
/** Share of the squares that get a puddle on a soaked ground. */
const PUDDLE_SHARE = 0.4;
const SMALLEST_PUDDLE = 3;

/**
 * The puddles of a ground this wet over the view: always at the same places of the map, the first ones early in the
 * rain and growing, the last ones only on a soaked ground. `size` makes them all bigger or smaller.
 */
export function puddlesIn(view: WeatherView, wetness: number, size = 1): Puddle[] {
    const puddles: Puddle[] = [];
    if (wetness <= 0) return puddles;
    for (
        let row = Math.floor(view.y / PUDDLE_CELL) - 1;
        row <= Math.ceil((view.y + view.height) / PUDDLE_CELL);
        row++
    ) {
        for (
            let column = Math.floor(view.x / PUDDLE_CELL) - 1;
            column <= Math.ceil((view.x + view.width) / PUDDLE_CELL);
            column++
        ) {
            if (hash01(column, row, 41) >= PUDDLE_SHARE) continue;
            // Each puddle starts at its own wetness, then grows to its full size on a soaked ground.
            const from = hash01(column, row, 43) * 0.6;
            const grown = (wetness - from) / (1 - from);
            if (grown <= 0) continue;
            const radiusX = (10 + 16 * hash01(column, row, 47)) * Math.sqrt(grown) * size;
            if (radiusX < SMALLEST_PUDDLE) continue;
            puddles.push({
                x: Math.round((column + hash01(column, row, 53)) * PUDDLE_CELL),
                y: Math.round((row + hash01(column, row, 59)) * PUDDLE_CELL),
                radiusX,
                radiusY: radiusX * (0.45 + 0.2 * hash01(column, row, 61)),
                seed: hash01(column, row, 67),
            });
        }
    }
    return puddles;
}

export interface PuddleRow {
    x: number;
    y: number;
    width: number;
}

/** Height of the rows a puddle is drawn with, map pixels: pixel art, like the rest of the map. */
export const PUDDLE_ROW = 2;

/** The puddle as rows of pixels: an oval with an uneven edge, the same at every drawing. */
export function puddleRows(puddle: Puddle): PuddleRow[] {
    const rows: PuddleRow[] = [];
    const half = Math.max(1, Math.round(puddle.radiusY / PUDDLE_ROW));
    for (let line = -half; line < half; line++) {
        const share = (line + 0.5) / half;
        const reach = puddle.radiusX * Math.sqrt(1 - share * share);
        const left = Math.round((puddle.x - reach + (hash01(line, puddle.seed * 1000, 71) - 0.5) * 4) / 2) * 2;
        const right = Math.round((puddle.x + reach + (hash01(line, puddle.seed * 1000, 73) - 0.5) * 4) / 2) * 2;
        if (right - left < 2) continue;
        rows.push({ x: left, y: puddle.y + line * PUDDLE_ROW, width: right - left });
    }
    return rows;
}
