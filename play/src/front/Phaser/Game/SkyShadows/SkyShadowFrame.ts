import type { SkyLight } from "../Night/SkyLight";
import { paddedView, wellInside } from "../Weather/WeatherFrame";
import type { WeatherView } from "../Weather/WeatherFrame";

/** Blue-black of the shadows, and their opacity under a high sun in a clear sky: the ground stays readable. */
export const SHADOW_COLOR = 0x0d1428;
export const SHADOW_MAX_ALPHA = 0.4;
/** The shadows are drawn this share of the screen beyond each of its edges, and again once half of it is used. */
export const SHADOW_DRAW_MARGIN = 0.25;
/** The light moves the shadows again once it has moved this much (degrees): about two minutes of sun. */
const LIGHT_STEP = 0.5;
/** And changes their opacity once it has grown or faded this much. */
const INTENSITY_STEP = 0.01;

/** What the shadows are drawn from. `casters` is the signature of what throws them (readShadowCasters). */
export interface ShadowFrame {
    light: SkyLight;
    casters: string;
    outdoorVersion: number;
    view: WeatherView;
    zoom: number;
}

/** What was drawn last, and over which part of the map. */
export interface DrawnShadows extends ShadowFrame {
    area: WeatherView;
}

/** Where to draw the shadows for a view: the view and its margin. */
export function shadowArea(view: WeatherView): WeatherView {
    return paddedView(view, SHADOW_DRAW_MARGIN);
}

/**
 * Whether the shadows must be drawn again ("draw"), only take another opacity ("alpha"), or stay ("none"): drawn
 * again when the light has moved by LIGHT_STEP or changed body, when what throws them, the outdoors or the zoom
 * changed, or when a scroll comes near the edge of what was drawn; never at every image.
 */
export function shadowRedraw(drawn: DrawnShadows | undefined, frame: ShadowFrame): "draw" | "alpha" | "none" {
    if (!drawn) return "draw";
    const { light } = frame;
    if (
        light.body !== drawn.light.body ||
        Math.abs(light.azimuth - drawn.light.azimuth) >= LIGHT_STEP ||
        Math.abs(light.elevation - drawn.light.elevation) >= LIGHT_STEP ||
        light.color !== drawn.light.color ||
        frame.casters !== drawn.casters ||
        frame.outdoorVersion !== drawn.outdoorVersion ||
        frame.zoom !== drawn.zoom ||
        !wellInside(drawn.area, frame.view, SHADOW_DRAW_MARGIN / 2)
    ) {
        return "draw";
    }
    return Math.abs(light.intensity - drawn.light.intensity) >= INTENSITY_STEP ? "alpha" : "none";
}

/**
 * How finely the shadows are drawn for a camera zoom, in texels a map pixel: one zoomed in, halved at each halving of
 * the zoom out. A zoom that glides (the wheel, a focus zone) only draws them again at each halving.
 */
export function shadowResolution(zoom: number): number {
    if (!Number.isFinite(zoom) || zoom <= 0) return 1;
    return Math.min(1, 2 ** Math.floor(Math.log2(zoom)));
}

/** How dark the shadows are for a light. */
export function shadowAlpha(light: SkyLight): number {
    return SHADOW_MAX_ALPHA * Math.max(0, Math.min(1, light.intensity));
}

/**
 * The cells of an area that are not outdoors (rooms and walls), as rows of cells merged left to right, in map pixels:
 * the shadows of the sky are taken away there.
 */
export function indoorRuns(
    isOutdoorCell: (column: number, row: number) => boolean,
    cellSize: number,
    area: WeatherView,
): WeatherView[] {
    const firstColumn = Math.floor(area.x / cellSize);
    const lastColumn = Math.ceil((area.x + area.width) / cellSize) - 1;
    const firstRow = Math.floor(area.y / cellSize);
    const lastRow = Math.ceil((area.y + area.height) / cellSize) - 1;
    const runs: WeatherView[] = [];
    for (let row = firstRow; row <= lastRow; row++) {
        let start: number | undefined;
        for (let column = firstColumn; column <= lastColumn + 1; column++) {
            const indoor = column <= lastColumn && !isOutdoorCell(column, row);
            if (indoor && start === undefined) start = column;
            else if (!indoor && start !== undefined) {
                runs.push({
                    x: start * cellSize,
                    y: row * cellSize,
                    width: (column - start) * cellSize,
                    height: cellSize,
                });
                start = undefined;
            }
        }
    }
    return runs;
}
