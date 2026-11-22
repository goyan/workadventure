import { heightAt, metresOf, TERRAIN_CELL } from "@workadventure/map-editor";
import type { TerrainData } from "@workadventure/map-editor";
import { WATER_SHOWN_PX } from "../Terrain/TerrainWater";

/**
 * The altitude of an avatar over the ground of the map, in pixels of altitude: the altitude of the raised floor it
 * stands on, or on the ground the height of the relief under its feet (negative in a hollow). Undefined on a map
 * without relief: there is nothing to tell.
 */
export function avatarAltitude(
    terrain: TerrainData | undefined,
    feetX: number,
    feetY: number,
    floorZ: number,
): number | undefined {
    if (!terrain || Object.keys(terrain.chunks).length === 0) return undefined;
    if (floorZ > 0) return floorZ;
    return heightAt(terrain, Math.floor(feetX / TERRAIN_CELL), Math.floor(feetY / TERRAIN_CELL));
}

/**
 * What the pointer reads of the ground and of the water under it, in metres rounded to the decimetre (0: the ground
 * of the map, as the level a source or a sink holds). `surface` and `depth` are there only where water is shown.
 */
export interface PointerGround {
    /** The ground: the height of the relief, or the floor of a pool where its basin is dug. */
    ground: number;
    /** The level of the water there: the ground and the depth of its water. */
    surface?: number;
    /** The depth of the water: the surface shown less the ground shown, so that the three figures agree. */
    depth?: number;
    /** The surface is frozen: it is the one of the ice, at the level of its water. */
    ice?: boolean;
}

/** The water as the pointer reads it: the ground the server pours it over, and its depth in the last state. */
export interface PointerWater {
    basin(): TerrainData | undefined;
    settledDepthAt(x: number, y: number): number;
}

/** Metres to the decimetre, never "-0". */
function tenths(metres: number): number {
    const rounded = Math.round(metres * 10) / 10;
    return rounded === 0 ? 0 : rounded;
}

/**
 * The ground and the water of a cell, as told under the clock: `groundPx` the height of its ground and `depthPx` the
 * water over it, in pixels of altitude. A film thinner than what the map draws is no water.
 */
export function pointerGround(groundPx: number, depthPx: number, frozen = false): PointerGround {
    const ground = tenths(metresOf(groundPx));
    if (!(depthPx >= WATER_SHOWN_PX)) return { ground };
    const surface = tenths(metresOf(groundPx + depthPx));
    return { ground, surface, depth: tenths(surface - ground), ...(frozen ? { ice: true } : {}) };
}

/**
 * The ground and the water under the pointer (map pixels). The ground is read where the water stands, as the
 * server reads it (TerrainWater.basin: the floor of a pool where its basin is dug), whatever floor or bridge is built
 * over it; the water is the last state the server sent, not its glide, so that it changes once a state at most.
 * Undefined on a map without relief, and while the pointer is off the game.
 */
export function pointerGroundAt(
    terrain: TerrainData | undefined,
    pointer: { x: number; y: number } | undefined,
    water: PointerWater,
    frozenAt: (point: { x: number; y: number }) => boolean,
): PointerGround | undefined {
    if (!pointer || !terrain || Object.keys(terrain.chunks).length === 0) return undefined;
    const groundPx = heightAt(
        water.basin() ?? terrain,
        Math.floor(pointer.x / TERRAIN_CELL),
        Math.floor(pointer.y / TERRAIN_CELL),
    );
    const depthPx = water.settledDepthAt(pointer.x, pointer.y);
    // The ice is read only over water: it goes by the meadow and the walls of the map.
    return pointerGround(groundPx, depthPx, depthPx >= WATER_SHOWN_PX && frozenAt(pointer));
}

/** Whether two readings show the same: the stack is drawn again only when one of its figures changes. */
export function samePointerGround(a: PointerGround | undefined, b: PointerGround | undefined): boolean {
    if (a === undefined || b === undefined) return a === b;
    return a.ground === b.ground && a.surface === b.surface && a.depth === b.depth && a.ice === b.ice;
}

/** Metres as shown to the players, to the decimetre: signed ("+1,6 m") for an altitude, unsigned for a depth. */
export function metresLabel(metres: number, locale?: string, signed = true): string {
    const figure = new Intl.NumberFormat(locale, {
        maximumFractionDigits: 1,
        signDisplay: signed ? "exceptZero" : "auto",
    }).format(tenths(metres));
    return `${figure} m`;
}

/** An altitude as shown to the players: in metres, signed, to the decimetre ("+1,6 m"). */
export function altitudeLabel(altitudePx: number, locale?: string): string {
    return metresLabel(metresOf(altitudePx), locale);
}
