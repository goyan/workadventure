import { WeatherType } from "@workadventure/map-editor";

export const WEATHER_PHASE_MS = 30 * 60 * 1000;
export const SNOW_ACCUMULATION_MS = 10 * 60 * 1000;
export const SNOW_MELT_MS = 10 * 60 * 1000;

/** Server epochs keep coverage identical on reconnect and on every client. */
export function snowCoverage(configured: WeatherType, epoch: number, startedAt?: number): number {
    if (!Number.isFinite(epoch)) return 0;
    if (configured === WeatherType.Automatic) {
        const phase = ((Math.floor(epoch / WEATHER_PHASE_MS) % 4) + 4) % 4;
        const elapsed = ((epoch % WEATHER_PHASE_MS) + WEATHER_PHASE_MS) % WEATHER_PHASE_MS;
        if (phase === 3) return Math.min(1, elapsed / SNOW_ACCUMULATION_MS);
        if (phase === 0) return Math.max(0, 1 - elapsed / SNOW_MELT_MS);
        return 0;
    }
    if (configured !== WeatherType.Snow) return 0;
    // Legacy maps without an episode date keep their snowy ground until their weather is edited.
    return startedAt === undefined ? 1 : Math.max(0, Math.min(1, (epoch - startedAt) / SNOW_ACCUMULATION_MS));
}

/** Coherent patches rather than independent random tiles; stable for a world cell. */
export function snowCell(column: number, row: number, coverage: number): { variant: number; alpha: number } {
    const region = Math.abs(Math.sin(Math.floor(column / 4) * 127.1 + Math.floor(row / 4) * 311.7) * 43758.5453) % 1;
    const detail = Math.abs(Math.sin(column * 73.7 + row * 183.3) * 19743.7241) % 1;
    const threshold = region * 0.65 + detail * 0.15;
    return { variant: Math.floor(detail * 8), alpha: Math.max(0, Math.min(1, (coverage - threshold) / 0.2)) };
}
