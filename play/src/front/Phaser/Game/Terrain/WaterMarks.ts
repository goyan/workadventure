import {
    DEFAULT_SINK_RADIUS_TILES,
    metresOf,
    TERRAIN_CELL,
    TILE_PX,
    WaterSinkPropertyData,
    WaterSourcePropertyData,
} from "@workadventure/map-editor";
import type { WAMFileFormat } from "@workadventure/map-editor";
import { DEFAULT_WATER_FLOW_UNIT, flowInUnit, waterFlowUnit } from "./WaterFlowUnits";

/** A source or a sink of the map, as the relief tool points it out. */
export interface WaterMark {
    kind: "source" | "sink";
    /** Where its water comes out or goes, in map pixels: the middle of the cell the server pours into or takes from. */
    x: number;
    y: number;
    /** What it is set to, never negative: 0 for one that is turned off. */
    litresPerMinute: number;
    /** The radius of the disc it pours over or takes from, in map pixels (0: at its foot only). */
    discPx: number;
    /** The level it holds, in pixels of altitude: absent when it always runs. */
    levelPx?: number;
}

/**
 * The sources and the sinks of a map, for the relief tool to point out. Unlike `waterObjectsOf` (what the server
 * steps the water with), one that is turned off is kept: it is the one an editor looks for. A broken property is
 * left out.
 */
export function waterMarksOf(wam: Pick<WAMFileFormat, "entities"> | undefined): WaterMark[] {
    const marks: WaterMark[] = [];
    for (const entity of Object.values(wam?.entities ?? {})) {
        for (const property of entity.properties ?? []) {
            // Most objects have other properties: only the water ones are checked in full.
            const kind =
                property.type === "waterSourcePropertyData"
                    ? "source"
                    : property.type === "waterSinkPropertyData"
                      ? "sink"
                      : undefined;
            if (!kind) continue;
            const parsed = (kind === "source" ? WaterSourcePropertyData : WaterSinkPropertyData).safeParse(property);
            if (!parsed.success) continue;
            const found = parsed.data;
            const cell = (pixels: number): number => (Math.floor(pixels / TERRAIN_CELL) + 0.5) * TERRAIN_CELL;
            marks.push({
                kind,
                x: cell(entity.x + (found.anchorX ?? 0)),
                y: cell(entity.y + (found.anchorY ?? 0)),
                litresPerMinute: found.flow,
                discPx: (found.radius ?? (kind === "source" ? 0 : DEFAULT_SINK_RADIUS_TILES)) * TILE_PX,
                ...(found.level === undefined ? {} : { levelPx: found.level }),
            });
        }
    }
    return marks;
}

/**
 * The flow of a mark as written next to it: in the unit of the dashboard, + for a source, − for a sink, then the
 * level it holds, in metres.
 */
export function waterMarkLabel(mark: WaterMark): string {
    const sign = mark.litresPerMinute === 0 ? "" : mark.kind === "source" ? "+" : "−";
    const unit = waterFlowUnit(DEFAULT_WATER_FLOW_UNIT);
    const flow = `${sign}${flowInUnit(mark.litresPerMinute, unit.id)} ${unit.label}`;
    if (mark.levelPx === undefined) return flow;
    const metres = Math.round(metresOf(mark.levelPx) * 10) / 10;
    return `${flow} → ${metres < 0 ? "−" : ""}${Math.abs(metres).toFixed(1)} m`;
}

/** A mark is this wide on the screen (pixels), whatever the zoom, and never smaller than this on the map. */
const MARK_SCREEN_RADIUS = 14;
const MARK_MAP_RADIUS = 10;

/** The radius of a mark in map pixels, at a zoom of the camera: a map seen from far keeps marks one can see. */
export function waterMarkRadius(zoom: number): number {
    return Math.max(MARK_MAP_RADIUS, MARK_SCREEN_RADIUS / (zoom > 0 ? zoom : 1));
}
