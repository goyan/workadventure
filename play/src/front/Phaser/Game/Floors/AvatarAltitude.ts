import { heightAt, metresOf, TERRAIN_CELL } from "@workadventure/map-editor";
import type { TerrainData } from "@workadventure/map-editor";

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

/** An altitude as shown to the players: in metres, signed, to the decimetre ("+1,6 m"). */
export function altitudeLabel(altitudePx: number, locale?: string): string {
    const metres = Math.round(metresOf(altitudePx) * 10) / 10;
    const figure = new Intl.NumberFormat(locale, { maximumFractionDigits: 1, signDisplay: "exceptZero" }).format(
        metres === 0 ? 0 : metres,
    );
    return `${figure} m`;
}
