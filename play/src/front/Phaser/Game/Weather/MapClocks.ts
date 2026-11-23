import { freezeThawSpeedOf } from "@workadventure/map-editor";
import type { WAMFileFormat } from "@workadventure/map-editor";
import type { UpdateWaterSettingMessage } from "@workadventure/messages";
import type { MapClockId } from "../../../Stores/MapClockStore";
import { readTerrainMapSettings } from "../Terrain/TerrainMapSettings";

/** A step of a clock of the map in the action bar: the speed it sets, and how it is drawn (as on a player). */
export interface MapClockStep {
    speed: number;
    glyph: string;
}

/** A clock of the map the action bar can speed up: its steps, and how its speed is read from the map. */
export interface MapClock {
    id: MapClockId;
    steps: readonly MapClockStep[];
    speedOf(wam: WAMFileFormat | undefined): number;
}

/**
 * The cold of the map: its ice takes and thaws, its snow melts and goes that many times faster (the speed of the
 * freeze and the thaw); never its water. « > » as in reality, « >> » an hour in a minute, « >>> » in six seconds.
 */
export const FREEZE_THAW_CLOCK: MapClock = {
    id: "freezeThaw",
    steps: [
        { speed: 1, glyph: ">" },
        { speed: 60, glyph: ">>" },
        { speed: 600, glyph: ">>>" },
    ],
    speedOf: (wam) => freezeThawSpeedOf(wam?.settings?.water),
};

/** The clocks of the map shown in the action bar, in their order. Only the cold today. */
export const MAP_CLOCKS: readonly MapClock[] = [FREEZE_THAW_CLOCK];

/** The speed of every clock of the map as a map says it. */
export function mapClockSpeedsOf(wam: WAMFileFormat | undefined): Partial<Record<MapClockId, number>> {
    return Object.fromEntries(MAP_CLOCKS.map((clock) => [clock.id, clock.speedOf(wam)]));
}

/** How long an hour of the clock lasts at a speed: whole seconds under a minute, else minutes. */
export function hourLastsAt(speed: number): { seconds: number } | { minutes: number } {
    const seconds = 3600 / (Number.isFinite(speed) && speed > 0 ? speed : 1);
    return seconds < 60 ? { seconds: Math.round(seconds) } : { minutes: Math.round(seconds / 60) };
}

/**
 * The settings of the water of the map as they are, with the speed of the freeze and the thaw changed: the message
 * that changes this one setting (the others are sent as the map has them, as the editor of the relief sends them).
 */
export function freezeThawSettingMessage(
    freezeThawSpeed: number,
    settings: ReturnType<typeof readTerrainMapSettings> = readTerrainMapSettings(),
): UpdateWaterSettingMessage {
    return {
        runoff: settings.runoff,
        evaporation: settings.evaporation,
        speed: settings.speed,
        absorption: settings.absorption,
        current: settings.current,
        maxSurface: settings.maxSurface,
        indoorDrain: settings.indoorDrain,
        inertia: settings.inertia,
        updates: settings.updates,
        impactReach: settings.impactReach,
        freezeThawSpeed,
        // The waves only matter to the water with inertia: a map without it keeps what it had.
        ...(settings.inertia
            ? {
                  waveRoughness: settings.waves.roughness,
                  waveDamping: settings.waves.damping,
                  waveBreaking: settings.waves.breaking,
                  waveMomentum: settings.waves.momentum,
                  precision: settings.precision,
                  flowPace: settings.flowPace,
              }
            : {}),
    };
}
