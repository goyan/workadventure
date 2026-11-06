import { MathUtils } from "@workadventure/math-utils";
import type { AreaData } from "@workadventure/map-editor";

/** Duration of the fade between dark (0) and lit (1) for an area. */
export const NIGHT_FADE_MS = 1000;

export interface NightRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** An area to cut out of the night veil. `intensity` goes from 0 (dark) to 1 (fully lit). */
export interface LitArea extends NightRect {
    id: string;
    intensity: number;
}

/** Areas that may light up: those covering at most a quarter of the map. */
export function lightableAreas(areas: Iterable<AreaData>, mapWidth: number, mapHeight: number): AreaData[] {
    const maxSurface = (mapWidth * mapHeight) / 4;
    return [...areas].filter((area) => area.width * area.height <= maxSurface);
}

interface AreaState {
    intensity: number;
    occupied: boolean;
}

export class NightLights {
    private readonly states = new Map<string, AreaState>();
    private lastNow: number | undefined;

    /** Updates which areas are occupied at `now` and returns the areas with a non-zero intensity. */
    public update(now: number, areas: readonly AreaData[], players: readonly { x: number; y: number }[]): LitArea[] {
        const dt = this.lastNow === undefined ? 0 : now - this.lastNow;
        this.lastNow = now;
        const step = dt / NIGHT_FADE_MS;

        const lit: LitArea[] = [];
        const present = new Set<string>();
        for (const area of areas) {
            present.add(area.id);
            const occupied = players.some((player) => MathUtils.isOverlappingWithRectangle(player, area));
            let state = this.states.get(area.id);
            if (state === undefined) {
                if (!occupied) {
                    continue;
                }
                // A newly occupied area starts dark: the fade begins at this update.
                state = { intensity: 0, occupied };
                this.states.set(area.id, state);
            } else {
                state.occupied = occupied;
                state.intensity = Math.min(1, Math.max(0, state.intensity + (occupied ? step : -step)));
            }

            if (state.intensity === 0 && !occupied) {
                this.states.delete(area.id);
                continue;
            }
            if (state.intensity > 0) {
                lit.push({
                    id: area.id,
                    x: area.x,
                    y: area.y,
                    width: area.width,
                    height: area.height,
                    intensity: state.intensity,
                });
            }
        }

        for (const id of this.states.keys()) {
            if (!present.has(id)) {
                this.states.delete(id);
            }
        }
        return lit;
    }

    /**
     * Forgets every area and the time of the last update: the next update starts from darkness, so areas occupied
     * when the veil comes back (after day, the map editor or the setting) fade in instead of jumping to full light.
     */
    public reset(): void {
        this.states.clear();
        this.lastNow = undefined;
    }

    /** Whether an intensity is still fading (a redraw is needed next frame). */
    public isFading(): boolean {
        for (const state of this.states.values()) {
            if (state.occupied ? state.intensity < 1 : state.intensity > 0) {
                return true;
            }
        }
        return false;
    }
}
